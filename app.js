"use strict";
// retrieve core dependencies
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

// retrieve extra dependencies
const Ajv = require('ajv');
const ajv = new Ajv();
const bcrypt = require('bcrypt');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const express = require('express');
const basicAuth = require('express-basic-auth');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const subdomain = require('express-subdomain');
const { GameDig } = require('gamedig');
const { createProxyMiddleware } = require('http-proxy-middleware');
const got = require('got');
const cron = require('node-cron');
const serveIndex = require('serve-index');
const wol = require('wake_on_lan');
const multer = require('multer');
const faviconUpload = multer({ storage: multer.memoryStorage() });
const sharp = require('sharp');
const toIco = require('to-ico');
const { createClient } = require('redis');
const { RedisStore } = require('connect-redis');

// retrieve local dependencies
const { OdalPapiService } = require('./odalpapi.js')

// retrieve configuration
let config;
try {
  config = require('./config.json');
} catch (e) {
  config = {};
  console.warn('Initial configuration required')
}

// retrieve secrets
let secrets;
try {
  secrets = require('./secrets.json');
} catch (e) {
  secrets = {};
  console.warn('Secrets not configured');
}

// retrieve ddns
let ddns;
try {
  ddns = require('./ddns.json');
} catch (e) {
  ddns = {};
  console.warn('DDNS not configured');
}

// retrieve advanced config
let advancedConfig;
try {
  advancedConfig = require('./advanced.json');
} catch (e) {
  advancedConfig = { parsers: {}, extractors: {}, queryTypes: [] };
  console.warn('Advanced Options not configured');
}

// retrieve blocklist
let blocklist;
try {
  blocklist = require('./blocklist.json');
} catch (e) {
  blocklist = [];
  console.warn('Blocklist not established');
}

// retrieve ecosystem
let ecosystem;
try {
  ecosystem = require('./ecosystem.config.js');
} catch (e) {
  ecosystem = {};
  console.warn('Ecosystem not established');
}

// retrieve environment variables
dotenv.config();

// declare environment
const env = process.env.NODE_ENV;

// declare protocols
const protocols = {
  insecure: 'http://',
  secure: 'https://',
};
if (env === 'development' || env === 'test') protocols.secure = 'http://';

// declare default parsers
const defaultParsers = {
  hass: (body) => {
    const dom = cheerio.load(body);
    const health = dom('.connected').last().text();
    return health && health.toLowerCase().indexOf('healthy') > -1;
  },
  radio: (body) => {
    const json = JSON.parse(body);
    return json.icestats && json.icestats.source;
  },
  body: (body) => body !== null && body !== undefined,
};

// declare default extractors
const defaultExtractors = {
  doom: (state) => ({
    online: state.server.players.length,
    max: state.server.maxPlayers,
    version: `${state.server.versionMajor}.${state.server.versionMinor}.${state.server.versionPatch}`,
  }),
  minecraft: (state) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.bedrock?.raw?.mcVersion,
  }),
  valheim: (state) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.version,
  }),
  radio: (state) => {
    const json = JSON.parse(state);
    if (json.icestats && json.icestats.source) {
      return {
        online: json.icestats.source.listeners || 0,
        version: json.icestats.source.title,
      };
    }
  },
};

// merge custom parsers/extractors from advanced config
const parsers = { ...defaultParsers };
const extractors = { ...defaultExtractors };

// load custom parsers
if (advancedConfig.parsers) {
  Object.keys(advancedConfig.parsers).forEach(key => {
    try {
      parsers[key] = eval(`(${advancedConfig.parsers[key]})`);
    } catch (error) {
      console.error(`Error loading custom parser "${key}":`, error);
    }
  });
}

// load custom extractors
if (advancedConfig.extractors) {
  Object.keys(advancedConfig.extractors).forEach(key => {
    try {
      extractors[key] = eval(`(${advancedConfig.extractors[key]})`);
    } catch (error) {
      console.error(`Error loading custom extractor "${key}":`, error);
    }
  });
}

// declare health checker
const checkService = (name, callback) => {
  const service = config.services[name];
  const check = service?.healthcheck;
  const report = {
    service: name,
    healthy: false,
    deck: 'deckunhealthy',
  };
  if (check && check.type && check.path ) {
    if (check.meta) {
      report.meta = { ...check.meta };
    }
    if (report.meta?.link) {
      report.meta.link = `${protocols[service.subdomain.protocol]}${name}.${config.domain}`;
    }
    if (check.type === 'http') {
      got(`${protocols.insecure}${check.path}`, { timeout: { request: check.timeout || 1000 } })
        .then((response) => {
          if (parsers[check.parser] && parsers[check.parser](response.body)) {
            report.healthy = true;
            report.deck = 'deckhealthy';
            if (check.extractor && extractors[check.extractor] && report.meta) {
              Object.assign(report.meta, extractors[check.extractor](response.body));
            }
          }
          callback(report);
        })
        .catch((error) => {
          report.error = error;
          callback(report);
        });
    } else if (check.type === 'gamedig') {
      GameDig.query({
        type: check.queryType,
        host: check.path,
      })
      .then((state) => {
        report.healthy = true;
        report.deck = 'deckhealthy';
        if (check.extractor && extractors[check.extractor] && report.meta) {
          Object.assign(report.meta, extractors[check.extractor](state));
        }
        callback(report);
      })
      .catch((error) => {
        report.error = error;
        callback(report);
      });
    } else if (check.type === 'odalpapi') {
      const hostParts = check.path.split(':');
      OdalPapiService.queryGameServer({
        ip: hostParts[0],
        port: hostParts[1],
      }, true)
      .then((state) => {
        report.healthy = true;
        report.deck = 'deckhealthy';
        if (check.extractor && extractors[check.extractor] && report.meta) {
          Object.assign(report.meta, extractors[check.extractor](state));
        }
        callback(report);
      })
      .catch((error) => {
        report.error = error;
        callback(report);
      });
    }
  } else if (check.id && name === 'api') {
    report.healthy = true;
    report.deck = 'deckhealthy';
    callback(report);
  } else {
    report.error = 'Healthcheck Config Incomplete';
    callback(report);
  }
};

// declare third party healthcheck pinger
const pingHealthcheck = async (name) => {
  const id = config.services?.[name]?.healthcheck?.id;
  if (id) {
    const now = new Date().toISOString();
    const nicename = name.charAt(0).toUpperCase() + name.slice(1);
    try {
      const ping = await got(`${protocols.secure}${path.join('hc-ping.com', id)}`, {timeout: {request: 5000}});
      console.log(`${now}: ${nicename} healthcheck ping succeeded. ${ping.body}`);
    } catch (error) {
      console.log(`${now}: ${nicename} healthcheck ping failed. ${error}`);
    }
  }
};

// delcare application initializer
const initApplication = async () => {
  let redisClient;
  let redisStore;
  try {
    redisClient = createClient({ url: 'redis://127.0.0.1:6379', socket: { connectTimeout: 1000 } });
    await redisClient.connect();
    redisStore = new RedisStore({ client: redisClient, prefix: 'api-sessions:' });
  } catch (error) {
    console.warn('Redis unavailable, proceeding with in-memory session store.');
  }

  const application = express();

  // API session TTL for login sessions
  const API_SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

  if (config.services) {
    // apply routers and proxy routing
    Object.keys(config.services).forEach(name => {
      if (config.services[name].subdomain) {
        config.services[name].subdomain.router = express.Router();
        const secure = (env === 'production') && config.services[name].subdomain.protocol === 'secure';
        if (secure) config.services[name].subdomain.router.use('/.well-known', express.static(path.join(__dirname, 'web', 'all', '.well-known')));
        if (config.services[name].subdomain.proxy) {
          if (config.services[name].subdomain.type === 'proxy') {
            config.services[name].subdomain.proxy.middleware = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}` });
            if (config.services[name].subdomain.proxy.socket) {
              config.services[name].subdomain.proxy.websocket = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}`, ws: true });
            }
            if (config.services[name].subdomain.proxy.path) {
              config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.path, config.services[name].subdomain.proxy.middleware);
            } else {
              config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.middleware);
            }
          }
          if (config.services[name].subdomain.type !== 'proxy' && config.services[name].subdomain.proxy.path && config.services[name].subdomain.path) {
            config.services[name].subdomain.proxy.middleware = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}` });
            config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.path, config.services[name].subdomain.proxy.middleware);
          }
        }
      }
    });

    // setup redirects for secure and insecure and remove www
    application.set('trust proxy', 'loopback')
    application.use((request, response, next) => {
      const services = Object.keys(config.services);
      const now = new Date().toISOString();
      const address = request.socket?.remoteAddress?.split(':');
      const ip = address ? address[address.length - 1] : 'unknown';
      const host = request.headers.host;

      console.log(`${now}: ${protocols[request.secure ? 'secure' : 'insecure']}${host}${request.url} by ${ip}`);
      if (ip !== 'unknown' && blocklist && blocklist.includes(ip)) {
        console.log(`${now}: [blocklist] Blocking request from ${ip}`);
        return response.status(403).send('Access Denied');
      }
      if (ip !== 'unknown' && request.url.match(/wp-admin|wp-login|wp-content|wp-includes|wp-atom.php/i)) {
        console.log(`${now}: [bot-blocker] WordPress bot detected, blocking request from ${ip}`);
        return response.status(403).send('Access Denied');
      }

      response.set('x-forwarded-for', ip);

      const isValidHost = host === config.domain || 
                          host === `www.${config.domain}` ||
                          services.some(name => host === `${name}.${config.domain}`);
      
      if (!isValidHost) {
        return response.redirect(`${protocols.secure}${config.domain}`);
      }
      
      let target = services.find((name) => {
        return `${name}.${config.domain}` === host && config.services[name].subdomain;
      });
      
      if (request.url.includes('.well-known')) {
        if (request.secure) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        }
      } else {
        if (host && host.indexOf('www.') === 0) {
          return response.redirect(`${protocols.secure}${config.domain}${request.url}`);
        } else if (!target && host !== config.domain) {
          return response.redirect(`${protocols.insecure}${config.domain}${request.url}`);
        } else if (target && config.services[target].subdomain.protocol === 'insecure' && request.secure) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        } else if (env !== 'development' && env !== 'test') {
          if ((host === config.domain || config.services[target].subdomain.protocol === 'secure') && !request.secure) {
            return response.redirect(`${protocols.secure}${host}${request.url}`);
          }
        }
      }
      next();
    });

    // setup services
    Object.keys(config.services).forEach(name => {
      if (config.services[name].subdomain) {
        if (config.services[name].subdomain.type === 'index') {
          config.services[name].subdomain.router.use('/global', express.static(path.join(__dirname, 'web', 'global')));
          config.services[name].subdomain.router.use('/static', express.static(path.join(__dirname, 'web', 'static', name)));

          if (name === 'api') {
            config.services[name].subdomain.router.use(express.json());
            // create open service data route with CORS support
            config.services[name].subdomain.router.options('/service/:id', (req, res) => {
              const origin = req.headers.origin;
              if (origin && origin.match(new RegExp(`^https?://([a-zA-Z0-9-]+\\.)?${config.domain.replace('.', '\\.')}$`))) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.setHeader('Access-Control-Max-Age', '86400');
              }
              res.status(204).end();
            });
            config.services[name].subdomain.router.get('/service/:id', (req, res) => {
              const origin = req.headers.origin;
              if (origin && origin.match(new RegExp(`^https?://([a-zA-Z0-9-]+\\.)?${config.domain.replace('.', '\\.')}$`))) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              }
              const id = req.params?.id;
              let serviceData = { name: id, nicename: config.services[id]?.nicename || '' };
              res.json(serviceData);
            });
            // create login/logout routes if configured
            if (secrets.admin_email_address && secrets.api_password_hash) {
              config.services[name].subdomain.router.get('/login', (req, res) => {
                res.sendFile(path.join(__dirname, 'web', 'public', 'api', 'login', 'index.html'));
              });
              config.services[name].subdomain.router.use('/login', express.static(path.join(__dirname, 'web', 'public', 'api', 'login')));

              let sessionSecret = secrets.api_session_secret;
              if (!sessionSecret) {
                sessionSecret = crypto.randomBytes(32).toString('hex');
                try {
                  const secretsPath = path.join(__dirname, 'secrets.json');
                  let existing = {};
                  if (fs.existsSync(secretsPath)) existing = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
                  existing.api_session_secret = sessionSecret;
                  fs.writeFileSync(secretsPath, JSON.stringify(existing, null, 2));
                  secrets.api_session_secret = sessionSecret;
                  console.log('Persisted API session secret to secrets.json');
                } catch (e) {
                  console.warn('Failed to persist API session secret:', e.message);
                }
              }

              config.services[name].subdomain.router.use(session({
                store: redisStore || undefined,
                name: 'api_sid',
                secret: sessionSecret,
                resave: false,
                saveUninitialized: false,
                cookie: {
                  httpOnly: true,
                  secure: (env === 'production'),
                  sameSite: 'lax',
                  maxAge: API_SESSION_TTL,
                  path: '/',
                }
              }));

              config.services[name].subdomain.router.post('/login', async (req, res) => {
                try {
                  const { username, password } = req.body || {};
                  if (!username || !password) return res.status(400).send({ success: false, error: 'Missing credentials' });
                  if (username !== secrets.admin_email_address) return res.status(401).send({ success: false, error: 'Invalid credentials' });
                  const valid = await bcrypt.compare(password, secrets.api_password_hash);
                  if (!valid) return res.status(401).send({ success: false, error: 'Invalid credentials' });
                  req.session.authenticated = true;
                  req.session.username = username;
                  req.session.cookie.maxAge = API_SESSION_TTL;
                  res.send({ success: true });
                } catch (error) {
                  res.status(500).send({ success: false, error: error.message });
                }
              });

              config.services[name].subdomain.router.post('/logout', (req, res) => {
                try {
                  req.session.destroy((err) => {
                    const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                    if (env === 'production') cookieOptions.secure = true;
                    res.clearCookie('api_sid', cookieOptions);

                    if (err) {
                      return res.status(500).send({ success: false, error: 'Failed to destroy session' });
                    }
                    return res.send({ success: true });
                  });
                } catch (error) {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie('api_sid', cookieOptions);
                  res.status(500).send({ success: false, error: error.message });
                }
              });

              const apiAuth = (req, res, next) => {
                try {
                  if (req.session && req.session.authenticated) {
                    req.session.cookie.maxAge = API_SESSION_TTL;
                    return next();
                  }

                  const accept = req.headers.accept || '';
                  if (req.method === 'GET' && accept.includes('text/html')) {
                    const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                    return res.redirect(`/login?next=${nextUrl}`);
                  }

                  return res.status(401).sendFile(path.join(__dirname, 'web', 'public', '401.html'));
                } catch (error) {
                  return res.status(401).sendFile(path.join(__dirname, 'web', 'public', '401.html'));
                }
              };
              config.services[name].subdomain.router.use(apiAuth);
            }

            // create checklist route
            config.services[name].subdomain.router.get('/checklist', (req, res) => {
              const checklist = [];
              Object.entries(config.services).forEach(([serviceID, service]) => {
                if (service.healthcheck && service.healthcheck.platform) {
                  const item = { 
                    name: serviceID, 
                    polltime: service.healthcheck.pollrate ? service.healthcheck.pollrate*1000 : 30000, 
                    platform: service.healthcheck.platform
                  };
                  if (service.nicename) {
                    item.nicename = service.nicename;
                  }
                  checklist.push(item);
                } else if (service.nicename) {
                  const item = { name: serviceID, nicename: service.nicename };
                  checklist.push(item);
                }
              });
              res.json(checklist);
            });

            // create health check routes
            Object.keys(config.services).forEach(healthname => {
              if (config.services[healthname].healthcheck) {
                config.services[name].subdomain.router.get(`/health/${healthname}`, (request, response) => {
                  response.setHeader('Content-Type', 'application/json');
                  checkService(healthname, response.send.bind(response));
                });
              }
            });

            if (secrets.shock_password_hash && secrets.shock_mac) {
              // create wake-on-lan service with rate limiting
              const shockLimiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 5, // limit each IP to 5 requests per windowMs
                message: { status: 'Too Many Requests', error: 'Rate limit exceeded. Try again later.' },
                standardHeaders: true,
                legacyHeaders: false,
              });
              
              config.services[name].subdomain.router.post('/shock', shockLimiter, async (request, response) => {
                response.setHeader('Content-Type', 'application/json');
                
                try {
                  let isValid = false;
                  
                  if (secrets.shock_password_hash) {
                    isValid = await bcrypt.compare(request.body.password, secrets.shock_password_hash);
                  }
                  
                  if (isValid) {
                    wol.wake(secrets.shock_mac, (error) => {
                      if (error) {
                        response.send({status: 'Error', error});
                      } else {
                        response.send({status: 'Shocked!'});
                      }
                    });
                  } else {
                    response.status(403).send({status: 'Access Denied'});
                  }
                } catch (error) {
                  response.status(500).send({status: 'Error', error: error.message});
                }
              });
            }
          }
            
          config.services[name].subdomain.router.use(express.static(path.join(__dirname, 'web', 'public', name)));
          config.services[name].subdomain.router.get('/', (request, response) => {
            response.sendFile(path.join(__dirname, 'web', 'public', name, 'index.html'));
          });
          config.services[name].subdomain.router.use((request, response) => {
            response.status(404).sendFile(path.join(__dirname, 'web', 'public', '404.html'));
          });
        } else if (config.services[name].subdomain.type === 'dirlist') {
          if (config.services[name].subdomain.basicUser && config.services[name].subdomain.basicPass) {
            const authMiddleware = basicAuth({
              users: { [config.services[name].subdomain.basicUser]: config.services[name].subdomain.basicPass },
              challenge: true
            });
            config.services[name].subdomain.router.use('/protected', authMiddleware);
          }
          config.services[name].subdomain.router.use('/', express.static(path.join(__dirname, 'web', 'public', name)), serveIndex(path.join(__dirname, 'web', 'public', name)));
        } else if (config.services[name].subdomain.type === 'spa') {
          // Serve static files from the public directory
          config.services[name].subdomain.router.use(express.static(path.join(__dirname, 'web', 'public', name), {
            maxAge: '1y', // Cache static assets for 1 year
            etag: true,
            lastModified: true,
            setHeaders: (res, filepath) => {
              // Set appropriate cache control headers
              if (filepath.endsWith('.html')) {
                // Don't cache HTML files (especially index.html)
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              } else if (filepath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
                // Cache other static assets
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              }
            }
          }));
          // SPA fallback - all non-file routes return index.html for client-side routing
          config.services[name].subdomain.router.get('*', (request, response) => {
            response.sendFile(path.join(__dirname, 'web', 'public', name, 'index.html'));
          });
        }
        application.use(subdomain(name, config.services[name].subdomain.router));
      }
    });

    if (config.services.www) {
      // setup domain
      application.use(config.services.www.subdomain.router);
    }
  }

  return application;
}

// declare websocket upgrade handler
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
};

// helper function to write JSON config and restart server
const saveConfigAndRestart = (filePath, data, message, response, delay = 2000) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  response.status(200).send({ success: true, message });
  if (delay >= 0) {
    setTimeout(() => {
      process.exit(0);
    }, delay);
  }
};

// helper function for error responses
const sendError = (response, statusCode, error) => {
  response.status(statusCode).send({ 
    success: false, 
    error: typeof error === 'string' ? error : error.message,
    ...(error.details && { details: error.details })
  });
};

/* DDNS SETUP */
if (ddns && ddns.active && ddns.aws_access_key_id && ddns.aws_secret_access_key && ddns.aws_region && ddns.route53_hosted_zone_id) {
  const { Route53Client, ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
  const route53 = new Route53Client({
    region: ddns.aws_region,
    credentials: {
      accessKeyId: ddns.aws_access_key_id,
      secretAccessKey: ddns.aws_secret_access_key,
    },
  });
  
  let lastKnownIP = null;
  
  const updateDNSRecord = async () => {
    try {
      const response = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
      const publicIP = response.body.trim();
      
      if (publicIP === lastKnownIP) {
        return;
      }
      
      const changes = [{
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: config.domain,
          Type: 'A',
          TTL: 300,
          ResourceRecords: [{ Value: publicIP }],
        },
      },
      {
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: `*.${config.domain}`,
          Type: 'A',
          TTL: 300,
          ResourceRecords: [{ Value: publicIP }],
        },
      }];
      
      if (env === 'development') {
        console.log('DDNS update skipped in development mode:', changes);
        lastKnownIP = publicIP;
        return;
      }
      
      const params = {
        ChangeBatch: {
          Changes: changes,
          Comment: 'Updated automatically by Dynamic DNS',
        },
        HostedZoneId: ddns.route53_hosted_zone_id,
      };
      const command = new ChangeResourceRecordSetsCommand(params);
      await route53.send(command);
      
      lastKnownIP = publicIP;
      const now = new Date().toISOString();
      console.log(`${now}: DDNS updated to ${publicIP}`);
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: DDNS update failed: ${error}`);
    }
  };

  updateDNSRecord();
  if (env === 'production') {
    cron.schedule('*/5 * * * *', () => {
      updateDNSRecord();
    });
  }
}

/* CONFIGURATOR SETUP */
// config editor app

// declare default ignore watch files
const defaultIgnoreWatch = [
  "node_modules",
  "web",
  "advanced.json",
  "blocklist.json",
  "certs.json",
  "config.json",
  "ddns.json",
  "ecosystem.config.js",
  "secrets.json",
  "package-lock.json",
  "package.json",
  "readme.md",
  ".*"
];

// initialize configurator app
const manapp = express();

// config editor router
const manrouter = express.Router();

// serve static files from configurator directory (excluding index.html)
manrouter.use(express.static(path.join(__dirname, 'configurator'), {
  index: false
}));

// serve global resources (favicon, etc.)
manrouter.use('/global', express.static(path.join(__dirname, 'web', 'global')));

manrouter.use(express.json());

// setup config editor routes
manrouter.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, 'configurator', 'index.html'));
});

manrouter.get('/config', (request, response) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const configObj = JSON.parse(configData);
    response.setHeader('Content-Type', 'application/json');
    response.send(configObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/blocklist', (request, response) => {
  try {
    const blocklistPath = path.join(__dirname, 'blocklist.json');
    const blocklistData = fs.readFileSync(blocklistPath, 'utf8');
    const blocklistObj = JSON.parse(blocklistData);
    response.setHeader('Content-Type', 'application/json');
    response.send(blocklistObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/secrets', (request, response) => {
  try {
    const secretsPath = path.join(__dirname, 'secrets.json');
    const secretsData = fs.readFileSync(secretsPath, 'utf8');
    const secretsObj = JSON.parse(secretsData);
    response.setHeader('Content-Type', 'application/json');
    response.send(secretsObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/certs', (request, response) => {
  try {
    const certsPath = path.join(__dirname, 'certs.json');
    if (fs.existsSync(certsPath)) {
      const certsData = fs.readFileSync(certsPath, 'utf8');
      const certsObj = JSON.parse(certsData);
      response.setHeader('Content-Type', 'application/json');
      response.send(certsObj);
    } else {
      response.setHeader('Content-Type', 'application/json');
      response.send({ services: [], provisionedAt: null });
    }
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/publicip', async (request, response) => {
  try {
    const ipResponse = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
    const publicIP = ipResponse.body.trim();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip: publicIP });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/localip', (request, response) => {
  try {
    const networkInterfaces = os.networkInterfaces();
    let localIP = null;
    
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP) break;
    }
    
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip: localIP || '127.0.0.1' });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/ecosystem', (request, response) => {
  try {
    const ecosystemPath = path.join(__dirname, 'ecosystem.config.js');
    
    if (!fs.existsSync(ecosystemPath)) {
      const defaultEcosystem = {
        default: true,
        apps: [{
          name: "Reverse Proxy",
          script: "./app.js",
          watch: true,
          ignore_watch: defaultIgnoreWatch,
          env: {
            NODE_ENV: "production"
          }
        }]
      };
      response.setHeader('Content-Type', 'application/json');
      return response.send(defaultEcosystem);
    }
    
    const ecosystemConfig = require(ecosystemPath);
    
    // if ecosystemConfig ignoreWatch is missing items from defaultIgnoreWatch, add a flag to the returned object
    const ignoreWatch = ecosystemConfig.apps?.[0]?.ignore_watch || [];
    const missingIgnores = defaultIgnoreWatch.filter(item => !ignoreWatch.includes(item));
    if (missingIgnores.length > 0) {
      ecosystemConfig.resave = true;
    }
    response.setHeader('Content-Type', 'application/json');
    response.send(ecosystemConfig);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.put('/config', (request, response) => {
  try {
    const updatedConfig = request.body;
    
    const configSchema = {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string', minLength: 1 },
        services: {
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9_-]+$': {
              type: 'object',
              properties: {
                nicename: { type: 'string' },
                subdomain: { type: 'object' },
                healthcheck: { type: 'object' }
              }
            }
          }
        }
      },
      additionalProperties: false
    };
    
    const validate = ajv.compile(configSchema);
    if (!validate(updatedConfig)) {
      return sendError(response, 400, { message: 'Invalid config format', details: validate.errors });
    }
    
    if (updatedConfig.domain !== config.domain) {
      console.log('Domain change detected, clearing provisioned certificates');
      registerProvisionedCerts([], false, false);
    }

    const configPath = path.join(__dirname, 'config.json');
    saveConfigAndRestart(configPath, updatedConfig, 'Config updated successfully', response);
  } catch (error) {
    sendError(response, 500, error);
  }
});

manrouter.put('/blocklist', (request, response) => {
  try {
    const updatedBlocklist = request.body;
    if (!Array.isArray(updatedBlocklist)) {
      return sendError(response, 400, 'Blocklist must be an array of IP addresses');
    }
    const blocklistPath = path.join(__dirname, 'blocklist.json');
    blocklist = updatedBlocklist;
    saveConfigAndRestart(blocklistPath, updatedBlocklist, 'Blocklist updated successfully', response, -1);
  } catch (error) {
    sendError(response, 500, error);
  }
});

manrouter.put('/secrets', async (request, response) => {
  try {
    const updatedSecrets = request.body;
    
    const secretsSchema = {
      type: 'object',
      properties: {
        admin_email_address: { 
          type: 'string',
          pattern: '^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        shock_password_hash: { type: 'string' },
        shock_mac: { 
          type: 'string', 
          pattern: '^$|^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$' 
        },
        api_password_hash: { type: 'string' }
      },
      additionalProperties: true
    };
    
    const validate = ajv.compile(secretsSchema);
    if (!validate(updatedSecrets)) {
      return sendError(response, 400, { message: 'Invalid secrets format', details: validate.errors });
    }
    
    let existingSecrets = {};
    try {
      const secretsPath = path.join(__dirname, 'secrets.json');
      const secretsData = fs.readFileSync(secretsPath, 'utf8');
      existingSecrets = JSON.parse(secretsData);
    } catch (e) {
      // do nothing: no existing secrets
    }
    
    // If shock_password_hash is empty but existed before, restore the old hash
    if ((!updatedSecrets.shock_password_hash || updatedSecrets.shock_password_hash.trim() === '') && existingSecrets.shock_password_hash) {
      updatedSecrets.shock_password_hash = existingSecrets.shock_password_hash;
    }
    
    // If shock_password_hash is provided and looks like plaintext (not a hash), hash it
    if (updatedSecrets.shock_password_hash && !updatedSecrets.shock_password_hash.startsWith('$2b$')) {
      updatedSecrets.shock_password_hash = await bcrypt.hash(updatedSecrets.shock_password_hash, 10);
    }

    // If api_password_hash is empty but existed before, restore the old hash
    if (!updatedSecrets.api_password_hash) {
      // do nothing, leave it undefined
    } else if ((updatedSecrets.api_password_hash.trim() === '') && existingSecrets.api_password_hash) {
      updatedSecrets.api_password_hash = existingSecrets.api_password_hash;
    }

    // If api_password_hash is provided and looks like plaintext (not a hash), hash it
    if (updatedSecrets.api_password_hash && !updatedSecrets.api_password_hash.startsWith('$2b$')) {
      updatedSecrets.api_password_hash = await bcrypt.hash(updatedSecrets.api_password_hash, 10);
    }

    const secretsPath = path.join(__dirname, 'secrets.json');
    saveConfigAndRestart(secretsPath, updatedSecrets, 'Secrets updated successfully', response);
  } catch (error) {
    sendError(response, 500, error);
  }
});

manrouter.get('/colors', (request, response) => {
  try {
    const colorsPath = path.join(__dirname, 'web', 'global', 'colors.json');
    const colorsData = fs.readFileSync(colorsPath, 'utf8');
    const colorsObj = JSON.parse(colorsData);
    response.setHeader('Content-Type', 'application/json');
    response.send(colorsObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.put('/colors', (request, response) => {
  try {
    const updatedColors = request.body;
    
    const hexColorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
    const colorFields = ['primary', 'secondary', 'accent', 'background', 'inverse'];
    
    const receivedFields = Object.keys(updatedColors);
    const extraFields = receivedFields.filter(f => !colorFields.includes(f));
    if (extraFields.length > 0) {
      return response.status(400).send({ 
        success: false, 
        error: `Unexpected fields: ${extraFields.join(', ')}. Only ${colorFields.join(', ')} are allowed.` 
      });
    }
    
    for (const field of colorFields) {
      if (!updatedColors[field]) {
        return response.status(400).send({ 
          success: false, 
          error: `Missing required field: ${field}` 
        });
      }
      
      if (typeof updatedColors[field] !== 'string') {
        return response.status(400).send({ 
          success: false, 
          error: `Invalid type for ${field}. Must be a string.` 
        });
      }
      
      if (!hexColorRegex.test(updatedColors[field])) {
        return response.status(400).send({ 
          success: false, 
          error: `Invalid color format for ${field}. Must be a valid hex color (e.g., #ffffff or #fff)` 
        });
      }
    }
    
    const colorsPath = path.join(__dirname, 'web', 'global', 'colors.json');
    fs.writeFileSync(colorsPath, JSON.stringify(updatedColors, null, 2));
    
    const browserconfigPath = path.join(__dirname, 'web', 'global', 'favicon', 'browserconfig.xml');
    const browserconfigContent = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
    <msapplication>
        <tile>
            <square150x150logo src="/mstile-150x150.png"/>
            <TileColor>${updatedColors.primary || '#ffffff'}</TileColor>
        </tile>
    </msapplication>
</browserconfig>
`;
    fs.writeFileSync(browserconfigPath, browserconfigContent);
    
    const webmanifestPath = path.join(__dirname, 'web', 'global', 'favicon', 'site.webmanifest');
    const webmanifest = {
      name: "Reverse Proxy Server",
      short_name: "ReverseProxy",
      icons: [
        {
          src: "./android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png"
        }
      ],
      theme_color: updatedColors.primary || '#ffffff',
      background_color: updatedColors.background || '#000000',
      display: "standalone"
    };
    fs.writeFileSync(webmanifestPath, JSON.stringify(webmanifest, null, 4));
    
    response.status(200).send({ success: true, message: 'Colors updated successfully' });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.post('/favicon', faviconUpload.single('favicon'), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).send({ success: false, error: 'No file uploaded' });
    }

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedMimeTypes.includes(request.file.mimetype)) {
      return response.status(400).send({ 
        success: false, 
        error: `Invalid file type. Only image files are allowed (${allowedMimeTypes.join(', ')})` 
      });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (request.file.size > maxSize) {
      return response.status(400).send({ 
        success: false, 
        error: 'File too large. Maximum size is 5MB' 
      });
    }

    const faviconDir = path.join(__dirname, 'web', 'global', 'favicon');
    
    if (!fs.existsSync(faviconDir)) {
      fs.mkdirSync(faviconDir, { recursive: true });
    }

    const originalPath = path.join(faviconDir, 'favicon-original.png');
    fs.writeFileSync(originalPath, request.file.buffer);

    const sizes = [
      { name: 'android-chrome-192x192.png', size: 192 },
      { name: 'apple-touch-icon.png', size: 180 },
      { name: 'favicon-32x32.png', size: 32 },
      { name: 'favicon-16x16.png', size: 16 },
      { name: 'mstile-150x150.png', size: 150 }
    ];

    for (const { name, size } of sizes) {
      await sharp(request.file.buffer)
        .resize(size, size)
        .png()
        .toFile(path.join(faviconDir, name));
    }

    const ico32 = await sharp(request.file.buffer).resize(32, 32).png().toBuffer();
    const ico16 = await sharp(request.file.buffer).resize(16, 16).png().toBuffer();
    const icoBuffer = await toIco([ico32, ico16]);
    fs.writeFileSync(path.join(faviconDir, 'favicon.ico'), icoBuffer);

    response.status(200).send({ success: true, message: 'Favicon uploaded successfully' });
  } catch (error) {
    console.error('Favicon upload error:', error);
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/ddns', (request, response) => {
  try {
    const ddnsPath = path.join(__dirname, 'ddns.json');
    const ddnsData = fs.readFileSync(ddnsPath, 'utf8');
    const ddnsObj = JSON.parse(ddnsData);
    response.setHeader('Content-Type', 'application/json');
    response.send(ddnsObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.put('/ddns', (request, response) => {
  try {
    const updatedDdns = request.body;
    
    const ddnsSchema = {
      type: 'object',
      required: ['active', 'aws_access_key_id', 'aws_secret_access_key', 'aws_region', 'route53_hosted_zone_id'],
      properties: {
        active: { type: 'boolean' },
        aws_access_key_id: { type: 'string', minLength: 1 },
        aws_secret_access_key: { type: 'string', minLength: 1 },
        aws_region: { type: 'string', minLength: 1 },
        route53_hosted_zone_id: { type: 'string', minLength: 1 }
      },
      additionalProperties: false
    };
    
    const validate = ajv.compile(ddnsSchema);
    if (!validate(updatedDdns)) {
      return sendError(response, 400, { message: 'Invalid DDNS configuration format', details: validate.errors });
    }
    
    const ddnsPath = path.join(__dirname, 'ddns.json');
    saveConfigAndRestart(ddnsPath, updatedDdns, 'DDNS configuration updated successfully', response);
  } catch (error) {
    sendError(response, 500, error);
  }
});

manrouter.get('/advanced', (request, response) => {
  try {
    const advancedPath = path.join(__dirname, 'advanced.json');
    
    if (!fs.existsSync(advancedPath)) {
      const defaultAdvanced = {
        parsers: {},
        extractors: {},
        queryTypes: []
      };
      response.setHeader('Content-Type', 'application/json');
      return response.send(defaultAdvanced);
    }
    
    const advancedData = fs.readFileSync(advancedPath, 'utf8');
    const advancedObj = JSON.parse(advancedData);
    response.setHeader('Content-Type', 'application/json');
    response.send(advancedObj);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/checklogrotate', (request, response) => {
  if (env === 'development') {
    return response.status(200).send({ success: true, message: 'Logrotate success response faked in development mode.' });
  }
  exec('pm2 describe pm2-logrotate', (err, out) => {
    if ((err && err.toString().includes("doesn't exist")) || (out && out.includes("doesn't exist"))) {
      return response.status(500).send({ success: false, error: 'Logrotate module is not installed. Please install it to enable live log streaming.' });
    }
    return response.status(200).send({ success: true, message: 'Logrotate module is installed.' });
  });
});

manrouter.get('/installlogrotate', (request, response) => {
  if (env === 'development') {
    setTimeout(() => {
      return response.status(500).send({ success: false, error: 'Logrotate module cannot be installed in development mode.' });
    }, 5000);
  } else {
    exec('pm2 install pm2-logrotate', (err, out) => {
      if (err) {
        return response.status(500).send({ success: false, error: `Failed to install logrotate module: ${err.message}` });
      }
      response.status(200).send({ success: true, message: 'Logrotate module installed successfully.' });
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    });
  }
});

// setup PM2 live logs route
manrouter.get('/logs/:appName/:type', (request, response) => {
  const appName = request.params.appName;
  const type = request.params.type || 'out';

  function setSSEHeaders(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
  }

  function sendLogLines(res, data) {
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      if (line) res.write(`data: ${line}\n\n`);
    }
  }

  if (env === 'development') {
    setSSEHeaders(response);
    let count = 1;
    const interval = setInterval(() => {
      response.write(`data: 2026-01-21T02:28:46.493Z: (${appName} Development Mode: Mocked test message) [${count}]\n\n`);
      count++;
      if (count > 100) {
        clearInterval(interval);
        setTimeout(() => response.end(), 60000);
      }
    }, 100);
    request.on('close', () => {
      clearInterval(interval);
      response.end();
    });
    return;
  }

  if (env === 'production' || env === 'test') {
    setSSEHeaders(response);
    const logPath = path.join(os.homedir(), '.pm2', 'logs', `${appName.replace(' ', '-')}-${type}.log`);
    if (!fs.existsSync(logPath)) {
      response.write(`data: Log file not found\n\n`);
      response.end();
      return;
    }

    const keepAliveInterval = setInterval(() => {
      response.write(': keep-alive\n\n');
    }, 30000);

    let fileSize = fs.statSync(logPath).size;
    let fileDescriptor = fs.openSync(logPath, 'r');
    let isClosed = false;

    // Initial tail of last 100 lines
    const tail = require('child_process').spawn('tail', ['-n', '100', logPath]);
    tail.stdout.on('data', (data) => sendLogLines(response, data.toString('utf8')));
    tail.on('close', () => {});

    // Watch for changes
    const watcher = fs.watch(logPath, (eventType) => {
      if (eventType === 'change') {
        try {
          const stats = fs.statSync(logPath);
          if (stats.size > fileSize) {
            const readLen = stats.size - fileSize;
            const readBuffer = Buffer.alloc(readLen);
            fs.readSync(fileDescriptor, readBuffer, 0, readLen, fileSize);
            fileSize = stats.size;
            sendLogLines(response, readBuffer.toString('utf8'));
          }
        } catch (err) {
          // file may be rotated, ignore
        }
      }
    });

    request.on('close', () => {
      if (isClosed) return;
      isClosed = true;
      clearInterval(keepAliveInterval);
      watcher.close();
      fs.closeSync(fileDescriptor);
      tail.kill();
    });
    return;
  }

  // Fallback for other environments
  setSSEHeaders(response);
  response.write(`data: Logs are not available in this environment\n\n`);
  response.end();
});

manrouter.put('/advanced', (request, response) => {
  try {
    const updatedAdvanced = request.body;
    
    const advancedSchema = {
      type: 'object',
      properties: {
        parsers: { type: 'object' },
        extractors: { type: 'object' },
        queryTypes: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      additionalProperties: false
    };
    
    const validate = ajv.compile(advancedSchema);
    if (!validate(updatedAdvanced)) {
      return sendError(response, 400, { message: 'Invalid advanced configuration format', details: validate.errors });
    }
    
    const advancedPath = path.join(__dirname, 'advanced.json');
    saveConfigAndRestart(advancedPath, updatedAdvanced, 'Advanced configuration updated successfully', response);
  } catch (error) {
    sendError(response, 500, error);
  }
});

manrouter.put('/ecosystem', (request, response) => {
  try {
    const updatedEcosystem = request.body;
    
    const ecosystemSchema = {
      type: 'object',
      properties: {
        apps: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['name', 'script'],
            properties: {
              name: { type: 'string', minLength: 1 },
              script: { type: 'string', minLength: 1 },
              watch: { type: 'boolean' },
              ignore_watch: { type: 'array', items: { type: 'string' } },
              env: { type: 'object' }
            }
          }
        }
      },
      additionalProperties: true
    };
    
    const validate = ajv.compile(ecosystemSchema);
    if (!validate(updatedEcosystem)) {
      return response.status(400).send({ 
        success: false, 
        error: 'Invalid ecosystem configuration format', 
        details: validate.errors 
      });
    }
    
    let firstrun = true;
    const ecosystemPath = path.join(__dirname, 'ecosystem.config.js');

    if (fs.existsSync(ecosystemPath)) {
      firstrun = false;
    }

    if (updatedEcosystem.apps && updatedEcosystem.apps.length > 0) {
      updatedEcosystem.apps[0].ignore_watch = Array.from(new Set([...(updatedEcosystem.apps[0].ignore_watch || []), ...defaultIgnoreWatch]));
    }

    const fileContent = `module.exports = ${JSON.stringify(updatedEcosystem, null, 2)}\n`;
    fs.writeFileSync(ecosystemPath, fileContent);
    
    response.status(200).send({ success: true, message: 'Ecosystem config updated successfully' });
    setTimeout(() => {
      if (env === 'development') {
        process.exit(0);
      } else {
        if (firstrun) {
          exec('pm2 start ecosystem.config.js && pm2 save', () => {
            process.exit(0);
          });
        } else {
          const safeName = (updatedEcosystem.apps[0].name || 'app').replace(/[^a-zA-Z0-9 _-]/g, '');
          exec(`pm2 restart '${ecosystem.apps[0].name}' ecosystem.config.js --name '${safeName}'`, () => {
            process.exit(0);
          });
        }
      }
    }, 2000);
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/git/status', (request, response) => {
  try {
    exec('git rev-parse --abbrev-ref HEAD', (branchError, branchOut) => {
      if (branchError) {
        return response.status(500).send({ success: false, error: 'Not a git repository or git not available' });
      }
      
      const branch = branchOut.trim();
      
      exec('git rev-parse --short HEAD', (commitError, commitOut) => {
        if (commitError) {
          return response.status(500).send({ success: false, error: 'Could not get commit hash' });
        }
        
        const commit = commitOut.trim();
        
        exec('git log -1 --format=%s', (messageError, messageOut) => {
          const message = messageError ? '' : messageOut.trim();
          
          exec('git log -1 --format=%ct', (timestampError, timestampOut) => {
            let version = 'Unknown';
            
            if (env === 'development') {
              version = 'Developer Mode';
            } else if (!timestampError && timestampOut.trim()) {
              const timestamp = parseInt(timestampOut.trim()) * 1000;
              const d = new Date(timestamp);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const hours = String(d.getHours()).padStart(2, '0');
              const minutes = String(d.getMinutes()).padStart(2, '0');
              version = `${year}.${month}.${day}.${hours}${minutes}`;
            }
            
            response.status(200).send({
              success: true,
              branch,
              commit,
              message,
              version,
            });
          });
        });
      });
    });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.get('/git/check', (request, response) => {
  try {
    if (env === 'development') {
      return response.status(200).send({
        success: true,
        updatesAvailable: true,
        commitsAhead: 1,
        message: '1 Update Available',
      });
    }
    
    exec('git fetch origin', (fetchError) => {
      if (fetchError) {
        return response.status(500).send({ success: false, error: 'Could not fetch from origin' });
      }
      
      exec('git rev-parse HEAD', (localError, localOut) => {
        if (localError) {
          return response.status(500).send({ success: false, error: 'Could not get local commit' });
        }
        
        const localCommit = localOut.trim();
        
        exec('git rev-parse @{u}', (remoteError, remoteOut) => {
          if (remoteError) {
            return response.status(200).send({ success: true, updatesAvailable: false, message: 'No upstream branch configured' });
          }
          
          const remoteCommit = remoteOut.trim();
          const updatesAvailable = localCommit !== remoteCommit;
          
          if (updatesAvailable) {
            exec('git rev-list --count HEAD..@{u}', (countError, countOut) => {
              const commitsAhead = countError ? 0 : parseInt(countOut.trim());
              response.status(200).send({
                success: true,
                updatesAvailable: true,
                commitsAhead,
                message: `${commitsAhead} Update${commitsAhead !== 1 ? 's' : ''} Available`
              });
            });
          } else {
            response.status(200).send({
              success: true,
              updatesAvailable: false,
              message: 'Already up to date'
            });
          }
        });
      });
    });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.post('/git/pull', (request, response) => {
  try {
    if (env === 'development') {
      response.status(500).send({
        success: false,
        error: 'Development mode: No actual update performed, showing as failed to test force update.',
      });
      return;
    }
    
    exec('git pull origin', (error, stdout, stderr) => {
      if (error) {
        return response.status(500).send({ success: false, error: stderr || error.message });
      }
      
      if (stdout.includes('package.json') || stdout.includes('package-lock.json')) {
        exec('npm install', (npmError, npmStdout, npmStderr) => {
          if (npmError) {
            response.status(500).send({ success: false, error: `Update succeeded but dependency install failed: ${npmStderr || npmError.message}` });
          } else {
            response.status(200).send({ success: true, message: 'Update successful', output: stdout });
          }
          setTimeout(() => {
            exec(`pm2 restart '${ecosystem.apps[0].name}'`, () => {
              process.exit(0);
            });
          }, 2000);
        });
      } else {
        response.status(200).send({ success: true, message: 'Update successful', output: stdout });
        setTimeout(() => {
          exec(`pm2 restart '${ecosystem.apps[0].name}'`, () => {
            process.exit(0);
          });
        }, 2000);
      }
    });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

manrouter.post('/git/force', (request, response) => {
  try {
    if (env === 'development') {
      response.status(200).send({
        success: true,
        message: 'Force update endpoint tested successfully',
        output: 'Development mode: No actual git pull performed',
      });
      setTimeout(() => {
        process.exit(0);
      }, 2000);
      return;
    }
    
    exec('git reset --hard origin', (error, stdout, stderr) => {
      if (error) {
        return response.status(500).send({ success: false, error: stderr || error.message });
      }
      
      exec('npm install', (npmError, npmStdout, npmStderr) => {
        if (npmError) {
          response.status(500).send({ success: false, error: `Update succeeded but dependency install failed: ${npmStderr || npmError.message}` });
        } else {
          response.status(200).send({ success: true, message: 'Update successful', output: stdout });
        }
        setTimeout(() => {
          exec(`pm2 restart '${ecosystem.apps[0].name}'`, () => {
            process.exit(0);
          });
        }, 2000);
      });
    });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

// declare helper to register provisioned certs
const registerProvisionedCerts = (secureServices, crontab, permissions) => {
  try {
    const certsData = {
      services: secureServices,
      provisionedAt: new Date().toISOString(),
      crontab,
      permissions
    };
    const certsPath = path.join(__dirname, 'certs.json');
    fs.writeFileSync(certsPath, JSON.stringify(certsData, null, 2), 'utf8');
  } catch (writeError) {
    console.error('Failed to write certs.json:', writeError);
  }
};

manrouter.put('/certs', (request, response) => {
  try {
    const email = request.body.email;
    
    if (!email) {
      return response.status(400).send({ success: false, error: 'Email address is required' });
    }
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return response.status(400).send({ 
        success: false, 
        error: 'Invalid email address format' 
      });
    }
    
    const dangerousChars = /[;`$&|<>\\]/;
    if (dangerousChars.test(email)) {
      return response.status(400).send({ 
        success: false, 
        error: 'Email contains invalid characters' 
      });
    }
    
    const domains = [config.domain];
    const secureServices = Object.keys(config.services || {}).filter(name => {
      return config.services[name].subdomain?.protocol === 'secure';
    });
    if (secureServices.length > 0) {
      secureServices.forEach(name => {
        domains.push(`${name}.${config.domain}`);
      });
    
      const domainFlags = domains.map(d => `-d ${d}`).join(' ');
      const deployHook = `sudo -u ${os.userInfo().username} bash -c '. ~/.bashrc; pm2 restart all'`;
      const baseCommand = `sudo certbot certonly --webroot --webroot-path ${path.join(__dirname, 'web', 'all')} --cert-name ${config.domain} ${domainFlags} --non-interactive --agree-tos --email ${email}`;
      const cronCommandWithHook = `${baseCommand} --deploy-hook "${deployHook}"`;

      if (env === 'development') {
        registerProvisionedCerts(secureServices, true, true);
        response.status(200).send({ success: true, message: 'Development mode: Certificates sucessfully not provisioned.' });
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } else {
        exec(baseCommand, (error, stdout, stderr) => {
          if (error) {
            return response.status(500).send({ success: false, error: error.message });
          }

          const cronCommand = `0 0 * * * ${cronCommandWithHook}`;
          const certbotReport = { success: true };
          const tmpCronFile = path.join(os.tmpdir(), `reverseproxy-cron-${Date.now()}.txt`);
          try {
            const existingCron = require('child_process').execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
            const filtered = existingCron.split(/\r?\n/).filter(line => !line.includes('certbot certonly --webroot') && line.trim() !== '').join('\n');
            const newCron = (filtered ? filtered + '\n' : '') + cronCommand + '\n';
            fs.writeFileSync(tmpCronFile, newCron, { encoding: 'utf8', mode: 0o600 });
            exec(`crontab "${tmpCronFile}"`, (cronError, cronStdout, cronStderr) => {
              try { fs.unlinkSync(tmpCronFile); } catch (e) {}
              if (cronError) {
                certbotReport.message = 'Certificates provisioned successfully, but automatic renewal setup failed. You may need to set up cron manually.';
              } else {
                certbotReport.message = 'Certificates provisioned successfully and automatic renewal configured.';
              }

            const chmodCommands = [
              'sudo find /etc/letsencrypt/live -type d -exec sudo chmod 755 {} \\;',
              'sudo find /etc/letsencrypt/archive -type d -exec sudo chmod 755 {} \\;',
              'sudo find /etc/letsencrypt/live -type f -name "*.pem" -exec sudo chmod 644 {} \\;',
              'sudo find /etc/letsencrypt/archive -type f -name "*.pem" -exec sudo chmod 644 {} \\;'
            ];
            
            let chmodFailed = false;
            const runChmodCommands = (index = 0) => {
              if (index >= chmodCommands.length) {
                if (chmodFailed) {
                  certbotReport.message += ' Permissions update on certificates failed, you may need to set up permissions manually.';
                }

                registerProvisionedCerts(secureServices, !cronError, !chmodFailed);

                response.status(200).send(certbotReport);
                
                setTimeout(() => {
                  process.exit(0);
                }, 2000);
                return;
              }
              
              exec(chmodCommands[index], (chmodError, chmodStdout, chmodStderr) => {
                if (chmodError) {
                  chmodFailed = true;
                }
                runChmodCommands(index + 1);
              });
            };
            
            runChmodCommands();
          });
          } catch (err) {
            try { fs.unlinkSync(tmpCronFile); } catch (e) {}
            certbotReport.message = 'Certificates provisioned successfully, but automatic renewal setup failed: ' + err.message;
            response.status(500).send({ success: false, error: err.message });
            return;
          }
        });
      }
    } else {
      response.status(200).send({ success: true });
    }
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

// attach router to app
manapp.use(manrouter);

// setup config editor server
const manserver = http.createServer(manapp);

// setup config editor listener
manserver.listen(3000, () => {
  console.log(`Configurator running on port 3000`);
});

let cert;
if (env === 'production') {
  // retrieve certificate
  try {
    cert = {
      key: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'privkey.pem'), 'utf8'),
      cert: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'cert.pem'), 'utf8'),
      ca: fs.readFileSync(path.join('/etc', 'letsencrypt', 'live', config.domain, 'chain.pem'), 'utf8'),
    };
  } catch (error) {
    console.error('Error loading SSL certificates, try provisioning certificates using the configurator.');
  }

  // setup healthcheck pings
  cron.schedule('1 * * * *', () => {
    const services = Object.keys(config.services).filter((name) => config.services[name].healthcheck);
    services.forEach((name) => {
      checkService(name, (service) => {
        if (service.healthy) {
          pingHealthcheck(name);
        }
      });
    });
  });
}
if (env === 'development') {
  // test healthcheck pings
  pingHealthcheck('test');
}

/* SERVER SETUP */
if (config.domain) {
  // initialize application
  initApplication().then((app) => {
    const port_http = (env === 'development' || env === 'test') ? 80 : 8080;
    const httpServer = http.createServer(app);
    const httpsServer = cert ? https.createServer(cert, app) : null;

    httpServer.listen(port_http, () => {
      console.log(`HTTP Server running on port ${port_http}`);
      httpServer.on('upgrade', handleWebSocketUpgrade);
    });
    if (httpsServer) {
      const port_https = 8443;
      httpsServer.listen(port_https, () => {
        console.log(`HTTPS Server running on port ${port_https}`);
        httpsServer.on('upgrade', handleWebSocketUpgrade);
      });
    }
  }).catch((err) => {
    console.error('Failed to initialize application:', err);
    process.exit(1);
  });
}
