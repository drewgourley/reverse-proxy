"use strict";

const cron = require('node-cron');
const dotenv = require('dotenv');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const configLoader = require('./lib-public/config-loader');
const parsersExtractors = require('./lib-public/parsers-extractors');
const { initializeDDNS } = require('./lib-public/ddns-manager');
const { initializeHealthchecks } = require('./lib-public/health-checker');
const { extractIpFromSocket, setupServerListener } = require('./lib-public/helpers');
const { isIpBlocked } = require('./lib-public/bot-blocker');
const { initApplication } = require('./lib-public/public');

const { OdalPapiMainService } = require('./lib-public/odalpapi.js');
const odalpapiService = new OdalPapiMainService();

const configapp = require('./lib-private/configurator.js');

// Check if any of the files in the store folder are in the root and move them to the store folder
const storeDir = path.join(__dirname, 'store');
const rootFiles = [
  path.join('web', 'global', 'colors.json'),
  'advanced.json',
  'blocklist.json',
  'certs.json',
  'config.json',
  'ddns.json',
  'secrets.json',
  'users.json',
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
initializeDDNS(ddns, config, env, cron);

// Schedule health checks for services with healthcheck URLs
initializeHealthchecks(config, protocols, parsers, extractors, odalpapiService, env, cron);

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
      const portHttp = (env === 'development' || env === 'test') ? 80 : 8080;

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

      // Always Create HTTP server
      const httpServer = http.createServer(earlyHandler);
      setupServerListener(config, blocklist, httpServer, portHttp, 'HTTP');

      // Only create HTTPS server if certs are available
      const httpsServer = cert ? https.createServer(cert, earlyHandler) : null;
      if (httpsServer) {
        const portHttps = 8443;
        setupServerListener(config, blocklist, httpsServer, portHttps, 'HTTPS');
      }
    }).catch((err) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
