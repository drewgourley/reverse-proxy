"use strict";

/**
 * WARNING: Functions in this module expose service health status publicly via API endpoints.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const got = require('got');
const { GameDig } = require('gamedig');

/**
 * Check service health status
 * @param {string} name - Service name
 * @param {object} config - Configuration object
 * @param {object} protocols - Protocol mapping
 * @param {object} parsers - Parser functions
 * @param {object} extractors - Extractor functions
 * @param {object} odalpapiService - OdalPapi service instance
 * @param {function} callback - Callback function
 */
function checkService(name, config, protocols, parsers, extractors, odalpapiService, callback) {
  const service = config.services[name];
  const check = service?.healthcheck;
  const report = {
    service: name,
    healthy: false,
    deck: 'deckunhealthy',
  };

  if (check && check.type && check.path) {
    if (check.meta) {
      report.meta = { ...check.meta };
    }
    if (report.meta?.link && service.subdomain?.protocol) {
      report.meta.link = `${protocols[service.subdomain.protocol]}${name}.${config.domain}`;
    } else {
      delete report.meta?.link;
    }

    if (check.type === 'http') {
      got(`${protocols.insecure}${check.path}`, { timeout: { request: check.timeout || 1000 } })
        .then((response) => {
          if (parsers[check.parser] && parsers[check.parser](response.body)) {
            report.healthy = true;
            report.deck = 'deckhealthy';
            if (check.extractor && extractors[check.extractor] && report.meta) {
              Object.assign(report.meta, extractors[check.extractor](response.body));
            }
          }
          callback(report);
        })
        .catch((error) => {
          report.error = error;
          callback(report);
        });
    } else if (check.type === 'gamedig') {
      GameDig.query({
        type: check.queryType,
        host: check.path,
      })
      .then((state) => {
        report.healthy = true;
        report.deck = 'deckhealthy';
        if (check.extractor && extractors[check.extractor] && report.meta) {
          Object.assign(report.meta, extractors[check.extractor](state));
        }
        callback(report);
      })
      .catch((error) => {
        report.error = error;
        callback(report);
      });
    } else if (check.type === 'odalpapi') {
      const hostParts = check.path.split(':');
      odalpapiService.queryGameServer({
        ip: hostParts[0],
        port: hostParts[1],
      })
      .then((state) => {
        report.healthy = true;
        report.deck = 'deckhealthy';
        if (check.extractor && extractors[check.extractor] && report.meta) {
          Object.assign(report.meta, extractors[check.extractor](state));
        }
        callback(report);
      })
      .catch((error) => {
        report.error = error;
        callback(report);
      });
    }
  } else if (check.id && name === 'api') {
    report.healthy = true;
    report.deck = 'deckhealthy';
    callback(report);
  } else {
    report.error = 'Healthcheck Config Incomplete';
    callback(report);
  }
}

/**
 * Ping external healthcheck service
 * @param {string} name - Service name
 * @param {object} config - Configuration object
 * @param {object} protocols - Protocol mapping
 */
async function pingHealthcheck(name, config, protocols) {
  const id = config.services?.[name]?.healthcheck?.id;
  if (id) {
    const now = new Date().toISOString();
    const path = require('path');
    try {
      const ping = await got(`${protocols.secure}${path.join('hc-ping.com', id)}`, { timeout: { request: 5000 } });
      console.log(`${now}: ${name} healthcheck ping succeeded. ${ping.body}`);
    } catch (error) {
      console.log(`${now}: ${name} healthcheck ping failed. ${error}`);
    }
  }
}

/**
 * Initializes health checks for services with healthcheck URLs in the configuration
 * @param {object} config - Service configuration object
 * @param {object} protocols - Protocol mapping
 * @param {object} parsers - Parser functions
 * @param {object} extractors - Extractor Functions
 * @param {object} odalpapiService - OdalPapi service instance
 * @param {string} env - Environment (production, development, etc.)
 * @param {object} cron - Node-cron instance
 */
async function initHealthchecks(config, protocols, parsers, extractors, odalpapiService, env, cron) {
  if (config.services) {
    const healthchecks = Object.keys(config.services).filter((name) => config.services[name].healthcheck);
    cron.schedule('1 * * * *', () => {
      healthchecks.forEach((name) => {
        checkService(name, config, protocols, parsers, extractors, odalpapiService, (service) => {
          const now = new Date().toISOString();
          if (service.healthy) {
            if (env === 'production') {
              console.log(`${now}: ${name} service is up. Pinging healthcheck...`);
              pingHealthcheck(name, config, protocols);
            } else {
              console.log(`${now}: Skipping healthcheck ping for ${name} in non-production environment`);
            }
          }
        });
      });
    });
  }
}

module.exports = {
  initHealthchecks,
  checkService,
  pingHealthcheck
};
