import cron from 'node-cron';
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';

// Local modules - progressively migrate to TypeScript. Keep `any` for complex module shapes for now.
import { loadConfigs } from './lib-public/config-loader';
import { setupParsersAndExtractors } from './lib-public/parsers-extractors';
import { initializeDDNS } from './lib-public/ddns-manager';
import { checkService, pingHealthcheck } from './lib-public/health-checker';
import { handleWebSocketUpgrade } from './lib-public/helpers';
import { initApplication } from './lib-public/public';
import { OdalPapiMainService } from './lib-public/odalpapi';
const odalpapiService = new OdalPapiMainService();

import configapp from './lib-private/configurator';

const baseDir = path.resolve(__dirname, '..');
const { config, secrets, users, ddns, advancedConfig, blocklist } = loadConfigs(baseDir);

dotenv.config();
const env = process.env.NODE_ENV;
const protocols: Record<string, string> = {
  insecure: 'http://',
  secure: 'https://',
};
if (env === 'development' || env === 'test') protocols.secure = 'http://';

const { parsers, extractors } = setupParsersAndExtractors(advancedConfig);

initializeDDNS(ddns, config, env, cron);

const healthchecks = Object.keys(config.services).filter(
  (name: string) => config.services[name].healthcheck,
);
cron.schedule('1 * * * *', () => {
  healthchecks.forEach((name: string) => {
    checkService(name, config, protocols, parsers, extractors, odalpapiService, (service: any) => {
      const now = new Date().toISOString();
      if (service.healthy) {
        if (env === 'production') {
          console.log(`${now}: ${name} service is up. Pinging healthcheck...`);
          pingHealthcheck(name, config, protocols);
        } else {
          console.log(
            `${now}: Skipping healthcheck ping for ${name} in non-production environment`,
          );
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

  let cert: any;
  if (env === 'production') {
    try {
      cert = {
        key: fs.readFileSync(
          path.join('/etc', 'letsencrypt', 'live', config.domain, 'privkey.pem'),
          'utf8',
        ),
        cert: fs.readFileSync(
          path.join('/etc', 'letsencrypt', 'live', config.domain, 'cert.pem'),
          'utf8',
        ),
        ca: fs.readFileSync(
          path.join('/etc', 'letsencrypt', 'live', config.domain, 'chain.pem'),
          'utf8',
        ),
      };
    } catch (error) {
      const now = new Date().toISOString();
      console.error(
        `${now}: Error loading SSL certificates, try provisioning certificates using the configurator.`,
      );
    }
  }

  if (config.domain) {
    initApplication({
      config,
      secrets,
      users,
      blocklist,
      env,
      protocols,
      parsers,
      extractors,
      odalpapiService,
      __dirname: baseDir,
    })
      .then((app: any) => {
        const port_http = env === 'development' || env === 'test' ? 80 : 8080;
        const httpServer = http.createServer(app);
        const httpsServer = cert ? https.createServer(cert, app) : null;

        httpServer.listen(port_http, () => {
          const now = new Date().toISOString();
          console.log(`${now}: HTTP Server running on port ${port_http}`);
          httpServer.on('upgrade', (req, socket, head) =>
            handleWebSocketUpgrade(config, req, socket, head),
          );
        });

        if (httpsServer) {
          const port_https = 8443;

          httpsServer.listen(port_https, () => {
            const now = new Date().toISOString();
            console.log(`${now}: HTTPS Server running on port ${port_https}`);
            httpsServer.on('upgrade', (req, socket, head) =>
              handleWebSocketUpgrade(config, req, socket, head),
            );
          });
        }
      })
      .catch((err: any) => {
        const now = new Date().toISOString();
        console.error(`${now}: Failed to initialize application:`, err);
        process.exit(1);
      });
  }
}, 1000);
