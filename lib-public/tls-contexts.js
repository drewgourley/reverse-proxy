"use strict";

/**
 * WARNING: Functions in this module load the private keys of the certificates the proxy serves.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const fs = require('fs');
const path = require('path');
const tls = require('tls');

const { wildcardServices } = require('./hosts');

/**
 * Read one certificate lineage that certbot keeps under /etc/letsencrypt/live
 * @param {string} name - Lineage name (the primary domain, or the host of a wildcard service)
 * @param {function} readFile - fs.readFileSync, replaceable in tests
 * @returns {{key: string, cert: string, ca: string}|undefined} Undefined when the lineage isn't provisioned (yet)
 */
function readLineage(name, readFile = fs.readFileSync) {
  try {
    const dir = path.join('/etc', 'letsencrypt', 'live', name);
    return {
      key: readFile(path.join(dir, 'privkey.pem'), 'utf8'),
      cert: readFile(path.join(dir, 'cert.pem'), 'utf8'),
      ca: readFile(path.join(dir, 'chain.pem'), 'utf8'),
    };
  } catch (error) {
    return undefined;
  }
}

/**
 * Which wildcard service's certificate answers for a server name, if any
 * @param {string} servername - TLS server name (SNI)
 * @param {Array<{name: string, host: string}>} wildcards - From wildcardServices
 * @returns {string|null} The wildcard service's host (its lineage name), or null for the default certificate
 */
function lineageFor(servername, wildcards) {
  const name = (servername || '').toLowerCase();
  return wildcards.find(wildcard => name === wildcard.host || name.endsWith(`.${wildcard.host}`))?.host ?? null;
}

/**
 * Options for the HTTPS server: the primary domain's certificate by default, and a wildcard service's own certificate for
 * its host and every subdomain of it, chosen by the name the browser asked for.
 * @param {object} config - Main configuration
 * @param {object} [deps] - Replaceable in tests
 * @returns {object|null} https.createServer options, or null when no certificate is provisioned at all
 */
function buildTlsOptions(config, { read = readLineage, createContext = tls.createSecureContext } = {}) {
  const wildcards = wildcardServices(config);
  const materials = new Map();
  wildcards.forEach(({ host }) => {
    const material = read(host);
    if (material) materials.set(host, material);
  });

  // Without a certificate for the primary domain, the first wildcard one stands in for names nobody asked about.
  const fallback = read(config.domain) || materials.values().next().value;
  if (!fallback) return null;

  const defaultContext = createContext(fallback);
  const contexts = new Map([...materials].map(([host, material]) => [host, createContext(material)]));
  return {
    ...fallback,
    SNICallback(servername, callback) {
      callback(null, contexts.get(lineageFor(servername, wildcards)) || defaultContext);
    },
  };
}

module.exports = {
  readLineage,
  lineageFor,
  buildTlsOptions
};
