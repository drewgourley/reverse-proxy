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
const { handleWebSocketUpgrade } = require('./lib-public/helpers');
const { initApplication } = require('./lib-public/public');

const { OdalPapiMainService } = require('./lib-public/odalpapi.js');
const odalpapiService = new OdalPapiMainService();

const configapp = require('./lib-private/configurator.js');

const { config, secrets, users, ddns, advancedConfig, blocklist } = configLoader.loadConfigs(__dirname);

dotenv.config();
const env = process.env.NODE_ENV;
const protocols = {
  insecure: 'http://',
  secure: 'https://',
};
if (env === 'development' || env === 'test') protocols.secure = 'http://';

const { parsers, extractors } = parsersExtractors.setupParsersAndExtractors(advancedConfig);

ddnsManager.initializeDDNS(ddns, config, env, cron);

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
      const httpServer = http.createServer(app);
      const httpsServer = cert ? https.createServer(cert, app) : null;

      httpServer.listen(port_http, () => {
        const now = new Date().toISOString();
        console.log(`${now}: HTTP Server running on port ${port_http}`);
        httpServer.on('upgrade', (req, socket, head) => handleWebSocketUpgrade(config, req, socket, head));
      });

      if (httpsServer) {
        const port_https = 8443;

        httpsServer.listen(port_https, () => {
          const now = new Date().toISOString();
          console.log(`${now}: HTTPS Server running on port ${port_https}`);
          httpsServer.on('upgrade', (req, socket, head) => handleWebSocketUpgrade(config, req, socket, head));
        });
      }
    }).catch((err) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
