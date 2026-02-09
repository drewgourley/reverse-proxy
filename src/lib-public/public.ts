import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import basicAuth from 'express-basic-auth';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import subdomain from 'express-subdomain';
import serveIndex from 'serve-index';
const bcrypt: any = require('bcrypt');
const wol: any = require('wake_on_lan');
import { createClient } from 'redis';
import { createProxyMiddleware } from 'http-proxy-middleware';
const { RedisStore } = require('connect-redis');

import { sendError } from './helpers';
const { checkSuspiciousRequest, addToBlocklist }: any = require('./bot-blocker');

export async function initApplication(options: any) {
  const {
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
  } = options;

  const application = express();
  const API_SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

  // Redis session store setup
  let redisClient: any;
  const redisStores: Record<string, any> = {};
  try {
    redisClient = createClient({ url: 'redis://127.0.0.1:6379', socket: { connectTimeout: 1000 } });
    await redisClient.connect();
  } catch (error) {
    const now = new Date().toISOString();
    console.warn(`${now}: Redis unavailable, proceeding with in-memory session store.`);
    redisClient = null;
  }

  const getRedisStore = (serviceName: string) => {
    if (!redisClient) return undefined;
    if (!redisStores[serviceName]) {
      redisStores[serviceName] = new RedisStore({
        client: redisClient,
        prefix: `${serviceName}-sessions:`,
      });
    }
    return redisStores[serviceName];
  };

  // Make a mutable copy of the blocklist so we can update it in async callbacks
  let currentBlocklist = blocklist;

  // Helper wrappers
  const userHasServiceAccess = (username: string, serviceName: string) => {
    // Delegates to auth-helpers module which will be migrated separately
    const authHelpers: any = require('./auth-helpers');
    return authHelpers.userHasServiceAccess(username, serviceName, secrets, users);
  };

  const validateUserCredentials = async (
    username: string,
    password: string,
    serviceName: string,
  ) => {
    const authHelpers: any = require('./auth-helpers');
    return await authHelpers.validateUserCredentials(
      username,
      password,
      serviceName,
      secrets,
      users,
    );
  };

  // Phase 1: Initialize routers and proxy middleware
  if (config.services) {
    Object.keys(config.services).forEach((name) => {
      if (config.services[name].subdomain) {
        config.services[name].subdomain.router = express.Router();
        const secure =
          env === 'production' && config.services[name].subdomain.protocol === 'secure';

        // Serve Let's Encrypt verification files for secure services
        if (secure)
          config.services[name].subdomain.router.use(
            '/.well-known',
            express.static(path.join(baseDir, 'web', 'all', '.well-known')),
          );

        if (config.services[name].subdomain.proxy) {
          // Proxy type
          if (config.services[name].subdomain.type === 'proxy') {
            config.services[name].subdomain.proxy.middleware = createProxyMiddleware({
              target: `${protocols.insecure}${config.services[name].subdomain.path}`,
            });

            if (config.services[name].subdomain.proxy.socket) {
              config.services[name].subdomain.proxy.websocket = createProxyMiddleware({
                target: `${protocols.insecure}${config.services[name].subdomain.path}`,
                ws: true,
              });
            }

            if (config.services[name].subdomain.proxy.path) {
              config.services[name].subdomain.router.use(
                config.services[name].subdomain.proxy.path,
                config.services[name].subdomain.proxy.middleware,
              );
            } else {
              config.services[name].subdomain.router.use(
                config.services[name].subdomain.proxy.middleware,
              );
            }
          }

          // Mixed mode static + proxy handled later in Phase 2
        }
      }
    });

    // Global middleware
    application.set('trust proxy', 'loopback');

    application.use(async (request: any, response: any, next: any) => {
      const services = Object.keys(config.services);
      const address = request.socket?.remoteAddress?.split(':');
      const ip = address ? address[address.length - 1] : 'unknown';
      const host = request.headers.host;

      response.on('finish', () => {
        const now = new Date().toISOString();
        console.log(
          `${now}: ${protocols[request.secure ? 'secure' : 'insecure']}${host}${request.url} by ${ip} - ${response.statusCode}`,
        );
      });

      if (ip !== 'unknown' && blocklist && blocklist.includes(ip)) {
        const now = new Date().toISOString();
        console.log(`${now}: [blocklist] Blocking request from ${ip}`);
        return response.status(403).send('Access Denied');
      }

      const suspicionCheck = checkSuspiciousRequest(ip, request.url, host);
      if (suspicionCheck.suspicious) {
        const now = new Date().toISOString();
        console.log(
          `${now}: [bot-detector] Suspicious request from ${ip} (score: ${suspicionCheck.score}, cumulative: ${suspicionCheck.cumulativeScore}, patterns: ${suspicionCheck.patterns.join(', ')}, host: ${host})`,
        );

        if (suspicionCheck.shouldBlock) {
          addToBlocklist(
            ip,
            `Cumulative suspicion score: ${suspicionCheck.cumulativeScore}, patterns: ${suspicionCheck.patterns.join(', ')}, host: ${host}`,
            currentBlocklist,
          ).then((newList: any) => {
            currentBlocklist = newList;
          });
          return response.status(403).send('Access Denied');
        }
      }

      response.set('x-forwarded-for', ip);

      const isValidHost =
        host === config.domain ||
        host === `www.${config.domain}` ||
        services.some((name) => host === `${name}.${config.domain}`);
      if (!isValidHost) {
        return response.redirect(`${protocols.secure}${config.domain}`);
      }

      let target = services.find(
        (name) => `${name}.${config.domain}` === host && config.services[name].subdomain,
      );

      if (request.url.includes('.well-known')) {
        if (request.secure) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        }
      } else {
        if (host && host.indexOf('www.') === 0) {
          return response.redirect(`${protocols.secure}${config.domain}${request.url}`);
        } else if (!target && host !== config.domain) {
          return response.redirect(`${protocols.insecure}${config.domain}${request.url}`);
        } else if (
          target &&
          config.services[target].subdomain.protocol === 'insecure' &&
          request.secure
        ) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        } else if (env !== 'development' && env !== 'test') {
          const isCorsEndpoint = target === 'api' && request.url.startsWith('/service/');
          if (
            (host === config.domain ||
              (target && config.services[target].subdomain.protocol === 'secure')) &&
            !request.secure &&
            !isCorsEndpoint
          ) {
            return response.redirect(`${protocols.secure}${host}${request.url}`);
          }
        }
      }
      next();
    });

    // ========== Phase 2: Configure Service-Specific Routes (index, dirlist, spa, etc.) ==========
    Object.keys(config.services).forEach((name) => {
      if (config.services[name].subdomain) {
        // SERVICE TYPE: INDEX
        if (config.services[name].subdomain.type === 'index') {
          const publicFolderPath = path.join(baseDir, 'web', 'public', name);
          const staticFolderPath = path.join(baseDir, 'web', 'static', name);

          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }
          if (!fs.existsSync(staticFolderPath)) {
            fs.mkdirSync(staticFolderPath, { recursive: true });
          }

          // Shared assets and service static files
          config.services[name].subdomain.router.use(
            '/global',
            express.static(path.join(baseDir, 'web', 'global')),
          );
          config.services[name].subdomain.router.use('/static', express.static(staticFolderPath));

          // Session-based authentication for non-api/www services that require auth
          if (
            name !== 'api' &&
            name !== 'www' &&
            config.services[name].subdomain.requireAuth &&
            (secrets.admin_email_address || users.users?.length > 0)
          ) {
            let sessionSecret = secrets.api_session_secret;
            if (!sessionSecret) {
              sessionSecret = crypto.randomBytes(32).toString('hex');
              try {
                const secretsPath = path.join(baseDir, 'secrets.json');
                let existing: any = {};
                if (fs.existsSync(secretsPath))
                  existing = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
                existing.api_session_secret = sessionSecret;
                fs.writeFileSync(secretsPath, JSON.stringify(existing, null, 2));
                secrets.api_session_secret = sessionSecret;
              } catch (e: any) {
                const now = new Date().toISOString();
                console.warn(`${now}: Failed to persist API session secret:`, e.message);
              }
            }

            const serviceName = name;
            const isSecure = config.services[name].subdomain.protocol === 'secure';

            config.services[name].subdomain.router.use(express.json());
            config.services[name].subdomain.router.get('/login', (req: any, res: any) => {
              res.sendFile(path.join(baseDir, 'web', 'global', 'login', 'index.html'));
            });

            config.services[name].subdomain.router.use(
              session({
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
                },
              }),
            );

            config.services[name].subdomain.router.post('/login', async (req: any, res: any) => {
              try {
                const { username, password } = req.body || {};
                if (!username || !password) return sendError(res, 400, 'Missing credentials');

                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return sendError(res, 401, result.error);

                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err: any) => {
                  if (err) return sendError(res, 500, 'Session save failed');
                  res.send({ success: true });
                });
              } catch (error: any) {
                sendError(res, 500, error);
              }
            });

            config.services[name].subdomain.router.post('/logout', (req: any, res: any) => {
              try {
                req.session.destroy((err: any) => {
                  const cookieOptions: any = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return sendError(res, 500, 'Failed to destroy session');
                  return res.send({ success: true });
                });
              } catch (error: any) {
                const cookieOptions: any = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                sendError(res, 500, error);
              }
            });

            const serviceAuth = (req: any, res: any, next: any) => {
              if (
                req.session &&
                req.session.authenticated &&
                userHasServiceAccess(req.session.username, serviceName)
              ) {
                req.session.cookie.maxAge = API_SESSION_TTL; // Extend session on activity
                return next();
              }

              const accept = req.headers.accept || '';
              if (req.method === 'GET' && accept.includes('text/html')) {
                const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                return res.redirect(`/login?next=${nextUrl}`);
              }

              return res.status(401).sendFile(path.join(baseDir, 'web', 'errors', '401.html'));
            };
            config.services[name].subdomain.router.use(serviceAuth);
          }

          // ========== Static File Serving for 'index' Type Services ==========
          config.services[name].subdomain.router.use(
            express.static(path.join(baseDir, 'web', 'public', name)),
          );
          config.services[name].subdomain.router.get('/', (request: any, response: any) => {
            response.sendFile(path.join(baseDir, 'web', 'public', name, 'index.html'));
          });
          config.services[name].subdomain.router.use((request: any, response: any) => {
            response.status(404).sendFile(path.join(baseDir, 'web', 'errors', '404.html'));
          });
          // ========== SERVICE TYPE: DIRLIST ==========
        } else if (config.services[name].subdomain.type === 'dirlist') {
          const protectedFolderPath = path.join(baseDir, 'web', 'public', name, 'protected');
          if (!fs.existsSync(protectedFolderPath)) {
            fs.mkdirSync(protectedFolderPath, { recursive: true });
          }

          // Apply HTTP Basic Authentication to /protected subdirectory if configured
          if (
            config.services[name].subdomain.basicUser &&
            config.services[name].subdomain.basicPass
          ) {
            const authMiddleware = basicAuth({
              users: {
                [config.services[name].subdomain.basicUser]:
                  config.services[name].subdomain.basicPass,
              },
              challenge: true,
            });
            config.services[name].subdomain.router.use('/protected', authMiddleware);
          }

          // Serve files with directory index listing
          config.services[name].subdomain.router.use(
            '/',
            express.static(path.join(baseDir, 'web', 'public', name)),
            serveIndex(path.join(baseDir, 'web', 'public', name)),
          );
          // ========== SERVICE TYPE: SPA (Single Page Application) ==========
        } else if (config.services[name].subdomain.type === 'spa') {
          const publicFolderPath = path.join(baseDir, 'web', 'public', name);
          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }

          // Serve shared global resources
          config.services[name].subdomain.router.use(
            '/global',
            express.static(path.join(baseDir, 'web', 'global')),
          );

          // SPA Authentication (if required) - same as 'index' auth
          if (
            name !== 'api' &&
            name !== 'www' &&
            config.services[name].subdomain.requireAuth &&
            (secrets.admin_email_address || users.users?.length > 0)
          ) {
            let sessionSecret = secrets.api_session_secret;
            if (!sessionSecret) {
              sessionSecret = crypto.randomBytes(32).toString('hex');
              try {
                const secretsPath = path.join(baseDir, 'secrets.json');
                let existing: any = {};
                if (fs.existsSync(secretsPath))
                  existing = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
                existing.api_session_secret = sessionSecret;
                fs.writeFileSync(secretsPath, JSON.stringify(existing, null, 2));
                secrets.api_session_secret = sessionSecret;
              } catch (e: any) {
                const now = new Date().toISOString();
                console.warn(`${now}: Failed to persist API session secret:`, e.message);
              }
            }
            const serviceName = name; // Capture for closure
            const isSecure = config.services[name].subdomain.protocol === 'secure';
            config.services[name].subdomain.router.use(express.json());
            config.services[name].subdomain.router.get('/login', (req: any, res: any) => {
              res.sendFile(path.join(baseDir, 'web', 'global', 'login', 'index.html'));
            });
            config.services[name].subdomain.router.use(
              session({
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
                },
              }),
            );
            config.services[name].subdomain.router.post('/login', async (req: any, res: any) => {
              try {
                const { username, password } = req.body || {};
                if (!username || !password) return sendError(res, 400, 'Missing credentials');
                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return sendError(res, 401, result.error);
                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err: any) => {
                  if (err) return sendError(res, 500, 'Session save failed');
                  res.send({ success: true });
                });
              } catch (error: any) {
                sendError(res, 500, error);
              }
            });
            config.services[name].subdomain.router.post('/logout', (req: any, res: any) => {
              try {
                req.session.destroy((err: any) => {
                  const cookieOptions: any = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return sendError(res, 500, 'Failed to destroy session');
                  return res.send({ success: true });
                });
              } catch (error: any) {
                const cookieOptions: any = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                sendError(res, 500, error);
              }
            });
            const serviceAuth = (req: any, res: any, next: any) => {
              if (
                req.session &&
                req.session.authenticated &&
                userHasServiceAccess(req.session.username, serviceName)
              ) {
                req.session.cookie.maxAge = API_SESSION_TTL;
                return next();
              }
              const accept = req.headers.accept || '';
              if (req.method === 'GET' && accept.includes('text/html')) {
                const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                return res.redirect(`/login?next=${nextUrl}`);
              }
              return res.status(401).sendFile(path.join(baseDir, 'web', 'errors', '401.html'));
            };
            config.services[name].subdomain.router.use(serviceAuth);
          }

          // ========== SPA Static Asset Serving with Smart Caching ==========
          config.services[name].subdomain.router.use(
            express.static(path.join(baseDir, 'web', 'public', name), {
              maxAge: '1y',
              etag: true,
              lastModified: true,
              setHeaders: (res: any, filepath: string) => {
                if (filepath.endsWith('.html')) {
                  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                } else if (
                  filepath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
                ) {
                  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
              },
            }),
          );

          // All routes serve index.html - let client-side router handle routing
          config.services[name].subdomain.router.get('*', (request: any, response: any) => {
            response.sendFile(path.join(baseDir, 'web', 'public', name, 'index.html'));
          });
        }

        // Mount this service's router to its subdomain
        application.use(subdomain(name, config.services[name].subdomain.router));
      }
    });
  }

  // Return configured application
  return application;
}
