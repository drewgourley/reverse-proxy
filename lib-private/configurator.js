"use strict";

const dotenv = require('dotenv');
const path = require('path');
const express = require('express');
const multer = require('multer');

const configManager = require('./config-manager');
const fileOps = require('./file-operations');
const gitManager = require('./git-manager');
const logsManager = require('./logs-manager');
const systemInfo = require('./system-info');
const themeManager = require('./theme-manager');
const certManager = require('./certificate-manager');
const processManager = require('./process-manager');
const { sendError } = require('./helpers');

const faviconUpload = multer({ storage: multer.memoryStorage() });

dotenv.config();
const env = process.env.NODE_ENV;

const rootDir = path.join(__dirname, '..');

const configapp = express();
const configrouter = express.Router();

configrouter.use(express.static(path.join(rootDir, 'configurator'), { index: false }));

configrouter.use('/favicon', express.static(path.join(rootDir, 'web', 'global', 'favicon')));

configrouter.get('/', (request, response) => {
  response.sendFile(path.join(rootDir, 'configurator', 'index.html'));
});
configrouter.get('/config/*', (request, response) => {
  response.sendFile(path.join(rootDir, 'configurator', 'index.html'));
});
configrouter.get('/management/*', (request, response) => {
  response.sendFile(path.join(rootDir, 'configurator', 'index.html'));
});
configrouter.get('/monitor/*', (request, response) => {
  response.sendFile(path.join(rootDir, 'configurator', 'index.html'));
});

configrouter.use(express.json());

configrouter.get('/config', (request, response) => {
  try {
    const config = configManager.readConfig(rootDir, 'config.json');
    response.setHeader('Content-Type', 'application/json');
    response.send(config);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/blocklist', (request, response) => {
  try {
    const blocklist = configManager.readConfig(rootDir, 'blocklist.json', []);
    response.setHeader('Content-Type', 'application/json');
    response.send(blocklist);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/secrets', (request, response) => {
  try {
    const secrets = configManager.readConfig(rootDir, 'secrets.json', {});
    response.setHeader('Content-Type', 'application/json');
    response.send(secrets);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/users', (request, response) => {
  try {
    const users = configManager.readConfig(rootDir, 'users.json', { users: [] });
    response.setHeader('Content-Type', 'application/json');
    response.send(users);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/certs', (request, response) => {
  try {
    const certs = configManager.readConfig(rootDir, 'certs.json', { services: [], provisionedAt: null });
    response.setHeader('Content-Type', 'application/json');
    response.send(certs);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/publicip', async (request, response) => {
  try {
    const ip = await systemInfo.getPublicIP();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/localip', (request, response) => {
  try {
    const ip = systemInfo.getLocalIP();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/ecosystem', (request, response) => {
  try {
    const ecosystem = processManager.readEcosystem(rootDir);
    response.setHeader('Content-Type', 'application/json');
    response.send(ecosystem);
  } catch (error) {
    sendError(response, 500, error);
  }
});


configrouter.get('/colors', (request, response) => {
  try {
    const colors = themeManager.readColors(rootDir);
    response.setHeader('Content-Type', 'application/json');
    response.send(colors);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/ddns', (request, response) => {
  try {
    const ddns = configManager.readConfig(rootDir, 'ddns.json', {});
    response.setHeader('Content-Type', 'application/json');
    response.send(ddns);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/advanced', (request, response) => {
  try {
    const advanced = configManager.readConfig(rootDir, 'advanced.json', { parsers: {}, extractors: {}, queryTypes: [] });  
    response.setHeader('Content-Type', 'application/json');
    response.send(advanced);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/checklogrotate', async (request, response) => {
  try {
    await processManager.checkLogrotate();
    response.status(200).send({ success: true, message: 'Logrotate module is installed.' });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/installlogrotate', async (request, response) => {
  try {
    await processManager.installLogrotate();
    response.status(200).send({ success: true, message: 'Logrotate module installed successfully.' });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/git/status', async (request, response) => {
  try {
    const status = await gitManager.getGitStatus();
    response.status(200).send({ success: true, ...status });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/git/check', async (request, response) => {
  try {
    const result = await gitManager.checkForUpdates();
    response.status(200).send({ success: true, ...result });
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.get('/logs/:appName/:type', (request, response) => {
  logsManager.streamLogs(request, response);
});

configrouter.put('/users', async (request, response) => {
  try {
    await configManager.updateUsers(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Users updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/files/:serviceName/:folderType', (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const subPath = request.query.path || '';
    
    const config = require('../config.json');
    const result = fileOps.listFiles(rootDir, serviceName, folderType, config, subPath);
    
    response.status(200).send({ success: true, ...result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/config', (request, response) => {
  try {
    const result = configManager.updateConfig(rootDir, request.body);
    if (result.domainChanged) {
      const now = new Date().toISOString();
      console.log(`${now}: Domain change detected, clearing provisioned certificates`);
      certManager.registerProvisionedCerts(rootDir, [], false, false);
    }
    response.status(200).send({ success: true, message: 'Config updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/blocklist', (request, response) => {
  try {
    configManager.updateBlocklist(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Blocklist updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/secrets', async (request, response) => {
  try {
    await configManager.updateSecrets(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Secrets updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/colors', (request, response) => {
  try {
    themeManager.updateColors(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Colors updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 400;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/ddns', (request, response) => {
  try {
    configManager.updateDDNS(rootDir, request.body);
    response.status(200).send({ success: true, message: 'DDNS configuration updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/advanced', (request, response) => {
  try {
    configManager.updateAdvanced(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Advanced configuration updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/ecosystem', async (request, response) => {
  try {
    await processManager.updateEcosystem(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Ecosystem config updated successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/certs', async (request, response) => {
  try {
    const email = request.body.email;
    if (!email) {
      return sendError(response, 400, 'Email address is required');
    }
    
    const config = configManager.readConfig(rootDir, 'config.json');
    const result = await certManager.provisionCertificates(rootDir, email, config, env);
    
    response.status(200).send({ success: true, message: result.message });
    if (env === 'production') {
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    }
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post('/favicon', faviconUpload.single('favicon'), async (request, response) => {
  try {
    await themeManager.uploadFavicon(rootDir, request.file);
    response.status(200).send({ success: true, message: 'Favicon uploaded successfully' });
  } catch (error) {
    console.error('Favicon upload error:', error);
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post('/git/pull', async (request, response) => {
  try {
    const result = await gitManager.pullChanges();
    response.status(200).send({ success: true, message: 'Update successful', output: result.output });
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.post('/git/force', async (request, response) => {
  try {
    const result = await gitManager.forceReset();
    response.status(200).send({ success: true, message: 'Update successful', output: result.output });
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  } catch (error) {
    sendError(response, 500, error);
  }
});

configrouter.post('/files/:serviceName/:folderType', fileOps.fileUpload.single('file'), (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const targetPath = request.body.targetPath || '';
    
    const config = require('../config.json');
    const file = fileOps.uploadFile(rootDir, serviceName, folderType, config, request.file, targetPath);
    
    response.status(200).send({ 
      success: true, 
      message: 'File uploaded successfully',
      file
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post('/files/:serviceName/:folderType/directory', (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const { directoryPath } = request.body;
    
    const config = require('../config.json');
    fileOps.createDirectory(rootDir, serviceName, folderType, config, directoryPath);
    
    response.status(200).send({ success: true, message: 'Directory created successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post('/files/:serviceName/:folderType/rename', (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const { oldPath, newPath } = request.body;
    
    const config = require('../config.json');
    fileOps.renameFile(rootDir, serviceName, folderType, config, oldPath, newPath);
    
    response.status(200).send({ success: true, message: 'Renamed successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post('/files/:serviceName/:folderType/unpack', fileOps.fileUpload.single('zipFile'), (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const { targetPath, deploy } = request.body;
    
    const config = require('../config.json');
    const result = fileOps.unpackZip(rootDir, serviceName, folderType, config, request.file, targetPath, deploy === 'true');
    
    response.status(200).send({ 
      success: true, 
      message: 'Zip extracted successfully',
      filesExtracted: result.filesExtracted
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.delete('/files/:serviceName/:folderType', (request, response) => {
  try {
    const { serviceName, folderType } = request.params;
    const { filePath } = request.body;
    
    const config = require('../config.json');
    fileOps.deleteFile(rootDir, serviceName, folderType, config, filePath);
    
    response.status(200).send({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

// SPA fallback: for any GET navigation that accepts HTML (and isn't an asset/API request), serve the configurator index
configrouter.get('*', (request, response, next) => {
  if (request.method !== 'GET') return next();

  // If client prefers JSON (API request), skip fallback
  const preferred = request.accepts(['html', 'json', 'text']);
  if (preferred && preferred !== 'html') return next();

  // Skip obvious asset requests (contain a file extension)
  if (path.extname(request.path)) return next();

  // Redirect to root for SPA routing, preserving query params
  response.redirect('/');
});

configapp.use(configrouter);
module.exports = configapp;
