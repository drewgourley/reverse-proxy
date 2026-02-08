"use strict";

/**
 * WARNING: Functions in this module handle configuration loading for the reverse proxy.
 * Anything in these functions can and will be publicly facing, so be careful what you expose.
 */

const path = require('path');

/**
 * Load all configuration files with error handling
 * @param {string} baseDir - Base directory path
 * @returns {object} Object containing all loaded configs
 */
function loadConfigs(baseDir) {
  const now = new Date().toISOString();
  
  let config;
  try {
    config = require(path.join(baseDir, 'config.json'));
  } catch (e) {
    config = {};
    console.warn(`${now}: Initial configuration required`);
  }

  let secrets;
  try {
    secrets = require(path.join(baseDir, 'secrets.json'));
  } catch (e) {
    secrets = {};
    console.warn(`${now}: Secrets not configured`);
  }

  let users;
  try {
    users = require(path.join(baseDir, 'users.json'));
  } catch (e) {
    users = { users: [] };
    console.warn(`${now}: Users not configured`);
  }

  let ddns;
  try {
    ddns = require(path.join(baseDir, 'ddns.json'));
  } catch (e) {
    ddns = {};
    console.warn(`${now}: DDNS not configured`);
  }

  let advancedConfig;
  try {
    advancedConfig = require(path.join(baseDir, 'advanced.json'));
  } catch (e) {
    advancedConfig = { parsers: {}, extractors: {}, queryTypes: [] };
    console.warn(`${now}: Advanced Options not configured`);
  }

  let blocklist;
  try {
    blocklist = require(path.join(baseDir, 'blocklist.json'));
  } catch (e) {
    blocklist = [];
    console.warn(`${now}: Blocklist not established`);
  }

  return {
    config,
    secrets,
    users,
    ddns,
    advancedConfig,
    blocklist
  };
}

module.exports = {
  loadConfigs
};
