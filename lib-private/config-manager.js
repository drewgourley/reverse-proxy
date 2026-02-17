"use strict";

const Ajv = require('ajv');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const ajv = new Ajv();

/**
 * Read a JSON configuration file
 * @param {string} baseDir - Base directory
 * @param {string} fileName - Name of the JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @returns {Object} Parsed JSON data
 */
function readConfig(baseDir, fileName, defaultValue = null) {
  const filePath = path.join(baseDir, fileName);
  
  if (!fs.existsSync(filePath)) {
    if (defaultValue !== null) {
      return defaultValue;
    }
    const error = new Error(`${fileName} not found`);
    error.statusCode = 404;
    throw error;
  }
  
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

/**
 * Save configuration and optionally restart
 * @param {string} filePath - Full path to config file
 * @param {Object} data - Data to save
 */
function saveConfig(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  
  setTimeout(() => {
    process.exit(0);
  }, 2000);
}

/**
 * Update config.json with validation
 */
function updateConfig(baseDir, updatedConfig) {
  let existingConfig = {};
  try {
    existingConfig = readConfig(baseDir, 'config.json', {});
  } catch (e) {
    // Ignore if doesn't exist
  }
  
  const configSchema = {
    type: 'object',
    required: ['domain'],
    properties: {
      domain: { type: 'string', minLength: 1 },
      rootservice: { type: 'string' },
      services: {
        type: 'object',
        patternProperties: {
          '^[a-zA-Z0-9_-]+$': {
            type: 'object',
            properties: {
              nicename: { type: 'string' },
              subdomain: { type: 'object' },
              healthcheck: { type: 'object' }
            }
          }
        }
      }
    },
    additionalProperties: false
  };
  
  const validate = ajv.compile(configSchema);
  if (!validate(updatedConfig)) {
    const error = new Error('Invalid config format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }
  
  const domainChanged = updatedConfig.domain !== existingConfig.domain;
  const configPath = path.join(baseDir, 'config.json');
  saveConfig(configPath, updatedConfig);
  
  return { domainChanged };
}

/**
 * Update blocklist.json
 */
function updateBlocklist(baseDir, updatedBlocklist) {
  if (!Array.isArray(updatedBlocklist)) {
    const error = new Error('Blocklist must be an array of IP addresses');
    error.statusCode = 400;
    throw error;
  }
  
  const blocklistPath = path.join(baseDir, 'blocklist.json');
  saveConfig(blocklistPath, updatedBlocklist);
}

/**
 * Update secrets.json with password hashing
 */
async function updateSecrets(baseDir, updatedSecrets) {
  const secretsSchema = {
    type: 'object',
    properties: {
      admin_email_address: { 
        type: 'string',
        pattern: '^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
      },
      shock_password_hash: { type: 'string' },
      shock_mac: { 
        type: 'string', 
        pattern: '^$|^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$' 
      },
      api_password_hash: { type: 'string' }
    },
    additionalProperties: true
  };
  
  const validate = ajv.compile(secretsSchema);
  if (!validate(updatedSecrets)) {
    const error = new Error('Invalid secrets format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }
  
  let existingSecrets = {};
  try {
    existingSecrets = readConfig(baseDir, 'secrets.json', {});
  } catch (e) {
    // Ignore
  }
  
  // Handle shock_password_hash
  if ((!updatedSecrets.shock_password_hash || updatedSecrets.shock_password_hash.trim() === '') && existingSecrets.shock_password_hash) {
    updatedSecrets.shock_password_hash = existingSecrets.shock_password_hash;
  }
  if (updatedSecrets.shock_password_hash && !updatedSecrets.shock_password_hash.startsWith('$2b$')) {
    updatedSecrets.shock_password_hash = await bcrypt.hash(updatedSecrets.shock_password_hash, 10);
  }
  
  // Handle api_password_hash
  if (!updatedSecrets.api_password_hash) {
    // Leave undefined
  } else if ((updatedSecrets.api_password_hash.trim() === '') && existingSecrets.api_password_hash) {
    updatedSecrets.api_password_hash = existingSecrets.api_password_hash;
  }
  if (updatedSecrets.api_password_hash && !updatedSecrets.api_password_hash.startsWith('$2b$')) {
    updatedSecrets.api_password_hash = await bcrypt.hash(updatedSecrets.api_password_hash, 10);
  }
  
  const secretsPath = path.join(baseDir, 'secrets.json');
  saveConfig(secretsPath, updatedSecrets);
}

/**
 * Update users.json with password hashing
 */
async function updateUsers(baseDir, updatedUsers) {
  const usersSchema = {
    type: 'object',
    required: ['users'],
    properties: {
      users: {
        type: 'array',
        items: {
          type: 'object',
          required: ['uuid', 'username', 'services'],
          properties: {
            uuid: { type: 'string', minLength: 1 },
            username: { type: 'string', minLength: 1 },
            password_hash: { type: 'string' },
            services: { 
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    additionalProperties: false
  };
  
  const validate = ajv.compile(usersSchema);
  if (!validate(updatedUsers)) {
    const error = new Error('Invalid users format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }
  
  let existingUsers = { users: [] };
  try {
    existingUsers = readConfig(baseDir, 'users.json', { users: [] });
  } catch (e) {
    // Ignore
  }
  
  for (let i = 0; i < updatedUsers.users.length; i++) {
    const user = updatedUsers.users[i];
    const existingUser = existingUsers.users?.find(u => u.uuid === user.uuid);
    
    if ((!user.password_hash || user.password_hash.trim() === '') && existingUser?.password_hash) {
      user.password_hash = existingUser.password_hash;
    }
    
    if (user.password_hash && !user.password_hash.startsWith('$2b$')) {
      user.password_hash = await bcrypt.hash(user.password_hash, 10);
    }
  }
  
  const usersPath = path.join(baseDir, 'users.json');
  saveConfig(usersPath, updatedUsers);
}

/**
 * Update ddns.json
 */
function updateDDNS(baseDir, updatedDdns) {
  const ddnsSchema = {
    type: 'object',
    required: ['active', 'aws_access_key_id', 'aws_secret_access_key', 'aws_region', 'route53_hosted_zone_id'],
    properties: {
      active: { type: 'boolean' },
      aws_access_key_id: { type: 'string', minLength: 1 },
      aws_secret_access_key: { type: 'string', minLength: 1 },
      aws_region: { type: 'string', minLength: 1 },
      route53_hosted_zone_id: { type: 'string', minLength: 1 }
    },
    additionalProperties: false
  };
  
  const validate = ajv.compile(ddnsSchema);
  if (!validate(updatedDdns)) {
    const error = new Error('Invalid DDNS configuration format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }
  
  const ddnsPath = path.join(baseDir, 'ddns.json');
  saveConfig(ddnsPath, updatedDdns);
}

/**
 * Update advanced.json
 */
function updateAdvanced(baseDir, updatedAdvanced) {
  const advancedSchema = {
    type: 'object',
    properties: {
      parsers: { type: 'object' },
      extractors: { type: 'object' },
      queryTypes: { 
        type: 'array',
        items: { type: 'string' }
      }
    },
    additionalProperties: false
  };
  
  const validate = ajv.compile(advancedSchema);
  if (!validate(updatedAdvanced)) {
    const error = new Error('Invalid advanced configuration format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }
  
  const advancedPath = path.join(baseDir, 'advanced.json');
  saveConfig(advancedPath, updatedAdvanced);
}

module.exports = {
  readConfig,
  saveConfig,
  updateConfig,
  updateBlocklist,
  updateSecrets,
  updateUsers,
  updateDDNS,
  updateAdvanced
};
