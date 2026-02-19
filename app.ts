import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import type { Configs, Config, Secrets, Users } from './types';

const cron: any = require('node-cron');
const dotenv: any = require('dotenv');

const configLoader: any = require('./lib-public/config-loader');
const parsersExtractors: any = require('./lib-public/parsers-extractors');
const { initDDNS }: any = require('./lib-public/ddns-manager');
const { initHealthchecks }: any = require('./lib-public/health-checker');
const { initApplication }: any = require('./lib-public/public');
const { isIpBlocked }: any = require('./lib-public/bot-blocker');
const { extractIpFromSocket }: any = require('./lib-public/helpers');

const { OdalPapiMainService }: any = require('./lib-public/odalpapi.js');
const odalpapiService: any = new OdalPapiMainService();

const configapp: any = require('./lib-private/configurator.js');

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
const configs: Configs = configLoader.loadConfigs(storeDir) as Configs;
const { config, secrets, users, ddns, advancedConfig, blocklist } = configs;

// Load environment variables and set up protocols based on environment
dotenv.config();
const env = process.env.NODE_ENV;
const protocols: { insecure: string; secure: string } = {
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
const configurator = http.createServer(configapp as any);

// Delay for server restarts to avoid port conflicts.
setTimeout(() => {
  configurator.listen(3000, () => {
    const now = new Date().toISOString();
    console.log(`${now}: Configurator running on port 3000`);
  });

  // Load SSL certificates if in production environment
  let cert: any;
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
    initApplication({ config, secrets, users, blocklist, env, protocols, parsers, extractors, odalpapiService, __dirname }).then((app: any) => {
      const portHttp = (env === 'development' || env === 'test') ? 80 : 8080;

      /**
       * Early request handler to block connections from IPs in the blocklist before they reach the main application
       * @param req - Express/HTTP request
       * @param res - Express/HTTP response
       */
      const earlyHandler = (req: IncomingMessage, res: ServerResponse): any => {
        const ip = extractIpFromSocket((req as any).socket);
        if (isIpBlocked(ip, blocklist)) {
          const now = new Date().toISOString();
          console.log(`${now}: [early-block] Destroying connection from ${ip}`);
          try { (res as any).socket.destroy(); } catch (e) { /* ignore */ }
          return;
        }
        return (app as any)(req, res);
      };

      /**
       * Handle WebSocket upgrade requests and route them to the appropriate service based on the Host header
       */
      const handleWebSocketUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer): void => {
        const websockets = Object.keys(config.services).filter((name: string) => config.services[name].subdomain?.proxy?.socket);
        let found = false;
        websockets.forEach((name: string) => {
          if (req.headers.host === `${name}.${config.domain}`) {
            const ws = config.services[name]?.subdomain?.proxy?.websocket;
            if (ws && typeof ws.upgrade === 'function') {
              ws.upgrade(req as any, socket as any, head);
              found = true;
            }
          }
        });
        if (!found) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
        }
      }

      /**
       * Set up a server listener for either HTTP or HTTPS, and handle WebSocket upgrade requests
       */
      const setupServerListener = (server: http.Server | https.Server, port: number, type: string): void => {
        server.listen(port, () => {
          const now = new Date().toISOString();
          console.log(`${now}: ${type} Server running on port ${port}`);
          server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
            const ip = extractIpFromSocket(socket as any);
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
      const httpServer = http.createServer(earlyHandler as any);
      setupServerListener(httpServer, portHttp, 'HTTP');

      // Only create HTTPS server if certs are available
      const httpsServer = cert ? https.createServer(cert as any, earlyHandler as any) : null;
      if (httpsServer) {
        const portHttps = 8443;
        setupServerListener(httpsServer, portHttps, 'HTTPS');
      }
    }).catch((err: any) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
