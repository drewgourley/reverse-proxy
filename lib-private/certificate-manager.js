"use strict";

const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isContainerized = process.env.CONTAINERIZED === 'true' || fs.existsSync('/.dockerenv');

/**
 * Register provisioned certificates
 * @param {string} baseDir - Base directory
 * @param {Array} secureServices - List of secure services
 * @param {boolean} crontab - Whether crontab was set up
 * @param {boolean} permissions - Whether permissions were set
 */
function registerProvisionedCerts(baseDir, secureServices, crontab, permissions) {
  try {
    const certsData = {
      services: secureServices,
      provisionedAt: new Date().toISOString(),
      crontab,
      permissions
    };
    const certsPath = path.join(baseDir, 'certs.json');
    fs.writeFileSync(certsPath, JSON.stringify(certsData, null, 2), 'utf8');
  } catch (writeError) {
    const now = new Date().toISOString();
    console.error(`${now}: Failed to write certs.json:`, writeError);
  }
}

/**
 * Provision SSL certificates using certbot
 * @param {string} webDir - Web directory
 * @param {string} baseDir - Base directory
 * @param {string} email - Email address for Let's Encrypt
 * @param {Object} config - Configuration object
 * @param {string} env - Environment (development/production)
 * @returns {Promise<Object>} Provisioning result
 */
function provisionCertificates(webDir, baseDir, email, config, env) {
  return new Promise((resolve, reject) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      const error = new Error('Invalid email address format');
      error.statusCode = 400;
      return reject(error);
    }
    
    const dangerousChars = /[;`$&|<>\\]/;
    if (dangerousChars.test(email)) {
      const error = new Error('Email contains invalid characters');
      error.statusCode = 400;
      return reject(error);
    }
    
    const domains = [config.domain];
    const secureServices = Object.keys(config.services || {}).filter(name => {
      return config.services[name].subdomain?.protocol === 'secure';
    });
    
    if (secureServices.length === 0) {
      return resolve({ message: 'No secure services configured' });
    }
    
    secureServices.forEach(name => {
      domains.push(`${name}.${config.domain}`);
    });
    
    const domainFlags = domains.map(d => `-d ${d}`).join(' ');
const deployHook = isContainerized ? '' : `sudo -u ${os.userInfo().username} bash -c '. ~/.bashrc; pm2 restart all'`;
const baseCommand = `${isContainerized ? '' : 'sudo '}certbot certonly --webroot --webroot-path ${path.join(webDir, 'web', 'all')} --cert-name ${config.domain} ${domainFlags} --non-interactive --agree-tos --email ${email}`.trim();
const cronCommandWithHook = deployHook ? `${baseCommand} --deploy-hook "${deployHook}"` : baseCommand;
    if (env === 'development') {
      registerProvisionedCerts(baseDir, secureServices, true, true);
      return resolve({ message: 'Development mode: Certificates sucessfully not provisioned.' });
    }
    
    // Production mode - actually provision certificates
    exec(baseCommand, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(error.message));
      }
      
      const cronCommand = `0 0 * * * ${cronCommandWithHook}`;
      const tmpCronFile = path.join(os.tmpdir(), `reverseproxy-cron-${Date.now()}.txt`);
      
      try {
        const existingCron = require('child_process').execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8', windowsHide: true });
        const filtered = existingCron.split(/\r?\n/).filter(line => !line.includes('certbot certonly --webroot') && line.trim() !== '').join('\n');
        const newCron = (filtered ? filtered + '\n' : '') + cronCommand + '\n';
        fs.writeFileSync(tmpCronFile, newCron, { encoding: 'utf8', mode: 0o600 });
        
        exec(`crontab "${tmpCronFile}"`, { windowsHide: true }, (cronError) => {
          try { fs.unlinkSync(tmpCronFile); } catch (e) {}
          
          if (cronError) {
            registerProvisionedCerts(baseDir, secureServices, false, false);
            return resolve({ message: 'Certificates provisioned successfully, but automatic renewal setup failed. You may need to set up cron manually.' });
          }
          
          // Set permissions
          const findCmdPrefix = isContainerized ? '' : 'sudo ';
          const chmodCommands = [
            `${findCmdPrefix}find /etc/letsencrypt/live -type d -exec ${findCmdPrefix}chmod 755 {} \\;`,
            `${findCmdPrefix}find /etc/letsencrypt/archive -type d -exec ${findCmdPrefix}chmod 755 {} \\;`,
            `${findCmdPrefix}find /etc/letsencrypt/live -type f -name "*.pem" -exec ${findCmdPrefix}chmod 644 {} \\;`,
            `${findCmdPrefix}find /etc/letsencrypt/archive -type f -name "*.pem" -exec ${findCmdPrefix}chmod 644 {} \\;`
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
            
            exec(chmodCommands[index], { windowsHide: true }, (chmodError) => {
              if (chmodError) chmodFailed = true;
              runChmodCommands(index + 1);
            });
          };
          
          runChmodCommands();
        });
      } catch (err) {
        try { fs.unlinkSync(tmpCronFile); } catch (e) {}
        return reject(new Error('Certificates provisioned successfully, but automatic renewal setup failed: ' + err.message));
      }
    });
  });
}

module.exports = {
  registerProvisionedCerts,
  provisionCertificates
};
