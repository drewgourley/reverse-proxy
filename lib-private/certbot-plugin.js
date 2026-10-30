"use strict";

const { execFile } = require('child_process');

const APT_PACKAGE = 'python3-certbot-dns-route53';

// What to type by hand, for when installing the plugin from here isn't possible (no passwordless sudo, offline, ...)
const DIRECTIONS = {
  apt: ['sudo apt update', `sudo apt install -y ${APT_PACKAGE}`],
  snap: ['sudo snap set certbot trust-plugin-with-root=ok', 'sudo snap install certbot-dns-route53', 'sudo snap connect certbot:plugin certbot-dns-route53'],
  none: [`sudo apt install -y certbot ${APT_PACKAGE}`],
};

/**
 * Run a command without a shell
 * @param {string} file - Executable
 * @param {string[]} args - Arguments
 * @param {Object} [options] - execFile options
 * @returns {Promise<string>} stdout
 */
function runFile(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 5 * 60 * 1000, ...options }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout);
    });
  });
}

/**
 * The last lines of a failure, enough to tell what went wrong
 * @param {Error} error - Failed command
 * @returns {string}
 */
function reason(error) {
  return String(error.message).trim().split('\n').slice(-3).join(' ');
}

/**
 * How Certbot was installed, which decides how its plugins are
 * @param {function} run - runFile, replaceable in tests
 * @returns {Promise<'apt'|'snap'|'none'>}
 */
async function installMethod(run) {
  try {
    const found = (await run('which', ['certbot'])).trim();
    return found.startsWith('/snap/') ? 'snap' : 'apt';
  } catch (error) {
    return 'none';
  }
}

/**
 * Whether Certbot's Route 53 plugin is installed, and how to install it by hand
 * @param {function} [run] - runFile, replaceable in tests
 * @returns {Promise<{installed: boolean, method: string, directions: string[], detail?: string}>}
 */
async function getStatus(run = runFile) {
  const method = await installMethod(run);
  const directions = DIRECTIONS[method];
  if (method === 'none') return { installed: false, method, directions, detail: 'Certbot was not found.' };
  try {
    const plugins = await run('sudo', ['-n', 'certbot', 'plugins']);
    return { installed: /dns-route53/.test(plugins), method, directions };
  } catch (error) {
    return { installed: false, method, directions, detail: reason(error) };
  }
}

/**
 * Install Certbot's Route 53 plugin when it is missing. Never throws: a failure comes back with the directions to do it by hand.
 * @param {function} [run] - runFile, replaceable in tests
 * @returns {Promise<{installed: boolean, method: string, directions: string[], detail?: string}>}
 */
async function installPlugin(run = runFile) {
  const status = await getStatus(run);
  if (status.installed || status.method === 'none') return status;
  try {
    if (status.method === 'snap') {
      await run('sudo', ['-n', 'snap', 'set', 'certbot', 'trust-plugin-with-root=ok']);
      await run('sudo', ['-n', 'snap', 'install', 'certbot-dns-route53']);
      await run('sudo', ['-n', 'snap', 'connect', 'certbot:plugin', 'certbot-dns-route53']).catch(() => {});
    } else {
      await run('sudo', ['-n', 'apt-get', 'update']).catch(() => {});
      await run('sudo', ['-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', APT_PACKAGE]);
    }
  } catch (error) {
    return { ...status, installed: false, detail: reason(error) };
  }
  return getStatus(run);
}

module.exports = {
  runFile,
  getStatus,
  installPlugin
};
