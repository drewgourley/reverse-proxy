import * as state from './state.js';
import { showStatus } from './ui-components.js';
import { renderGitStatus, checkForUpdates } from './update.js';

/**
 * Return the default configuration object used by the UI
 * @returns {object} Default configuration
 */
export function getDefaultConfig() {
  return {
    domain: '',
    services: {
      api: {
        subdomain: {
          type: 'index',
          protocol: 'insecure',
          proxy: {
            websocket: null,
            middleware: null
          },
          router: null
        }
      },
      www: {
        subdomain: {
          type: 'index',
          protocol: 'insecure',
          proxy: {
            websocket: null,
            middleware: null
          },
          router: null
        }
      }
    }
  };
}

/**
 * Return the default secrets object used by the UI
 * @returns {object} Default secrets
 */
export function getDefaultSecrets() {
  return {
    admin_email_address: '',
    shock_password_hash: '',
    shock_mac: '',
    api_password_hash: '',
    api_session_secret: ''
  };
}

/**
 * Return the default DDNS configuration object
 * @returns {object} Default DDNS config
 */
export function getDefaultDdns() {
  return {
    active: false,
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: '',
    route53_hosted_zone_id: ''
  };
}

/**
 * Return the default advanced settings object
 * @returns {object} Default advanced configuration
 */
export function getDefaultAdvanced() {
  return {
    parsers: {},
    extractors: {},
    queryTypes: []
  };
}

/**
 * Return default certificate metadata object
 * @returns {object} Default certs structure
 */
export function getDefaultCerts() {
  return {
    services: [],
    provisionedAt: null
  };
}

/**
 * Return default color palette used by the UI
 * @returns {object} Default colors
 */
export function getDefaultColors() {
  return {
    primary: "#667eea",
    secondary: "#764ba2",
    accent: "#48bb78",
    background: "#ffffff",
    inverse: "#b84878"
  }
}

/**
 * Return default users payload
 * @returns {object} Default users object
 */
export function getDefaultUsers() {
  return {
    users: []
  };
}

/**
 * Return default blocklist (empty)
 * @returns {Array} Default blocklist
 */
export function getDefaultBlocklist() {
  return [];
}

/**
 * Load configuration from the server and update UI state
 * @param {boolean} [suppressStatus=false] - If true, suppress status messages
 * @returns {Promise<void>}
 */
export async function loadConfig(suppressStatus = false) {
  try {
    const response = await fetch('/config');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load config`);

    const loadedConfig = await response.json();
    
    const defaults = getDefaultConfig();
    if (!loadedConfig.services) {
      loadedConfig.services = {};
    }
    if (!loadedConfig.services.api) {
      loadedConfig.services.api = defaults.services.api;
    }
    if (!loadedConfig.services.www) {
      loadedConfig.services.www = defaults.services.www;
    }

    state.setConfig(loadedConfig);
    state.setOriginalConfig(JSON.parse(JSON.stringify(loadedConfig)));
  } catch (error) {
    const defaultConfig = getDefaultConfig();
    state.setConfig(defaultConfig);
    state.setOriginalConfig(JSON.parse(JSON.stringify(defaultConfig)));
    if (!suppressStatus) showStatus('Could not load Config: ' + error.message, 'error');
  }
}

/**
 * Load secrets from the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadSecrets(suppressStatus = false) {
  try {
    const response = await fetch('/secrets');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load secrets`);
    
    const loadedSecrets = await response.json();

    if (!loadedSecrets.default) {
      state.setSecretsSaved(true);
    } 
    delete loadedSecrets.default;

    const defaults = getDefaultSecrets();
    Object.keys(defaults).forEach(key => {
      if (!(key in loadedSecrets)) {
        loadedSecrets[key] = defaults[key];
      }
    });

    
    state.setSecrets(loadedSecrets);
    state.setOriginalSecrets(JSON.parse(JSON.stringify(loadedSecrets)));
  } catch (error) {
    const defaultSecrets = getDefaultSecrets();
    state.setSecrets(defaultSecrets);
    state.setOriginalSecrets(JSON.parse(JSON.stringify(defaultSecrets)));
    state.setSecretsSaved(false);
    if (!suppressStatus) showStatus('Could not load Secrets: ' + error.message, 'error');
  }
}

/**
 * Load users from the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadUsers(suppressStatus = false) {
  try {
    const response = await fetch('/users');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load users`);
    
    const loadedUsers = await response.json();
    if (!loadedUsers.users) loadedUsers.users = [];

    state.setUsers(loadedUsers);
    state.setOriginalUsers(JSON.parse(JSON.stringify(loadedUsers)));
  } catch (error) {
    const defaultUsers = getDefaultUsers();
    state.setUsers(defaultUsers);
    state.setOriginalUsers(JSON.parse(JSON.stringify(defaultUsers)));
    if (!suppressStatus) showStatus('Could not load Users: ' + error.message, 'error');
  }
}

/**
 * Load blocklist from the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadBlocklist(suppressStatus = false) {
  try {
    const response = await fetch('/blocklist');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load blocklist`);
    
    const loadedBlocklist = await response.json();

    state.setBlocklist(loadedBlocklist);
    state.setOriginalBlocklist(JSON.parse(JSON.stringify(loadedBlocklist)));
  } catch (error) {
    const defaultBlocklist = getDefaultBlocklist();
    state.setBlocklist(defaultBlocklist);
    state.setOriginalBlocklist(defaultBlocklist);
    if (!suppressStatus) showStatus('Could not load Blocklist: ' + error.message, 'error');
  }
}

/**
 * Load DDNS configuration from the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadDdns(suppressStatus = false) {
  try {
    const response = await fetch('/ddns');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load DDNS config`);
    
    const loadedDdns = await response.json();;
    
    const defaults = getDefaultDdns();
    Object.keys(defaults).forEach(key => {
      if (loadedDdns[key] === undefined) loadedDdns[key] = defaults[key];
    });
    
    state.setDdns(loadedDdns);
    state.setOriginalDdns(JSON.parse(JSON.stringify(loadedDdns)));
  } catch (error) {
    const defaultDdns = getDefaultDdns();
    state.setDdns(defaultDdns);
    state.setOriginalDdns(JSON.parse(JSON.stringify(defaultDdns)));
    if (!suppressStatus) showStatus('Could not load DDNS Config: ' + error.message, 'error');
  }
}

/**
 * Load PM2 ecosystem data and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadEcosystem(suppressStatus = false) {
  try {
    const response = await fetch('/ecosystem');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ecosystem config`);
    
    const loadedEcosystem = await response.json();

    state.setEcosystem(loadedEcosystem);
    state.setOriginalEcosystem(JSON.parse(JSON.stringify(loadedEcosystem)));
    state.setEnvironment(loadedEcosystem.apps[0].env.NODE_ENV);
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Ecosystem: ' + error.message, 'error');
  }
}

/**
 * Load advanced settings from server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadAdvanced(suppressStatus = false) {
  try {
    const response = await fetch('/advanced');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Advanced config`);
    
    const loadedAdvanced = await response.json();

    const defaults = getDefaultAdvanced();
    Object.keys(defaults).forEach(key => {
      if (loadedAdvanced[key] === undefined) loadedAdvanced[key] = defaults[key];
    });
    
    state.setAdvanced(loadedAdvanced);
    state.setOriginalAdvanced(JSON.parse(JSON.stringify(loadedAdvanced)));
  } catch (error) {
    const defaultAdvanced = getDefaultAdvanced();
    state.setAdvanced(defaultAdvanced);
    state.setOriginalAdvanced(JSON.parse(JSON.stringify(defaultAdvanced)));
    if (!suppressStatus) showStatus('Could not load Advanced Config: ' + error.message, 'error');
  }
}

/**
 * Load certificate metadata from the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadCerts(suppressStatus = false) {
  try {
    const response = await fetch('/certs');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load certificate data`);

    const loadedCerts = await response.json();

    state.setCerts(loadedCerts);
    state.setOriginalCerts(JSON.parse(JSON.stringify(loadedCerts)));
  } catch (error) {
    const defaultCerts = getDefaultCerts();
    state.setCerts(defaultCerts);
    state.setOriginalCerts(defaultCerts);
    if (!suppressStatus) showStatus('Could not load certificate data: ' + error.message, 'error');
  }
}

/**
 * Load color palette from server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadColors(suppressStatus = false) {
  try {
    const response = await fetch('/colors');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load colors`);
    
    const loadedColors = await response.json();

    const defaults = getDefaultColors();
    Object.keys(defaults).forEach(key => {
      if (loadedColors[key] === undefined) loadedColors[key] = defaults[key];
    });

    state.setColors(loadedColors);
    state.setOriginalColors(JSON.parse(JSON.stringify(loadedColors)));
  } catch (error) {
    const defaultColors = getDefaultColors();
    if (!suppressStatus) showStatus('Could not load colors: ' + error.message, 'error');
    state.setColors(defaultColors);
    state.setOriginalColors(JSON.parse(JSON.stringify(defaultColors)));
  }
}

/**
 * Save blocklist to the server
 * @param {Array} blocklist - Blocklist array to persist
 * @returns {Promise<object>} Server response JSON
 */
export async function saveBlocklist(blocklist) {
  const response = await fetch('/blocklist', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blocklist)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist secrets to the server
 * @param {object} secrets - Secrets object to save
 * @returns {Promise<object>} Server response JSON
 */
export async function saveSecrets(secrets) {
  const response = await fetch('/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(secrets)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist users list to the server
 * @param {object} users - Users payload
 * @returns {Promise<object>} Server response JSON
 */
export async function saveUsers(users) {
  const response = await fetch('/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(users)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist DDNS settings to the server
 * @param {object} ddns - DDNS config
 * @returns {Promise<object>} Server response JSON
 */
export async function saveDdns(ddns) {
  const response = await fetch('/ddns', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ddns)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist PM2 ecosystem configuration to server
 * @param {object} ecosystem - Ecosystem config
 * @returns {Promise<object>} Server response JSON
 */
export async function saveEcosystem(ecosystem) {
  const response = await fetch('/ecosystem', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ecosystem)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist advanced settings to the server
 * @param {object} advanced - Advanced settings
 * @returns {Promise<object>} Server response JSON
 */
export async function saveAdvanced(advanced) {
  const response = await fetch('/advanced', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(advanced)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist main configuration to the server
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Server response JSON
 */
export async function saveConfig(config) {
  const response = await fetch('/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Persist color palette to the server
 * @param {object} colors - Color values
 * @returns {Promise<object>} Server response JSON
 */
export async function saveColors(colors) {
  const response = await fetch('/colors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(colors)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

/**
 * Request certificate provisioning for the given email
 * @param {string} email - Contact email for certificate provisioning
 * @returns {Promise<object>} Provision result
 */
export async function provisionCertificates(email) {
  const response = await fetch('/certs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to provision certificates');
  }

  return result;
}

/**
 * Fetch public IP from server API
 * @returns {Promise<object|undefined>} Response containing success/ip or undefined on error
 */
export async function fetchPublicIp() {
  try {
    const response = await fetch('/publicip');
    const data = await response.json();
    
    if (data.success && data.ip) {
      return data;
    } else {
      showStatus('Failed to fetch public IP: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showStatus('Error fetching public IP: ' + error.message, 'error');
  }
}

/**
 * Fetch local IP from server API
 * @returns {Promise<object|undefined>} Response containing success/ip or undefined on error
 */
export async function fetchLocalIp() {
  try {
    const response = await fetch('/localip');
    const data = await response.json();
    
    if (data.success && data.ip) {
      return data;
    } else {
      showStatus('Failed to fetch local IP: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showStatus('Error fetching local IP: ' + error.message, 'error');
  }
}

/**
 * Check git status on the server
 * @returns {Promise<object>} Git status payload
 */
export async function gitCheck() {
  const response = await fetch('/git/check');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}: Failed to check for updates`);
  }
  return data;
}

/**
 * Trigger a git pull on the server
 * @returns {Promise<object>} Result of git pull
 */
export async function gitPull() {
  const response = await fetch('/git/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || 'Git pull failed');
  }
  return data;
}

/**
 * Trigger a forced git reset/pull on the server
 * @returns {Promise<object>} Result of forced update
 */
export async function gitForce() {
  const response = await fetch('/git/force', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || 'Git force update failed');
  }
  return data;
}

/**
 * Load git status from server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @param {boolean} [showForceUpdate=false]
 * @returns {Promise<void>}
 */
export async function loadGitStatus(suppressStatus = false, showForceUpdate = false) {
  try {
    const response = await fetch('/git/status');
    if (!response.ok) {
      renderGitStatus({ error: 'Version Unavailable' });
      return;
    }
    
    const data = await response.json();
    if (data.success) {
      state.setGitStatus(data);
      renderGitStatus(data, showForceUpdate);
      if (!showForceUpdate) checkForUpdates();
    } else {
      renderGitStatus({ error: data.error });
    }
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Git Status: ' + error.message, 'error');
    renderGitStatus({ error: 'Version Unavailable' });
  }
}

/**
 * Check whether logrotate is installed on the server and update UI state
 * @param {boolean} [suppressStatus=false]
 * @returns {Promise<void>}
 */
export async function loadLogRotateStatus(suppressStatus = false) {
  try {
    const response = await fetch('/checklogrotate');
    if (!response.ok) {
      throw new Error((await response.json()).error || 'Log rotate check failed');
    }
    state.setLogRotateInstalled(true);
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Log Rotate Status: ' + error.message, 'error');
    state.setLogRotateInstalled(false);
  }
}

/**
 * Trigger installation of PM2 log-rotate module on the server
 * @returns {Promise<void>}
 */
export async function installLogRotate() {
  const response = await fetch('/installlogrotate');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}: Failed to install logrotate`);
  }
  return data;
}

/**
 * Upload a new favicon to the server
 * @param {FormData} formData - FormData object containing the favicon file
 * @returns {Promise<object>} Server response JSON
 */
export async function uploadFavicon(formData) {
  const response = await fetch('/favicon', {
    method: 'POST',
    body: formData
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || 'Favicon upload failed');
  }
  return data;
}
