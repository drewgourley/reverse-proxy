"use strict";
/* CORE DEPENDENCY SETUP */
const bcrypt = require('bcrypt');
const cheerio = require('cheerio');
const cron = require('node-cron');
const crypto = require('crypto');
const dotenv = require('dotenv');
const fs = require('fs');
const got = require('got');
const http = require('http');
const https = require('https');
const path = require('path');
const wol = require('wake_on_lan');
const express = require('express');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const subdomain = require('express-subdomain');
const serveIndex = require('serve-index');
const { createClient } = require('redis');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { GameDig } = require('gamedig');
const { RedisStore } = require('connect-redis');
const { OdalPapiMainService } = require('./odalpapi.js')
const odalpapiService = new OdalPapiMainService();
const configurator = require('./configurator.js');
/* CONFIGURED DEPENDENCY SETUP */
let config;
try {
  config = require('./config.json');
} catch (e) {
  config = {};
  const now = new Date().toISOString();
  console.warn(`${now}: Initial configuration required`)
}
let secrets;
try {
  secrets = require('./secrets.json');
} catch (e) {
  secrets = {};
  const now = new Date().toISOString();
  console.warn(`${now}: Secrets not configured`);
}
let users;
try {
  users = require('./users.json');
} catch (e) {
  users = { users: [] };
  const now = new Date().toISOString();
  console.warn(`${now}: Users not configured`);
}
let ddns;
try {
  ddns = require('./ddns.json');
} catch (e) {
  ddns = {};
  const now = new Date().toISOString();
  console.warn(`${now}: DDNS not configured`);
}
let advancedConfig;
try {
  advancedConfig = require('./advanced.json');
} catch (e) {
  advancedConfig = { parsers: {}, extractors: {}, queryTypes: [] };
  const now = new Date().toISOString();
  console.warn(`${now}: Advanced Options not configured`);
}
let blocklist;
try {
  blocklist = require('./blocklist.json');
} catch (e) {
  blocklist = [];
  const now = new Date().toISOString();
  console.warn(`${now}: Blocklist not established`);
}
let ecosystem;
try {
  ecosystem = require('./ecosystem.config.js');
} catch (e) {
  ecosystem = {};
  const now = new Date().toISOString();
  console.warn(`${now}: Ecosystem not established`);
}
/* ENVIRONMENT SETUP */
dotenv.config();
const env = process.env.NODE_ENV;
const protocols = {
  insecure: 'http://',
  secure: 'https://',
};
if (env === 'development' || env === 'test') protocols.secure = 'http://';
/* PARSER AND EXTRACTOR SETUP */
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
const parsers = { ...defaultParsers };
const extractors = { ...defaultExtractors };
if (advancedConfig.parsers) {
  Object.keys(advancedConfig.parsers).forEach(key => {
    try {
      parsers[key] = eval(`(${advancedConfig.parsers[key]})`);
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: Error loading custom parser "${key}":`, error);
    }
  });
}
if (advancedConfig.extractors) {
  Object.keys(advancedConfig.extractors).forEach(key => {
    try {
      extractors[key] = eval(`(${advancedConfig.extractors[key]})`);
    } catch (error) {
      const now = new Date().toISOString();
      console.error(`${now}: Error loading custom extractor "${key}":`, error);
    }
  });
}
/* HEALTHCHECK SETUP */
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
      odalpapiService.queryGameServer({
        ip: hostParts[0],
        port: hostParts[1],
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
const pingHealthcheck = async (name) => {
  const id = config.services?.[name]?.healthcheck?.id;
  if (id) {
    const now = new Date().toISOString();
    try {
      const ping = await got(`${protocols.secure}${path.join('hc-ping.com', id)}`, {timeout: {request: 5000}});
      console.log(`${now}: ${name} healthcheck ping succeeded. ${ping.body}`);
    } catch (error) {
      console.log(`${now}: ${name} healthcheck ping failed. ${error}`);
    }
  }
};
/* APPLICATION SETUP */
const initApplication = async () => {
  let redisClient;
  const redisStores = {};
  try {
    redisClient = createClient({ url: 'redis://127.0.0.1:6379', socket: { connectTimeout: 1000 } });
    await redisClient.connect();
  } catch (error) {
    const now = new Date().toISOString();
    console.warn(`${now}: Redis unavailable, proceeding with in-memory session store.`);
    redisClient = null;
  }
  const getRedisStore = (serviceName) => {
    if (!redisClient) return undefined;
    if (!redisStores[serviceName]) {
      redisStores[serviceName] = new RedisStore({ client: redisClient, prefix: `${serviceName}-sessions:` });
    }
    return redisStores[serviceName];
  };
  const userHasServiceAccess = (username, serviceName) => {
    if (username === secrets.admin_email_address) return true;
    if (serviceName !== 'api') {
      const user = users.users?.find(u => u.username === username);
      if (!user) return false;
      if (user.services?.includes('*')) return true;
      return user.services?.includes(serviceName) || false;
    } else {
      return false;
    }
  };
  const validateUserCredentials = async (username, password, serviceName) => {
    if (username === secrets.admin_email_address && secrets.api_password_hash) {
      const valid = await bcrypt.compare(password, secrets.api_password_hash);
      if (valid) return { valid: true, username };
    }
    const user = users.users?.find(u => u.username === username);
    if (user && user.password_hash) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (valid && userHasServiceAccess(username, serviceName)) {
        return { valid: true, username };
      }
      if (valid) {
        return { valid: false, error: 'Access denied to this service' };
      }
    }
    return { valid: false, error: 'Invalid credentials' };
  };
  const application = express();
  const API_SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
  if (config.services) {
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
          const isCorsEndpoint = target === 'api' && request.url.startsWith('/service/');
          if ((host === config.domain || config.services[target].subdomain.protocol === 'secure') && !request.secure && !isCorsEndpoint) {
            return response.redirect(`${protocols.secure}${host}${request.url}`);
          }
        }
      }
      next();
    });
    Object.keys(config.services).forEach(name => {
      if (config.services[name].subdomain) {
        if (config.services[name].subdomain.type === 'index') {
          const publicFolderPath = path.join(__dirname, 'web', 'public', name);
          const staticFolderPath = path.join(__dirname, 'web', 'static', name);
          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }
          if (!fs.existsSync(staticFolderPath)) {
            fs.mkdirSync(staticFolderPath, { recursive: true });
          }
          config.services[name].subdomain.router.use('/global', express.static(path.join(__dirname, 'web', 'global')));
          config.services[name].subdomain.router.use('/static', express.static(path.join(__dirname, 'web', 'static', name)));
          if (name !== 'api' && name !== 'www' && config.services[name].subdomain.requireAuth && (secrets.admin_email_address || users.users?.length > 0)) {
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
              } catch (e) {
                const now = new Date().toISOString();
                console.warn(`${now}: Failed to persist API session secret:`, e.message);
              }
            }
            const serviceName = name;
            const isSecure = config.services[name].subdomain.protocol === 'secure';
            config.services[name].subdomain.router.use(express.json());
            config.services[name].subdomain.router.get('/login', (req, res) => {
              res.sendFile(path.join(__dirname, 'web', 'global', 'login', 'index.html'));
            });
            config.services[name].subdomain.router.use(session({
              store: getRedisStore(serviceName),
              name: `${serviceName}_sid`,
              secret: sessionSecret,
              resave: false,
              saveUninitialized: false,
              cookie: {
                httpOnly: isSecure,
                secure: isSecure,
                sameSite: 'lax',
                maxAge: API_SESSION_TTL,
                path: '/',
              }
            }));
            config.services[name].subdomain.router.post('/login', async (req, res) => {
              try {
                const { username, password } = req.body || {};
                if (!username || !password) return res.status(400).send({ success: false, error: 'Missing credentials' });
                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return res.status(401).send({ success: false, error: result.error });
                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err) => {
                  if (err) return res.status(500).send({ success: false, error: 'Session save failed' });
                  res.send({ success: true });
                });
              } catch (error) {
                res.status(500).send({ success: false, error: error.message });
              }
            });
            config.services[name].subdomain.router.post('/logout', (req, res) => {
              try {
                req.session.destroy((err) => {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return res.status(500).send({ success: false, error: 'Failed to destroy session' });
                  return res.send({ success: true });
                });
              } catch (error) {
                const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                res.status(500).send({ success: false, error: error.message });
              }
            });
            const serviceAuth = (req, res, next) => {
              if (req.session && req.session.authenticated && userHasServiceAccess(req.session.username, serviceName)) {
                req.session.cookie.maxAge = API_SESSION_TTL;
                return next();
              }
              const accept = req.headers.accept || '';
              if (req.method === 'GET' && accept.includes('text/html')) {
                const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                return res.redirect(`/login?next=${nextUrl}`);
              }
              return res.status(401).sendFile(path.join(__dirname, 'web', 'errors', '401.html'));
            };
            config.services[name].subdomain.router.use(serviceAuth);
          }
          if (name === 'api') {
            config.services[name].subdomain.router.use(express.json());
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
                } catch (e) {
                  const now = new Date().toISOString();
                  console.warn(`${now}: Failed to persist API session secret:`, e.message);
                }
              }
              config.services[name].subdomain.router.use(session({
                store: getRedisStore('api'),
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
                  const result = await validateUserCredentials(username, password, 'api');
                  if (!result.valid) return res.status(401).send({ success: false, error: result.error });
                  req.session.authenticated = true;
                  req.session.username = result.username;
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
                  if (req.session && req.session.authenticated && userHasServiceAccess(req.session.username, 'api')) {
                    req.session.cookie.maxAge = API_SESSION_TTL;
                    return next();
                  }

                  const accept = req.headers.accept || '';
                  if (req.method === 'GET' && accept.includes('text/html')) {
                    const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                    return res.redirect(`/login?next=${nextUrl}`);
                  }

                  return res.status(401).sendFile(path.join(__dirname, 'web', 'errors', '401.html'));
                } catch (error) {
                  return res.status(401).sendFile(path.join(__dirname, 'web', 'errors', '401.html'));
                }
              };
              config.services[name].subdomain.router.use(apiAuth);
            }
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
            Object.keys(config.services).forEach(healthname => {
              if (config.services[healthname].healthcheck) {
                config.services[name].subdomain.router.get(`/health/${healthname}`, (request, response) => {
                  response.setHeader('Content-Type', 'application/json');
                  checkService(healthname, response.send.bind(response));
                });
              }
            });
            if (secrets.shock_password_hash && secrets.shock_mac) {
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
            response.status(404).sendFile(path.join(__dirname, 'web', 'errors', '404.html'));
          });
        } else if (config.services[name].subdomain.type === 'dirlist') {
          const protectedFolderPath = path.join(__dirname, 'web', 'public', name, 'protected');
          if (!fs.existsSync(protectedFolderPath)) {
            fs.mkdirSync(protectedFolderPath, { recursive: true });
          }
          if (config.services[name].subdomain.basicUser && config.services[name].subdomain.basicPass) {
            const authMiddleware = basicAuth({
              users: { [config.services[name].subdomain.basicUser]: config.services[name].subdomain.basicPass },
              challenge: true
            });
            config.services[name].subdomain.router.use('/protected', authMiddleware);
          }
          config.services[name].subdomain.router.use('/', express.static(path.join(__dirname, 'web', 'public', name)), serveIndex(path.join(__dirname, 'web', 'public', name)));
        } else if (config.services[name].subdomain.type === 'spa') {
          const publicFolderPath = path.join(__dirname, 'web', 'public', name);
          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }
          config.services[name].subdomain.router.use('/global', express.static(path.join(__dirname, 'web', 'global')));
          if (name !== 'api' && name !== 'www' && config.services[name].subdomain.requireAuth && (secrets.admin_email_address || users.users?.length > 0)) {
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
              } catch (e) {
                const now = new Date().toISOString();
                console.warn(`${now}: Failed to persist API session secret:`, e.message);
              }
            }
            const serviceName = name; // Capture for closure
            const isSecure = config.services[name].subdomain.protocol === 'secure';
            config.services[name].subdomain.router.use(express.json());
            config.services[name].subdomain.router.get('/login', (req, res) => {
              res.sendFile(path.join(__dirname, 'web', 'global', 'login', 'index.html'));
            });
            config.services[name].subdomain.router.use(session({
              store: getRedisStore(serviceName),
              name: `${serviceName}_sid`,
              secret: sessionSecret,
              resave: false,
              saveUninitialized: false,
              cookie: {
                httpOnly: true,
                secure: isSecure,
                sameSite: 'lax',
                maxAge: API_SESSION_TTL,
                path: '/',
              }
            }));
            config.services[name].subdomain.router.post('/login', async (req, res) => {
              try {
                const { username, password } = req.body || {};
                if (!username || !password) return res.status(400).send({ success: false, error: 'Missing credentials' });
                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return res.status(401).send({ success: false, error: result.error });
                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err) => {
                  if (err) return res.status(500).send({ success: false, error: 'Session save failed' });
                  res.send({ success: true });
                });
              } catch (error) {
                res.status(500).send({ success: false, error: error.message });
              }
            });
            config.services[name].subdomain.router.post('/logout', (req, res) => {
              try {
                req.session.destroy((err) => {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return res.status(500).send({ success: false, error: 'Failed to destroy session' });
                  return res.send({ success: true });
                });
              } catch (error) {
                const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                res.status(500).send({ success: false, error: error.message });
              }
            });
            const serviceAuth = (req, res, next) => {
              if (req.session && req.session.authenticated && userHasServiceAccess(req.session.username, serviceName)) {
                req.session.cookie.maxAge = API_SESSION_TTL;
                return next();
              }
              const accept = req.headers.accept || '';
              if (req.method === 'GET' && accept.includes('text/html')) {
                const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                return res.redirect(`/login?next=${nextUrl}`);
              }
              return res.status(401).sendFile(path.join(__dirname, 'web', 'errors', '401.html'));
            };
            config.services[name].subdomain.router.use(serviceAuth);
          }
          config.services[name].subdomain.router.use(express.static(path.join(__dirname, 'web', 'public', name), {
            maxAge: '1y',
            etag: true,
            lastModified: true,
            setHeaders: (res, filepath) => {
              if (filepath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              } else if (filepath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              }
            }
          }));
          config.services[name].subdomain.router.get('*', (request, response) => {
            response.sendFile(path.join(__dirname, 'web', 'public', name, 'index.html'));
          });
        }
        application.use(subdomain(name, config.services[name].subdomain.router));
      }
    });
    const rootService = config.rootservice || 'www';
    if (config.services[rootService] && config.services[rootService].subdomain) {
      application.use(config.services[rootService].subdomain.router);
    }
  }
  return application;
}

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
        console.log(`${now}: DDNS update skipped in development mode:`, changes);
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
      const now = new Date().toISOString();
      console.log(`${now}: DDNS updated to ${publicIP}`);
      lastKnownIP = publicIP;
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

const healthchecks = Object.keys(config.services).filter((name) => config.services[name].healthcheck);
cron.schedule('1 * * * *', () => {
  healthchecks.forEach((name) => {
    checkService(name, (service) => {
      const now = new Date().toISOString();
      if (service.healthy) {
        if (env === 'production') {
          console.log(`${now}: ${name} service is up. Pinging healthcheck...`);
          pingHealthcheck(name);
        } else {
          console.log(`${now}: Skipping healthcheck ping for ${name} in non-production environment`);
        }
      }
    });
  });
});

// Delay for server restarts to avoid port conflicts.
setTimeout(() => {
  /* CONFIGURATOR SETUP */
  configurator.listen(3000, () => {
    const now = new Date().toISOString();
    console.log(`${now}: Configurator running on port 3000`);
  });
  /* SERVER SETUP */
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
    initApplication().then((app) => {
      const port_http = (env === 'development' || env === 'test') ? 80 : 8080;
      const httpServer = http.createServer(app);
      const httpsServer = cert ? https.createServer(cert, app) : null;
      httpServer.listen(port_http, () => {
        const now = new Date().toISOString();
        console.log(`${now}: HTTP Server running on port ${port_http}`);
        httpServer.on('upgrade', handleWebSocketUpgrade);
      });
      if (httpsServer) {
        const port_https = 8443;
        httpsServer.listen(port_https, () => {
          const now = new Date().toISOString();
          console.log(`${now}: HTTPS Server running on port ${port_https}`);
          httpsServer.on('upgrade', handleWebSocketUpgrade);
        });
      }
    }).catch((err) => {
      const now = new Date().toISOString();
      console.error(`${now}: Failed to initialize application:`, err);
      process.exit(1);
    });
  }
}, 1000);
