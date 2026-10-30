"use strict";

/**
 * Which host names a service answers for. A service marked `wildcard` also answers for every subdomain of its host, so
 * something behind it (a platform that gives each customer a subdomain) can create names without touching this proxy.
 */

/**
 * The host name a service answers at: its alternate domain (with the optional prefix), else name.domain
 * @param {object} config - Main configuration
 * @param {string} name - Service identifier
 * @returns {string}
 */
function serviceHost(config, name) {
  const sub = config.services[name].subdomain;
  if (sub.altDomain) return sub.altDomainPrefix ? `${sub.altDomainPrefix}.${sub.altDomain}` : sub.altDomain;
  return `${name}.${config.domain}`;
}

/**
 * The enabled services that also answer for every subdomain of their host, longest host first so the most specific one wins
 * @param {object} config - Main configuration
 * @returns {Array<{name: string, host: string}>}
 */
function wildcardServices(config) {
  return Object.keys(config.services || {})
    .filter(name => {
      const sub = config.services[name].subdomain;
      return sub && sub.wildcard === true && !sub.disabled;
    })
    .map(name => ({ name, host: serviceHost(config, name).toLowerCase() }))
    .sort((a, b) => b.host.length - a.host.length);
}

/**
 * The wildcard service a host name belongs to: a subdomain of its host, not the host itself
 * @param {Array<{name: string, host: string}>} wildcards - From wildcardServices
 * @param {string} host - Host header or TLS server name
 * @returns {string|undefined} Service identifier
 */
function matchWildcard(wildcards, host) {
  const name = (host || '').toLowerCase().replace(/:\d+$/, '');
  return wildcards.find(wildcard => name.length > wildcard.host.length + 1 && name.endsWith(`.${wildcard.host}`))?.name;
}

module.exports = {
  serviceHost,
  wildcardServices,
  matchWildcard
};
