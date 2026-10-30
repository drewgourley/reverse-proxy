"use strict";

const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { serviceHost, wildcardServices } = require('../lib-public/hosts');
const { runFile, getStatus } = require('./certbot-plugin');

// Where certbot's Route 53 plugin finds the credentials (copied from Secrets), for the provisioning below
// and for the renewals cron runs later. Only root can read it.
const ROUTE53_CREDENTIALS = '/etc/letsencrypt/reverseproxy-route53-credentials';
const DOMAIN_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const AWS_VALUE = /^[A-Za-z0-9/+=_-]+$/;

/**
 * Work out which certificates the configuration needs: one certificate (webroot, HTTP-01) for the primary domain and every
 * ordinary secure service, and, when wildcard certificates are enabled, one of their own (DNS-01, the only way to get a
 * wildcard) per secure wildcard service.
 * @param {Object} config - Configuration object
 * @returns {{domains: string[], secureServices: string[], wildcardJobs: Array<{name: string, certName: string, domains: string[]}>}}
 */
function certificatePlan(config) {
  const secureServices = Object.keys(config.services || {}).filter(name => {
    const sub = config.services[name].subdomain;
    return sub?.protocol === 'secure' && sub?.disabled !== true;
  });
  const wildcardHosts = new Map(config.wildcardCerts === true ? wildcardServices(config).map(wildcard => [wildcard.name, wildcard.host]) : []);

  const domains = [config.domain];
  const wildcardJobs = [];
  secureServices.forEach(name => {
    if (wildcardHosts.has(name)) {
      const host = wildcardHosts.get(name);
      wildcardJobs.push({ name, certName: host, domains: [host, `*.${host}`] });
    } else {
      // A service bound to an alt domain is served ONLY there, not at name.config.domain
      domains.push(serviceHost(config, name));
    }
  });
  return { domains, secureServices, wildcardJobs };
}

/**
 * Reject host names that couldn't be a real domain, since they end up in certbot commands
 * @param {{domains: string[], wildcardJobs: Array<{certName: string, domains: string[]}>}} plan - From certificatePlan
 * @returns {void}
 */
function assertValidDomains(plan) {
  const names = [...plan.domains, ...plan.wildcardJobs.flatMap(job => job.domains.map(domain => domain.replace(/^\*\./, '')))];
  const invalid = names.find(name => !DOMAIN_NAME.test(name));
  if (invalid) {
    const error = new Error(`Invalid domain name for a certificate: ${invalid}`);
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Arguments for the certbot run that issues (or keeps, or renews) a wildcard service's certificate
 * @param {{certName: string, domains: string[]}} job - From certificatePlan
 * @param {string} email - Email address for Let's Encrypt
 * @returns {string[]}
 */
function wildcardCertbotArgs(job, email) {
  return ['certonly', '--dns-route53', '--cert-name', job.certName, ...job.domains.flatMap(domain => ['-d', domain]), '--non-interactive', '--agree-tos', '--email', email];
}

/**
 * The same certbot run as a shell command for cron, quoting whatever the shell would otherwise interpret (like the wildcard)
 * @param {{certName: string, domains: string[]}} job - From certificatePlan
 * @param {string} email - Email address for Let's Encrypt
 * @returns {string}
 */
function wildcardCertbotCommand(job, email) {
  const quote = (arg) => /^[A-Za-z0-9_./=@:-]+$/.test(arg) ? arg : `'${arg}'`;
  return `sudo env AWS_SHARED_CREDENTIALS_FILE=${ROUTE53_CREDENTIALS} certbot ${wildcardCertbotArgs(job, email).map(quote).join(' ')}`;
}

/**
 * Copy the wildcard certificate AWS credentials from Secrets to a root-only file for certbot's DNS plugin
 * @param {string} baseDir - Base directory (where secrets.json lives)
 * @returns {Promise<void>}
 */
async function installRoute53Credentials(baseDir) {
  let secrets = {};
  try {
    secrets = JSON.parse(fs.readFileSync(path.join(baseDir, 'secrets.json'), 'utf8'));
  } catch (error) {
    // Reported below, same as when the fields are missing
  }
  const accessKeyId = secrets.wildcard_aws_access_key_id || '';
  const secretAccessKey = secrets.wildcard_aws_secret_access_key || '';
  if (!AWS_VALUE.test(accessKeyId) || !AWS_VALUE.test(secretAccessKey)) {
    const error = new Error('Wildcard certificates need an AWS access key: add it in Secrets (it must be able to edit TXT records in the hosted zone and list hosted zones)');
    error.statusCode = 400;
    throw error;
  }

  const tmpFile = path.join(os.tmpdir(), `reverseproxy-route53-${Date.now()}.ini`);
  try {
    fs.writeFileSync(tmpFile, `[default]\naws_access_key_id = ${accessKeyId}\naws_secret_access_key = ${secretAccessKey}\n`, { encoding: 'utf8', mode: 0o600 });
    await runFile('sudo', ['install', '-m', '600', '-o', 'root', '-g', 'root', tmpFile, ROUTE53_CREDENTIALS]);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
}

/**
 * Issue the certificates of the wildcard services using DNS-01 challenges through Route 53
 * @param {string} baseDir - Base directory
 * @param {string} email - Email address for Let's Encrypt
 * @param {Array<{certName: string, domains: string[]}>} jobs - From certificatePlan
 * @returns {Promise<void>}
 */
async function provisionWildcardCertificates(baseDir, email, jobs) {
  if (jobs.length === 0) return;
  const plugin = await getStatus();
  if (!plugin.installed) {
    const error = new Error(`Certbot's Route 53 plugin is not installed. Install it from the Certificates page, or run: ${plugin.directions.join(' && ')}`);
    error.statusCode = 400;
    throw error;
  }
  await installRoute53Credentials(baseDir);
  for (const job of jobs) {
    try {
      await runFile('sudo', ['env', `AWS_SHARED_CREDENTIALS_FILE=${ROUTE53_CREDENTIALS}`, 'certbot', ...wildcardCertbotArgs(job, email)]);
    } catch (error) {
      throw new Error(`Wildcard certificate for ${job.certName} failed: ${error.message}`);
    }
  }
}

/**
 * Register provisioned certificates
 * @param {string} baseDir - Base directory
 * @param {Array<string>} secureServices - List of secure services
 * @param {boolean} crontab - Whether crontab was set up
 * @param {boolean} permissions - Whether permissions were set
 * @param {Array<string>} [wildcards] - Secure services provisioned with their own wildcard certificate
 * @returns {void}
 */
function registerProvisionedCerts(baseDir, secureServices, crontab, permissions, wildcards = []) {
  try {
    const certsData = {
      services: secureServices,
      wildcards,
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
    
    const { domains, secureServices, wildcardJobs } = certificatePlan(config);
    
    if (env !== 'development') {
      try {
        assertValidDomains({ domains, wildcardJobs });
      } catch (error) {
        return reject(error);
      }
    }
    
    const domainFlags = domains.map(d => `-d ${d}`).join(' ');
    const deployHook = `sudo -u ${os.userInfo().username} bash -c '. ~/.bashrc; pm2 restart all'`;
    const baseCommand = `sudo certbot certonly --webroot --webroot-path ${path.join(webDir, 'web', 'all')} --cert-name ${config.domain} ${domainFlags} --non-interactive --agree-tos --email ${email}`;
    const cronCommandWithHook = `${baseCommand} --deploy-hook "${deployHook}"`;
    
    if (env === 'development') {
      setTimeout(async () => {
        registerProvisionedCerts(baseDir, secureServices, true, true, wildcardJobs.map(job => job.name));
        return resolve({ message: 'Development mode: Certificates successfully not provisioned.' });
      }, 2000);
      return;
    }
    
    exec(baseCommand, { windowsHide: true }, async (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(error.message));
      }
      
      try {
        await provisionWildcardCertificates(baseDir, email, wildcardJobs);
      } catch (wildcardError) {
        return reject(wildcardError);
      }
      
      // One renewal line per certificate: the shared one, and one for each wildcard service
      const cronCommand = [cronCommandWithHook, ...wildcardJobs.map(job => `${wildcardCertbotCommand(job, email)} --deploy-hook "${deployHook}"`)]
        .map(command => `0 0 * * * ${command}`)
        .join('\n');
      const tmpCronFile = path.join(os.tmpdir(), `reverseproxy-cron-${Date.now()}.txt`);
      
      try {
        const existingCron = require('child_process').execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8', windowsHide: true });
        const filtered = existingCron.split(/\r?\n/).filter(line => !line.includes('certbot certonly --webroot') && !line.includes(ROUTE53_CREDENTIALS) && line.trim() !== '').join('\n');
        const newCron = (filtered ? filtered + '\n' : '') + cronCommand + '\n';
        fs.writeFileSync(tmpCronFile, newCron, { encoding: 'utf8', mode: 0o600 });
        
        exec(`crontab "${tmpCronFile}"`, { windowsHide: true }, (cronError) => {
          try { fs.unlinkSync(tmpCronFile); } catch (e) {}
          
          if (cronError) {
            registerProvisionedCerts(baseDir, secureServices, false, false, wildcardJobs.map(job => job.name));
            return resolve({ message: 'Certificates provisioned successfully, but automatic renewal setup failed. You may need to set up cron manually.' });
          }
          
          // Set permissions
          const chmodCommands = [
            'sudo find /etc/letsencrypt/live -type d -exec sudo chmod 755 {} \\;',
            'sudo find /etc/letsencrypt/archive -type d -exec sudo chmod 755 {} \\;',
            'sudo find /etc/letsencrypt/live -type f -name "*.pem" -exec sudo chmod 644 {} \\;',
            'sudo find /etc/letsencrypt/archive -type f -name "*.pem" -exec sudo chmod 644 {} \\;'
          ];
          
          let chmodFailed = false;
          const runChmodCommands = (index = 0) => {
            if (index >= chmodCommands.length) {
              registerProvisionedCerts(baseDir, secureServices, true, !chmodFailed, wildcardJobs.map(job => job.name));
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
  provisionCertificates,
  certificatePlan,
  assertValidDomains,
  wildcardCertbotArgs,
  wildcardCertbotCommand
};
