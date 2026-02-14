"use strict";

const cron = require('node-cron');
const dotenv = require('dotenv');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const configLoader = require('./lib-public/config-loader');
const parsersExtractors = require('./lib-public/parsers-extractors');
const ddnsManager = require('./lib-public/ddns-manager');
const { checkService, pingHealthcheck } = require('./lib-public/health-checker');
const { handleWebSocketUpgrade, extractIpFromSocket } = require('./lib-public/helpers');
const { isIpBlocked } = require('./lib-public/bot-blocker');
const { initApplication } = require('./lib-public/public');

const { OdalPapiMainService } = require('./lib-public/odalpapi.js');
const odalpapiService = new OdalPapiMainService();

const configapp = require('./lib-private/configurator.js');

const { config, secrets, users, ddns, advancedConfig, blocklist } = configLoader.loadConfigs(__dirname);

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
ddnsManager.initializeDDNS(ddns, config, env, cron);

// Schedule health checks for services with healthcheck URLs
const healthchecks = Object.keys(config.services).filter((name) => config.services[name].healthcheck);
cron.schedule('1 * * * *', () => {
  healthchecks.forEach((name) => {
    checkService(name, config, protocols, parsers, extractors, odalpapiService, (service) => {
      const now = new Date().toISOString();
      if (service.healthy) {
        if (env === 'production') {
          console.log(`${now}: ${name} service is up. Pinging healthcheck...`);
          pingHealthcheck(name, config, protocols);
        } else {
          console.log(`${now}: Skipping healthcheck ping for ${name} in non-production environment`);
        }
      }
    });
  });
});

// Create and start the internal configurator server
const configurator = http.createServer(configapp);

// Delay for server restarts to avoid port conflicts.
setTimeout(() => {
  configurator.listen(3000, () => {
    const now = new Date().toISOString();
    console.log(`${now}: Configurator running on port 3000`);
  });

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

  if (config.domain) {
    initApplication({ config, secrets, users, blocklist, env, protocols, parsers, extractors, odalpapiService, __dirname }).then((app) => {
      const port_http = (env === 'development' || env === 'test') ? 80 : 8080;

      // Use shared bot-blocker helper for fast blocklist checks
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

      // Create HTTP server always
      const httpServer = http.createServer(earlyHandler);
      httpServer.listen(port_http, () => {
        const now = new Date().toISOString();
        console.log(`${now}: HTTP Server running on port ${port_http}`);
        httpServer.on('upgrade', (req, socket, head) => {
          const ip = extractIpFromSocket(socket);
          if (isIpBlocked(ip, blocklist)) {
            console.log(`${now}: [early-block-upgrade] Destroying websocket connection from ${ip}`);
            try { socket.destroy(); } catch (e) { /* ignore */ }
            return;
          }
          handleWebSocketUpgrade(config, req, socket, head);
        });
      });

      // Only create HTTPS server if certs are available
      const httpsServer = cert ? https.createServer(cert, earlyHandler) : null;
      if (httpsServer) {
        const port_https = 8443;

        httpsServer.listen(port_https, () => {
          const now = new Date().toISOString();
          console.log(`${now}: HTTPS Server running on port ${port_https}`);
          httpsServer.on('upgrade', (req, socket, head) => {
            const ip = extractIpFromSocket(socket);
            if (isIpBlocked(ip, blocklist)) {
              console.log(`${now}: [early-block-upgrade] Destroying websocket connection from ${ip}`);
              try { socket.destroy(); } catch (e) { /* ignore */ }
              return;
            }
            handleWebSocketUpgrade(config, req, socket, head);
          });
        });
      }
    }).catch((err) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
