import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function registerProvisionedCerts(
  baseDir: string,
  secureServices: any[],
  crontab: boolean,
  permissions: boolean,
) {
  try {
    const certsData = {
      services: secureServices,
      provisionedAt: new Date().toISOString(),
      crontab,
      permissions,
    };
    const certsPath = path.join(baseDir, 'certs.json');
    fs.writeFileSync(certsPath, JSON.stringify(certsData, null, 2), 'utf8');
  } catch (writeError: any) {
    const now = new Date().toISOString();
    console.error(`${now}: Failed to write certs.json:`, writeError);
  }
}

export function provisionCertificates(
  baseDir: string,
  email: string,
  config: any,
  env: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      const error: any = new Error('Invalid email address format');
      error.statusCode = 400;
      return reject(error);
    }

    const dangerousChars = /[;`$&|<>\\]/;
    if (dangerousChars.test(email)) {
      const error: any = new Error('Email contains invalid characters');
      error.statusCode = 400;
      return reject(error);
    }

    const domains = [config.domain];
    const secureServices = Object.keys(config.services || {}).filter((name) => {
      return config.services[name].subdomain?.protocol === 'secure';
    });

    if (secureServices.length === 0) {
      return resolve({ message: 'No secure services configured' });
    }

    secureServices.forEach((name) => {
      domains.push(`${name}.${config.domain}`);
    });

    const domainFlags = domains.map((d: string) => `-d ${d}`).join(' ');
    const deployHook = `sudo -u ${os.userInfo().username} bash -c '. ~/.bashrc; pm2 restart all'`;
    const baseCommand = `sudo certbot certonly --webroot --webroot-path ${path.join(baseDir, 'web', 'all')} --cert-name ${config.domain} ${domainFlags} --non-interactive --agree-tos --email ${email}`;
    const cronCommandWithHook = `${baseCommand} --deploy-hook "${deployHook}"`;

    if (env === 'development') {
      registerProvisionedCerts(baseDir, secureServices, true, true);
      return resolve({ message: 'Development mode: Certificates sucessfully not provisioned.' });
    }

    exec(baseCommand, { windowsHide: true }, (error: any, stdout: any, stderr: any) => {
      if (error) {
        return reject(new Error(error.message));
      }

      const cronCommand = `0 0 * * * ${cronCommandWithHook}`;
      const tmpCronFile = path.join(os.tmpdir(), `reverseproxy-cron-${Date.now()}.txt`);

      try {
        const existingCron = require('child_process').execSync('crontab -l 2>/dev/null || true', {
          encoding: 'utf8',
          windowsHide: true,
        });
        const filtered = existingCron
          .split(/\r?\n/)
          .filter(
            (line: string) => !line.includes('certbot certonly --webroot') && line.trim() !== '',
          )
          .join('\n');
        const newCron = (filtered ? filtered + '\n' : '') + cronCommand + '\n';
        fs.writeFileSync(tmpCronFile, newCron, { encoding: 'utf8', mode: 0o600 });

        exec(`crontab "${tmpCronFile}"`, { windowsHide: true }, (cronError: any) => {
          try {
            fs.unlinkSync(tmpCronFile);
          } catch (e) {}

          if (cronError) {
            registerProvisionedCerts(baseDir, secureServices, false, false);
            return resolve({
              message:
                'Certificates provisioned successfully, but automatic renewal setup failed. You may need to set up cron manually.',
            });
          }

          const chmodCommands = [
            'sudo find /etc/letsencrypt/live -type d -exec sudo chmod 755 {} \\;',
            'sudo find /etc/letsencrypt/archive -type d -exec sudo chmod 755 {} \\;',
            'sudo find /etc/letsencrypt/live -type f -name "*.pem" -exec sudo chmod 644 {} \\;',
            'sudo find /etc/letsencrypt/archive -type f -name "*.pem" -exec sudo chmod 644 {} \\;',
          ];

          let chmodFailed = false;
          const runChmodCommands = (index = 0) => {
            if (index >= chmodCommands.length) {
              registerProvisionedCerts(baseDir, secureServices, true, !chmodFailed);
              const message = chmodFailed
                ? 'Certificates provisioned successfully and automatic renewal configured. Permissions update on certificates failed, you may need to set up permissions manually.'
                : 'Certificates provisioned successfully and automatic renewal configured.';
              return resolve({ message });
            }

            exec(chmodCommands[index], { windowsHide: true }, (chmodError: any) => {
              if (chmodError) chmodFailed = true;
              runChmodCommands(index + 1);
            });
          };

          runChmodCommands();
        });
      } catch (err: any) {
        try {
          fs.unlinkSync(tmpCronFile);
        } catch (e) {}
        return reject(
          new Error(
            'Certificates provisioned successfully, but automatic renewal setup failed: ' +
              err.message,
          ),
        );
      }
    });
  });
}
