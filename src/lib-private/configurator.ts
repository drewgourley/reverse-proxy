import dotenv from 'dotenv';
import path from 'path';
import express, { Request, Response } from 'express';
import multer from 'multer';

// Local CommonJS modules (migrated to src/lib-private)
const configManager: any = require('./config-manager');
const fileOps: any = require('./file-operations');
const gitManager: any = require('./git-manager');
const logsManager: any = require('./logs-manager');
const systemInfo: any = require('./system-info');
const themeManager: any = require('./theme-manager');
const certManager: any = require('./certificate-manager');
const processManager: any = require('./process-manager');
const { sendError } = require('./helpers');

const faviconUpload = multer({ storage: multer.memoryStorage() });

dotenv.config();
const env = process.env.NODE_ENV;

const rootDir = path.join(__dirname, '..', '..');

const configapp = express();
const configrouter = express.Router();

configrouter.use(express.static(path.join(rootDir, 'configurator'), { index: false }));
configrouter.use('/favicon', express.static(path.join(rootDir, 'web', 'global', 'favicon')));
configrouter.use(express.json());

configrouter.get('/', (request: Request, response: Response) => {
  response.sendFile(path.join(rootDir, 'configurator', 'index.html'));
});

configrouter.get('/config', (request: Request, response: Response) => {
  try {
    const config = configManager.readConfig(rootDir, 'config.json');
    response.setHeader('Content-Type', 'application/json');
    response.send(config);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/blocklist', (request: Request, response: Response) => {
  try {
    const blocklist = configManager.readConfig(rootDir, 'blocklist.json', []);
    response.setHeader('Content-Type', 'application/json');
    response.send(blocklist);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/secrets', (request: Request, response: Response) => {
  try {
    const secrets = configManager.readConfig(rootDir, 'secrets.json', {});
    response.setHeader('Content-Type', 'application/json');
    response.send(secrets);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/users', (request: Request, response: Response) => {
  try {
    const users = configManager.readConfig(rootDir, 'users.json', { users: [] });
    response.setHeader('Content-Type', 'application/json');
    response.send(users);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.put('/users', async (request: Request, response: Response) => {
  try {
    await configManager.updateUsers(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Users updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/certs', (request: Request, response: Response) => {
  try {
    const certs = configManager.readConfig(rootDir, 'certs.json', {
      services: [],
      provisionedAt: null,
    });
    response.setHeader('Content-Type', 'application/json');
    response.send(certs);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/publicip', async (request: Request, response: Response) => {
  try {
    const ip = await systemInfo.getPublicIP();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/localip', (request: Request, response: Response) => {
  try {
    const ip = systemInfo.getLocalIP();
    response.setHeader('Content-Type', 'application/json');
    response.send({ success: true, ip });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/ecosystem', (request: Request, response: Response) => {
  try {
    const ecosystem = processManager.readEcosystem(rootDir);
    response.setHeader('Content-Type', 'application/json');
    response.send(ecosystem);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.put('/config', (request: Request, response: Response) => {
  try {
    const result = configManager.updateConfig(rootDir, request.body);
    if (result.domainChanged) {
      const now = new Date().toISOString();
      console.log(`${now}: Domain change detected, clearing provisioned certificates`);
      certManager.registerProvisionedCerts(rootDir, [], false, false);
    }
    response.status(200).send({ success: true, message: 'Config updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/blocklist', (request: Request, response: Response) => {
  try {
    configManager.updateBlocklist(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Blocklist updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/secrets', async (request: Request, response: Response) => {
  try {
    await configManager.updateSecrets(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Secrets updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/colors', (request: Request, response: Response) => {
  try {
    const colors = themeManager.readColors(rootDir);
    response.setHeader('Content-Type', 'application/json');
    response.send(colors);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.put('/colors', (request: Request, response: Response) => {
  try {
    themeManager.updateColors(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Colors updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 400;
    sendError(response, statusCode, error);
  }
});

configrouter.post(
  '/favicon',
  faviconUpload.single('favicon'),
  async (request: Request, response: Response) => {
    try {
      await themeManager.uploadFavicon(rootDir, (request as any).file);
      response.status(200).send({ success: true, message: 'Favicon uploaded successfully' });
    } catch (error: any) {
      console.error('Favicon upload error:', error);
      const statusCode = error.statusCode || 500;
      sendError(response, statusCode, error);
    }
  },
);

configrouter.get('/ddns', (request: Request, response: Response) => {
  try {
    const ddns = configManager.readConfig(rootDir, 'ddns.json', {});
    response.setHeader('Content-Type', 'application/json');
    response.send(ddns);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.put('/ddns', (request: Request, response: Response) => {
  try {
    configManager.updateDDNS(rootDir, request.body);
    response
      .status(200)
      .send({ success: true, message: 'DDNS configuration updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/advanced', (request: Request, response: Response) => {
  try {
    const advanced = configManager.readConfig(rootDir, 'advanced.json', {
      parsers: {},
      extractors: {},
      queryTypes: [],
    });
    response.setHeader('Content-Type', 'application/json');
    response.send(advanced);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/checklogrotate', async (request: Request, response: Response) => {
  try {
    await processManager.checkLogrotate();
    response.status(200).send({ success: true, message: 'Logrotate module is installed.' });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/installlogrotate', async (request: Request, response: Response) => {
  try {
    await processManager.installLogrotate();
    response
      .status(200)
      .send({ success: true, message: 'Logrotate module installed successfully.' });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/logs/:appName/:type', (request: Request, response: Response) => {
  logsManager.streamLogs(request, response);
});

configrouter.put('/advanced', (request: Request, response: Response) => {
  try {
    configManager.updateAdvanced(rootDir, request.body);
    response
      .status(200)
      .send({ success: true, message: 'Advanced configuration updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.put('/ecosystem', async (request: Request, response: Response) => {
  try {
    await processManager.updateEcosystem(rootDir, request.body);
    response.status(200).send({ success: true, message: 'Ecosystem config updated successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/git/status', async (request: Request, response: Response) => {
  try {
    const status = await gitManager.getGitStatus();
    response.status(200).send({ success: true, ...status });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.get('/git/check', async (request: Request, response: Response) => {
  try {
    const result = await gitManager.checkForUpdates();
    response.status(200).send({ success: true, ...result });
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.post('/git/pull', async (request: Request, response: Response) => {
  try {
    const result = await gitManager.pullChanges();
    response
      .status(200)
      .send({ success: true, message: 'Update successful', output: result.output });
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.post('/git/force', async (request: Request, response: Response) => {
  try {
    const result = await gitManager.forceReset();
    response
      .status(200)
      .send({ success: true, message: 'Update successful', output: result.output });
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  } catch (error: any) {
    sendError(response, 500, error);
  }
});

configrouter.put('/certs', async (request: Request, response: Response) => {
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
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.get('/files/:serviceName/:folderType', (request: Request, response: Response) => {
  try {
    const { serviceName, folderType } = request.params;
    const subPath = request.query.path || '';

    const config = require('../config.json');
    const result = fileOps.listFiles(rootDir, serviceName, folderType, config, subPath);

    response.status(200).send({ success: true, ...result });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post(
  '/files/:serviceName/:folderType',
  fileOps.fileUpload.single('file'),
  (request: Request, response: Response) => {
    try {
      const { serviceName, folderType } = request.params;
      const targetPath = request.body.targetPath || '';

      const config = require(path.join(rootDir, 'config.json'));
      const file = fileOps.uploadFile(
        rootDir,
        serviceName,
        folderType,
        config,
        (request as any).file,
        targetPath,
      );

      response.status(200).send({
        success: true,
        message: 'File uploaded successfully',
        file,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      sendError(response, statusCode, error);
    }
  },
);

configrouter.delete('/files/:serviceName/:folderType', (request: Request, response: Response) => {
  try {
    const { serviceName, folderType } = request.params;
    const { filePath } = request.body;

    const config = require(path.join(rootDir, 'config.json'));
    fileOps.deleteFile(rootDir, serviceName, folderType, config, filePath);

    response.status(200).send({ success: true, message: 'File deleted successfully' });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    sendError(response, statusCode, error);
  }
});

configrouter.post(
  '/files/:serviceName/:folderType/directory',
  (request: Request, response: Response) => {
    try {
      const { serviceName, folderType } = request.params;
      const { directoryPath } = request.body;

      const config = require(path.join(rootDir, 'config.json'));
      fileOps.createDirectory(rootDir, serviceName, folderType, config, directoryPath);

      response.status(200).send({ success: true, message: 'Directory created successfully' });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      sendError(response, statusCode, error);
    }
  },
);

configrouter.post(
  '/files/:serviceName/:folderType/rename',
  (request: Request, response: Response) => {
    try {
      const { serviceName, folderType } = request.params;
      const { oldPath, newPath } = request.body;

      const config = require(path.join(rootDir, 'config.json'));
      fileOps.renameFile(rootDir, serviceName, folderType, config, oldPath, newPath);

      response.status(200).send({ success: true, message: 'Renamed successfully' });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      sendError(response, statusCode, error);
    }
  },
);

configrouter.post(
  '/files/:serviceName/:folderType/unpack',
  fileOps.fileUpload.single('zipFile'),
  (request: Request, response: Response) => {
    try {
      const { serviceName, folderType } = request.params;
      const { targetPath, deploy } = request.body;

      const config = require(path.join(rootDir, 'config.json'));
      const result = fileOps.unpackZip(
        rootDir,
        serviceName,
        folderType,
        config,
        (request as any).file,
        targetPath,
        deploy === 'true',
      );

      response.status(200).send({
        success: true,
        message: 'Zip extracted successfully',
        filesExtracted: result.filesExtracted,
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      sendError(response, statusCode, error);
    }
  },
);

configapp.use(configrouter);
export default configapp;
