"use strict";

const cron = require('node-cron');
const dotenv = require('dotenv');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const configLoader = require('./lib-public/config-loader');
const parsersExtractors = require('./lib-public/parsers-extractors');
const { initDDNS } = require('./lib-public/ddns-manager');
const { initHealthchecks } = require('./lib-public/health-checker');
const { initApplication } = require('./lib-public/public');
const { isIpBlocked } = require('./lib-public/bot-blocker');
const { extractIpFromSocket } = require('./lib-public/helpers');

const { OdalPapiMainService } = require('./lib-public/odalpapi.js');
const odalpapiService = new OdalPapiMainService();

const configapp = require('./lib-private/configurator.js');

// Check if any of the files in the store folder are in the root and move them to the store folder
const storeDir = path.join(__dirname, 'store');
const rootFiles = [
  'advanced.json',
  'blocklist.json',
  'certs.json',
  'config.json',
  'ddns.json',
  'secrets.json',
  'users.json',
];
const webFiles = [
  'colors.json',
];
rootFiles.forEach(file => {
  if (fs.existsSync(path.join(storeDir, file))) {
    console.log(`File ${file} already exists in store directory`);
  } else {
    if (fs.existsSync(path.join(__dirname, file))) {
      fs.renameSync(path.join(__dirname, file), path.join(storeDir, file));
      console.log(`Moved ${file} to store directory`);
    }
  }
});
webFiles.forEach(file => {
  if (fs.existsSync(path.join(storeDir, file))) {
    console.log(`File ${file} already exists in store directory`);
  } else {
    if (fs.existsSync(path.join(__dirname, 'web', 'global', file))) {
      fs.renameSync(path.join(__dirname, 'web', 'global', file), path.join(storeDir, file));
      console.log(`Moved ${file} to store directory`);
    }
  }
});

// Load configurations from store directory
const { config, secrets, users, ddns, advancedConfig, blocklist } = configLoader.loadConfigs(storeDir);

// Load environment variables and set up protocols based on environment
dotenv.config();
const env = process.env.NODE_ENV;
const protocols = {
  insecure: 'http://',
  secure: 'https://',
};
if (env === 'development' || env === 'test') protocols.secure = 'http://';

// Setup parsers and extractors based on the loaded configuration
const { parsers, extractors } = parsersExtractors.setupParsersAndExtractors(advancedConfig);

// Initialize DDNS manager to handle dynamic DNS updates for services
initDDNS(ddns, config, env, cron);

// Schedule health checks for services with healthcheck URLs
initHealthchecks(config, protocols, parsers, extractors, odalpapiService, env, cron);

// Create and start the internal configurator server
const configurator = http.createServer(configapp);

// Delay for server restarts to avoid port conflicts.
setTimeout(() => {
  configurator.listen(3000, () => {
    const now = new Date().toISOString();
    console.log(`${now}: Configurator running on port 3000`);
  });

  // Load SSL certificates if in production environment
  let cert;
  if (env === 'production') {
    try {
      cert = {
        key: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'privkey.pem'), 'utf8'),
        cert: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'cert.pem'), 'utf8'),
        ca: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'chain.pem'), 'utf8'),
      };
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: Error loading SSL certificates, try provisioning certificates using the configurator.`);
    }
  }

  // Main application initialization and server setup
  if (config.domain) {
    initApplication({ config, secrets, users, blocklist, env, protocols, parsers, extractors, odalpapiService, __dirname }).then((app) => {
      const portHttp = (env === 'development' || env === 'test') ? 80 : 8080;

      /**
       * Early request handler to block connections from IPs in the blocklist before they reach the main application
       * @param {Object} req - Express request object
       * @param {Object} res - Express response object
       * @returns {void|Object} - Returns void if connection is blocked, otherwise returns the main app handler
       */
      const earlyHandler = (req, res) => {
        const ip = extractIpFromSocket(req.socket);
        if (isIpBlocked(ip, blocklist)) {
          const now = new Date().toISOString();
          console.log(`${now}: [early-block] Destroying connection from ${ip}`);
          try { res.socket.destroy(); } catch (e) { /* ignore */ }
          return;
        }
        return app(req, res);
      };

      /**
       * Handle WebSocket upgrade requests and route them to the appropriate service based on the Host header
       * @param {Object} req - HTTP request object
       * @param {Object} socket - Network socket between the server and client
       * @param {Buffer} head - First packet of the upgraded stream, may contain data
       * @return {void} - This function does not return a value, it either upgrades the connection or destroys the socket
      */
      const handleWebSocketUpgrade = (req, socket, head) => {
        const websockets = Object.keys(config.services).filter(name => config.services[name].subdomain?.proxy?.socket);
        let found = false;
        websockets.forEach(name => {
          if (req.headers.host === `${name}.${config.domain}`) {
            config.services[name].subdomain.proxy.websocket.upgrade(req, socket, head);
            found = true;
          }
        });
        if (!found) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
        }
      }

      /**
       * Set up a server listener for either HTTP or HTTPS, and handle WebSocket upgrade requests
       * @param {Object} server - HTTP or HTTPS server instance
       * @param {number} port - Port number to listen on
       * @param {string} type - Type of server ('HTTP' or 'HTTPS') for logging purposes
       * @returns {void}
       */
      const setupServerListener = (server, port, type) => {
        server.listen(port, () => {
          const now = new Date().toISOString();
          console.log(`${now}: ${type} Server running on port ${port}`);
          server.on('upgrade', (req, socket, head) => {
            const ip = extractIpFromSocket(socket);
            if (isIpBlocked(ip, blocklist)) {
              console.log(`${now}: [early-block-upgrade] Destroying websocket connection from ${ip}`);
              try { socket.destroy(); } catch (e) { /* ignore */ }
              return;
            }
            handleWebSocketUpgrade(req, socket, head);
          });
        });
      }

      // Always Create HTTP server
      const httpServer = http.createServer(earlyHandler);
      setupServerListener(httpServer, portHttp, 'HTTP');

      // Only create HTTPS server if certs are available
      const httpsServer = cert ? https.createServer(cert, earlyHandler) : null;
      if (httpsServer) {
        const portHttps = 8443;
        setupServerListener(httpsServer, portHttps, 'HTTPS');
      }
    }).catch((err) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
