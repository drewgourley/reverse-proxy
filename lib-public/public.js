"use strict";

/**
 * WARNING: Functions in this module handle configuration loading for the reverse proxy.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const subdomain = require('express-subdomain');
const serveIndex = require('serve-index');
const bcrypt = require('bcrypt');
const wol = require('wake_on_lan');
const { createClient } = require('redis');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { RedisStore } = require('connect-redis');

const authHelpers = require('./auth-helpers');
const { sendError } = require('./helpers');
const { checkSuspiciousRequest, addToBlocklist } = require('./bot-blocker');

/**
 * Initializes the Express application with all configured services, middleware, and routing
 * @param {Object} options - Configuration object containing all necessary dependencies
 * @returns {Express.Application} Configured Express application instance
 */
async function initApplication(options) {
  let blocklist = options.blocklist || []; // IPs to block from accessing services
  const { 
    config,        // Main configuration (services, domain, etc.)
    secrets,       // Sensitive data (passwords, API keys, etc.)
    users,         // User authentication data
    env,           // Runtime environment (production, development, test)
    protocols,     // HTTP/HTTPS protocol mappings
    parsers,       // Health check response parsers
    extractors,    // Health check data extractors
    odalpapiService, // Odamex game server query service
    __dirname      // Application root directory
  } = options;

  // ========== Redis Session Store Setup ==========
  // Try to connect to Redis for persistent session storage across restarts
  let redisClient;
  const redisStores = {}; // Cache of per-service Redis stores
  try {
    redisClient = createClient({ url: 'redis://127.0.0.1:6379', socket: { connectTimeout: 1000 } });
    await redisClient.connect();
  } catch (error) {
    // Fall back to in-memory sessions if Redis is unavailable (sessions lost on restart)
    const now = new Date().toISOString();
    console.warn(`${now}: Redis unavailable, proceeding with in-memory session store.`);
    redisClient = null;
  }
  
  /**
   * Get or create a Redis session store for a specific service
   * Each service gets its own session namespace to prevent conflicts
   */
  const getRedisStore = (serviceName) => {
    if (!redisClient) return undefined; // Use in-memory if Redis unavailable
    if (!redisStores[serviceName]) {
      redisStores[serviceName] = new RedisStore({ client: redisClient, prefix: `${serviceName}-sessions:` });
    }
    return redisStores[serviceName];
  };
  
  // ========== Authentication Helper Wrappers ==========
  // Check if a user has permission to access a specific service
  const userHasServiceAccess = (username, serviceName) => {
    return authHelpers.userHasServiceAccess(username, serviceName, secrets, users);
  };
  
  // Validate username/password against bcrypt hashes for a service
  const validateUserCredentials = async (username, password, serviceName) => {
    return await authHelpers.validateUserCredentials(username, password, serviceName, secrets, users);
  };
  
  // ========== Express Application Setup ==========
  const application = express();
  const API_SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days session lifetime
  
  if (config.services) {
    // ========== Phase 1: Initialize Routers and Proxy Middleware ==========
    // Create Express routers for each service and set up proxy configurations
    Object.keys(config.services).forEach(name => {
      if (config.services[name].subdomain) {
        // Create a dedicated router for this subdomain
        config.services[name].subdomain.router = express.Router();
        const secure = (env === 'production') && config.services[name].subdomain.protocol === 'secure';
        
        // Serve Let's Encrypt verification files for secure services
        if (secure) config.services[name].subdomain.router.use('/.well-known', express.static(path.join(__dirname, 'web', 'all', '.well-known')));
        
        if (config.services[name].subdomain.proxy) {
          // Type 'proxy': Pure reverse proxy to another service
          if (config.services[name].subdomain.type === 'proxy') {
            config.services[name].subdomain.proxy.middleware = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}` });
            
            // Enable WebSocket proxying if configured (for realtime apps)
            if (config.services[name].subdomain.proxy.socket) {
              config.services[name].subdomain.proxy.websocket = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}`, ws: true });
            }
            
            // Mount proxy at specific path or root
            if (config.services[name].subdomain.proxy.path) {
              config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.path, config.services[name].subdomain.proxy.middleware);
            } else {
              config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.middleware);
            }
          }
          
          // Mixed mode: Static content + proxy for API endpoints
          if (config.services[name].subdomain.type !== 'proxy' && config.services[name].subdomain.proxy.path && config.services[name].subdomain.path) {
            config.services[name].subdomain.proxy.middleware = createProxyMiddleware({ target: `${protocols.insecure}${config.services[name].subdomain.path}` });
            config.services[name].subdomain.router.use(config.services[name].subdomain.proxy.path, config.services[name].subdomain.proxy.middleware);
          }
        }
      }
    });
    
    // ========== Global Middleware ==========
    // Trust X-Forwarded-* headers from localhost (for reverse proxy setups)
    application.set('trust proxy', 'loopback')
    
    // ========== Request Logging, Security, and Routing Middleware ==========
    application.use(async (request, response, next) => {
      const services = Object.keys(config.services);
      
      // Extract real client IP (handles proxy forwarding)
      const address = request.socket?.remoteAddress?.split(':');
      const ip = address ? address[address.length - 1] : 'unknown';
      const host = request.headers.host;
      
      // Log all incoming requests with timestamp and source IP and response status code (after response is sent)
      response.on('finish', () => {
        const now = new Date().toISOString();
        console.log(`${now}: ${protocols[request.secure ? 'secure' : 'insecure']}${host}${request.url} by ${ip} - ${response.statusCode}`);
      });
      
      // Block requests from blacklisted IPs
      if (ip !== 'unknown' && blocklist && blocklist.includes(ip)) {
        const now = new Date().toISOString();
        console.log(`${now}: [blocklist] Blocking request from ${ip}`);
        return response.status(403).send('Access Denied');
      }
      
      // Check for suspicious bot/vulnerability scanner patterns
      const suspicionCheck = checkSuspiciousRequest(ip, request.url, host);
      if (suspicionCheck.suspicious) {
        const now = new Date().toISOString();
        console.log(`${now}: [bot-detector] Suspicious request from ${ip} (score: ${suspicionCheck.score}, cumulative: ${suspicionCheck.cumulativeScore}, patterns: ${suspicionCheck.patterns.join(', ')}, host: ${host})`);
        
        if (suspicionCheck.shouldBlock) {
          blocklist = await addToBlocklist(ip, `Cumulative suspicion score: ${suspicionCheck.cumulativeScore}, patterns: ${suspicionCheck.patterns.join(', ')}, host: ${host}`, blocklist);
          return response.status(403).send('Access Denied');
        }
      }
      
      // Set forwarded IP header for downstream services
      response.set('x-forwarded-for', ip);
      
      // Validate hostname against configured domain and subdomains
      const isValidHost = host === config.domain || 
                          host === `www.${config.domain}` ||
                          services.some(name => host === `${name}.${config.domain}`);
      if (!isValidHost) {
        return response.redirect(`${protocols.secure}${config.domain}`);
      }
      
      // Determine target service based on subdomain
      let target = services.find((name) => {
        return `${name}.${config.domain}` === host && config.services[name].subdomain;
      });
      
      // ========== HTTPS/HTTP Routing Logic ==========
      if (request.url.includes('.well-known')) {
        // Force Let's Encrypt challenges over HTTP (certbot requirement)
        if (request.secure) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        }
      } else {
        // Redirect www to apex domain
        if (host && host.indexOf('www.') === 0) {
          return response.redirect(`${protocols.secure}${config.domain}${request.url}`);
        } 
        // Redirect invalid subdomains to main domain
        else if (!target && host !== config.domain) {
          return response.redirect(`${protocols.insecure}${config.domain}${request.url}`);
        } 
        // Force insecure services to HTTP if accessed via HTTPS
        else if (target && config.services[target].subdomain.protocol === 'insecure' && request.secure) {
          return response.redirect(`${protocols.insecure}${host}${request.url}`);
        } 
        // Force secure services to HTTPS in production (except CORS preflight)
        else if (env !== 'development' && env !== 'test') {
          const isCorsEndpoint = target === 'api' && request.url.startsWith('/service/');
          if ((host === config.domain || config.services[target].subdomain.protocol === 'secure') && !request.secure && !isCorsEndpoint) {
            return response.redirect(`${protocols.secure}${host}${request.url}`);
          }
        }
      }
      next();
    });
    
    // ========== Phase 2: Configure Service-Specific Routes ==========
    Object.keys(config.services).forEach(name => {
      if (config.services[name].subdomain) {
        // ========== SERVICE TYPE: INDEX ==========
        // Serves static content with optional dynamic content directory listing
        if (config.services[name].subdomain.type === 'index') {
          const publicFolderPath = path.join(__dirname, 'web', 'public', name);
          const staticFolderPath = path.join(__dirname, 'web', 'static', name);
          
          // Ensure directories exist for this service
          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }
          if (!fs.existsSync(staticFolderPath)) {
            fs.mkdirSync(staticFolderPath, { recursive: true });
          }
          
          // Serve shared global assets (fonts, scripts, styles)
          config.services[name].subdomain.router.use('/global', express.static(path.join(__dirname, 'web', 'global')));
          // Serve service-specific static assets
          config.services[name].subdomain.router.use('/static', express.static(path.join(__dirname, 'web', 'static', name)));
          
          // ========== Session-Based Authentication Setup (Non-API Services) ==========
          // Apply auth to services that require it (excluding 'api' and 'www' which have custom auth)
          if (name !== 'api' && name !== 'www' && config.services[name].subdomain.requireAuth && (secrets.admin_email_address || users.users?.length > 0)) {
            // Generate or reuse session secret
            let sessionSecret = secrets.api_session_secret;
            if (!sessionSecret) {
              sessionSecret = crypto.randomBytes(32).toString('hex');
              try {
                // Persist generated secret to secrets.json for consistency across restarts
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
            
            // Enable JSON body parsing for login endpoint
            config.services[name].subdomain.router.use(express.json());
            
            // Serve login page
            config.services[name].subdomain.router.get('/login', (req, res) => {
              res.sendFile(path.join(__dirname, 'web', 'global', 'login', 'index.html'));
            });
            
            // Configure session middleware with Redis or in-memory storage
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
            
            // Login endpoint - validates credentials and creates session
            config.services[name].subdomain.router.post('/login', async (req, res) => {
              try {
                const { username, password } = req.body || {};
                if (!username || !password) return sendError(res, 400, 'Missing credentials');
                
                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return sendError(res, 401, result.error);
                
                // Set session data and extend session lifetime
                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err) => {
                  if (err) return sendError(res, 500, 'Session save failed');
                  res.send({ success: true });
                });
              } catch (error) {
                sendError(res, 500, error);
              }
            });
            
            // Logout endpoint - destroys session and clears cookie
            config.services[name].subdomain.router.post('/logout', (req, res) => {
              try {
                req.session.destroy((err) => {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return sendError(res, 500, 'Failed to destroy session');
                  return res.send({ success: true });
                });
              } catch (error) {
                const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                sendError(res, 500, error);
              }
            });
            
            // Authentication middleware - protects all routes below this point
            const serviceAuth = (req, res, next) => {
              if (req.session && req.session.authenticated && userHasServiceAccess(req.session.username, serviceName)) {
                req.session.cookie.maxAge = API_SESSION_TTL; // Extend session on activity
                return next();
              }
              
              // Redirect browser requests to login page
              const accept = req.headers.accept || '';
              if (req.method === 'GET' && accept.includes('text/html')) {
                const nextUrl = encodeURIComponent(req.originalUrl || req.url || '/');
                return res.redirect(`/login?next=${nextUrl}`);
              }
              
              // Return 401 page for API/AJAX requests
              return res.status(401).sendFile(path.join(__dirname, 'web', 'errors', '401.html'));
            };
            config.services[name].subdomain.router.use(serviceAuth);
          }
          
          // ========== API Service - Special Routes ==========
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
            // ========== API Authentication (Admin Only) ==========
            if (secrets.admin_email_address && secrets.api_password_hash) {
              // Serve API-specific login page
              config.services[name].subdomain.router.get('/login', (req, res) => {
                res.sendFile(path.join(__dirname, 'web', 'public', 'api', 'login', 'index.html'));
              });
              config.services[name].subdomain.router.use('/login', express.static(path.join(__dirname, 'web', 'public', 'api', 'login')));

              // Generate or retrieve session secret
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
              
              // Configure session middleware for API
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
              
              // API login endpoint
              config.services[name].subdomain.router.post('/login', async (req, res) => {
                try {
                  const { username, password } = req.body || {};
                  if (!username || !password) return sendError(res, 400, 'Missing credentials');
                  const result = await validateUserCredentials(username, password, 'api');
                  if (!result.valid) return sendError(res, 401, result.error);
                  req.session.authenticated = true;
                  req.session.username = result.username;
                  req.session.cookie.maxAge = API_SESSION_TTL;
                  res.send({ success: true });
                } catch (error) {
                  sendError(res, 500, error);
                }
              });
              
              // API logout endpoint
              config.services[name].subdomain.router.post('/logout', (req, res) => {
                try {
                  req.session.destroy((err) => {
                    const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                    if (env === 'production') cookieOptions.secure = true;
                    res.clearCookie('api_sid', cookieOptions);

                    if (err) {
                      return sendError(res, 500, 'Failed to destroy session');
                    }
                    return res.send({ success: true });
                  });
                } catch (error) {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie('api_sid', cookieOptions);
                  sendError(res, 500, error);
                }
              });
              
              // API authentication middleware
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
            
            // ========== Health Check Endpoints ==========
            // Each service with healthcheck config gets its own status endpoint
            Object.keys(config.services).forEach(healthname => {
              if (config.services[healthname].healthcheck) {
                const { checkService } = require('./health-checker');
                config.services[name].subdomain.router.get(`/health/${healthname}`, (request, response) => {
                  response.setHeader('Content-Type', 'application/json');
                  checkService(healthname, config, protocols, parsers, extractors, odalpapiService, response.send.bind(response));
                });
              }
            });
            
            // ========== Wake-on-LAN 'Shock' Endpoint ==========
            // Allows remote wake-up of a machine via magic packet
            if (secrets.shock_password_hash && secrets.shock_mac) {
              // Rate limit to prevent abuse (5 attempts per 15 minutes)
              const shockLimiter = rateLimit({
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 5, // limit each IP to 5 requests per windowMs
                message: { status: 'Too Many Requests', error: 'Rate limit exceeded. Try again later.' },
                standardHeaders: true,
                legacyHeaders: false,
              });
              
              // Password-protected Wake-on-LAN endpoint
              config.services[name].subdomain.router.post('/shock', shockLimiter, async (request, response) => {
                response.setHeader('Content-Type', 'application/json');
                try {
                  // Validate password against bcrypt hash
                  let isValid = false;
                  if (secrets.shock_password_hash) {
                    isValid = await bcrypt.compare(request.body.password, secrets.shock_password_hash);
                  }
                  if (isValid) {
                    // Send Wake-on-LAN magic packet to configured MAC address
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
          
          // ========== Static File Serving for 'index' Type Services ==========
          // Serve public files and index.html, with 404 fallback
          config.services[name].subdomain.router.use(express.static(path.join(__dirname, 'web', 'public', name)));
          config.services[name].subdomain.router.get('/', (request, response) => {
            response.sendFile(path.join(__dirname, 'web', 'public', name, 'index.html'));
          });
          config.services[name].subdomain.router.use((request, response) => {
            response.status(404).sendFile(path.join(__dirname, 'web', 'errors', '404.html'));
          });
          
        // ========== SERVICE TYPE: DIRLIST ==========
        // Directory listing service with optional password-protected areas
        } else if (config.services[name].subdomain.type === 'dirlist') {
          const protectedFolderPath = path.join(__dirname, 'web', 'public', name, 'protected');
          if (!fs.existsSync(protectedFolderPath)) {
            fs.mkdirSync(protectedFolderPath, { recursive: true });
          }
          
          // Apply HTTP Basic Authentication to /protected subdirectory if configured
          if (config.services[name].subdomain.basicUser && config.services[name].subdomain.basicPass) {
            const authMiddleware = basicAuth({
              users: { [config.services[name].subdomain.basicUser]: config.services[name].subdomain.basicPass },
              challenge: true
            });
            config.services[name].subdomain.router.use('/protected', authMiddleware);
          }
          
          // Serve files with directory index listing
          config.services[name].subdomain.router.use('/', express.static(path.join(__dirname, 'web', 'public', name)), serveIndex(path.join(__dirname, 'web', 'public', name)));
          
        // ========== SERVICE TYPE: SPA (Single Page Application) ==========
        // Serves a client-side app with optional auth, aggressive caching for assets
        } else if (config.services[name].subdomain.type === 'spa') {
          const publicFolderPath = path.join(__dirname, 'web', 'public', name);
          if (!fs.existsSync(publicFolderPath)) {
            fs.mkdirSync(publicFolderPath, { recursive: true });
          }
          
          // Serve shared global resources
          config.services[name].subdomain.router.use('/global', express.static(path.join(__dirname, 'web', 'global')));
          
          // ========== SPA Authentication (if required) ==========
          // Same auth pattern as 'index' type services
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
                if (!username || !password) return sendError(res, 400, 'Missing credentials');
                const result = await validateUserCredentials(username, password, serviceName);
                if (!result.valid) return sendError(res, 401, result.error);
                req.session.authenticated = true;
                req.session.username = result.username;
                req.session.cookie.maxAge = API_SESSION_TTL;
                req.session.save((err) => {
                  if (err) return sendError(res, 500, 'Session save failed');
                  res.send({ success: true });
                });
              } catch (error) {
                sendError(res, 500, error);
              }
            });
            config.services[name].subdomain.router.post('/logout', (req, res) => {
              try {
                req.session.destroy((err) => {
                  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                  if (env === 'production') cookieOptions.secure = true;
                  res.clearCookie(`${serviceName}_sid`, cookieOptions);
                  if (err) return sendError(res, 500, 'Failed to destroy session');
                  return res.send({ success: true });
                });
              } catch (error) {
                const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' };
                if (env === 'production') cookieOptions.secure = true;
                res.clearCookie(`${serviceName}_sid`, cookieOptions);
                sendError(res, 500, error);
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
          
          // ========== SPA Static Asset Serving with Smart Caching ==========
          // Cache versioned assets aggressively (1 year), but never cache HTML
          config.services[name].subdomain.router.use(express.static(path.join(__dirname, 'web', 'public', name), {
            maxAge: '1y',
            etag: true,
            lastModified: true,
            setHeaders: (res, filepath) => {
              if (filepath.endsWith('.html')) {
                // Never cache HTML - allows instant updates to SPA shell
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              } else if (filepath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
                // Cache assets for 1 year (assumes hash-based versioning in filenames)
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              }
            }
          }));
          
          // All routes serve index.html - let client-side router handle routing
          config.services[name].subdomain.router.get('*', (request, response) => {
            response.sendFile(path.join(__dirname, 'web', 'public', name, 'index.html'));
          });
        }
        
        // ========== Mount Service Router to Subdomain ==========
        // Attach this service's router to its subdomain (e.g., 'api' → api.domain.com)
        application.use(subdomain(name, config.services[name].subdomain.router));
      }
    });
    
    // ========== Root Domain Routing ==========
    // Mount the root service (default: 'www') at the main domain apex
    const rootService = config.rootservice || 'www';
    if (config.services[rootService] && config.services[rootService].subdomain) {
      application.use(config.services[rootService].subdomain.router);
    }
  }
  
  // Return the fully configured Express application
  return application;
}

module.exports = { initApplication };
