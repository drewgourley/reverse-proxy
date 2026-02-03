"use strict";

// retrieve core dependencies
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

// retrieve extra dependencies
const Ajv = require('ajv');
const ajv = new Ajv();
const bcrypt = require('bcrypt');
const express = require('express');
const got = require('got');
const multer = require('multer');
const faviconUpload = multer({ storage: multer.memoryStorage() });
const sharp = require('sharp');
const toIco = require('to-ico');

// retrieve environment variables
const env = process.env.NODE_ENV;

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
  "users.json",
  "package-lock.json",
  "package.json",
  "readme.md",
  ".*"
];

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

// initialize configurator app
const configapp = express();

// config editor router
const configrouter = express.Router();

// serve static files from configurator directory (excluding index.html)
configrouter.use(express.static(path.join(__dirname, 'configurator'), {
  index: false
}));

// serve global resources (favicon, etc.)
configrouter.use('/global', express.static(path.join(__dirname, 'web', 'global')));

configrouter.use(express.json());

// setup config editor routes
configrouter.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, 'configurator', 'index.html'));
});

configrouter.get('/config', (request, response) => {
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

configrouter.get('/blocklist', (request, response) => {
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

configrouter.get('/secrets', (request, response) => {
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

configrouter.get('/users', (request, response) => {
  try {
    const usersPath = path.join(__dirname, 'users.json');
    if (fs.existsSync(usersPath)) {
      const usersData = fs.readFileSync(usersPath, 'utf8');
      const usersObj = JSON.parse(usersData);
      response.setHeader('Content-Type', 'application/json');
      response.send(usersObj);
    } else {
      response.setHeader('Content-Type', 'application/json');
      response.send({ users: [] });
    }
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

configrouter.put('/users', async (request, response) => {
  try {
    const updatedUsers = request.body;
    
    const usersSchema = {
      type: 'object',
      required: ['users'],
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            required: ['uuid', 'username', 'services'],
            properties: {
              uuid: { type: 'string', minLength: 1 },
              username: { type: 'string', minLength: 1 },
              password_hash: { type: 'string' },
              services: { 
                type: 'array',
                items: { type: 'string' }
              }
            }
          }
        }
      },
      additionalProperties: false
    };
    
    const validate = ajv.compile(usersSchema);
    if (!validate(updatedUsers)) {
      return sendError(response, 400, { message: 'Invalid users format', details: validate.errors });
    }
    
    // Load existing users to preserve password hashes
    let existingUsers = { users: [] };
    try {
      const usersPath = path.join(__dirname, 'users.json');
      if (fs.existsSync(usersPath)) {
        const usersData = fs.readFileSync(usersPath, 'utf8');
        existingUsers = JSON.parse(usersData);
      }
    } catch (e) {
      // do nothing: no existing users
    }
    
    // Process each user
    for (let i = 0; i < updatedUsers.users.length; i++) {
      const user = updatedUsers.users[i];
      const existingUser = existingUsers.users?.find(u => u.uuid === user.uuid);
      
      // If password_hash is empty but existed before, restore the old hash
      if ((!user.password_hash || user.password_hash.trim() === '') && existingUser?.password_hash) {
        user.password_hash = existingUser.password_hash;
      }
      
      // If password_hash is provided and looks like plaintext (not a hash), hash it
      if (user.password_hash && !user.password_hash.startsWith('$2b$')) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    }
    
    const usersPath = path.join(__dirname, 'users.json');
    saveConfigAndRestart(usersPath, updatedUsers, 'Users updated successfully', response);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/certs', (request, response) => {
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

configrouter.get('/publicip', async (request, response) => {
  try {
    const ipResponse = await got('https://checkip.amazonaws.com/', { timeout: { request: 5000 } });
    const publicIP = ipResponse.body.trim();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip: publicIP });
  } catch (error) {
    response.status(500).send({ success: false, error: error.message });
  }
});

configrouter.get('/localip', (request, response) => {
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

configrouter.get('/ecosystem', (request, response) => {
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

configrouter.put('/config', (request, response) => {
  try {
    const updatedConfig = request.body;
    
    // Load current config to check for domain changes
    let config = {};
    try {
      config = require('./config.json');
    } catch (e) {
      // Ignore if config doesn't exist yet
    }
    
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

configrouter.put('/blocklist', (request, response) => {
  try {
    const updatedBlocklist = request.body;
    if (!Array.isArray(updatedBlocklist)) {
      return sendError(response, 400, 'Blocklist must be an array of IP addresses');
    }
    const blocklistPath = path.join(__dirname, 'blocklist.json');
    saveConfigAndRestart(blocklistPath, updatedBlocklist, 'Blocklist updated successfully', response, -1);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.put('/secrets', async (request, response) => {
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

configrouter.get('/colors', (request, response) => {
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

configrouter.put('/colors', (request, response) => {
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

configrouter.post('/favicon', faviconUpload.single('favicon'), async (request, response) => {
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

configrouter.get('/ddns', (request, response) => {
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

configrouter.put('/ddns', (request, response) => {
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

configrouter.get('/advanced', (request, response) => {
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

configrouter.get('/checklogrotate', (request, response) => {
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

configrouter.get('/installlogrotate', (request, response) => {
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
configrouter.get('/logs/:appName/:type', (request, response) => {
  const appName = request.params.appName;
  const type = request.params.type || 'out';

  const setSSEHeaders = (res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
  }

  const sendLogLines = (res, data) => {
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

configrouter.put('/advanced', (request, response) => {
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

configrouter.put('/ecosystem', (request, response) => {
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
    
    // Load ecosystem to get the app name
    let ecosystem = {};
    try {
      ecosystem = require('./ecosystem.config.js');
    } catch (e) {
      // Ignore if doesn't exist yet
    }
    
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

configrouter.get('/git/status', (request, response) => {
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

configrouter.get('/git/check', (request, response) => {
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

configrouter.post('/git/pull', (request, response) => {
  try {
    if (env === 'development') {
      response.status(500).send({
        success: false,
        error: 'Development mode: No actual update performed, showing as failed to test force update.',
      });
      return;
    }
    
    // Load ecosystem to get the app name
    let ecosystem = {};
    try {
      ecosystem = require('./ecosystem.config.js');
    } catch (e) {
      // Ignore if doesn't exist yet
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

configrouter.post('/git/force', (request, response) => {
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
    
    // Load ecosystem to get the app name
    let ecosystem = {};
    try {
      ecosystem = require('./ecosystem.config.js');
    } catch (e) {
      // Ignore if doesn't exist yet
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

configrouter.put('/certs', (request, response) => {
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
    
    // Load current config
    let config = {};
    try {
      config = require('./config.json');
    } catch (e) {
      return response.status(500).send({ success: false, error: 'Config not found' });
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
configapp.use(configrouter);

// setup config editor server
const configurator = http.createServer(configapp);

// export the server
module.exports = configurator;
