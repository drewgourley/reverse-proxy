// API Module
// All server communication and data persistence operations

import { 
  secrets, colors,
  setConfig, setOriginalConfig, setSecrets, setOriginalSecrets,
  setUsers, setOriginalUsers, setDdns, setOriginalDdns,
  setEcosystem, setOriginalEcosystem, setAdvanced, setOriginalAdvanced,
  setCerts, setOriginalCerts, setBlocklist, setOriginalBlocklist,
  setGitStatus, setSecretsSaved, setLogRotateInstalled, setColors, setOriginalColors
} from './state.js';
import { showStatus } from './ui-components.js';

// Default configurations
export function getDefaultConfig() {
  return {
    domain: '',
    services: {
      api: {
        subdomain: {
          type: 'index',
          protocol: secrets.admin_email_address ? 'secure' : 'insecure',
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
          protocol: secrets.admin_email_address ? 'secure' : 'insecure',
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
    const response = await fetch('config');
    
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

    setConfig(loadedConfig);
    setOriginalConfig(JSON.parse(JSON.stringify(loadedConfig)));
  } catch (error) {
    const defaultConfig = getDefaultConfig();
    setConfig(defaultConfig);
    setOriginalConfig(JSON.parse(JSON.stringify(defaultConfig)));
    if (!suppressStatus) showStatus('Could not load Config: ' + error.message, 'error');
  }
}

export async function loadSecrets(suppressStatus = false) {
  try {
    const response = await fetch('secrets');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load secrets`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    setSecretsSaved(true);
    const loadedSecrets = JSON.parse(text);
    
    const defaults = getDefaultSecrets();
    Object.keys(defaults).forEach(key => {
      if (!(key in loadedSecrets)) {
        loadedSecrets[key] = defaults[key];
      }
    });
    
    setSecrets(loadedSecrets);
    setOriginalSecrets(JSON.parse(JSON.stringify(loadedSecrets)));
  } catch (error) {
    const defaultSecrets = getDefaultSecrets();
    setSecrets(defaultSecrets);
    setOriginalSecrets(JSON.parse(JSON.stringify(defaultSecrets)));
    setSecretsSaved(false);
    if (!suppressStatus) showStatus('Could not load Secrets: ' + error.message, 'error');
  }
}

export async function loadUsers(suppressStatus = false) {
  try {
    const response = await fetch('users');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load users`);
    
    const text = await response.text();
    
    if (!text) {
      setUsers({ users: [] });
      setOriginalUsers(JSON.parse(JSON.stringify({ users: [] })));
      return;
    }
    
    const loadedUsers = JSON.parse(text);
    if (!loadedUsers.users) loadedUsers.users = [];
    setUsers(loadedUsers);
    setOriginalUsers(JSON.parse(JSON.stringify(loadedUsers)));
  } catch (error) {
    setUsers({ users: [] });
    setOriginalUsers(JSON.parse(JSON.stringify({ users: [] })));
    if (!suppressStatus) showStatus('Could not load Users: ' + error.message, 'error');
  }
}

export async function loadBlocklist(suppressStatus = false) {
  try {
    const response = await fetch('blocklist');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load blocklist`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    const loadedBlocklist = JSON.parse(text);
    setBlocklist(loadedBlocklist);
    setOriginalBlocklist(JSON.parse(JSON.stringify(loadedBlocklist)));
  } catch (error) {
    setBlocklist([]);
    setOriginalBlocklist([]);
    if (!suppressStatus) showStatus('Could not load Blocklist: ' + error.message, 'error');
  }
}

export async function loadDdns(suppressStatus = false) {
  try {
    const response = await fetch('ddns');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load DDNS config`);
    
    const text = await response.text();
    
    if (!text) {
      const defaultDdns = getDefaultDdns();
      setDdns(defaultDdns);
      setOriginalDdns(JSON.parse(JSON.stringify(defaultDdns)));
      return;
    }
    
    const loadedDdns = JSON.parse(text);
    
    const defaults = getDefaultDdns();
    Object.keys(defaults).forEach(key => {
      if (loadedDdns[key] === undefined) loadedDdns[key] = defaults[key];
    });
    
    setDdns(loadedDdns);
    setOriginalDdns(JSON.parse(JSON.stringify(loadedDdns)));
  } catch (error) {
    const defaultDdns = getDefaultDdns();
    setDdns(defaultDdns);
    setOriginalDdns(JSON.parse(JSON.stringify(defaultDdns)));
    if (!suppressStatus) showStatus('Could not load DDNS Config: ' + error.message, 'error');
  }
}

export async function loadEcosystem(suppressStatus = false) {
  try {
    const response = await fetch('ecosystem');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ecosystem config`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    const loadedEcosystem = JSON.parse(text);
    setEcosystem(loadedEcosystem);
    setOriginalEcosystem(JSON.parse(JSON.stringify(loadedEcosystem)));
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Ecosystem: ' + error.message, 'error');
  }
}

export async function loadAdvanced(suppressStatus = false) {
  try {
    const response = await fetch('advanced');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Advanced config`);
    
    const text = await response.text();
    
    if (!text) {
      const defaultAdvanced = getDefaultAdvanced();
      setAdvanced(defaultAdvanced);
      setOriginalAdvanced(JSON.parse(JSON.stringify(defaultAdvanced)));
      return;
    }
    
    const loadedAdvanced = JSON.parse(text);
    
    const defaults = getDefaultAdvanced();
    Object.keys(defaults).forEach(key => {
      if (loadedAdvanced[key] === undefined) loadedAdvanced[key] = defaults[key];
    });
    
    setAdvanced(loadedAdvanced);
    setOriginalAdvanced(JSON.parse(JSON.stringify(loadedAdvanced)));
  } catch (error) {
    const defaultAdvanced = getDefaultAdvanced();
    setAdvanced(defaultAdvanced);
    setOriginalAdvanced(JSON.parse(JSON.stringify(defaultAdvanced)));
    if (!suppressStatus) showStatus('Could not load Advanced Config: ' + error.message, 'error');
  }
}

export async function loadCerts(suppressStatus = false) {
  try {
    const response = await fetch('certs');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load certificate data`);
    
    const text = await response.text();
    
    let loadedCerts;
    if (!text) {
      loadedCerts = { services: [], provisionedAt: null };
    } else {
      loadedCerts = JSON.parse(text);
    }
    
    setCerts(loadedCerts);
    setOriginalCerts(JSON.parse(JSON.stringify(loadedCerts)));
  } catch (error) {
    const defaultCerts = { services: [], provisionedAt: null };
    setCerts(defaultCerts);
    setOriginalCerts(defaultCerts);
    if (!suppressStatus) showStatus('Could not load certificate data: ' + error.message, 'error');
  }
}

export async function loadGitStatus(suppressStatus = false, showForceUpdate = false) {
  const { renderGitStatus, checkForUpdates } = await import('./update.js');
  try {
    const response = await fetch('git/status');
    if (!response.ok) {
      renderGitStatus({ error: 'Version Unavailable' });
      return;
    }
    
    const data = await response.json();
    if (data.success) {
      setGitStatus(data);
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

export async function loadLogRotateStatus(suppressStatus = false) {
  try {
    const response = await fetch('checklogrotate');
    if (!response.ok) {
      throw new Error((await response.json()).error || 'Log rotate check failed');
    }
    setLogRotateInstalled(true);
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load Log Rotate Status: ' + error.message, 'error');
    setLogRotateInstalled(false);
  }
}

export async function loadColors(suppressStatus = false) {
  try {
    const response = await fetch('colors');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load colors`);
    
    const loadedColors = await response.json();
    setColors(loadedColors);
    setOriginalColors(JSON.parse(JSON.stringify(loadedColors)));
  } catch (error) {
    if (!suppressStatus) showStatus('Could not load colors: ' + error.message, 'error');
    const defaultColors = {
      primary: '#667eea',
      secondary: '#764ba2',
      accent: '#48bb78',
      background: '#ffffff',
      inverse: '#b84878'
    };
    setColors(defaultColors);
    setOriginalColors(JSON.parse(JSON.stringify(defaultColors)));
  }
}

// Save operations
export async function saveBlocklist(blocklist) {
  const response = await fetch('blocklist', {
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
  const response = await fetch('secrets', {
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
  const response = await fetch('users', {
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
  const response = await fetch('ddns', {
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
  const response = await fetch('ecosystem', {
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
  const response = await fetch('advanced', {
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
  const response = await fetch('config', {
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
  const response = await fetch('colors', {
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
  const response = await fetch('certs', {
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
    const response = await fetch('publicip');
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
    const response = await fetch('localip');
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
