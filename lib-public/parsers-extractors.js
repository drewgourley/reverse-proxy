"use strict";

/**
 * WARNING: Functions in this module process data from external services and game servers.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const cheerio = require('cheerio');

/**
 * Default parsers for healthcheck responses
 */
const defaultParsers = {
  hass: (body) => {
    const dom = cheerio.load(body);
    const health = dom('.connected').last().text();
    return health && health.toLowerCase().indexOf('healthy') > -1;
  },
  radio: (body) => {
    const json = JSON.parse(body);
    return json.icestats && json.icestats.source;
  },
  body: (body) => body !== null && body !== undefined,
};

/**
 * Default extractors for service state information
 */
const defaultExtractors = {
  doom: (state) => ({
    online: state.server.players.length,
    max: state.server.maxPlayers,
    version: `${state.server.versionMajor}.${state.server.versionMinor}.${state.server.versionPatch}`,
  }),
  minecraft: (state) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.bedrock?.raw?.mcVersion,
  }),
  valheim: (state) => ({
    online: state.numplayers,
    max: state.maxplayers,
    version: state.raw?.version,
  }),
  radio: (state) => {
    const json = JSON.parse(state);
    if (json.icestats && json.icestats.source) {
      return {
        online: json.icestats.source.listeners || 0,
        version: json.icestats.source.title,
      };
    }
  },
};

/**
 * Setup parsers and extractors with custom overrides
 * @param {object} advancedConfig - Advanced configuration with custom parsers/extractors
 * @returns {object} Object containing parsers and extractors
 */
function setupParsersAndExtractors(advancedConfig) {
  const parsers = { ...defaultParsers };
  const extractors = { ...defaultExtractors };

  if (advancedConfig.parsers) {
    Object.keys(advancedConfig.parsers).forEach(key => {
      try {
        parsers[key] = eval(`(${advancedConfig.parsers[key]})`);
      } catch (error) {
        const now = new Date().toISOString();
        console.error(`${now}: Error loading custom parser "${key}":`, error);
      }
    });
  }

  if (advancedConfig.extractors) {
    Object.keys(advancedConfig.extractors).forEach(key => {
      try {
        extractors[key] = eval(`(${advancedConfig.extractors[key]})`);
      } catch (error) {
        const now = new Date().toISOString();
        console.error(`${now}: Error loading custom extractor "${key}":`, error);
      }
    });
  }

  return { parsers, extractors };
}

module.exports = {
  defaultParsers,
  defaultExtractors,
  setupParsersAndExtractors
};
