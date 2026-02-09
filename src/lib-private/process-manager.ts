import { exec } from 'child_process';
import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';

const ajv = new Ajv();

export function readEcosystem(baseDir: string) {
  const ecosystemPath = path.join(baseDir, 'ecosystem.config.js');

  if (!fs.existsSync(ecosystemPath)) {
    return {
      default: true,
      apps: [
        {
          name: 'Reverse Proxy',
          script: './app.js',
          watch: false,
          env: { NODE_ENV: 'production' },
        },
      ],
    };
  }

  const fileContent = fs.readFileSync(ecosystemPath, 'utf8');
  const jsonString = fileContent.replace(/^module\.exports\s*=\s*/, '').trim();
  const ecosystemConfig = JSON.parse(jsonString);

  if (ecosystemConfig.apps && Array.isArray(ecosystemConfig.apps)) {
    for (const app of ecosystemConfig.apps) {
      if (app.watch === true || app.ignore_watch) {
        ecosystemConfig.resave = true;
      }
    }
  }

  return ecosystemConfig;
}

export function updateEcosystem(baseDir: string, updatedEcosystem: any) {
  return new Promise<void>((resolve, reject) => {
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
              env: { type: 'object' },
            },
          },
        },
      },
      additionalProperties: true,
    };

    const validate = ajv.compile(ecosystemSchema);
    if (!validate(updatedEcosystem)) {
      const error: any = new Error('Invalid ecosystem configuration format');
      error.details = validate.errors;
      error.statusCode = 400;
      return reject(error);
    }

    const ecosystemPath = path.join(baseDir, 'ecosystem.config.js');
    const firstrun = !fs.existsSync(ecosystemPath);

    let originalEcosystem: any = null;
    if (!firstrun) {
      const originalContent = fs.readFileSync(ecosystemPath, 'utf8');
      const jsonString = originalContent.replace(/^module\.exports\s*=\s*/, '').trim();
      originalEcosystem = JSON.parse(jsonString);
    }

    const updateContent = `module.exports = ${JSON.stringify(updatedEcosystem, null, 2)}\n`;
    fs.writeFileSync(ecosystemPath, updateContent);

    if (firstrun) {
      setTimeout(() => {
        exec('pm2 start ecosystem.config.js && pm2 save', { windowsHide: true }, () => {
          process.exit(0);
        });
      }, 2000);
    } else {
      setTimeout(() => {
        exec('pm2 startOrReload ecosystem.config.js', { windowsHide: true }, (err: any) => {
          if (err) {
            console.error('PM2 reload failed:', err);
            return;
          }

          if (
            originalEcosystem &&
            originalEcosystem.apps[0].name !== (updatedEcosystem as any).apps[0].name
          ) {
            exec(
              `pm2 delete "${originalEcosystem.apps[0].name}"`,
              { windowsHide: true },
              (delErr: any) => {
                if (delErr) console.error('Failed to delete old app:', delErr);
                exec('pm2 save', { windowsHide: true });
              },
            );
          } else {
            exec('pm2 save', { windowsHide: true });
          }
        });
      }, 2000);
    }

    resolve();
  });
}

export function checkLogrotate(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    exec('pm2 describe pm2-logrotate', { windowsHide: true }, (err: any, out: any) => {
      if (
        (err && err.toString().includes("doesn't exist")) ||
        (out && out.includes("doesn't exist"))
      ) {
        return reject(
          new Error(
            'Logrotate module is not installed. Please install it to enable live log streaming.',
          ),
        );
      }
      resolve(true);
    });
  });
}

export function installLogrotate(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('pm2 install pm2-logrotate', { windowsHide: true }, (err: any) => {
      if (err) {
        return reject(new Error(`Failed to install logrotate module: ${err.message}`));
      }

      setTimeout(() => {
        process.exit(0);
      }, 2000);

      resolve();
    });
  });
}
