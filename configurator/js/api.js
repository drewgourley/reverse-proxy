import * as state from './state.js';
import { showStatus } from './ui-components.js';

// Establish defaults
export function getDefaultConfig() {
  return {
    domain: '',
    services: {
      api: {
        subdomain: {
          type: 'index',
          protocol: state.secrets.admin_email_address ? 'secure' : 'insecure',
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
          protocol: state.secrets.admin_email_address ? 'secure' : 'insecure',
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

export function getDefaultSecrets() {
  return {
    admin_email_address: '',
    shock_password_hash: '',
    shock_mac: '',
    api_password_hash: '',
    api_session_secret: ''
  };
}

export function getDefaultDdns() {
  return {
    active: false,
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: '',
    route53_hosted_zone_id: ''
  };
}

export function getDefaultAdvanced() {
  return {
    parsers: {},
    extractors: {},
    queryTypes: []
  };
}

// Load operations
export async function loadConfig(suppressStatus = false) {
  try {
    const response = await fetch('/config');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load config`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    const loadedConfig = JSON.parse(text);
    
    if (!loadedConfig.services) {
      loadedConfig.services = {};
    }
    
    const defaults = getDefaultConfig();
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

export async function loadSecrets(suppressStatus = false) {
  try {
    const response = await fetch('/secrets');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load secrets`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    state.setSecretsSaved(true);
    const loadedSecrets = JSON.parse(text);
    
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

export async function loadUsers(suppressStatus = false) {
  try {
    const response = await fetch('/users');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load users`);
    
    const text = await response.text();
    
    if (!text) {
      state.setUsers({ users: [] });
      state.setOriginalUsers(JSON.parse(JSON.stringify({ users: [] })));
      return;
    }
    
    const loadedUsers = JSON.parse(text);
    if (!loadedUsers.users) loadedUsers.users = [];
    state.setUsers(loadedUsers);
    state.setOriginalUsers(JSON.parse(JSON.stringify(loadedUsers)));
  } catch (error) {
    state.setUsers({ users: [] });
    state.setOriginalUsers(JSON.parse(JSON.stringify({ users: [] })));
    if (!suppressStatus) showStatus('Could not load Users: ' + error.message, 'error');
  }
}

export async function loadBlocklist(suppressStatus = false) {
  try {
    const response = await fetch('/blocklist');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load blocklist`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    const loadedBlocklist = JSON.parse(text);
    state.setBlocklist(loadedBlocklist);
    state.setOriginalBlocklist(JSON.parse(JSON.stringify(loadedBlocklist)));
  } catch (error) {
    state.setBlocklist([]);
    state.setOriginalBlocklist([]);
    if (!suppressStatus) showStatus('Could not load Blocklist: ' + error.message, 'error');
  }
}

export async function loadDdns(suppressStatus = false) {
  try {
    const response = await fetch('/ddns');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load DDNS config`);
    
    const text = await response.text();
    
    if (!text) {
      const defaultDdns = getDefaultDdns();
      state.setDdns(defaultDdns);
      state.setOriginalDdns(JSON.parse(JSON.stringify(defaultDdns)));
      return;
    }
    
    const loadedDdns = JSON.parse(text);
    
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

export async function loadEcosystem(suppressStatus = false) {
  try {
    const response = await fetch('/ecosystem');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ecosystem config`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    const loadedEcosystem = JSON.parse(text);
    state.setEcosystem(loadedEcosystem);
    state.setOriginalEcosystem(JSON.parse(JSON.stringify(loadedEcosystem)));
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Ecosystem: ' + error.message, 'error');
  }
}

export async function loadAdvanced(suppressStatus = false) {
  try {
    const response = await fetch('/advanced');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Advanced config`);
    
    const text = await response.text();
    
    if (!text) {
      const defaultAdvanced = getDefaultAdvanced();
      state.setAdvanced(defaultAdvanced);
      state.setOriginalAdvanced(JSON.parse(JSON.stringify(defaultAdvanced)));
      return;
    }
    
    const loadedAdvanced = JSON.parse(text);
    
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

export async function loadCerts(suppressStatus = false) {
  try {
    const response = await fetch('/certs');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load certificate data`);
    
    const text = await response.text();
    
    let loadedCerts;
    if (!text) {
      loadedCerts = { services: [], provisionedAt: null };
    } else {
      loadedCerts = JSON.parse(text);
    }
    
    state.setCerts(loadedCerts);
    state.setOriginalCerts(JSON.parse(JSON.stringify(loadedCerts)));
  } catch (error) {
    const defaultCerts = { services: [], provisionedAt: null };
    state.setCerts(defaultCerts);
    state.setOriginalCerts(defaultCerts);
    if (!suppressStatus) showStatus('Could not load certificate data: ' + error.message, 'error');
  }
}

export async function loadColors(suppressStatus = false) {
  try {
    const response = await fetch('/colors');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load colors`);
    
    const loadedColors = await response.json();
    state.setColors(loadedColors);
    state.setOriginalColors(JSON.parse(JSON.stringify(loadedColors)));
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load colors: ' + error.message, 'error');
    const defaultColors = {
      primary: '#667eea',
      secondary: '#764ba2',
      accent: '#48bb78',
      background: '#ffffff',
      inverse: '#b84878'
    };
    state.setColors(defaultColors);
    state.setOriginalColors(JSON.parse(JSON.stringify(defaultColors)));
  }
}

// Save operations
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

// IP fetching utilities
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

// Git operations
export async function gitCheck() {
  const response = await fetch('/git/check');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}: Failed to check for updates`);
  }
  return data;
}

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

export async function loadGitStatus(suppressStatus = false, showForceUpdate = false) {
  const { renderGitStatus, checkForUpdates } = await import('./update.js');
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

// Special logrotate operations
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

export async function installLogRotate() {
  const response = await fetch('/installlogrotate');
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}: Failed to install logrotate`);
  }
  return data;
}

// Favicon upload
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
