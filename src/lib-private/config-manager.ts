import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
const bcrypt: any = require('bcrypt');

const ajv = new Ajv();

export function readConfig(baseDir: string, fileName: string, defaultValue: any = null): any {
  const filePath = path.join(baseDir, fileName);

  if (!fs.existsSync(filePath)) {
    if (defaultValue !== null) {
      return defaultValue;
    }
    const error: any = new Error(`${fileName} not found`);
    error.statusCode = 404;
    throw error;
  }

  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

export function saveConfig(filePath: string, data: any, restartDelay: number = 2000) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  if (restartDelay >= 0) {
    setTimeout(() => {
      process.exit(0);
    }, restartDelay);
  }
}

export function updateConfig(baseDir: string, updatedConfig: any) {
  let existingConfig: any = {};
  try {
    existingConfig = readConfig(baseDir, 'config.json', {});
  } catch (e) {
    // ignore
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
              healthcheck: { type: 'object' },
            },
          },
        },
      },
    },
    additionalProperties: false,
  };

  const validate = ajv.compile(configSchema);
  if (!validate(updatedConfig)) {
    const error: any = new Error('Invalid config format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }

  const domainChanged = updatedConfig.domain !== existingConfig.domain;
  const configPath = path.join(baseDir, 'config.json');
  saveConfig(configPath, updatedConfig);

  return { domainChanged };
}

export function updateBlocklist(baseDir: string, updatedBlocklist: any) {
  if (!Array.isArray(updatedBlocklist)) {
    const error: any = new Error('Blocklist must be an array of IP addresses');
    error.statusCode = 400;
    throw error;
  }

  const blocklistPath = path.join(baseDir, 'blocklist.json');
  saveConfig(blocklistPath, updatedBlocklist, -1);
}

export async function updateSecrets(baseDir: string, updatedSecrets: any) {
  const secretsPayload: Record<string, any> = updatedSecrets as Record<string, any>;
  const secretsSchema = {
    type: 'object',
    properties: {
      admin_email_address: {
        type: 'string',
        pattern: '^$|^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      },
      shock_password_hash: { type: 'string' },
      shock_mac: {
        type: 'string',
        pattern: '^$|^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$',
      },
      api_password_hash: { type: 'string' },
    },
    additionalProperties: true,
  };

  const validate = ajv.compile(secretsSchema);
  if (!validate(secretsPayload)) {
    const error: any = new Error('Invalid secrets format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }

  let existingSecrets: any = {};
  try {
    existingSecrets = readConfig(baseDir, 'secrets.json', {});
  } catch (e) {
    // ignore
  }

  if (
    (!secretsPayload.shock_password_hash || secretsPayload.shock_password_hash.trim() === '') &&
    existingSecrets.shock_password_hash
  ) {
    secretsPayload.shock_password_hash = existingSecrets.shock_password_hash;
  }
  if (
    secretsPayload.shock_password_hash &&
    !secretsPayload.shock_password_hash.startsWith('$2b$')
  ) {
    secretsPayload.shock_password_hash = await bcrypt.hash(secretsPayload.shock_password_hash, 10);
  }

  if (!secretsPayload.api_password_hash) {
    // leave undefined
  } else if (secretsPayload.api_password_hash.trim() === '' && existingSecrets.api_password_hash) {
    secretsPayload.api_password_hash = existingSecrets.api_password_hash;
  }
  if (secretsPayload.api_password_hash && !secretsPayload.api_password_hash.startsWith('$2b$')) {
    secretsPayload.api_password_hash = await bcrypt.hash(secretsPayload.api_password_hash, 10);
  }

  const secretsPath = path.join(baseDir, 'secrets.json');
  saveConfig(secretsPath, updatedSecrets);
}

export async function updateUsers(baseDir: string, updatedUsers: any) {
  const usersPayload: { users: any[] } = updatedUsers as { users: any[] };
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
              items: { type: 'string' },
            },
          },
        },
      },
    },
    additionalProperties: false,
  };

  const validate = ajv.compile(usersSchema);
  if (!validate(usersPayload)) {
    const error: any = new Error('Invalid users format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }

  let existingUsers: any = { users: [] };
  try {
    existingUsers = readConfig(baseDir, 'users.json', { users: [] });
  } catch (e) {
    // ignore
  }

  for (let i = 0; i < usersPayload.users.length; i++) {
    const user = usersPayload.users[i];
    const existingUser = existingUsers.users?.find((u: any) => u.uuid === user.uuid);

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

export function updateDDNS(baseDir: string, updatedDdns: any) {
  const ddnsSchema = {
    type: 'object',
    required: [
      'active',
      'aws_access_key_id',
      'aws_secret_access_key',
      'aws_region',
      'route53_hosted_zone_id',
    ],
    properties: {
      active: { type: 'boolean' },
      aws_access_key_id: { type: 'string', minLength: 1 },
      aws_secret_access_key: { type: 'string', minLength: 1 },
      aws_region: { type: 'string', minLength: 1 },
      route53_hosted_zone_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  };

  const validate = ajv.compile(ddnsSchema);
  if (!validate(updatedDdns)) {
    const error: any = new Error('Invalid DDNS configuration format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }

  const ddnsPath = path.join(baseDir, 'ddns.json');
  saveConfig(ddnsPath, updatedDdns);
}

export function updateAdvanced(baseDir: string, updatedAdvanced: any) {
  const advancedSchema = {
    type: 'object',
    properties: {
      parsers: { type: 'object' },
      extractors: { type: 'object' },
      queryTypes: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    additionalProperties: false,
  };

  const validate = ajv.compile(advancedSchema);
  if (!validate(updatedAdvanced)) {
    const error: any = new Error('Invalid advanced configuration format');
    error.details = validate.errors;
    error.statusCode = 400;
    throw error;
  }

  const advancedPath = path.join(baseDir, 'advanced.json');
  saveConfig(advancedPath, updatedAdvanced);
}
