import path from 'path';

export type LoadedConfigs = {
  config: any;
  secrets: any;
  users: any;
  ddns: any;
  advancedConfig: any;
  blocklist: any;
};

/**
 * Load all configuration files with error handling
 * @param baseDir - Base directory path
 */
export function loadConfigs(baseDir: string): LoadedConfigs {
  const now = new Date().toISOString();

  let config: any;
  try {
    // Use require so JSON can be loaded relative to runtime baseDir
    config = require(path.join(baseDir, 'config.json'));
  } catch (e) {
    config = {};
    console.warn(`${now}: Initial configuration required`);
  }

  let secrets: any;
  try {
    secrets = require(path.join(baseDir, 'secrets.json'));
  } catch (e) {
    secrets = {};
    console.warn(`${now}: Secrets not configured`);
  }

  let users: any;
  try {
    users = require(path.join(baseDir, 'users.json'));
  } catch (e) {
    users = { users: [] };
    console.warn(`${now}: Users not configured`);
  }

  let ddns: any;
  try {
    ddns = require(path.join(baseDir, 'ddns.json'));
  } catch (e) {
    ddns = {};
    console.warn(`${now}: DDNS not configured`);
  }

  let advancedConfig: any;
  try {
    advancedConfig = require(path.join(baseDir, 'advanced.json'));
  } catch (e) {
    advancedConfig = { parsers: {}, extractors: {}, queryTypes: [] };
    console.warn(`${now}: Advanced Options not configured`);
  }

  let blocklist: any;
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
    blocklist,
  };
}
