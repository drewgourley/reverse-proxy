let config = {};
let originalConfig = {};
let secrets = {};
let originalSecrets = {};
let blocklist = [];
let originalBlocklist = [];
let ddns = {};
let originalDdns = {};
let ecosystem = {};
let originalEcosystem = {};
let advanced = {};
let originalAdvanced = {};
let certs = {};
let originalCerts = {};
let currentSelection = null;
let secureServicesChangedThisSession = false;
let firstConfigSave = true;
let secretsSaved = false;
let servicesWithSubdomainsAtLastSave = new Set();
let gitStatus = {};
let logRotateInstalled = false;

function parseErrorMessage(error) {
  try {
    const errorObj = JSON.parse(error.message);
    
    if (errorObj.details && Array.isArray(errorObj.details) && errorObj.details.length > 0) {
      const detail = errorObj.details[0];
      
      if (detail.keyword === 'required' && detail.params?.missingProperty) {
        return `Missing required field: ${detail.params.missingProperty}`;
      }
      
      if (detail.keyword === 'minLength' && detail.params?.limit === 1) {
        const fieldName = detail.instancePath ? detail.instancePath.split('/').pop() : '';
        return fieldName ? `${fieldName} must not be empty` : 'Field must not be empty';
      }
      
      if (detail.keyword === 'pattern' && detail.instancePath) {
        const fieldName = detail.instancePath.split('/').pop();
        return `Invalid format for field: ${fieldName}`;
      }
      
      if (detail.keyword === 'type' && detail.instancePath) {
        const fieldName = detail.instancePath.split('/').pop();
        return `Invalid type for field: ${fieldName}`;
      }
      
      if (detail.message) {
        const fieldName = detail.instancePath ? detail.instancePath.split('/').pop() : '';
        return fieldName ? `${fieldName}: ${detail.message}` : detail.message;
      }
    }
    
    if (errorObj.error) {
      return errorObj.error;
    }
    
    return 'Validation error occurred';
  } catch (e) {
    return error.message || 'An error occurred';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig(true);
  await loadSecrets(true);
  await loadBlocklist(true);
  await loadDdns(true);
  await loadEcosystem(true);
  await loadAdvanced(true);
  await loadCerts(true);
  await loadGitStatus(true);
  await loadLogRotateStatus(true);

  renderServicesList();
  updateSidebarButtons();

  const urlParams = new URLSearchParams(window.location.search);
  const justUpdated = urlParams.get('updated') === 'true';
  
  if (justUpdated) {
    urlParams.delete('updated');
    const url = new URL(window.location);
    url.search = urlParams.toString();
    window.history.replaceState({}, '', url);
    showStatus('Update completed successfully!', 'success');
  }
  
  const isFirstTimeSetup = ecosystem.default === true;
  
  if (isFirstTimeSetup) {
    selectItem('management-application');
  } else if (secretsSaved === false) {
    selectItem('management-secrets');
  } else if (config.domain === '' || config.domain.trim() === '') {
    selectItem('config-domain');
  } else {
    const section = urlParams.get('section');
    const type = urlParams.get('type');
    if (section) {
      const validMonitorSections = ['monitor-logs', 'monitor-blocklist'];
      const validManagementSections = ['management-application', 'management-secrets', 'management-theme', 'management-advanced'];
      if (secrets.admin_email_address && secrets.admin_email_address.trim() !== '') {
        validManagementSections.push('management-certificates');
      }
      if (config.domain && config.domain.trim() !== '') {
        validManagementSections.push('management-ddns');
      }
      const validConfigSections = ['config-domain'];
      const isValidMonitor = validMonitorSections.includes(section);
      const isValidManagement = validManagementSections.includes(section);
      const isValidConfig = validConfigSections.includes(section);
      const isService = section.startsWith('config-') && config.services && config.services[section.replace('config-', '')];


      if (isValidManagement || isValidConfig || isService || isValidMonitor) {
        selectItem(section, type);
      } else {
        const url = new URL(window.location);
        url.searchParams.delete('section');
        url.searchParams.delete('type');
        window.history.replaceState({}, '', url);
      }
    }
  }
  
  document.getElementById('promptInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitPrompt();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConfirmModal();
      closePromptModal();
    }
  });
  
  // Mark page as fully loaded
  document.documentElement.classList.add('loaded');
});

function updateSidebarButtons() {
  const isFirstTimeSetup = ecosystem.default === true || !secretsSaved;
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const addServiceBtn = document.getElementById('addServiceBtn');
  
  if (isFirstTimeSetup) {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.5';
      saveBtn.style.cursor = 'default';
      saveBtn.style.pointerEvents = 'none';
    }
    if (resetBtn) {
      resetBtn.disabled = true;
      resetBtn.style.opacity = '0.5';
      resetBtn.style.cursor = 'default';
      resetBtn.style.pointerEvents = 'none';
    }
    if (addServiceBtn) {
      addServiceBtn.disabled = true;
      addServiceBtn.style.opacity = '0.5';
      addServiceBtn.style.cursor = 'default';
      addServiceBtn.style.pointerEvents = 'none';
    }
  } else {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '';
      saveBtn.style.cursor = '';
      saveBtn.style.pointerEvents = '';
    }
    if (resetBtn) {
      resetBtn.disabled = false;
      resetBtn.style.opacity = '';
      resetBtn.style.cursor = '';
      resetBtn.style.pointerEvents = '';
    }
    if (addServiceBtn) {
      addServiceBtn.disabled = false;
      addServiceBtn.style.opacity = '';
      addServiceBtn.style.cursor = '';
      addServiceBtn.style.pointerEvents = '';
    }
  }
}

function getDefaultConfig() {
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

let colors = {};
let originalColors = {};

async function loadConfig(suppressStatus = false) {
  try {
    const url = 'config';
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load config`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    config = JSON.parse(text);
    
    if (!config.services) {
      config.services = {};
    }
    
    const defaults = getDefaultConfig();
    if (!config.services.api) {
      config.services.api = defaults.services.api;
    }
    if (!config.services.www) {
      config.services.www = defaults.services.www;
    }

    originalConfig = JSON.parse(JSON.stringify(config));
  } catch (error) {
    console.error('Config load error:', error);
    config = getDefaultConfig();
    originalConfig = JSON.parse(JSON.stringify(config));
    if (!suppressStatus) showStatus('Could not load Config: ' + error.message, 'error');
  }
}

function getDefaultSecrets() {
  return {
    admin_email_address: '',
    shock_password_hash: '',
    shock_mac: '',
    api_password_hash: '',
    api_session_secret: ''
  };
}

function getDefaultDdns() {
  return {
    active: false,
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: '',
    route53_hosted_zone_id: ''
  };
}

async function loadBlocklist(suppressStatus = false) {
  try {
    const response = await fetch('blocklist');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load blocklist`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    blocklist = JSON.parse(text);
    originalBlocklist = JSON.parse(JSON.stringify(blocklist));
  } catch (error) {
    console.error('Blocklist load error:', error);
    blocklist = [];
    originalBlocklist = JSON.parse(JSON.stringify(blocklist));
    if (!suppressStatus) showStatus('Could not load Blocklist: ' + error.message, 'error');
  }
}

async function loadSecrets(suppressStatus = false) {
  try {
    const response = await fetch('secrets');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load secrets`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    secretsSaved = true;
    secrets = JSON.parse(text);
    
    const defaults = getDefaultSecrets();
    Object.keys(defaults).forEach(key => {
      if (!(key in secrets)) {
        secrets[key] = defaults[key];
      }
    });
    
    originalSecrets = JSON.parse(JSON.stringify(secrets));
  } catch (error) {
    console.error('Secrets load error:', error);
    secrets = getDefaultSecrets();
    originalSecrets = JSON.parse(JSON.stringify(secrets));
    secretsSaved = false;
    if (!suppressStatus) showStatus('Could not load Secrets: ' + error.message, 'error');
  }
}

async function loadDdns(suppressStatus = false) {
  try {
    const url = 'ddns';
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load DDNS config`);
    
    const text = await response.text();
    
    if (!text) {
      ddns = getDefaultDdns();
      originalDdns = JSON.parse(JSON.stringify(ddns));
      return;
    }
    
    ddns = JSON.parse(text);
    
    const defaults = getDefaultDdns();
    Object.keys(defaults).forEach(key => {
      if (ddns[key] === undefined) ddns[key] = defaults[key];
    });
    
    originalDdns = JSON.parse(JSON.stringify(ddns));
  } catch (error) {
    console.error('DDNS load error:', error);
    ddns = getDefaultDdns();
    originalDdns = JSON.parse(JSON.stringify(ddns));
    if (!suppressStatus) showStatus('Could not load DDNS Config: ' + error.message, 'error');
  }
}

async function loadAdvanced(suppressStatus = false) {
  try {
    const url = 'advanced';
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Advanced config`);
    
    const text = await response.text();
    
    if (!text) {
      advanced = getDefaultAdvanced();
      originalAdvanced = JSON.parse(JSON.stringify(advanced));
      return;
    }
    
    advanced = JSON.parse(text);
    
    const defaults = getDefaultAdvanced();
    Object.keys(defaults).forEach(key => {
      if (advanced[key] === undefined) advanced[key] = defaults[key];
    });
    
    originalAdvanced = JSON.parse(JSON.stringify(advanced));
  } catch (error) {
    console.error('Advanced config load error:', error);
    advanced = getDefaultAdvanced();
    originalAdvanced = JSON.parse(JSON.stringify(advanced));
    if (!suppressStatus) showStatus('Could not load Advanced Config: ' + error.message, 'error');
  }
}

async function loadCerts(suppressStatus = false) {
  try {
    const response = await fetch('certs');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load certificate data`);
    
    const text = await response.text();
    
    if (!text) {
      certs = { services: [], provisionedAt: null };
    } else {
      certs = JSON.parse(text);
    }
    
    originalCerts = JSON.parse(JSON.stringify(certs));
  } catch (error) {
    console.error('Certs load error:', error);
    certs = { services: [], provisionedAt: null };
    originalCerts = JSON.parse(JSON.stringify(certs));
    if (!suppressStatus) showStatus('Could not load certificate data: ' + error.message, 'error');
  }
}

function getDefaultAdvanced() {
  return {
    parsers: {},
    extractors: {},
    queryTypes: []
  };
}

function renderBlocklistEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  
  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title">🛡️ Blocklist Management</div>
      <div class="hint hint-section">Add or remove IP addresses from the blocklist</div>
      <button class="btn-add-field on-top" onclick="addBlocklistEntry()">+ Add Blocklist Entry</button>
  `;
  blocklist.forEach((ip, index) => {
    html += `
      <div class="blocklist-entry">
        <div class="form-group form-group-no-margin">
          <label for="blocklist_ip_${index}">Blocked IP Address ${index + 1}</label>
          <div class="blocklist-input-group">
            <input type="text" id="blocklist_ip_${index}" value="${ip}" readonly />
            <button class="btn-remove" onclick="removeBlocklistEntry(${index})">Remove</button>
          </div>
        </div>
      </div>
    `;
  });
  html += `
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <button class="btn-reset" onclick="revertBlocklist()">Revert</button>
    <button class="btn-save" id="saveBlocklistBtn" onclick="saveBlocklist()">Save Blocklist</button>
  `;
}

function renderSecretsEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title">🔑 Secrets Management</div>
      <div class="hint hint-section">Manage sensitive configuration values</div>
  `;

  const secretKeys = Object.keys(secrets);
  const orderedKeys = [];
  
  if (secretKeys.includes('admin_email_address')) {
    orderedKeys.push('admin_email_address');
  }  
  if (secretKeys.includes('api_password_hash')) {
    orderedKeys.push('api_password_hash');
  }  
  secretKeys.forEach(key => {
    if (key === 'api_session_secret') return;
    if (key === 'admin_email_address') return;
    if (key === 'api_password_hash') return;
    orderedKeys.push(key);
  });
  
  const defaultSecretKeys = Object.keys(getDefaultSecrets());
  orderedKeys.forEach(key => {
    const value = secrets[key];
    const isDefaultSecret = defaultSecretKeys.includes(key);
    const isEmail = key === 'admin_email_address';
    const isPasswordHash = key === 'shock_password_hash' || key === 'api_password_hash';
    const isExistingHash = isPasswordHash && value && value.startsWith('$2b$');
    const isEmpty = !value || value.trim() === '';
    const shouldHighlight = isEmail && isEmpty;
    
    const labelMap = {
      'admin_email_address': 'Admin Email Address',
      'shock_password_hash': 'Wake-on-LAN Password',
      'shock_mac': 'Wake-on-LAN MAC Address',
      'api_password_hash': `API Password - ${ isExistingHash ? '🔒 API page is secured behind a login' : '⚠️ Providing this will secure the API page behind a login'}`,
    };
    const displayLabel = labelMap[key] || key;
    
    html += `
      <div class="secret-entry${shouldHighlight ? ' highlight-required' : ''}">
        <div class="form-group form-group-no-margin">
          <label for="secret_${key}">${displayLabel}</label>`;
    
    if (isEmail) {
      html += `
          <input type="email" id="secret_${key}" value="${value}" 
              onchange="updateSecret('${key}', this.value)"
              autocomplete="off"
              placeholder="${isEmpty ? 'Required for SSL certificates (https)' : ''}">
          <div class="hint">The email address to use for provisioning certificates</div>`;
    } else if (isPasswordHash) {
      const displayValue = isExistingHash ? '' : value;
      const placeholderText = isExistingHash ? 'Password already set - enter new password to change' : 'Enter new password to hash it automatically';
      const hintText = isExistingHash ? 'Leave empty to keep current password, or enter new password to update' : 'Enter a password here - it will be automatically hashed when saved';
      html += `
          <div class="password-input-group">
            <input type="text" id="secret_${key}" value="${displayValue}"
                style="-webkit-text-security: disc;"
                onchange="updatePasswordHash('${key}', this.value, ${isExistingHash})"
                placeholder="${placeholderText}"
                autocomplete="current-password">
            <button class="btn-toggle-password" onclick="togglePasswordVisibility('secret_${key}', this)">👁️ Show</button>
          </div>
          <div class="hint">${hintText}</div>`;
    } else {
      html += `
          <div class="password-input-group">
            <input type="text" id="secret_${key}" value="${value}"
                style="-webkit-text-security: disc;"
                onchange="updateSecret('${key}', this.value)"
                placeholder="Enter MAC address (e.g., 00:1A:2B:3C:4D:5E)"
                autocomplete="current-password">
            <button class="btn-toggle-password" onclick="togglePasswordVisibility('secret_${key}', this)">👁️ Show</button>
          </div>
          <div class="hint">The MAC address of the compute platform device</div>`;
    }
    
    html += `
          ${!isDefaultSecret ? `
          <div class="secret-actions">
            <button class="btn-remove" onclick="removeSecret('${key}')">Remove Secret</button>
          </div>
          ` : ''}
          ${isExistingHash && key === 'api_password_hash' ? `
          <div class="secret-actions" style="display: flex;align-items: center;">
            <button class="btn-remove" onclick="removeSecret('${key}')">Remove Password</button>
            <div class="hint" style="margin-left: 10px;">⚠️ This will remove the login requirement to view the API page</div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += `
      <button class="btn-add-field" onclick="addNewSecret()" style="display: none;">+ Add New Secret</button>
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <button class="btn-reset" onclick="revertSecrets()">Revert</button>
    <button class="btn-save" id="saveSecretsBtn" onclick="saveSecrets()">Save Secrets</button>
  `;
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (input.style.webkitTextSecurity === 'disc') {
    input.style.webkitTextSecurity = 'none';
    button.textContent = '🙈 Hide';
  } else {
    input.style.webkitTextSecurity = 'disc';
    button.textContent = '👁️ Show';
  }
}

function updateSecret(key, value) {
  secrets[key] = value;
}

function updatePasswordHash(key, value, wasExistingHash) {
  if (value.trim() !== '') {
    secrets[key] = value;
  }
}

function confirmClearApi() {
  showConfirmModal(
    'Clear API Credentials',
    'Are you sure you want to remove the API Username and API Password? This will immediately disable API authentication and restart the server.',
    async (confirmed) => {
      if (!confirmed) return;
      await clearApiCredentials();
    }
  );
}

function removeBlocklistEntry(index) {
  showConfirmModal(
    'Remove Blocklist Entry',
    `Are you sure you want to remove the blocklist entry with IP "${blocklist[index]}"?`,
    (confirmed) => {
      if (confirmed) {
        blocklist.splice(index, 1);
        renderBlocklistEditor();
        showStatus(`Blocklist entry "${blocklist[index]}" removed`, 'success');
      }
    }
  );
}

function removeSecret(key) {
  showConfirmModal(
    'Remove Secret',
    `Are you sure you want to remove the secret "${key}"?`,
    (confirmed) => {
      if (confirmed) {
        if (key === 'api_password_hash') {
          secrets[key] = '';
        } else {
          delete secrets[key];
        }
        renderSecretsEditor();
        showStatus(`Secret "${key}" removed`, 'success');
      }
    }
  );
}

function addBlocklistEntry() {
  showPromptModal(
    'Add New Blocklist Entry',
    'Enter the ip address to block:',
    'Valid IPv4 address format (e.g., 192.168.1.1)',
    '',
    'e.g., 192.168.1.1',
    (blocklistEntry) => {
      if (!blocklistEntry) return;
      
      if (blocklist.includes(blocklistEntry)) {
        showPromptError('A blocklist entry with this IP address already exists!');
        return;
      }
      
      const blocklistEntryRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      
      if (!blocklistEntryRegex.test(blocklistEntry)) {
        showPromptError('Invalid IP address format!');
        return;
      }

      blocklist.push(blocklistEntry);
      renderBlocklistEditor();
      showStatus('Blocklist entry added. Save to apply changes.', 'success');
      closePromptModal();
    },
  );
}

function addNewSecret() {
  showPromptModal(
    'Add New Secret',
    'Enter the name for the new secret:',
    'Lowercase letters and underscores only, must start and end with a letter',
    '',
    'e.g., my_secret_name',
    (secretName) => {
      if (!secretName) return;
      
      const existingKeys = Object.keys(secrets).map(k => k.toLowerCase());
      if (existingKeys.includes(secretName.toLowerCase())) {
        showPromptError('A secret with this name already exists!');
        return;
      }
      
      const secretNameRegex = /^[a-z][a-z_]*[a-z]$|^[a-z]$/;
      
      if (!secretNameRegex.test(secretName)) {
        showPromptError('Invalid secret name! Must contain only lowercase letters with words separated by underscores.');
        return;
      }

      secrets[secretName] = '';
      renderSecretsEditor();
      showStatus('Secret added. Enter a value and save.', 'success');
      closePromptModal();
    }
  );
}

async function saveBlocklist() {
  const saveBtn = document.getElementById('saveBlocklistBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await fetch('blocklist', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(blocklist)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    originalBlocklist = JSON.parse(JSON.stringify(blocklist));
    showStatus('✓ Blocklist saved successfully!', 'success');
    
    renderBlocklistEditor();
    
  } catch (error) {
    showStatus('✗ Error saving blocklist: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Blocklist';
  }
}

async function saveSecrets() {
  const saveBtn = document.getElementById('saveSecretsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const isFirstSecretsSave = !secretsSaved;

  try {
    const response = await fetch('secrets', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(secrets)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    originalSecrets = JSON.parse(JSON.stringify(secrets));
    secretsSaved = true;
    showStatus('✓ Secrets saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Secrets saved. Waiting for the server to restart...');
    await waitForServerRestart();
    
    if (isFirstSecretsSave) {
      selectItem('config-domain');
    } else {
      const url = new URL(window.location);
      window.location.href = url.toString();
    }

    renderServicesList();
    updateSidebarButtons();
    
  } catch (error) {
    showStatus('✗ Error saving secrets: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Secrets';
  }
}

function revertBlocklist() {
  showConfirmModal(
    'Revert Blocklist',
    'Are you sure you want to discard all changes to blocklist?',
    (confirmed) => {
      if (confirmed) {
        blocklist = JSON.parse(JSON.stringify(originalBlocklist));
        renderBlocklistEditor();
        showStatus('Blocklist changes reverted', 'success');
      }
    }
  );
}

function revertSecrets() {
  showConfirmModal(
    'Revert Secrets',
    'Are you sure you want to discard all changes to secrets?',
    (confirmed) => {
      if (confirmed) {
        secrets = JSON.parse(JSON.stringify(originalSecrets));
        renderSecretsEditor();
        showStatus('Secrets changes reverted', 'success');
      }
    }
  );
}

function renderDdnsEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const isActive = ddns.active || false;
  let html = `
    <div class="section">
      <div class="section-title">🌐 Dynamic DNS Configuration</div>
      <div class="hint hint-section">Configure AWS Route 53 credentials for Dynamic DNS updates. The hostname will be set to your domain from the configuration.</div>
      
      <div class="form-group">
        <label>
          <input type="checkbox" id="ddns_active" ${isActive ? 'checked' : ''} 
              onchange="updateDdns('active', this.checked)">
          Enable Dynamic DNS
        </label>
        <div class="hint">Automatically update your domain's A record with your current public IP address every 5 minutes</div>
      </div>
      <div class="secret-entry">
  `;

  const ddnsFields = [
    { key: 'aws_access_key_id', label: 'AWS Access Key ID', hint: 'Your AWS IAM access key ID' },
    { key: 'aws_secret_access_key', label: 'AWS Secret Access Key', hint: 'Your AWS IAM secret access key' },
    { key: 'aws_region', label: 'AWS Region', hint: 'AWS region (e.g., us-east-1, us-west-2)' },
    { key: 'route53_hosted_zone_id', label: 'Route 53 Hosted Zone ID', hint: 'The ID of your Route 53 hosted zone' }
  ];

  ddnsFields.forEach(({ key, label, hint }) => {
    const value = ddns[key] || '';
    const isSecret = key.includes('secret') || key.includes('key');
    
    html += `
        <div class="entry-field">
          <label>${label}</label>
          <div class="password-input-group">
            <input 
              type="text" 
              id="ddns_${key}" 
              value="${value}" 
              onchange="updateDdns('${key}', this.value)"
              style="${isSecret ? '-webkit-text-security: disc;' : ''}"
            />
    `;
    
    if (isSecret) {
      html += `
            <button 
              class="btn-toggle-password" 
              onclick="togglePasswordVisibility('ddns_${key}', this)"
            >👁️ Show</button>
      `;
    }
    
    html += `
          </div>
          <div class="hint">${hint}</div>
        </div>
    `;
  });

  html += `
      </div>
  `;

  const zoneId = ddns.route53_hosted_zone_id || 'YOUR_HOSTED_ZONE_ID';
  const iamPolicy = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "route53:ChangeResourceRecordSets"
        ],
        "Resource": `arn:aws:route53:::hostedzone/${zoneId}`
      },
      {
        "Effect": "Allow",
        "Action": [
          "route53:GetChange"
        ],
        "Resource": "arn:aws:route53:::change/*"
      }
    ]
  };

  html += `
      <div class="section-title" style="margin-top: 2rem;">📋 Required IAM Policy</div>
      <div class="hint hint-section">Use this policy when creating your IAM user in AWS. This grants the minimum permissions needed for Dynamic DNS updates.</div>
      <div class="setup-box route53">
        <pre class="setup-record-content">${JSON.stringify(iamPolicy, null, 2)}</pre>
      </div>
  `;

  html += `
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <button class="btn-reset" onclick="revertDdns()">Revert Changes</button>
    <button class="btn-save" id="saveDdnsBtn" onclick="saveDdns()">Save DDNS Config</button>
  `;
}

function updateDdns(key, value) {
  ddns[key] = value;
}

async function saveDdns() {
  const saveBtn = document.getElementById('saveDdnsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await fetch('ddns', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ddns)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    originalDdns = JSON.parse(JSON.stringify(ddns));
    showStatus('✓ DDNS config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'DDNS config saved. Waiting for the server to restart...');
    await waitForServerRestart();
    
  } catch (error) {
    showStatus('✗ Error saving DDNS config: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save DDNS Config';
  }
}

function revertDdns() {
  showConfirmModal(
    'Revert DDNS Config',
    'Are you sure you want to discard all changes to DDNS configuration?',
    (confirmed) => {
      if (confirmed) {
        ddns = JSON.parse(JSON.stringify(originalDdns));
        renderDdnsEditor();
        showStatus('DDNS config reverted', 'success');
      }
    }
  );
}

let pendingFaviconFile = null;

async function loadColors(suppressStatus = false) {
  try {
    const response = await fetch('colors');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load colors`);
    
    colors = await response.json();
    originalColors = JSON.parse(JSON.stringify(colors));
    
    updateTheme();
    document.documentElement.classList.add('ready');
    
    const color1 = document.getElementById('color1');
    const color2 = document.getElementById('color2');
    const color3 = document.getElementById('color3');
    const color4 = document.getElementById('color4');
    
    if (color1) color1.value = colors.primary || '#667eea';
    if (color2) color2.value = colors.secondary || '#764ba2';
    if (color3) color3.value = colors.accent || '#48bb78';
    if (color4) color4.value = colors.background || '#ffffff';
  } catch (error) {
    if (!suppressStatus) console.error('Failed to load colors:', error);
    colors = {
      primary: '#667eea',
      secondary: '#764ba2',
      accent: '#48bb78',
      background: '#ffffff',
      inverse: '#b84878'
    };
    originalColors = JSON.parse(JSON.stringify(colors));
    updateTheme();
    document.documentElement.classList.add('ready');
  }
}

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getInverseColor(hex) {
  const hsl = hexToHSL(hex);
  hsl.h = (hsl.h + 180) % 360;
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

function darkenColor(hex, percent) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

function lightenFromBackground(hex, lightenAmount) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.min(100, hsl.l + lightenAmount);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

function darkenFromBackground(hex, percent) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

function clampBackgroundColor(hex) {
  const hsl = hexToHSL(hex);
  const minLightness = 9.4;
  if (hsl.l < minLightness) {
    return hslToHex(hsl.h, hsl.s, minLightness);
  }
  return hex;
}

function updateTheme() {
  const primary = colors.primary || '#667eea';
  const secondary = colors.secondary || '#764ba2';
  const accent = colors.accent || '#48bb78';
  const background = colors.background || '#ffffff';
  const inverse = getInverseColor(accent);
  const displayBackground = clampBackgroundColor(background);
  
  const root = document.documentElement;
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-secondary', secondary);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-background', displayBackground);
  root.style.setProperty('--color-inverse', inverse);
  
  root.style.setProperty('--color-accent-hover', darkenColor(accent, 10));
  root.style.setProperty('--color-primary-hover', darkenColor(primary, 10));
  root.style.setProperty('--color-secondary-hover', darkenColor(secondary, 10));
  root.style.setProperty('--color-inverse-hover', darkenColor(inverse, 10));
  
  const bgHSL = hexToHSL(displayBackground);
  const isDark = bgHSL.l < 50;
  
  if (isDark) {
    root.style.setProperty('--color-gray-50', lightenFromBackground(displayBackground, 5));
    root.style.setProperty('--color-gray-100', lightenFromBackground(displayBackground, 10));
    root.style.setProperty('--color-gray-200', lightenFromBackground(displayBackground, 15));
    root.style.setProperty('--color-gray-300', lightenFromBackground(displayBackground, 25));
    root.style.setProperty('--color-gray-400', lightenFromBackground(displayBackground, 35));
    root.style.setProperty('--color-gray-500', lightenFromBackground(displayBackground, 45));
    root.style.setProperty('--color-gray-600', lightenFromBackground(displayBackground, 55));
    root.style.setProperty('--color-gray-700', lightenFromBackground(displayBackground, 65));
    root.style.setProperty('--color-gray-800', lightenFromBackground(displayBackground, 75));
    root.style.setProperty('--color-gray-900', lightenFromBackground(displayBackground, 85));
    root.style.setProperty('--color-text-primary', '#ffffff');
    root.style.setProperty('--color-text-secondary', lightenFromBackground(displayBackground, 70));
  } else {
    root.style.setProperty('--color-gray-50', darkenFromBackground(displayBackground, 2));
    root.style.setProperty('--color-gray-100', darkenFromBackground(displayBackground, 5));
    root.style.setProperty('--color-gray-200', darkenFromBackground(displayBackground, 10));
    root.style.setProperty('--color-gray-300', darkenFromBackground(displayBackground, 18));
    root.style.setProperty('--color-gray-400', darkenFromBackground(displayBackground, 38));
    root.style.setProperty('--color-gray-500', darkenFromBackground(displayBackground, 58));
    root.style.setProperty('--color-gray-600', darkenFromBackground(displayBackground, 71));
    root.style.setProperty('--color-gray-700', darkenFromBackground(displayBackground, 78));
    root.style.setProperty('--color-gray-800', darkenFromBackground(displayBackground, 88));
    root.style.setProperty('--color-gray-900', darkenFromBackground(displayBackground, 93));
    root.style.setProperty('--color-text-primary', '#111827');
    root.style.setProperty('--color-text-secondary', '#4b5563');
  }
  
  const darkenAmount = Math.max(0, (50 - bgHSL.l) * 0.9);
  const gradientPrimary = darkenColor(primary, darkenAmount);
  const gradientSecondary = darkenColor(secondary, darkenAmount);
  document.body.style.background = `linear-gradient(135deg, ${gradientPrimary} 0%, ${gradientSecondary} 100%)`;
}

function revertColors() {
  colors = JSON.parse(JSON.stringify(originalColors));
  updateTheme();
  
  const color1 = document.getElementById('color1');
  const color2 = document.getElementById('color2');
  const color3 = document.getElementById('color3');
  const color4 = document.getElementById('color4');
  
  if (color1) color1.value = originalColors.primary || '#667eea';
  if (color2) color2.value = originalColors.secondary || '#764ba2';
  if (color3) color3.value = originalColors.accent || '#48bb78';
  if (color4) color4.value = originalColors.background || '#ffffff';
  
  pendingFaviconFile = null;
  const faviconUpload = document.getElementById('faviconUpload');
  const faviconPreview = document.getElementById('faviconPreview');
  if (faviconUpload) faviconUpload.value = '';
  if (faviconPreview) faviconPreview.style.display = 'none';
}

async function handleFaviconPreview(event) {
  const file = event.target.files[0];
  if (!file) {
    pendingFaviconFile = null;
    return;
  }
  
  if (!file.type.match('image/png')) {
    showStatus('Please upload a PNG file', 'error');
    pendingFaviconFile = null;
    return;
  }
  
  const img = new Image();
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    img.onload = async () => {
      if (img.width > 512 || img.height > 512) {
        showStatus('Image must be 512x512 or smaller', 'error');
        pendingFaviconFile = null;
        return;
      }
      
      pendingFaviconFile = file;
      
      document.getElementById('faviconFileName').textContent = file.name;
      document.getElementById('faviconPreviewImg').src = e.target.result;
      document.getElementById('faviconPreview').style.display = 'block';
    };
    img.src = e.target.result;
  };
  
  reader.readAsDataURL(file);
}

async function uploadFavicon() {
  if (!pendingFaviconFile) return true;
  
  const formData = new FormData();
  formData.append('favicon', pendingFaviconFile);
  
  try {
    const response = await fetch('favicon', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Favicon upload failed');
    }
    
    const currentFavicon = document.getElementById('currentFavicon');
    const noFaviconWarning = document.getElementById('noFaviconWarning');
    if (currentFavicon) {
      currentFavicon.src = '/global/favicon/favicon-original.png?' + new Date().getTime();
      currentFavicon.style.display = 'block';
    }
    if (noFaviconWarning) {
      noFaviconWarning.style.display = 'none';
    }
    
    pendingFaviconFile = null;
    document.getElementById('faviconFileName').textContent = '';
    document.getElementById('faviconPreview').style.display = 'none';
    document.getElementById('faviconUpload').value = '';
    
    return true;
  } catch (error) {
    console.error('Favicon upload failed:', error);
    throw error;
  }
}

async function saveTheme() {
  try {
    const colorData = {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      background: colors.background,
      inverse: getInverseColor(colors.accent)
    };
    
    const response = await fetch('colors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(colorData)
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to save colors`);
    
    colors = colorData;
    originalColors = JSON.parse(JSON.stringify(colorData));
    
    if (pendingFaviconFile) {
      await uploadFavicon();
      showStatus('✓ Theme and favicon saved successfully!', 'success');
    } else {
      showStatus('✓ Theme colors saved successfully!', 'success');
    }
  } catch (error) {
    console.error('Failed to save theme:', error);
    showStatus('Failed to save theme: ' + error.message, 'error');
  }
}

function renderThemeEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title">🎨 Theme Customization</div>
      <div class="hint hint-section">Customize colors and favicon for the configurator interface.</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px;">
        <div>
          <h3 style="margin: 0 0 15px 0; color: var(--color-text-primary); font-size: 16px; font-weight: 600;">Colors</h3>
          <div class="form-group">
            <label for="color1">Primary Color</label>
            <input type="color" id="color1" value="${colors.primary || '#667eea'}">
            <div class="hint">Used for titles, buttons, and highlights</div>
          </div>
          <div class="form-group">
            <label for="color2">Secondary Color</label>
            <input type="color" id="color2" value="${colors.secondary || '#764ba2'}">
            <div class="hint">Used for active selections and gradients</div>
          </div>
          <div class="form-group">
            <label for="color3">Accent Color</label>
            <input type="color" id="color3" value="${colors.accent || '#48bb78'}">
            <div class="hint">Used for save buttons and success states</div>
          </div>
          <div class="form-group">
            <label for="color4">Background Color</label>
            <input type="color" id="color4" value="${colors.background || '#ffffff'}">
            <div class="hint">Base background color for panels (automatically generates grays)</div>
          </div>
        </div>
        <div>
          <h3 style="margin: 0 0 15px 0; color: var(--color-text-primary); font-size: 16px; font-weight: 600;">Favicon</h3>
          <div class="form-group">
            <label for="faviconUpload">Upload New Favicon</label>
            <input type="file" id="faviconUpload" accept="image/png" style="display: none;">
            <button class="btn-primary" onclick="document.getElementById('faviconUpload').click()">Choose File</button>
            <span id="faviconFileName" style="margin-left: 10px; color: var(--color-text-secondary);"></span>
            <div class="hint">PNG format only, up to 512x512 pixels</div>
          </div>
          <div style="margin-top: 15px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-primary); font-weight: 500;">Current Favicon</label>
            <div id="currentFaviconContainer">
              <img id="currentFavicon" src="/global/favicon/favicon-original.png" style="max-width: 128px; max-height: 128px; border-radius: 8px; background: var(--color-gray-100); padding: 10px; display: block;" onerror="this.style.display='none'; document.getElementById('noFaviconWarning').style.display='flex';">
              <div id="noFaviconWarning" style="display: none; width: 128px; height: 128px; padding: 10px; background: var(--color-gray-100); border-radius: 8px; color: var(--color-text-secondary); text-align: center; border: 2px dashed var(--color-gray-300); flex-direction: column; align-items: center; justify-content: center;">
                <div style="font-size: 32px; margin-bottom: 4px;">⚠️</div>
                <div style="font-weight: 500; font-size: 11px; margin-bottom: 2px;">No Favicon</div>
                <div style="font-size: 10px; line-height: 1.2;">Upload a PNG</div>
              </div>
            </div>
          </div>
          <div id="faviconPreview" style="display: none; margin-top: 15px;">
            <label style="display: block; margin-bottom: 8px; color: var(--color-text-primary); font-weight: 500;">Preview</label>
            <img id="faviconPreviewImg" style="max-width: 128px; max-height: 128px; border-radius: 8px; background: var(--color-gray-100); padding: 10px; display: block;">
          </div>
        </div>
      </div>
    </div>
  `;
  
  actions.innerHTML = `
    <button class="btn-reset" onclick="revertColors()">Revert</button>
    <button class="btn-save" id="saveThemeBtn" onclick="saveTheme()">Save Theme</button>
  `;

  document.getElementById('color1').addEventListener('input', (e) => {
    colors.primary = e.target.value;
    updateTheme();
  });
  document.getElementById('color2').addEventListener('input', (e) => {
    colors.secondary = e.target.value;
    updateTheme();
  });
  document.getElementById('color3').addEventListener('input', (e) => {
    colors.accent = e.target.value;
    updateTheme();
  });
  document.getElementById('color4').addEventListener('input', (e) => {
    colors.background = e.target.value;
    updateTheme();
  });
  
  document.getElementById('faviconUpload').addEventListener('change', handleFaviconPreview);
}

async function loadEcosystem(suppressStatus = false) {
  try {
    const response = await fetch('ecosystem');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load ecosystem config`);
    
    const text = await response.text();
    
    if (!text) {
      throw new Error('Empty response from server');
    }
    
    ecosystem = JSON.parse(text);
    originalEcosystem = JSON.parse(JSON.stringify(ecosystem));
  } catch (error) {
    if (!suppressStatus) console.error('Ecosystem load error:', error);
  }
}

async function loadGitStatus(suppressStatus = false, showForceUpdate = false) {
  try {
    const response = await fetch('git/status');
    if (!response.ok) {
      renderGitStatus({ error: 'Version Unavailable' });
      return;
    }
    
    const data = await response.json();
    if (data.success) {
      gitStatus = data;
      renderGitStatus(data, showForceUpdate);
      if (!showForceUpdate) checkForUpdates();
    } else {
      renderGitStatus({ error: data.error });
    }
  } catch (error) {
    if (!suppressStatus) console.error('Git status error:', error);
    renderGitStatus({ error: 'Version Unavailable' });
  }
}

async function loadLogRotateStatus(suppressStatus = false) {
  try {
    const response = await fetch('checklogrotate');
    if (!response.ok) {
      throw new Error((await response.json()).error || 'Log rotate check failed');
    }
    logRotateInstalled = true;
  } catch (error) {
    if (!suppressStatus) console.error(error);
    logRotateInstalled = false;
  }
}

function installButtonTextLoop(installBtn) {
  installBtn.textContent = 'Installing';
  let dotCount = 0;
  const interval = setInterval(() => {
    if (!installBtn || !installBtn.disabled) {
      clearInterval(interval);
      return;
    }
    dotCount = (dotCount + 1) % 4;
    installBtn.textContent = 'Installing' + '.'.repeat(dotCount);
  }, 500);
}

async function installLogRotate() {
  const installBtn = document.getElementById('installLogRotateBtn');
  try {
    installBtn.disabled = true;
    installButtonTextLoop(installBtn);
    
    const response = await fetch('installlogrotate');

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    showStatus('✓ Log Rotate Module Installed!', 'success');

    showLoadingOverlay('Server Restarting...', 'Log Rotate Module Installed. Waiting for the server to restart...');
    await waitForServerRestart();

    logRotateInstalled = true;
    renderLogsViewer();
  } catch (error) {
    showStatus('✗ Error installing Log Rotate Module, you may have to do it manually: ' + parseErrorMessage(error), 'error');
    installBtn.disabled = false;
    installBtn.textContent = 'Install PM2 Log Rotate Module';
  }
}

function renderGitStatus(status, showForceUpdate = false) {
  const versionInfo = document.getElementById('versionInfo');
  const isFirstTimeSetup = ecosystem.default === true;

  if (status.error) {
    versionInfo.innerHTML = `
      <div class="version-details">
        <span class="version-label">Version tracking unavailable</span>
      </div>
    `;
    return;
  }
  
  const versionNumber = status.version || 'Unknown';
  
  if (showForceUpdate) {
    versionInfo.innerHTML = `
      <button class="btn-update must-force-update" id="updateBtn" onclick="handleUpdate(true)" title="Force Update">
        <span class="update-icon">↻</span>
        <span class="update-text">Force Update</span>
      </button>
    `;
  } else {
    versionInfo.innerHTML = `
      <button class="btn-update" id="updateBtn" onclick="handleUpdate()" title="${isFirstTimeSetup ? 'Complete application setup first' : 'Check for updates'}" ${isFirstTimeSetup ? 'disabled' : ''}>
        <span class="update-icon"${isFirstTimeSetup ? ' style="display:none"' : ''}>↻</span>
        <span class="update-text">${isFirstTimeSetup ? 'Initial Setup' : 'Checking...'}</span>
      </button>
    `;
  }

  versionInfo.innerHTML += `
    <span class="version-number">${versionNumber}</span>
  `;
}

async function checkForUpdates(force = false) {
  const updateBtn = document.getElementById('updateBtn');
  const isFirstTimeSetup = ecosystem.default === true;
  if (!updateBtn || isFirstTimeSetup) return;
  
  const updateIcon = updateBtn.querySelector('.update-icon');
  const updateText = updateBtn.querySelector('.update-text');
  updateIcon.attributes.style = '';
  updateIcon.classList.add('spinning');
  updateText.textContent = 'Checking...';
  
  try {
    const response = await fetch('git/check');
    if (!response.ok) {
      throw new Error('Failed to check for updates');
    }
    
    const data = await response.json();
    updateIcon.classList.remove('spinning');
    
    if (data.success && data.updatesAvailable) {
      updateBtn.classList.add('updates-available');
      updateText.textContent = data.message || 'Updates Available';
      updateBtn.setAttribute('data-has-updates', 'true');
      updateBtn.disabled = false;
      updateBtn.title = 'Update available - click to install';
    } else {
      updateText.textContent = 'Up to Date';
      updateBtn.setAttribute('data-has-updates', 'false');
      updateBtn.disabled = false;
      updateBtn.title = 'Check for updates';
    }
  } catch (error) {
    console.error('Update check error:', error);
    updateIcon.classList.remove('spinning');
    updateText.textContent = 'Check Updates';
    updateBtn.disabled = false;
    updateBtn.title = 'Check for updates';
  }
}

function handleUpdate(force = false) {
  const updateBtn = document.getElementById('updateBtn');
  const hasUpdates = updateBtn?.getAttribute('data-has-updates') === 'true';
  
  if (force) {
    showConfirmModal(
      'Force Update',
      'Are you sure you want to force an update? This will discard any local changes and pull the latest version from the repository. The server will restart after updating. Continue?',
      () => pullUpdates(true)
    );
  } else if (hasUpdates) {
    showConfirmModal(
      'Update Available',
      'A new version is available. The server will restart after updating. Continue?',
      () => pullUpdates()
    );
  } else {
    checkForUpdates();
  }
}

async function pullUpdates(force) {
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMessage = document.getElementById('loadingMessage');
  
  loadingTitle.textContent = 'Updating...';
  loadingMessage.textContent = 'Pulling latest changes and restarting the server. This may take a minute.';
  loadingOverlay.classList.add('active');
  
  try {
    let response;
    if (force) {
      response = await fetch('git/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      response = await fetch('git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!response.ok) {
      const data = await response.json();
      loadGitStatus(true, true);
      throw new Error(data.error || 'Update failed');
    }
    
    await waitForServerRestart(10000);
    
    const url = new URL(window.location);
    url.searchParams.set('updated', 'true');
    window.location.href = url.toString();
    
  } catch (error) {
    console.error('Update error:', error);
    loadingOverlay.classList.remove('active');
    showStatus('Update failed: ' + error.message, 'error');
  }
}

function renderApplicationEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  const appName = ecosystem.apps && ecosystem.apps[0] ? ecosystem.apps[0].name : 'Reverse Proxy';
  const isDefault = ecosystem.default === true;
  const buttonText = isDefault ? 'Generate Application Settings' : 'Save Application Settings';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title">🛠️ Application Settings</div>
      <div class="hint hint-section">Configure your application's display name used by PM2.</div>
      <div class="app-entry">
        <div class="form-group">
          <label for="appNameInput">Application Name</label>
          <input type="text" id="appNameInput" placeholder="Enter a nicename for the application (e.g., My Proxy Server)" value="${appName}" onchange="updateEcosystemName(this.value)">
          <div class="hint">This name appears in PM2 process list</div>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <button class="btn-reset" onclick="revertEcosystem()">Revert</button>
    <button class="btn-save" id="saveEcosystemBtn" onclick="saveEcosystem()">${buttonText}</button>
  `;
}

function updateEcosystemName(name) {
  if (!ecosystem.apps) {
    ecosystem.apps = [{}];
  }
  if (!ecosystem.apps[0]) {
    ecosystem.apps[0] = {};
  }
  ecosystem.apps[0].name = name;
}

async function saveEcosystem() {
  const saveBtn = document.getElementById('saveEcosystemBtn');
  const isDefault = ecosystem.default === true;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const ecosystemToSave = JSON.parse(JSON.stringify(ecosystem));
    delete ecosystemToSave.default;
    delete ecosystemToSave.resave;
    
    const response = await fetch('ecosystem', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ecosystemToSave)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    delete ecosystem.default;
    delete ecosystem.resave;
    originalEcosystem = JSON.parse(JSON.stringify(ecosystem));
    showStatus('✓ Application settings saved successfully!', 'success');

    showLoadingOverlay('Server Restarting...', 'Application settings saved. Waiting for the server to restart...');
    await waitForServerRestart();

    if (isDefault) {
      selectItem('management-secrets');
    } else if (currentSelection) {
      selectItem(currentSelection);
    }
    
    if (gitStatus && !gitStatus.error) {
      renderGitStatus(gitStatus);
      checkForUpdates();
    }

    renderServicesList();
    updateSidebarButtons();
  } catch (error) {
    showStatus('✗ Error saving application settings: ' + parseErrorMessage(error), 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = isDefault ? 'Generate Application Settings' : 'Save Application Settings';
  }
}

function revertEcosystem() {
  showConfirmModal(
    'Revert Application Settings',
    'Are you sure you want to discard all changes to application settings?',
    (confirmed) => {
      if (confirmed) {
        ecosystem = JSON.parse(JSON.stringify(originalEcosystem));
        renderApplicationEditor();
        showStatus('Application settings changes reverted', 'success');
      }
    }
  );
}

function renderAdvancedEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  // Build parsers list
  let parsersHtml = '';
  if (advanced.parsers) {
    Object.keys(advanced.parsers).forEach(key => {
      parsersHtml += `
        <div class="form-group">
          <label for="parser_${key}">${key}</label>
          <textarea id="parser_${key}" rows="5" onchange="updateAdvancedParser('${key}', this.value)">${advanced.parsers[key] || ''}</textarea>
          <button class="btn-remove" onclick="removeAdvancedParser('${key}')">Remove</button>
        </div>
      `;
    });
  }
  
  // Build extractors list
  let extractorsHtml = '';
  if (advanced.extractors) {
    Object.keys(advanced.extractors).forEach(key => {
      extractorsHtml += `
        <div class="form-group">
          <label for="extractor_${key}">${key}</label>
          <textarea id="extractor_${key}" rows="5" onchange="updateAdvancedExtractor('${key}', this.value)">${advanced.extractors[key] || ''}</textarea>
          <button class="btn-remove" onclick="removeAdvancedExtractor('${key}')">Remove</button>
        </div>
      `;
    });
  }
  
  // Build query types list
  let queryTypesHtml = '';
  if (advanced.queryTypes && advanced.queryTypes.length > 0) {
    advanced.queryTypes.forEach((qt, index) => {
      queryTypesHtml += `
        <div class="form-group">
          <input type="text" id="querytype_${index}" value="${qt}" onchange="updateAdvancedQueryType(${index}, this.value)">
          <button class="btn-remove" style="margin-top:4px;" onclick="removeAdvancedQueryType(${index})">Remove</button>
        </div>
      `;
    });
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title">🔬 Advanced Configuration</div>
      <div class="hint hint-section">Configure custom parsers, extractors, and GameDig query types. These are advanced features for extending healthcheck functionality.</div>
    </div>
    <div class="section">
      <div class="section-title">HTTP Response Body Parsers</div>
      <div class="hint hint-section">Custom parsers for HTTP healthchecks. Must be valid JavaScript function code that takes (body) as parameter and returns boolean.</div>
      ${parsersHtml}
      <button class="btn-add-field" onclick="addAdvancedParser()">+ Add Parser</button>
    </div>
    <div class="section">
      <div class="section-title">Metadata Extractors</div>
      <div class="hint hint-section">Custom extractors for pulling metadata from healthcheck responses. Must be valid JavaScript function code that takes (state) as parameter and returns object with online, max, version properties.</div>
      ${extractorsHtml}
      <button class="btn-add-field" onclick="addAdvancedExtractor()">+ Add Extractor</button>
    </div>
    <div class="section">
      <div class="section-title">GameDig Query Types</div>
      <div class="hint hint-section">Supported game types for GameDig healthchecks (e.g., "mbe", "valheim").</div>
      ${queryTypesHtml}
      <button class="btn-add-field" onclick="addAdvancedQueryType()">+ Add Query Type</button>
    </div>
  `;

  actions.innerHTML = `
    <button class="btn-reset" onclick="revertAdvanced()">Revert</button>
    <button class="btn-save" id="saveAdvancedBtn" onclick="saveAdvanced()">Save Advanced Config</button>
  `;
}

function addAdvancedParser() {
  showPromptModal(
    'Add Parser',
    'Enter the name for the new parser:',
    'lowercase letters, numbers, and underscores',
    '',
    'e.g., my_parser',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Parser name cannot be empty', 'error');
        return false;
      }
      if (advanced.parsers[name]) {
        showStatus('Parser with that name already exists', 'error');
        return false;
      }
      advanced.parsers[name] = '(body) => {\n  // Your parser code here\n  return true;\n}';
      renderAdvancedEditor();
      showStatus('Parser added', 'success');
      return true;
    }
  );
}

function addAdvancedExtractor() {
  showPromptModal(
    'Add Extractor',
    'Enter the name for the new extractor:',
    'lowercase letters, numbers, and underscores',
    '',
    'e.g., my_extractor',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Extractor name cannot be empty', 'error');
        return false;
      }
      if (advanced.extractors[name]) {
        showStatus('Extractor with that name already exists', 'error');
        return false;
      }
      advanced.extractors[name] = '(state) => ({\n  online: 0,\n  max: 0,\n  version: "1.0"\n})';
      renderAdvancedEditor();
      showStatus('Extractor added', 'success');
      return true;
    }
  );
}

function addAdvancedQueryType() {
  showPromptModal(
    'Add Query Type',
    'Enter the query type name:',
    'valid gamedig query type',
    '',
    'e.g., mbe, valheim, csgo',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Query type cannot be empty', 'error');
        return false;
      }
      if (advanced.queryTypes.includes(name)) {
        showStatus('Query type already exists', 'error');
        return false;
      }
      advanced.queryTypes.push(name);
      renderAdvancedEditor();
      showStatus('Query type added', 'success');
      return true;
    }
  );
}

function updateAdvancedParser(name, value) {
  advanced.parsers[name] = value;
}

function updateAdvancedExtractor(name, value) {
  advanced.extractors[name] = value;
}

function updateAdvancedQueryType(index, value) {
  advanced.queryTypes[index] = value;
}

function removeAdvancedParser(name) {
  showConfirmModal(
    'Remove Parser',
    `Are you sure you want to remove the parser "${name}"?`,
    (confirmed) => {
      if (confirmed) {
        delete advanced.parsers[name];
        renderAdvancedEditor();
        showStatus('Parser removed', 'success');
      }
    }
  );
}

function removeAdvancedExtractor(name) {
  showConfirmModal(
    'Remove Extractor',
    `Are you sure you want to remove the extractor "${name}"?`,
    (confirmed) => {
      if (confirmed) {
        delete advanced.extractors[name];
        renderAdvancedEditor();
        showStatus('Extractor removed', 'success');
      }
    }
  );
}

function removeAdvancedQueryType(index) {
  showConfirmModal(
    'Remove Query Type',
    `Are you sure you want to remove the query type "${advanced.queryTypes[index]}"?`,
    (confirmed) => {
      if (confirmed) {
        advanced.queryTypes.splice(index, 1);
        renderAdvancedEditor();
        showStatus('Query type removed', 'success');
      }
    }
  );
}

async function saveAdvanced() {
  const saveBtn = document.getElementById('saveAdvancedBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await fetch('advanced', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(advanced)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    originalAdvanced = JSON.parse(JSON.stringify(advanced));
    showStatus('Advanced configuration saved successfully! Server will restart.', 'success');
    
    showLoadingOverlay(
      'Server Restarting...',
      'Waiting for the server to come back online. This usually takes a few seconds.'
    );
    
    await waitForServerRestart();
    
    selectItem('management-advanced');
    
  } catch (error) {
    console.error('Advanced config save error:', error);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Advanced Config';
    showStatus('Save failed: ' + error.message, 'error');
  }
}

function revertAdvanced() {
  showConfirmModal(
    'Revert Changes',
    'Are you sure you want to discard all changes to the advanced configuration?',
    (confirmed) => {
      if (confirmed) {
        advanced = JSON.parse(JSON.stringify(originalAdvanced));
        renderAdvancedEditor();
        showStatus('Advanced configuration changes reverted', 'success');
      }
    }
  );
}

function renderServicesList() {
  const list = document.getElementById('servicesList');
  list.innerHTML = '';
  
  const isFirstTimeSetup = ecosystem.default === true;
  const certStatus = getCertificateStatus();
  const canProvision = certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0;
  const needsApplicationResave = ecosystem.resave;
  const hasAdminEmail = secrets.admin_email_address && secrets.admin_email_address.trim() !== '';
  const hasDomain = config.domain && config.domain.trim() !== '';
  const secretsEnabled = !isFirstTimeSetup;
  const certificatesEnabled = !isFirstTimeSetup && hasAdminEmail && hasDomain;
  const ddnsEnabled = !isFirstTimeSetup && hasDomain;

  const monitorHeader = document.createElement('h2');
  monitorHeader.textContent = 'Activity Monitor';
  list.appendChild(monitorHeader);

  const logsItem = document.createElement('div');
  logsItem.className = 'service-item' + (currentSelection === 'monitor-logs' ? ' active' : '');
  logsItem.textContent = '📝 Logs';
  logsItem.onclick = () => selectItem('monitor-logs');
  list.appendChild(logsItem);

  const blocklistItem = document.createElement('div');
  blocklistItem.className = 'service-item' + (currentSelection === 'monitor-blocklist' ? ' active' : '');
  blocklistItem.textContent = '🛡️ Blocklist';
  blocklistItem.onclick = () => selectItem('monitor-blocklist');
  list.appendChild(blocklistItem);

  const managementHeader = document.createElement('h2');
  managementHeader.textContent = 'Management';
  list.appendChild(managementHeader);

  const appItem = document.createElement('div');
  appItem.className = 'service-item' + (currentSelection === 'management-application' ? ' active' : '') + (needsApplicationResave ? ' insecure' : '');
  appItem.innerHTML = '🛠️ Application' + (needsApplicationResave ? ' <span class="hint">Resave to apply PM2 update</span>' : '');;
  appItem.onclick = () => selectItem('management-application');
  list.appendChild(appItem);

  const secretsItem = document.createElement('div');
  secretsItem.className = 'service-item' + (currentSelection === 'management-secrets' ? ' active' : '');
  secretsItem.textContent = '🔑 Secrets';
  if (!secretsEnabled) {
    secretsItem.style.opacity = '0.5';
    secretsItem.style.cursor = 'default';
    secretsItem.style.pointerEvents = 'none';
    secretsItem.onclick = null;
  } else {
    secretsItem.onclick = () => selectItem('management-secrets');
  }
  list.appendChild(secretsItem);

  const certsItem = document.createElement('div');
  certsItem.className = 'service-item' + (currentSelection === 'management-certificates' ? ' active' : '') + (canProvision ? ' insecure' : '');
  certsItem.innerHTML = '🔒 Certificates' + (canProvision ? ' <span class="hint">Provisioning Needed</span>' : '');
  if (!certificatesEnabled) {
    certsItem.style.opacity = '0.5';
    certsItem.style.cursor = 'default';
    certsItem.style.pointerEvents = 'none';
    certsItem.onclick = null;
  } else {
    certsItem.onclick = () => selectItem('management-certificates');
  }
  list.appendChild(certsItem);

  const ddnsItem = document.createElement('div');
  ddnsItem.className = 'service-item' + (currentSelection === 'management-ddns' ? ' active' : '');
  ddnsItem.textContent = '🌐 Dynamic DNS';
  if (!ddnsEnabled) {
    ddnsItem.style.opacity = '0.5';
    ddnsItem.style.cursor = 'default';
    ddnsItem.style.pointerEvents = 'none';
    ddnsItem.onclick = null;
  } else {
    ddnsItem.onclick = () => selectItem('management-ddns');
  }
  list.appendChild(ddnsItem);

  const themeItem = document.createElement('div');
  themeItem.className = 'service-item' + (currentSelection === 'management-theme' ? ' active' : '');
  themeItem.textContent = '🎨 Theme';
  if (isFirstTimeSetup || !secretsSaved) {
    themeItem.style.opacity = '0.5';
    themeItem.style.cursor = 'default';
    themeItem.style.pointerEvents = 'none';
    themeItem.onclick = null;
  } else {
    themeItem.onclick = () => selectItem('management-theme');
  }
  list.appendChild(themeItem);

  const advancedItem = document.createElement('div');
  advancedItem.className = 'service-item' + (currentSelection === 'management-advanced' ? ' active' : '');
  advancedItem.textContent = '🔬 Advanced';
  if (isFirstTimeSetup || !secretsSaved) {
    advancedItem.style.opacity = '0.5';
    advancedItem.style.cursor = 'default';
    advancedItem.style.pointerEvents = 'none';
    advancedItem.onclick = null;
  } else {
    advancedItem.onclick = () => selectItem('management-advanced');
  }
  list.appendChild(advancedItem);

  const configHeader = document.createElement('h2');
  configHeader.textContent = 'Configuration';
  list.appendChild(configHeader);

  const domainItem = document.createElement('div');
  domainItem.className = 'service-item' + (currentSelection === 'config-domain' ? ' active' : '');
  domainItem.textContent = '🌐 Domain';
  if (isFirstTimeSetup || !secretsSaved) {
    domainItem.style.opacity = '0.5';
    domainItem.style.cursor = 'default';
    domainItem.style.pointerEvents = 'none';
    domainItem.onclick = null;
  } else {
    domainItem.onclick = () => selectItem('config-domain');
  }
  list.appendChild(domainItem);

  const defaultServices = ['www', 'api'];
  const allServiceNames = new Set(defaultServices);
  
  if (config.services) {
    Object.keys(config.services).forEach(name => allServiceNames.add(name));
  }
  
  if (!config.services) {
    config.services = {};
  }
  const defaults = getDefaultConfig();
  defaultServices.forEach(serviceName => {
    if (!config.services[serviceName]) {
      config.services[serviceName] = defaults.services[serviceName];
    }
  });
  
  const sortedServices = Array.from(allServiceNames).sort((a, b) => {
    const aIsDefault = defaultServices.includes(a);
    const bIsDefault = defaultServices.includes(b);
    
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;
    if (aIsDefault && bIsDefault) {
      return defaultServices.indexOf(a) - defaultServices.indexOf(b);
    }
    return a.localeCompare(b);
  });
  
  sortedServices.forEach(serviceName => {
    const item = document.createElement('div');
    item.className = 'service-item' + (currentSelection === 'config-' + serviceName ? ' active' : '') + (config.services[serviceName].subdomain?.protocol === 'insecure' ? ' insecure' : '');
    item.innerHTML = '⚙️ ' + serviceName + (config.services[serviceName].subdomain?.protocol === 'insecure' ? '<span class="hint">Not Secure</span>' : '');
    if (isFirstTimeSetup || !secretsSaved) {
      item.style.opacity = '0.5';
      item.style.cursor = 'default';
      item.style.pointerEvents = 'none';
      item.onclick = null;
    } else {
      item.onclick = () => selectItem('config-' + serviceName);
    }
    list.appendChild(item);
  });
}

function selectItem(prefixedName, type) {
  currentSelection = prefixedName;
  
  const url = new URL(window.location);
  url.searchParams.set('section', prefixedName);
  url.searchParams.delete('type');
  window.history.pushState({}, '', url);

  renderServicesList();
  updateSidebarButtons();
  
  const itemName = prefixedName.replace(/^(management-|config-)/, '');
  
  if (prefixedName === 'config-domain') {
    renderDomainEditor();
  } else if (prefixedName === 'management-application') {
    renderApplicationEditor();
  } else if (prefixedName === 'management-certificates') {
    renderCertificatesEditor();
  } else if (prefixedName === 'management-secrets') {
    renderSecretsEditor();
  } else if (prefixedName === 'management-ddns') {
    renderDdnsEditor();
  } else if (prefixedName === 'management-theme') {
    renderThemeEditor();
  } else if (prefixedName === 'management-advanced') {
    renderAdvancedEditor();
  } else if (prefixedName === 'monitor-logs') {
    renderLogsViewer(type);
  } else if (prefixedName === 'monitor-blocklist') {
    renderBlocklistEditor();
  } else if (prefixedName.startsWith('config-')) {
    renderServiceEditor(itemName);
  }

  if (prefixedName !== 'monitor-logs' && eventSource) {
    eventSource.close();
  }
}

function renderLogsViewer(type = 'out') {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  const url = new URL(window.location);

  url.searchParams.set('type', type);
  window.history.pushState({}, '', url);

  actions.classList.add('hidden');
  panel.classList.remove('scrollable');

  let html = `
    <div class="section logs-section">
      <div class="section-title">📝 Activity Logs</div>
      <div class="hint hint-section">View real-time logs of application activity and healthchecks.</div>
  `;

  if (!logRotateInstalled) {
    html += `
      <div class="installation-trigger highlight-recommended">
        <button class="btn-add-logrotate" id="installLogRotateBtn" onclick="installLogRotate()">Install PM2 Log Rotate Module</button>
        <div class="hint hint-section">Log rotate module is highly recommended for managing log files efficiently.</div>
      </div>
    `;
  }

  html += `
      <div class="logs-container">
        <div class="logs-tabs-row">
          <button class="tab-log-type${type === 'out' ? ' active' : ''}" id="btnLogOut" onclick="selectItem('monitor-logs', 'out')">Standard Output</button>
          <button class="tab-log-type${type === 'error' ? ' active' : ''}" id="btnLogErr" onclick="selectItem('monitor-logs', 'error')">Error Output</button>
        </div>
        <div id="logsBox" class="logs-box">
          <pre id="logsContent" class="logs-content">Loading logs...</pre>
        </div>
      </div>
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = '';

  startLogStream(type);
}

let logLines = [];
let logType;
let eventSource;

function startLogStream(type = 'out') {
  const appName = ecosystem?.apps?.[0]?.name ? (ecosystem.apps[0].name).replace(' ', '-') : 'Reverse-Proxy';
  const maxLines = 10000;
  const logsBox = document.getElementById('logsBox');
  const logsContent = document.getElementById('logsContent');
  let isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
  if (logType !== type) {
    logLines = [];
    logType = type;
    logLines.push(`Connecting to ${type === 'out' ? 'standard output' : 'error output'} log stream...`);
    logsContent.textContent = logLines.join('\n') + '\n';
  }
  if (eventSource) {
    eventSource.close();
  }
  eventSource = new EventSource(`logs/${appName}/${type}`);
  eventSource.onmessage = function(event) {
    // Only auto-scroll if user is already at the bottom
    isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
    logLines.push(event.data);
    const lastIndex = logLines.length - 1;
    const zuluTimeMatch = logLines[lastIndex].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z):\s(.*)$/);
    if (zuluTimeMatch) {
      const zuluTime = zuluTimeMatch[1];
      const message = zuluTimeMatch[2];
      const localDate = new Date(zuluTime);
      const formattedDate = localDate.toLocaleString();
      logLines[lastIndex] = `[${formattedDate}] ${message}`;
    }
    if (logLines.length > maxLines) {
      logLines = logLines.slice(logLines.length - maxLines);
    }
    logsContent.textContent = logLines.join('\n') + '\n';
    if (isAtBottom) {
      logsBox.scrollTop = logsBox.scrollHeight;
    }
  };
  eventSource.onerror = function() {
    isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
    logLines.push('[Error] Connection lost. Attempting to reconnect...');
    logsContent.textContent = logLines.join('\n') + '\n';
    // Only auto-scroll if user is already at the bottom
    if (isAtBottom) {
      logsBox.scrollTop = logsBox.scrollHeight;
    }
    eventSource.close();
    setTimeout(() => { startLogStream(type) }, 5000);
  }
  logsContent.textContent = logLines.join('\n') + '\n';
  if (isAtBottom) {
    logsBox.scrollTop = logsBox.scrollHeight;
  }
}

function renderDomainEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  const isEmpty = !config.domain || config.domain.trim() === '';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title">🌐 Domain Settings</div>
      <div class="hint hint-section">Configure your primary domain</div>
      <div class="domain-entry${isEmpty ? ' highlight-required' : ''}">
        <div class="form-group form-group-no-margin">
          <label for="domainInput">Domain Name</label>
          <input type="text" id="domainInput" placeholder="example.com" value="${config.domain || ''}" onchange="updateConfig('domain', this.value)">
          <div class="hint">Primary domain name for your services, without "www" or any subdomains</div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">📡 Environment & Setup</div>
      <div class="setup-heading">
        <div class="ip-display-row">
          <strong>Public IP Address:</strong>
          <span id="publicIpDisplay" class="ip-value">Loading...</span>
        </div>
        <div class="ip-display-row">
          <strong>Local IP Address:</strong>
          <span id="localIpDisplay" class="ip-value local">Loading...</span>
        </div>
      </div>
      <div class="setup-instructions">
        <div class="setup-section">
          <strong class="setup-section-title">🌍 Route53 DNS Configuration</strong>
          <div class="hint hint-section">Configure these records in your AWS Route53 hosted zone</div>
          <div class="setup-box route53">
            <div class="setup-record">
              <div class="setup-record-label">Record 1:</div>
              <div class="setup-record-content">
                <strong>Name:</strong> <span id="route53Record1" class="setup-value-domain">${config.domain || '(set domain above)'}</span><br>
                <strong>Type:</strong> A<br>
                <strong>Value:</strong> <span id="route53Ip1" class="setup-value-ip">Loading...</span><br>
                <strong>TTL:</strong> 300
              </div>
            </div>
            <div class="setup-record">
              <div class="setup-record-label">Record 2 (Wildcard for all subdomains):</div>
              <div class="setup-record-content">
                <strong>Name:</strong> <span id="route53Record2" class="setup-value-domain">*.${config.domain || '(set domain above)'}</span><br>
                <strong>Type:</strong> A<br>
                <strong>Value:</strong> <span id="route53Ip2" class="setup-value-ip">Loading...</span><br>
                <strong>TTL:</strong> 300
              </div>
            </div>
          </div>
        </div>
        <div class="setup-section">
          <strong class="setup-section-title">🔌 Router Port Forwarding</strong>
          <div class="hint hint-section">Configure these port forwarding rules on your router</div>
          <div class="setup-box router">
            <div class="setup-record">
              <div class="setup-record-label">HTTP Traffic:</div>
              <div class="setup-record-content">
                <strong>External Port:</strong> 80 (HTTP)<br>
                <strong>Internal IP:</strong> <span id="localIp1" class="setup-value-local">Loading...</span><br>
                <strong>Internal Port:</strong> 8080<br>
                <strong>Protocol:</strong> TCP
              </div>
            </div>
            <div class="setup-record">
              <div class="setup-record-label">HTTPS Traffic:</div>
              <div class="setup-record-content">
                <strong>External Port:</strong> 443 (HTTPS)<br>
                <strong>Internal IP:</strong> <span id="localIp2" class="setup-value-local">Loading...</span><br>
                <strong>Internal Port:</strong> 8443<br>
                <strong>Protocol:</strong> TCP
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <button class="btn-reset" id="resetBtn" onclick="resetEditor()">Revert</button>
    <button class="btn-save" id="saveBtn" onclick="saveConfig()">Save Config</button>
  `;

  // Fetch and display public IP and local IP
  fetchPublicIp();
  fetchLocalIp();
}

async function fetchPublicIp() {
  const displayElement = document.getElementById('publicIpDisplay');
  const route53Ip1 = document.getElementById('route53Ip1');
  const route53Ip2 = document.getElementById('route53Ip2');
  
  if (displayElement) displayElement.textContent = 'Loading...';
  if (route53Ip1) route53Ip1.textContent = 'Loading...';
  if (route53Ip2) route53Ip2.textContent = 'Loading...';
  
  try {
    const response = await fetch('publicip');
    const data = await response.json();
    
    if (data.success && data.ip) {
      if (displayElement) displayElement.textContent = data.ip;
      if (route53Ip1) route53Ip1.textContent = data.ip;
      if (route53Ip2) route53Ip2.textContent = data.ip;
    } else {
      const errorMsg = 'Unable to fetch';
      if (displayElement) displayElement.textContent = errorMsg;
      if (route53Ip1) route53Ip1.textContent = errorMsg;
      if (route53Ip2) route53Ip2.textContent = errorMsg;
    }
  } catch (error) {
    console.error('Error fetching public IP:', error);
    const errorMsg = 'Error loading IP';
    if (displayElement) displayElement.textContent = errorMsg;
    if (route53Ip1) route53Ip1.textContent = errorMsg;
    if (route53Ip2) route53Ip2.textContent = errorMsg;
  }
}

async function fetchLocalIp() {
  const localIpDisplay = document.getElementById('localIpDisplay');
  const localIp1 = document.getElementById('localIp1');
  const localIp2 = document.getElementById('localIp2');
  
  if (localIpDisplay) localIpDisplay.textContent = 'Loading...';
  if (localIp1) localIp1.textContent = 'Loading...';
  if (localIp2) localIp2.textContent = 'Loading...';
  
  try {
    const response = await fetch('localip');
    const data = await response.json();
    
    if (data.success && data.ip) {
      if (localIpDisplay) localIpDisplay.textContent = data.ip;
      if (localIp1) localIp1.textContent = data.ip;
      if (localIp2) localIp2.textContent = data.ip;
    } else {
      const errorMsg = 'Unable to fetch';
      if (localIpDisplay) localIpDisplay.textContent = errorMsg;
      if (localIp1) localIp1.textContent = errorMsg;
      if (localIp2) localIp2.textContent = errorMsg;
    }
  } catch (error) {
    console.error('Error fetching local IP:', error);
    const errorMsg = 'Error loading IP';
    if (localIpDisplay) localIpDisplay.textContent = errorMsg;
    if (localIp1) localIp1.textContent = errorMsg;
    if (localIp2) localIp2.textContent = errorMsg;
  }
}

function hasUnsavedConfigChanges() {
  return JSON.stringify(config) !== JSON.stringify(originalConfig);
}

function getCertificateStatus() {
  const status = {
    provisioned: [],
    needProvisioning: [],
    needDeprovisioning: []
  };
  
  // Get current secure services
  const currentSecureServices = new Set();
  if (originalConfig.services) {
    Object.keys(originalConfig.services).forEach(serviceName => {
      if (originalConfig.services[serviceName].subdomain && 
        originalConfig.services[serviceName].subdomain.protocol === 'secure') {
        currentSecureServices.add(serviceName);
      }
    });
  }
  
  // Get services that have provisioned certificates from certs.json
  const provisionedServices = new Set(certs.services || []);
  
  // Determine status for each service
  currentSecureServices.forEach(serviceName => {
    if (provisionedServices.has(serviceName)) {
      status.provisioned.push(serviceName);
    } else {
      status.needProvisioning.push(serviceName);
    }
  });
  
  provisionedServices.forEach(serviceName => {
    if (!currentSecureServices.has(serviceName)) {
      status.needDeprovisioning.push(serviceName);
    }
  });
  
  return status;
}

function renderCertificatesEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  const hasChanges = hasUnsavedConfigChanges();
  const certStatus = getCertificateStatus();
  const canProvision = !hasChanges && (certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0);

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  let warningMessage = '';
  if (hasChanges) {
    warningMessage = '<div class="hint" style="color: #ed8936; margin-bottom: 10px;">⚠️ Please save your configuration before provisioning certificates</div>';
  } else if (!canProvision) {
    warningMessage = '<div class="hint" style="color: #718096; margin-bottom: 10px;">ℹ️ No certificate changes needed at this time</div>';
  }
  
  // Build certificate status readout
  let statusHtml = '';
  
  if (certStatus.provisioned.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-provisioned">✓ Provisioned Certificates</div>
        <div class="cert-status-list">
          ${certStatus.provisioned.map(service => 
            `<div class="cert-status-item"><span class="cert-domain">${service}.${config.domain}</span></div>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  if (certStatus.needProvisioning.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-need-provision">⏳ Need Provisioning</div>
        <div class="cert-status-list">
          ${certStatus.needProvisioning.map(service => 
            `<div class="cert-status-item"><span class="cert-domain">${service}.${config.domain}</span></div>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  if (certStatus.needDeprovisioning.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-need-deprovision">⚠ Need Deprovisioning</div>
        <div class="cert-status-list">
          ${certStatus.needDeprovisioning.map(service => 
            `<div class="cert-status-item"><span class="cert-domain">${service}.${config.domain}</span></div>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  if (certStatus.provisioned.length === 0 && certStatus.needProvisioning.length === 0 && certStatus.needDeprovisioning.length === 0) {
    statusHtml = '<div class="hint" style="color: #718096; padding: 20px; text-align: center;">No secure services configured. Add services with secure protocol to provision certificates.</div>';
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title">🔒 SSL Certificates</div>
      <div class="hint hint-section">Automatically provision SSL certificates for secure routes using Let's Encrypt.</div>
      <div class="cert-status-container">
        ${statusHtml}
      </div>
      ${warningMessage}
      <div id="certOutput" class="result-output"></div>
    </div>
  `;

  if (hasChanges) {
    actions.innerHTML = `
      <button class="btn-reset" id="resetBtn" onclick="resetEditor()">Revert</button>
      <button class="btn-save" id="saveBtn" onclick="saveConfig()">Save Config</button>
    `;
  } else {
    actions.innerHTML = `
      <button class="btn-save" onclick="provisionCertificates()" id="provisionBtn" ${canProvision ? '' : 'disabled'}>Provision Certificates</button>
    `;
  }
}

async function provisionCertificates() {
  const email = secrets.admin_email_address;
  const provisionBtn = document.getElementById('provisionBtn');
  const outputEl = document.getElementById('certOutput');

  if (!email) {
    showStatus('Admin email address is not configured in secrets', 'error');
    return;
  }

  provisionBtn.disabled = true;
  provisionBtn.textContent = 'Provisioning...';
  outputEl.innerHTML = '<p class="progress-text">Executing certbot command... This may take a few moments.</p>';

  try {
    const response = await fetch('certs', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to provision certificates');
    }

    outputEl.innerHTML = `
      <div class="result-success">
        <strong>✓ Success!</strong>
        <p class="result-message">${result.message}</p>
        ${result.output ? `<pre class="result-output-pre">${result.output}</pre>` : ''}
      </div>
    `;
    showStatus('Certificates provisioned successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Certificates provisioned. Waiting for the server to restart...');
    await waitForServerRestart();
    
    // Reload certificate data after successful provisioning
    await loadCerts(true);

    selectItem('management-certificates');
  } catch (error) {
    outputEl.innerHTML = `
      <div class="result-error">
        <strong>✗ Error</strong>
        <p class="result-message">${parseErrorMessage(error)}</p>
      </div>
    `;
    showStatus('Error provisioning certificates: ' + parseErrorMessage(error), 'error');
    provisionBtn.disabled = false;
    provisionBtn.textContent = 'Provision Certificates';
  }
}

function renderServiceEditor(serviceName) {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  const service = config.services[serviceName];
  const isDefaultService = serviceName === 'api' || serviceName === 'www';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  let html = `
    <div class="section">
      <div class="section-title">⚙️ ${serviceName}</div>
      ${!isDefaultService ? `<button class="btn-remove" onclick="removeService('${serviceName}')">Remove Service</button>` : ''}
      <div class="form-group">
        <label for="service_nicename_${serviceName}">Display Name</label>
        <input type="text" id="service_nicename_${serviceName}" value="${service.nicename || ''}" 
            onchange="updateServiceProperty('${serviceName}', 'nicename', this.value)"
            placeholder="Friendly display name for this service">
        <div class="hint">Optional friendly name for display purposes</div>
      </div>
    </div>
  `;

  if (service.subdomain) {
    if (serviceName === 'www' || serviceName === 'api') {
      html += renderDefaultSubdomainSection(serviceName, service.subdomain);
    } else {
      html += renderSubdomainSection(serviceName, service.subdomain);
    }
  } else {
    html += `
      <div class="section">
        <div class="section-title">Subdomain Settings</div>
        <div class="form-group">
          <p class="hint">No subdomain configured for this service</p>
          <button class="btn-add-field" onclick="addSubdomain('${serviceName}')">+ Add Subdomain</button>
        </div>
      </div>
    `;
  }

  if (serviceName !== 'www') {
    if (service.healthcheck) {
      if (serviceName === 'api') {
        html += renderApiHealthcheckSection(serviceName, service.healthcheck);
      } else {
        html += renderHealthcheckSection(serviceName, service.healthcheck);
      }
    } else {
      html += `
        <div class="section">
          <div class="section-title">Health Check</div>
          <div class="form-group">
            <p class="hint">No health check configured for this service</p>
            <button class="btn-add-field" onclick="addHealthcheck('${serviceName}')">+ Add Health Check</button>
          </div>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
  actions.innerHTML = `
    <button class="btn-reset" id="resetBtn" onclick="resetEditor()">Revert</button>
    <button class="btn-save" id="saveBtn" onclick="saveConfig()">Save Config</button>
  `;

  // Set initial visibility state for conditional fields
  if (service.subdomain) {
    toggleFieldVisibility(serviceName);
  }
  if (service.healthcheck) {
    toggleHealthcheckFieldVisibility(serviceName);
    toggleMetaFieldVisibility(serviceName);
  }
}

function renderServiceProperties(serviceName, service, prefix = '', depth = 0) {
  let html = '';
  const maxDepth = 4;

  if (depth > maxDepth) return html;

  Object.keys(service).sort().forEach(key => {
    if (key === 'router' || key === 'middleware') return;

    const value = service[key];
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const fieldId = `${serviceName}_${fullPath}`.replace(/\./g, '_');

    if (value === null || value === undefined) {
      html += renderFieldInput(serviceName, fullPath, value, fieldId, 'null');
    } else if (typeof value === 'boolean') {
      html += `
        <div class="form-group">
          <label for="${fieldId}">
            <input type="checkbox" id="${fieldId}" ${value ? 'checked' : ''} 
                onchange="updateServiceProperty('${serviceName}', '${fullPath}', this.checked)">
            ${key}
          </label>
        </div>
      `;
    } else if (typeof value === 'number') {
      html += renderFieldInput(serviceName, fullPath, value, fieldId, 'number', key);
    } else if (typeof value === 'string') {
      html += renderFieldInput(serviceName, fullPath, value, fieldId, 'text', key);
    } else if (Array.isArray(value)) {
      html += renderArrayField(serviceName, fullPath, value, fieldId, key, depth);
    } else if (typeof value === 'object') {
      html += renderObjectSection(serviceName, key, value, fullPath, depth);
    }
  });

  return html;
}

function renderFieldInput(serviceName, fullPath, value, fieldId, type, label = '') {
  const displayLabel = label || fullPath.split('.').pop();
  const displayValue = value === null ? '' : value;
  
  return `
    <div class="form-group">
      <label for="${fieldId}">${displayLabel}</label>
      <input type="${type}" id="${fieldId}" value="${displayValue}" 
          onchange="updateServiceProperty('${serviceName}', '${fullPath}', ${type === 'number' ? 'parseInt(this.value) || null' : type === 'boolean' ? 'this.checked' : 'this.value'})">
    </div>
  `;
}

function renderObjectSection(serviceName, sectionName, obj, fullPath, depth) {
  let html = `
    <div class="section subsection">
      <div class="section-title subsection-title">${sectionName}</div>
      <div class="nested-object">
  `;

  Object.keys(obj).sort().forEach(key => {
    if (key === 'router' || key === 'middleware') return;

    const value = obj[key];
    const newPath = `${fullPath}.${key}`;
    const fieldId = `${serviceName}_${newPath}`.replace(/\./g, '_');

    if (value === null || value === undefined) {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'text', key);
    } else if (typeof value === 'boolean') {
      html += `
        <div class="form-group">
          <label for="${fieldId}">
            <input type="checkbox" id="${fieldId}" ${value ? 'checked' : ''} 
                onchange="updateServiceProperty('${serviceName}', '${newPath}', this.checked)">
            ${key}
          </label>
        </div>
      `;
    } else if (typeof value === 'number') {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'number', key);
    } else if (typeof value === 'string') {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'text', key);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      html += renderNestedObjectFields(serviceName, key, value, newPath, depth + 1);
    }
  });

  html += '</div></div>';
  return html;
}

function renderNestedObjectFields(serviceName, sectionName, obj, fullPath, depth) {
  let html = `<div class="nested-field">`;
  
  Object.keys(obj).sort().forEach(key => {
    if (key === 'router' || key === 'middleware') return;

    const value = obj[key];
    const newPath = `${fullPath}.${key}`;
    const fieldId = `${serviceName}_${newPath}`.replace(/\./g, '_');

    if (value === null || value === undefined) {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'text', key);
    } else if (typeof value === 'boolean') {
      html += `
        <div class="form-group">
          <label for="${fieldId}">
            <input type="checkbox" id="${fieldId}" ${value ? 'checked' : ''} 
                onchange="updateServiceProperty('${serviceName}', '${newPath}', this.checked)">
            ${key}
          </label>
        </div>
      `;
    } else if (typeof value === 'number') {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'number', key);
    } else if (typeof value === 'string') {
      html += renderFieldInput(serviceName, newPath, value, fieldId, 'text', key);
    } else if (typeof value === 'object' && depth < 4) {
      html += renderNestedObjectFields(serviceName, key, value, newPath, depth + 1);
    }
  });

  html += '</div>';
  return html;
}

function renderArrayField(serviceName, fullPath, arr, fieldId, label, depth) {
  let html = `<div class="form-group"><label>${label}</label><div class="nested-object">`;
  
  arr.forEach((item, index) => {
    const newPath = `${fullPath}[${index}]`;
    const itemFieldId = `${fieldId}_${index}`;
    
    if (typeof item === 'object' && item !== null) {
      html += `<div class="array-item">
        <strong>Item ${index + 1}</strong>
        ${renderNestedObjectFields(serviceName, `item`, item, `${fullPath}`, depth + 1)}
      </div>`;
    } else {
      const inputType = typeof item === 'number' ? 'number' : 'text';
      html += `
        <div class="form-group">
          <label for="${itemFieldId}">Item ${index + 1}</label>
          <input type="${inputType}" id="${itemFieldId}" value="${item}" 
              onchange="updateArrayItem('${serviceName}', '${fullPath}', ${index}, ${inputType === 'number' ? 'parseInt(this.value)' : 'this.value'})">
        </div>
      `;
    }
  });

  html += `<button class="btn-add-field" onclick="addArrayItem('${serviceName}', '${fullPath}')">+ Add Item</button>`;
  html += '</div></div>';
  return html;
}

function renderDefaultSubdomainSection(serviceName, subdomain) {
  const isWww = serviceName === 'www';
  return `
    <div class="section">
      <div class="section-title">Subdomain Settings</div>
      <div class="nested-object">
        <div class="form-group">
          <label for="subdomain_type_${serviceName}">Type</label>
          <select id="subdomain_type_${serviceName}" disabled>
            <option value="index" ${subdomain.type === 'index' ? 'selected' : ''}>Index</option>
            <option value="dirlist" ${subdomain.type === 'dirlist' ? 'selected' : ''}>Directory List</option>
            <option value="proxy" ${subdomain.type === 'proxy' ? 'selected' : ''}>Proxy</option>
          </select>
          <div class="hint">Type of service (index = static files, dirlist = directory listing, proxy = reverse proxy)</div>
        </div>
        <div class="form-group">
          <label for="subdomain_protocol_${serviceName}">Protocol</label>
          <select id="subdomain_protocol_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'subdomain.protocol', this.value)">
            <option ${secrets.admin_email_address ? '' : 'disabled '}value="secure" ${subdomain.protocol === 'secure' ? 'selected' : ''}>Secure (HTTPS)</option>
            <option value="insecure" ${subdomain.protocol === 'insecure' ? 'selected' : ''}>Not Secure (HTTP)</option>
          </select>
        </div>
        ${isWww ? '<div class="hint">Default www service uses simplified configuration</div>' : '<div class="hint">Default api service uses simplified configuration</div>'}
      </div>
    </div>
  `;
}

function renderSubdomainSection(serviceName, subdomain) {
  return `
    <div class="section">
      <div class="section-title">Subdomain Settings</div>
      <div class="nested-object">
        <button class="btn-remove" onclick="removeSubdomain('${serviceName}')">Remove Subdomain</button>
        <div class="form-group">
          <label for="subdomain_type_${serviceName}">Type</label>
          <select id="subdomain_type_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'subdomain.type', this.value); toggleFieldVisibility('${serviceName}')">
            <option value="index" ${subdomain.type === 'index' ? 'selected' : ''}>Index</option>
            <option value="dirlist" ${subdomain.type === 'dirlist' ? 'selected' : ''}>Directory List</option>
            <option value="proxy" ${subdomain.type === 'proxy' ? 'selected' : ''}>Proxy</option>
          </select>
          <div class="hint">Type of service (index = static files, dirlist = directory listing, proxy = reverse proxy)</div>
        </div>
        <div class="form-group">
          <label for="subdomain_protocol_${serviceName}">Protocol</label>
          <select id="subdomain_protocol_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'subdomain.protocol', this.value)">
            <option value="secure" ${subdomain.protocol === 'secure' ? 'selected' : ''}>Secure (HTTPS)</option>
            <option value="insecure" ${subdomain.protocol === 'insecure' ? 'selected' : ''}>Not Secure (HTTP)</option>
          </select>
        </div>
        <div class="form-group proxy-field" data-service="${serviceName}">
          <label for="subdomain_path_${serviceName}">IP address and Port to Internal Service</label>
          <input type="text" id="subdomain_path_${serviceName}" value="${subdomain.path || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'subdomain.path', this.value)"
              placeholder="e.g., 192.168.1.2:8000">
          <div class="hint">Index services can proxy a service if Proxy Path is included below</div>
        </div>
        <div class="form-group basicauth-field" data-service="${serviceName}">
          <label for="subdomain_basicUser_${serviceName}">Basic Auth Username</label>
          <input type="text" id="subdomain_basicUser_${serviceName}" value="${subdomain.basicUser || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'subdomain.basicUser', this.value)"
              placeholder="Optional username">
          <div class="hint">Used for /protected folder in dirlist services</div>
        </div>
        <div class="form-group basicauth-field" data-service="${serviceName}">
          <label for="subdomain_basicPass_${serviceName}">Basic Auth Password</label>
          <input type="text" id="subdomain_basicPass_${serviceName}" value="${subdomain.basicPass || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'subdomain.basicPass', this.value)"
              placeholder="Optional password">
          <div class="hint">Used for /protected folder in dirlist services</div>
        </div>
        <div class="form-group form-group-no-margin proxy-field" data-service="${serviceName}">
          <label>Proxy Options</label>
          <div class="nested-object">
            <div class="checkbox-item">
              <input type="checkbox" id="proxy_socket_${serviceName}" ${(subdomain.proxy && subdomain.proxy.socket) ? 'checked' : ''} 
                  onchange="updateServiceProperty('${serviceName}', 'subdomain.proxy.socket', this.checked)">
              <label for="proxy_socket_${serviceName}" class="inline-label">Enable WebSocket</label>
            </div>
            <div class="form-group form-group-spaced form-group-no-margin">
              <label for="proxy_path_${serviceName}">Proxy Path</label>
              <input type="text" id="proxy_path_${serviceName}" value="${(subdomain.proxy && subdomain.proxy.path) || ''}" 
                  onchange="updateServiceProperty('${serviceName}', 'subdomain.proxy.path', this.value)"
                  placeholder="e.g., /stream">
              <div class="hint">Optional, can be used to expose a proxy under an Index type service, but has other uses for Proxy services as well</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderApiHealthcheckSection(serviceName, healthcheck) {
  let html = `
    <div class="section">
      <div class="section-title">Health Check Configuration</div>
      <div class="nested-object">
        <button class="btn-remove" onclick="removeHealthcheck('${serviceName}')">Remove Health Check</button>
        <div class="form-group">
          <label for="hc_id_${serviceName}">Health Check ID (UUID)</label>
          <input type="text" id="hc_id_${serviceName}" value="${healthcheck.id || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.id', this.value)"
              placeholder="UUID for healthchecks.io health check">
          <div class="hint">Optional, used for pinging a healthchecks.io healthcheck</div>
        </div>
        <div class="hint">Default api service uses simplified configuration</div>
      </div>
    </div>
  `;
  return html;
}

function renderHealthcheckSection(serviceName, healthcheck) {
  // Build parser options from both defaults and advanced config
  const parserOptions = ['hass', 'radio', 'body'];
  if (advanced.parsers) {
    Object.keys(advanced.parsers).forEach(key => {
      if (!parserOptions.includes(key)) {
        parserOptions.push(key);
      }
    });
  }
  let parserOptionsHtml = parserOptions.map(parser => 
    `<option value="${parser}" ${healthcheck.parser === parser ? 'selected' : ''}>${parser}</option>`
  ).join('');
  
  // Build extractor options from both defaults and advanced config
  const extractorOptions = ['doom', 'minecraft', 'valheim', 'radio'];
  if (advanced.extractors) {
    Object.keys(advanced.extractors).forEach(key => {
      if (!extractorOptions.includes(key)) {
        extractorOptions.push(key);
      }
    });
  }
  let extractorOptionsHtml = extractorOptions.map(extractor =>
    `<option value="${extractor}" ${healthcheck.extractor === extractor ? 'selected' : ''}>${extractor}</option>`
  ).join('');
  
  // Build query type options from both defaults and advanced config
  const queryTypeOptions = ['mbe', 'valheim'];
  if (advanced.queryTypes && advanced.queryTypes.length > 0) {
    advanced.queryTypes.forEach(qt => {
      if (!queryTypeOptions.includes(qt)) {
        queryTypeOptions.push(qt);
      }
    });
  }
  let queryTypeOptionsHtml = queryTypeOptions.map(qt =>
    `<option value="${qt}" ${healthcheck.queryType === qt ? 'selected' : ''}>${qt}</option>`
  ).join('');
  
  let html = `
    <div class="section">
      <div class="section-title">Health Check Configuration</div>
      <div class="nested-object">
        <button class="btn-remove" onclick="removeHealthcheck('${serviceName}')">Remove Health Check</button>
        <div class="form-group">
          <label for="hc_id_${serviceName}">Health Check ID (UUID)</label>
          <input type="text" id="hc_id_${serviceName}" value="${healthcheck.id || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.id', this.value)"
              placeholder="UUID for healthchecks.io health check">
          <div class="hint">Optional, used for pinging a healthchecks.io healthcheck</div>
        </div>
        <div class="form-group">
          <label for="hc_path_${serviceName}">Path to Service Status Monitor (IP:Port or URL)</label>
          <input type="text" id="hc_path_${serviceName}" value="${healthcheck.path || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.path', this.value)"
              placeholder="e.g., 192.168.1.213:8000/status or http://service/health">
          <div class="hint">Some services have dedicated ports or routes for this, otherwise you can just check if the service returns its home or login page</div>
        </div>
        <div class="form-group">
          <label for="hc_type_${serviceName}">Type</label>
          <select id="hc_type_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'healthcheck.type', this.value); toggleHealthcheckFieldVisibility('${serviceName}')">
            <option value="">-- Select Type --</option>
            <option value="http" ${healthcheck.type === 'http' ? 'selected' : ''}>HTTP</option>
            <option value="gamedig" ${healthcheck.type === 'gamedig' ? 'selected' : ''}>GameDig</option>
            <option value="odalpapi" ${healthcheck.type === 'odalpapi' ? 'selected' : ''}>OdalPAPI</option>
          </select>
        </div>
        <div class="form-group http-only-field" data-service="${serviceName}">
          <label for="hc_timeout_${serviceName}">Timeout (ms)</label>
          <input type="number" id="hc_timeout_${serviceName}" value="${healthcheck.timeout || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.timeout', parseInt(this.value) || undefined)">
          <div class="hint">Defaults to 1000ms if left blank</div>
        </div>
        <div class="form-group http-only-field" data-service="${serviceName}">
          <label for="hc_parser_${serviceName}">HTML Body Parser</label>
          <select id="hc_parser_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'healthcheck.parser', this.value)">
            <option value="">-- Select Parser --</option>
            ${parserOptionsHtml}
          </select>
        </div>
        <div class="form-group gamedig-only-field" data-service="${serviceName}">
          <label for="hc_querytype_${serviceName}">Query Type</label>
          <select id="hc_querytype_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'healthcheck.queryType', this.value)">
            <option value="">-- Select Query Type --</option>
            ${queryTypeOptionsHtml}
          </select>
        </div>
        <div class="form-group">
          <label for="hc_platform_${serviceName}">Platform</label>
          <select id="hc_platform_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'healthcheck.platform', this.value)">
            <option value="">-- Select Platform --</option>
            <option value="compute" ${healthcheck.platform === 'compute' ? 'selected' : ''}>compute</option>
            <option value="storage" ${healthcheck.platform === 'storage' ? 'selected' : ''}>storage</option>
            <option value="standalone" ${healthcheck.platform === 'standalone' ? 'selected' : ''}>standalone</option>
          </select>
          <div class="hint">If Wake-on-LAN secrets are configured, the API page can send a Wake-on-LAN packet if all services on the compute platform are down</div>
        </div>
        <div class="form-group">
          <label for="hc_pollrate_${serviceName}">Polling Rate (s)</label>
          <input type="number" id="hc_pollrate_${serviceName}" value="${healthcheck.pollrate || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.pollrate', parseInt(this.value) || undefined)">
          <div class="hint">How often the API page will poll the service for health status updates, defaults to 30s if left blank</div>
        </div>
        <div class="form-group" data-service="${serviceName}">
          <label for="hc_extractor_${serviceName}">Meta Data Extractor</label>
          <select id="hc_extractor_${serviceName}" onchange="updateServiceProperty('${serviceName}', 'healthcheck.extractor', this.value); toggleMetaFieldVisibility('${serviceName}');">
            <option value="">-- Select Extractor --</option>
            ${extractorOptionsHtml}
          </select>
        </div>
        ${renderMetaSection(serviceName, healthcheck.meta || {})}
      </div>
    </div>
  `;
  return html;
}

function renderMetaSection(serviceName, meta) {
  let html = '<div class="form-group form-group-no-margin"><label>Meta Data Defaults</label><div class="nested-object">';
  
  const allMetaFields = [
    {key: 'tag', type: 'text', extractorDependent: true},
    {key: 'online', type: 'number', extractorDependent: true},
    {key: 'max', type: 'number', extractorDependent: true},
    {key: 'version', type: 'text', extractorDependent: false},
    {key: 'link', type: 'checkbox', extractorDependent: false}
  ];
  allMetaFields.forEach(({key, type, extractorDependent}) => {
    const value = meta[key] !== undefined ? meta[key] : '';
    const inputType = type;
    const fieldClass = extractorDependent ? 'form-group extractor-dependent-field' : 'form-group';
    if (inputType === 'checkbox') {
      html += `
        <div class="form-group form-group-spaced form-group-no-margin">
            <div class="checkbox-item">
              <input type="checkbox" id="meta_${serviceName}_${key}" ${value ? 'checked' : ''} 
                onchange="updateServiceProperty('${serviceName}', 'healthcheck.meta.${key}', this.checked)">
              <label for="meta_${serviceName}_${key}" class="inline-label">Provide Service Link in Metadata</label>
            </div>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="${fieldClass}" data-service="${serviceName}">
          <label for="meta_${serviceName}_${key}">${key}</label>
          <input type="${inputType}" id="meta_${serviceName}_${key}" value="${value}" 
            onchange="updateServiceProperty('${serviceName}', 'healthcheck.meta.${key}', ${inputType === 'number' ? 'parseInt(this.value) || 0' : 'this.value'})">
        </div>
      `;
    }
  });
  
  html += '</div></div>';
  return html;
}

function addHealthcheck(serviceName) {
  if (!config.services[serviceName].healthcheck) {
    config.services[serviceName].healthcheck = {
      id: '',
      path: '',
      type: '',
      timeout: 1000,
      parser: '',
      extractor: '',
      queryType: '',
      pollrate: 30,
      platform: '',
      meta: {}
    };
    renderServiceEditor(serviceName);
    showStatus('Health check added', 'success');
  }
}

function removeHealthcheck(serviceName) {
  showConfirmModal(
    'Remove Health Check',
    'Are you sure you want to remove the health check configuration?',
    (confirmed) => {
      if (confirmed) {
        delete config.services[serviceName].healthcheck;
        renderServiceEditor(serviceName);
        showStatus('Health check removed', 'success');
      }
    }
  );
}

function addSubdomain(serviceName) {
  if (!config.services[serviceName].subdomain) {
    config.services[serviceName].subdomain = {
      router: null,
      type: 'index',
      protocol: 'secure'
    };
    renderServiceEditor(serviceName);
    showStatus('Subdomain added', 'success');
  }
}

function removeSubdomain(serviceName) {
  showConfirmModal(
    'Remove Subdomain',
    'Are you sure you want to remove the subdomain configuration?',
    (confirmed) => {
      if (confirmed) {
        delete config.services[serviceName].subdomain;
        renderServiceEditor(serviceName);
        showStatus('Subdomain removed', 'success');
      }
    }
  );
}

function updateConfig(key, value) {
  config[key] = value;
}

function updateServiceProperty(serviceName, path, value) {
  const parts = path.split('.');
  let obj = config.services[serviceName];

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!obj[part] || typeof obj[part] !== 'object') {
      obj[part] = {};
    }
    obj = obj[part];
  }

  obj[parts[parts.length - 1]] = value;
}

function toggleFieldVisibility(serviceName) {
  const typeSelect = document.getElementById(`subdomain_type_${serviceName}`);
  if (!typeSelect) return;
  
  const selectedType = typeSelect.value;
  const basicAuthFields = document.querySelectorAll(`.basicauth-field[data-service="${serviceName}"]`);
  const proxyFields = document.querySelectorAll(`.proxy-field[data-service="${serviceName}"]`);
  
  // Basic Auth fields: show only for dirlist
  basicAuthFields.forEach(field => {
    if (selectedType === 'dirlist') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
  
  // Proxy fields: hide for dirlist, show for index and proxy
  proxyFields.forEach(field => {
    if (selectedType === 'dirlist') {
      field.classList.add('form-group-hidden');
    } else {
      field.classList.remove('form-group-hidden');
    }
  });
}

function toggleHealthcheckFieldVisibility(serviceName) {
  const typeSelect = document.getElementById(`hc_type_${serviceName}`);
  if (!typeSelect) return;
  
  const selectedType = typeSelect.value;
  const httpOnlyFields = document.querySelectorAll(`.http-only-field[data-service="${serviceName}"]`);
  const gamedigOnlyFields = document.querySelectorAll(`.gamedig-only-field[data-service="${serviceName}"]`);
  const httpGamedigFields = document.querySelectorAll(`.http-gamedig-field[data-service="${serviceName}"]`);
  
  // HTTP-only fields: show only for http type
  httpOnlyFields.forEach(field => {
    if (selectedType === 'http') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
  
  // GameDig-only fields: show only for gamedig type
  gamedigOnlyFields.forEach(field => {
    if (selectedType === 'gamedig') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
  
  // HTTP and GameDig fields: show for both http and gamedig types
  httpGamedigFields.forEach(field => {
    if (selectedType === 'http' || selectedType === 'gamedig') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
}

function toggleMetaFieldVisibility(serviceName) {
  const extractorSelect = document.getElementById(`hc_extractor_${serviceName}`);
  if (!extractorSelect) return;
  
  const selectedExtractor = extractorSelect.value;
  const extractorDependentFields = document.querySelectorAll(`.extractor-dependent-field[data-service="${serviceName}"]`);
  
  // Extractor-dependent fields: show only when an extractor is selected
  extractorDependentFields.forEach(field => {
    if (selectedExtractor && selectedExtractor !== '') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
}

function removeService(serviceName) {
  showConfirmModal(
    'Remove Service',
    `Are you sure you want to remove the service "${serviceName}"? This action cannot be undone.`,
    (confirmed) => {
      if (confirmed) {
        delete config.services[serviceName];
        currentSelection = null;
        
        const url = new URL(window.location);
        url.searchParams.delete('section');
        window.history.pushState({}, '', url);
        
        renderServicesList();
        const actions = document.getElementById('editorActions');
        const panel = document.getElementById('editorPanel');
        
        actions.classList.remove('hidden');
        panel.classList.remove('scrollable');
        
        panel.innerHTML = `
          <div class="placeholder-message">
            <p>Service removed. Select another item to continue editing.</p>
          </div>
        `;

        actions.innerHTML = `
          <button class="btn-reset" id="resetBtn" onclick="resetEditor()">Revert</button>
          <button class="btn-save" id="saveBtn" onclick="saveConfig()">Save Config</button>
        `;

        showStatus(`Service "${serviceName}" removed`, 'success');
      }
    }
  );
}

function addNewService() {
  showPromptModal(
    'Add New Service',
    'Enter a name for the new service:',
    'Lowercase letters, numbers, and hyphens only. Max 63 characters',
    '',
    'e.g., my-service',
    (serviceName) => {
      if (!serviceName) return;
      
      const existingServices = Object.keys(config.services).map(s => s.toLowerCase());
      if (existingServices.includes(serviceName.toLowerCase())) {
        showPromptError('A service with this name already exists!');
        return;
      }
      
      const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
      
      if (!subdomainRegex.test(serviceName)) {
        showPromptError('Invalid service name! Must contain only lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.');
        return;
      }
      
      if (serviceName.length > 63) {
        showPromptError('Service name too long! Maximum 63 characters.');
        return;
      }

      config.services[serviceName] = {
        subdomain: {
          router: null,
          type: 'index',
          protocol: 'secure'
        }
      };

      renderServicesList();
      selectItem('config-' + serviceName);
      showStatus('Service added successfully', 'success');
      closePromptModal();
    }
  );
}

function mapChecklist(config) {
  const checklist = [];
  if (config.services) {
    Object.entries(config.services).forEach(([name, service]) => {
      if (service.healthcheck && service.healthcheck.platform) {
        const item = { 
          name, 
          polltime: service.healthcheck.pollrate ? service.healthcheck.pollrate*1000 : 30000, 
          platform: service.healthcheck.platform
        };
        if (service.nicename) {
          item.nicename = service.nicename;
        }
        checklist.push(item);
      } else if (service.nicename) {
        const item = { name, nicename: service.nicename };
        checklist.push(item);
      }
    });
  }
  return checklist;
}          

async function saveConfig() {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const configToSave = JSON.parse(JSON.stringify(config));
    
    if (configToSave.services) {
      const sortedServices = {};
      Object.keys(configToSave.services).sort().forEach(key => {
        sortedServices[key] = configToSave.services[key];
      });
      configToSave.services = sortedServices;
    }
    
    Object.entries(configToSave.services).forEach(([name, service]) => {
      if (service.subdomain) {
        service.subdomain.router = null;
        if (!service.subdomain.proxy) {
          service.subdomain.proxy = {};
        }
        service.subdomain.proxy.websocket = null;
        service.subdomain.proxy.middleware = null;
      }
    });
    
    const cleanedConfig = cleanConfig(configToSave);
    
    let response = await fetch('config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cleanedConfig)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const checklist = mapChecklist(configToSave);
    
    response = await fetch('checks', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checklist)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const domainHasChanged = originalConfig.domain !== config.domain;

    originalConfig = JSON.parse(JSON.stringify(config));
    
    const currentServicesWithSubdomains = new Set();
    Object.keys(config.services).forEach(serviceName => {
      if (config.services[serviceName].subdomain && config.services[serviceName].subdomain.protocol === 'secure') {
        currentServicesWithSubdomains.add(serviceName);
      }
    });
    
    const hasNewServices = Array.from(currentServicesWithSubdomains).some(
      service => !servicesWithSubdomainsAtLastSave.has(service)
    );
    const hasRemovedServices = Array.from(servicesWithSubdomainsAtLastSave).some(
      service => !currentServicesWithSubdomains.has(service)
    );
    
    if (hasNewServices || hasRemovedServices) {
      secureServicesChangedThisSession = true;
      servicesWithSubdomainsAtLastSave = currentServicesWithSubdomains;
    }
    
    showStatus('✓ Config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Configuration saved. Waiting for the server to restart...');
    await waitForServerRestart();
    
    if (domainHasChanged) {
      selectItem('management-certificates');
      const url = new URL(window.location);
      window.location.href = url.toString();
    } else if (secureServicesChangedThisSession) {
      selectItem('management-certificates');
    } else if (currentSelection) {
      selectItem(currentSelection);
    }
  } catch (error) {
    showStatus('✗ Error saving config: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Config';
  }
}

function cleanConfig(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => cleanConfig(item));
  } else if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if ((key === 'router' || key === 'websocket' || key === 'middleware') && value === null) {
          cleaned[key] = null;
        }
        else if (key === 'nicename') {
          cleaned[key] = value || '';
        }
        else if (value === '') {
          continue;
        }
        else if (value !== null && typeof value === 'object') {
          const cleanedValue = cleanConfig(value);
          if (Object.keys(cleanedValue).length > 0) {
            cleaned[key] = cleanedValue;
          }
        }
        else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }
  return obj;
}

function resetEditor() {
  showConfirmModal(
    'Discard Changes',
    'Are you sure you want to discard all changes and reload the original configuration?',
    (confirmed) => {
      if (confirmed) {
        config = JSON.parse(JSON.stringify(originalConfig));
        currentSelection = null;
        renderServicesList();
        const actions = document.getElementById('editorActions');
        const panel = document.getElementById('editorPanel');
      
        actions.classList.add('hidden');
        panel.classList.remove('scrollable');

        panel.innerHTML = `
          <div class="placeholder-message">
            <p>Changes discarded. Select an item to edit.</p>
          </div>
        `;
        showStatus('Changes discarded', 'success');
      }
    }
  );
}

function showStatus(message, type) {
  const container = document.getElementById('statusContainer');
  
  // Create new status element
  const statusEl = document.createElement('div');
  statusEl.className = 'status ' + type;
  statusEl.textContent = message;
  
  // Click to dismiss
  statusEl.addEventListener('click', () => {
    removeStatus(statusEl);
  });
  
  // Add to container
  container.appendChild(statusEl);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    removeStatus(statusEl);
  }, 5000);
}

function removeStatus(statusEl) {
  if (!statusEl || !statusEl.parentNode) return;
  
  statusEl.classList.add('removing');
  setTimeout(() => {
    if (statusEl.parentNode) {
      statusEl.parentNode.removeChild(statusEl);
    }
  }, 300);
}

let confirmCallback = null;
let promptCallback = null;

function showConfirmModal(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
  confirmCallback = null;
}

function confirmAction() {
  if (confirmCallback) {
    confirmCallback(true);
  }
  closeConfirmModal();
}

function showPromptModal(title, message, hint = '', defaultValue = '', placeholder = 'Enter text here', callback) {
  document.getElementById('promptTitle').textContent = title;
  document.getElementById('promptMessage').textContent = message;
  const promptInput = document.getElementById('promptInput');
  promptInput.value = defaultValue;
  promptInput.placeholder = placeholder;
  
  const hintEl = document.getElementById('promptHint');
  if (hint) {
    hintEl.textContent = hint;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
  
  document.getElementById('promptError').style.display = 'none';
  
  promptCallback = callback;
  document.getElementById('promptModal').classList.add('active');
  setTimeout(() => {
    document.getElementById('promptInput').focus();
  }, 100);
}

function showPromptError(errorMessage) {
  const errorEl = document.getElementById('promptError');
  errorEl.textContent = errorMessage;
  errorEl.style.display = 'block';
}

function closePromptModal() {
  document.getElementById('promptModal').classList.remove('active');
  promptCallback = null;
}

function submitPrompt() {
  const value = document.getElementById('promptInput').value;
  if (promptCallback) {
    const result = promptCallback(value);
    // Only close modal if callback returns true (success)
    if (result !== false) {
      closePromptModal();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('promptInput').addEventListener('input', () => {
    document.getElementById('promptError').style.display = 'none';
  });
});

function showLoadingOverlay(title, message) {
  const overlay = document.getElementById('loadingOverlay');
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingMessage').textContent = message;
  overlay.classList.remove('hiding');
  overlay.classList.add('active');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hiding');
  overlay.classList.remove('active');
  
  setTimeout(() => {
    overlay.classList.remove('hiding');
  }, 300);
}

async function waitForServerRestart(delay = 2000) {
  const maxAttempts = 12;
  const pollInterval = 5000;
  let attempts = 0;
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  while (attempts < maxAttempts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        hideLoadingOverlay();
        showStatus('✓ Server restarted successfully!', 'success');
        return;
      }
    } catch (error) {
      console.warn('Server not responding yet, continuing to poll...');
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  hideLoadingOverlay();
  showStatus('⚠ Server did not restart within expected time. Please check manually.', 'error');
}

loadColors(true);
