let config = {};
let originalConfig = {};
let secrets = {};
let originalSecrets = {};
let users = {};
let originalUsers = {};
let ddns = {};
let originalDdns = {};
let ecosystem = {};
let originalEcosystem = {};
let advanced = {};
let originalAdvanced = {};
let certs = {};
let originalCerts = {};
let gitStatus = {};
let blocklist = [];
let originalBlocklist = [];
let rebooting = false;
let secretsSaved = false;
let logRotateInstalled = false;
let currentSelection = null;
let currentFileManagerContext = null;
let selectedFiles = new Set();
let allowPopStateNavigation = false;
let currentUrl = window.location.href;

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

function showMobilePanel(panel) {
  const mainContent = document.querySelector('.main-content');
  const servicesBtn = document.getElementById('navServicesBtn');
  const editorBtn = document.getElementById('navEditorBtn');
  
  if (panel === 'services') {
    mainContent.setAttribute('data-mobile-view', 'services');
    servicesBtn.classList.add('active');
    editorBtn.classList.remove('active');
  } else if (panel === 'editor') {
    mainContent.setAttribute('data-mobile-view', 'editor');
    servicesBtn.classList.remove('active');
    editorBtn.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig(true);
  await loadSecrets(true);
  await loadUsers(true);
  await loadBlocklist(true);
  await loadDdns(true);
  await loadEcosystem(true);
  await loadAdvanced(true);
  await loadCerts(true);
  await loadGitStatus(true);
  await loadLogRotateStatus(true);

  renderServicesList();
  renderPlaceholderEditor();

  const urlParams = new URLSearchParams(window.location.search);
  const justUpdated = urlParams.get('updated') === 'true';
  const justRestarted = urlParams.get('restarted') === 'true';
  
  if (justUpdated) {
    urlParams.delete('updated');
    showStatus('Update completed successfully!', 'success');
  }
  if (justRestarted) {
    urlParams.delete('restarted');
    showStatus('Server restarted successfully!', 'success');
  }
  if (justUpdated || justRestarted) {
    const url = new URL(window.location);
    url.search = urlParams.toString();
    window.history.replaceState({}, '', url);
  }
  
  const isFirstTimeSetup = ecosystem.default === true;
  const certStatus = getCertificateStatus();
  const canProvision = certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0;
  const addServiceBtn = document.getElementById('addServiceBtn');

  if (addServiceBtn && (isFirstTimeSetup || !secretsSaved)) {
    addServiceBtn.disabled = true;
  }

  // Add click listener to remove spotlight class from actions container
  document.addEventListener('mousedown', () => {
    const actionsContainer = document.getElementById('editorActionsContainer');
    const spotlightText = document.getElementById('spotlightText');
    if (actionsContainer && actionsContainer.classList.contains('spotlight')) {
      actionsContainer.classList.remove('spotlight');
    }
    if (spotlightText) {
      spotlightText.remove();
    }
  });

  if (isFirstTimeSetup) {
    selectItem('management-application');
  } else if (secretsSaved === false) {
    selectItem('management-secrets');
  } else if (config.domain === '' || config.domain.trim() === '') {
    selectItem('config-domain');
  } else if (canProvision) {
    selectItem('management-certificates');
  } else {
    const section = urlParams.get('section');
    const type = urlParams.get('type');
    const folder = urlParams.get('folder');
    const path = urlParams.get('path');
    
    if (section) {
      const validMonitorSections = ['monitor-logs', 'monitor-blocklist'];
      const validManagementSections = ['management-application', 'management-secrets', 'management-users', 'management-theme', 'management-advanced'];
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
        selectItem(section, type, folder, path, false);
      } else {
        const url = new URL(window.location);
        url.searchParams.delete('section');
        url.searchParams.delete('type');
        url.searchParams.delete('folder');
        url.searchParams.delete('path');
        window.history.replaceState({}, '', url);
      }
    }
  }
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConfirmModal();
      closePromptModal();
    }
  });

  // Prevent navigation away from page if there are unsaved changes
  window.addEventListener('beforeunload', (event) => {
    if (hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = ''; // Required for Chrome
      return ''; // For older browsers
    }
  });

  window.addEventListener('popstate', (event) => {
    if (allowPopStateNavigation) {
      allowPopStateNavigation = false;
      currentUrl = window.location.href;
    } else if (hasUnsavedConfigChanges() || hasUnsavedManagementChanges()) {
      history.pushState(null, '', window.currentUrl);
      showMobilePanel('editor');
      actions = document.getElementById('editorActions');
      actions.insertAdjacentHTML('afterbegin', '<span class="editor-actions-spotlight-text hint" id="spotlightText">Please save your changes or revert them before navigating away.</span>');
      actionsContainer = document.getElementById('editorActionsContainer');
      actionsContainer.classList.add('spotlight');
      return;
    } else {
      currentUrl = window.location.href;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    const type = urlParams.get('type');
    const folder = urlParams.get('folder');
    const path = urlParams.get('path');
    
    if (section) {
      const validMonitorSections = ['monitor-logs', 'monitor-blocklist'];
      const validManagementSections = ['management-application', 'management-secrets', 'management-users', 'management-theme', 'management-advanced'];
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
        selectItem(section, type, folder, path, false);
      }
    } else {
      currentSelection = null;
      renderPlaceholderEditor();
      renderServicesList();
    }
  });

  document.documentElement.classList.add('loaded')
});

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

async function loadUsers(suppressStatus = false) {
  try {
    const response = await fetch('users');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load users`);
    
    const text = await response.text();
    
    if (!text) {
      users = { users: [] };
      originalUsers = JSON.parse(JSON.stringify(users));
      return;
    }
    
    users = JSON.parse(text);
    if (!users.users) users.users = [];
    originalUsers = JSON.parse(JSON.stringify(users));
  } catch (error) {
    console.error('Users load error:', error);
    users = { users: [] };
    originalUsers = JSON.parse(JSON.stringify(users));
    if (!suppressStatus) showStatus('Could not load Users: ' + error.message, 'error');
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
  panel.scrollTop = 0;
  
  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">shield</span> Blocklist Management</div>
      <div class="hint hint-section">Add or remove IP addresses from the blocklist</div>
      <button class="btn-add-field on-top" onclick="addBlocklistEntry()"><span class="material-icons">add_circle</span> Add Blocklist Entry</button>
  `;
  blocklist.forEach((ip, index) => {
    html += `
      <div class="blocklist-entry">
        <div class="form-group form-group-no-margin">
          <label for="blocklist_ip_${index}">Blocked IP Address</label>
          <div class="blocklist-input-group">
            <input type="text" id="blocklist_ip_${index}" value="${ip}" readonly />
            <button class="btn-remove" onclick="removeBlocklistEntry(${index})"><span class="material-icons">remove_circle</span> Remove</button>
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
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertBlocklist()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveBlocklistBtn" onclick="saveBlocklist()"><span class="material-icons">save</span> Save Blocklist</button>
  `;
}

function renderSecretsEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">vpn_key</span> Secrets Management</div>
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
      'api_password_hash': `Admin Password - ${ isExistingHash ? '<span class="material-icons">lock</span> API page is secured behind a login' : '<span class="material-icons warning">warning</span> Providing this will also secure the API page behind a login'}`,
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
          <div class="hint">The email address for the admin user, also used for provisioning certificates</div>`;
    } else if (isPasswordHash) {
      const displayValue = isExistingHash ? '' : value;
      const placeholderText = isExistingHash ? 'Password already set - enter new password to change' : 'Enter new password to hash it automatically';
      const hintText = isExistingHash ? 'Leave empty to keep current password, or enter new password to update' : 'Enter a password here - it will be automatically hashed when saved';
      html += `
          <div class="password-input-group">
            <input type="text" id="secret_${key}" value="${displayValue}"
                class="text-security"
                onchange="updatePasswordHash('${key}', this.value, ${isExistingHash})"
                placeholder="${placeholderText}"
                autocomplete="current-password">
            <button class="btn-toggle-password" onclick="togglePasswordVisibility('secret_${key}', this)"><span class="material-icons">visibility</span> Show</button>
          </div>
          <div class="hint">${hintText}</div>`;
    } else {
      html += `
          <div class="password-input-group">
            <input type="text" id="secret_${key}" value="${value}"
                class="text-security"
                onchange="updateSecret('${key}', this.value)"
                placeholder="Enter MAC address (e.g., 00:1A:2B:3C:4D:5E)"
                autocomplete="current-password">
            <button class="btn-toggle-password" onclick="togglePasswordVisibility('secret_${key}', this)"><span class="material-icons">visibility</span> Show</button>
          </div>
          <div class="hint">The MAC address of the compute platform device</div>`;
    }
    
    html += `
          ${!isDefaultSecret ? `
          <div class="secret-actions">
            <button class="btn-remove" onclick="removeSecret('${key}')"><span class="material-icons">remove_circle</span> Remove Secret</button>
          </div>
          ` : ''}
          ${isExistingHash && key === 'api_password_hash' ? `
          <div class="secret-actions flex-row">
            <button class="btn-remove" onclick="removeSecret('${key}')"><span class="material-icons">remove_circle</span> Remove Password</button>
            <div class="hint margin-left-10"><span class="material-icons warning">warning</span> This will remove the login requirement to view the API page</div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  });

  html += `
      <button class="btn-add-field" onclick="addNewSecret()" style="display: none;"><span class="material-icons">add_circle</span> Add New Secret</button>
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertSecrets()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveSecretsBtn" onclick="saveSecrets()"><span class="material-icons">save</span> Save Secrets</button>
  `;
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (input.style.webkitTextSecurity === 'disc') {
    input.style.webkitTextSecurity = 'none';
    button.innerHTML = '<span class="material-icons">visibility_off</span> Hide';
  } else {
    input.style.webkitTextSecurity = 'disc';
    button.innerHTML = '<span class="material-icons">visibility</span> Show';
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
    '<span class="material-icons">delete_sweep</span> Clear API Credentials',
    'Are you sure you want to remove the API Username and API Password? This will immediately disable API authentication and restart the server.',
    async (confirmed) => {
      if (!confirmed) return;
      await clearApiCredentials();
    }
  );
}

function removeBlocklistEntry(index) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Blocklist Entry',
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
    '<span class="material-icons">remove_circle</span> Remove Secret',
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
    '<span class="material-icons">add_circle</span> Add New Blocklist Entry',
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

      blocklist.unshift(blocklistEntry);
      renderBlocklistEditor();
      showStatus('Blocklist entry added. Save to apply changes.', 'success');
      closePromptModal();
    },
  );
}

function addNewSecret() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add New Secret',
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
    showStatus('Blocklist saved successfully!', 'success');
    showLoadingOverlay('Server Restarting...', 'Blocklist saved. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving blocklist: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Blocklist';
  }
}

async function saveSecrets() {
  const saveBtn = document.getElementById('saveSecretsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

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
    showStatus('Secrets saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Secrets saved. Waiting for the server to restart...');
    await waitForServerRestart();
    
    if (!secretsSaved) {
      selectItem('config-domain');
    }

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving secrets: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Secrets';
  }
}

function revertBlocklist() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Blocklist',
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
    '<span class="material-icons">undo</span> Revert Secrets',
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

function renderUsersEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const authServices = Object.keys(config.services || {}).filter(name => {
    if (name === 'api' || name === 'www') return false;
    return config.services[name]?.subdomain?.requireAuth === true;
  });

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">group</span> User Management</div>
      <div class="hint hint-section">Manage users and their service access. Users can log into services that have "Require Login" enabled. The admin account (from Secrets) always has access to all services.</div>
      <button class="btn-add-field on-top" onclick="addNewUser()"><span class="material-icons">add_circle</span> Add New User</button>
  `;

  if (users.users && users.users.length > 0) {
    users.users.forEach((user, index) => {
      const isExistingHash = user.password_hash && user.password_hash.startsWith('$2b$');
      html += `
      <div class="secret-entry user-entry">
        <div class="form-group">
          <label for="user_username_${index}">Username</label>
          <input type="text" id="user_username_${index}" value="${user.username || ''}" 
              onchange="updateUser(${index}, 'username', this.value)"
              autocomplete="off"
              placeholder="Enter username">
          <div class="hint">UUID: ${user.uuid || 'Will be generated on save'}</div>
        </div>
        <div class="form-group">
          <label for="user_password_${index}">Password</label>
          <div class="password-input-group">
            <input type="text" id="user_password_${index}" value="${isExistingHash ? '' : (user.password_hash || '')}"
                class="text-security"
                onchange="updateUserPassword(${index}, this.value)"
                placeholder="${isExistingHash ? 'Password set - enter new to change' : 'Enter password'}"
                autocomplete="new-password">
            <button class="btn-toggle-password" onclick="togglePasswordVisibility('user_password_${index}', this)"><span class="material-icons">visibility</span> Show</button>
          </div>
          <div class="hint">${isExistingHash ? 'Leave empty to keep current password' : 'Password will be hashed when saved'}</div>
        </div>
        <div class="form-group">
          <p class="label color-primary" onclick="toggleDropdown('user_services_select_${index}', event)">Service Access</p>
          ${createDropdown({
            id: `user_services_select_${index}`,
            items: [
              {
                value: '*',
                label: '<span class="material-icons">star</span> All Services',
                selected: user.services?.includes('*'),
                special: 'all-services'
              },
              ...authServices.map(serviceName => ({
                value: serviceName,
                label: config.services[serviceName]?.nicename || serviceName,
                selected: user.services?.includes(serviceName) && !user.services?.includes('*'),
                disabled: user.services?.includes('*')
              })),
              ...(authServices.length === 0 ? [{
                value: '_no_services',
                label: 'No services with "Require Login" configured',
                disabled: true
              }] : [])
            ],
            multiSelect: true,
            placeholder: 'Select services...',
            onChange: `onUserServicesChange_${index}`
          })}
          <div class="hint">Choose "<span class="material-icons star">star</span> All Services" for full access or select individual services this user can access</div>
        </div>
        <div class="secret-actions">
          <button class="btn-remove" onclick="removeUser(${index})"><span class="material-icons">remove_circle</span> Remove User</button>
        </div>
      </div>
      `;
    });
  } else {
    html += `
      <div class="hint">No users configured. Add a user to allow login to protected services.</div>
    `;
  }

  html += `
    </div>
  `;
  
  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertUsers()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveUsersBtn" onclick="saveUsers()"><span class="material-icons">save</span> Save Users</button>
  `;
  
  // Create onChange handlers for each user's service selector
  if (users.users && users.users.length > 0) {
    users.users.forEach((user, index) => {
      createUserServicesChangeHandler(index);
    });
  }
}

// Create onChange handler for user services dropdown
function createUserServicesChangeHandler(index) {
  window[`onUserServicesChange_${index}`] = function(selectedValues) {
    if (!users.users[index]) return;
    
    const hasAllServices = selectedValues.includes('*');
    
    if (hasAllServices) {
      // If "All Services" is selected, set to only that
      users.users[index].services = ['*'];
    } else {
      // Filter out the placeholder and set selected services
      users.users[index].services = selectedValues.filter(v => v !== '_no_services');
    }
    
    // Re-render to update disabled states when * is selected/deselected
    renderUsersEditor();
  };
}

function updateUser(index, field, value) {
  if (!users.users[index]) return;
  users.users[index][field] = value;
}

function updateUserPassword(index, value) {
  if (!users.users[index]) return;
  if (value.trim() !== '') {
    users.users[index].password_hash = value;
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

document.addEventListener('click', function(event) {
  if (!event.target.closest('.multi-select')) {
    document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
  }
});

/* REUSABLE DROPDOWN COMPONENT */
/**
 * Creates a reusable dropdown component that supports both single-select and multi-select modes
 * @param {Object} options Configuration object
 * @param {string} options.id Unique identifier for the dropdown
 * @param {Array} options.items Array of items with {value, label, [selected], [disabled], [special]} properties
 * @param {boolean} options.multiSelect Whether to allow multiple selections (default: false)
 * @param {string} options.placeholder Placeholder text when nothing is selected
 * @param {string} options.onChange Name of the callback function to call when selection changes
 * @param {boolean} options.disabled Whether the dropdown is disabled (default: false)
 * @returns {string} HTML string for the dropdown
 */
function createDropdown(options) {
  const {
    id,
    items = [],
    multiSelect = false,
    placeholder = 'Select...',
    onChange = null,
    disabled = false
  } = options;

  const selectedItems = items.filter(item => item.selected);
  const hasSelection = selectedItems.length > 0;
  
  // Generate display content
  let displayContent;
  if (!hasSelection) {
    displayContent = `<span class="multi-select-placeholder">${placeholder}</span>`;
  } else if (multiSelect) {
    displayContent = selectedItems.map(item => {
      const specialClass = item.special ? ` ${item.special}` : '';
      return `<span class="multi-select-tag${specialClass}"><span>${item.label}</span><span class="multi-select-tag-remove" onclick="removeDropdownTag('${id}', '${item.value}', event)"><span class="material-icons">close</span></span></span>`;
    }).join('');
  } else {
    // Single-select mode: show selected value as plain text
    displayContent = `<span class="multi-select-selected-text">${selectedItems[0].label}</span>`;
  }

  // Generate options HTML
  const optionsHtml = items.map(item => {
    const isSelected = item.selected ? 'selected' : '';
    const isDisabled = item.disabled ? 'disabled' : '';
    const specialClass = item.special ? ` ${item.special}` : '';
    return `
      <div class="multi-select-option ${isSelected} ${isDisabled}${specialClass}" 
          data-value="${item.value}" onclick="selectDropdownOption('${id}', '${item.value}', ${multiSelect}, event)">
        ${multiSelect ? '<div class="multi-select-checkbox"></div>' : ''}
        <span class="multi-select-label">${item.label}</span>
      </div>
    `;
  }).join('');

  const onchangeAttr = onChange ? ` data-onchange="${onChange}"` : '';
  const disabledClass = disabled ? ' disabled' : '';
  const modeClass = multiSelect ? ' multi-select-multi' : ' multi-select-single';
  
  return `
    <div class="multi-select${modeClass}${disabledClass}" id="${id}" onclick="toggleDropdown('${id}', event)"${onchangeAttr}>
      <div class="multi-select-display">
        ${displayContent}
      </div>
      <div class="multi-select-dropdown">
        ${optionsHtml}
      </div>
    </div>
  `;
}
/**
 * Toggles a dropdown open/closed
 */
function toggleDropdown(id, event) {
  event.stopPropagation();
  
  if (event.target.closest('.multi-select-option') || event.target.closest('.multi-select-tag-remove')) {
    return;
  }
  
  const select = document.getElementById(id);
  if (!select || select.classList.contains('disabled')) return;
  
  const wasOpen = select.classList.contains('open');
  
  // Close all other dropdowns
  document.querySelectorAll('.multi-select.open').forEach(el => {
    el.classList.remove('open');
    const dropdown = el.querySelector('.multi-select-dropdown');
    if (dropdown) dropdown.classList.remove('drop-up');
  });

  if (!wasOpen) {
    select.classList.add('open');
    const dropdown = select.querySelector('.multi-select-dropdown');

    if (dropdown) {
      const rect = select.getBoundingClientRect();
      const dropdownHeight = Math.min(480, dropdown.scrollHeight);
      
      // Find the scrollable container (editor panel or other scrollable parent)
      let scrollableContainer = select.closest('.editor-panel-pane, .sidebar-scrollable');
      
      let spaceBelow, spaceAbove;
      
      if (scrollableContainer) {
        const containerRect = scrollableContainer.getBoundingClientRect();
        spaceBelow = containerRect.bottom - rect.bottom;
        spaceAbove = rect.top - containerRect.top;
      } else {
        spaceBelow = window.innerHeight - rect.bottom;
        spaceAbove = rect.top;
      }
      
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        dropdown.classList.add('drop-up');
      } else {
        dropdown.classList.remove('drop-up');
      }
    }
  }
}

/**
 * Handles option selection in dropdown
 */
function selectDropdownOption(id, value, multiSelect, event) {
  event.stopPropagation();
  
  const select = document.getElementById(id);
  if (!select) return;
  
  const option = event.target.closest('.multi-select-option');
  if (option?.classList.contains('disabled')) return;
  
  const onchangeCallback = select.getAttribute('data-onchange');
  
  if (multiSelect) {
    // Multi-select mode: toggle the option
    if (option.classList.contains('selected')) {
      option.classList.remove('selected');
    } else {
      option.classList.add('selected');
    }
    
    // Get all selected values
    const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
    const selectedValues = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
    
    // Update display
    updateDropdownDisplay(id, multiSelect);
    
    // Call onChange callback if provided
    if (onchangeCallback) {
      window[onchangeCallback](selectedValues);
    }
  } else {
    // Single-select mode: select only this option and close dropdown
    select.querySelectorAll('.multi-select-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');
    
    // Update display
    updateDropdownDisplay(id, multiSelect);
    
    // Close dropdown
    select.classList.remove('open');
    
    // Call onChange callback if provided
    if (onchangeCallback) {
      window[onchangeCallback](value);
    }
  }
}

/**
 * Removes a tag from a multi-select dropdown
 */
function removeDropdownTag(id, value, event) {
  event.stopPropagation();
  
  const select = document.getElementById(id);
  if (!select) return;
  
  const option = select.querySelector(`.multi-select-option[data-value="${value}"]`);
  if (option) {
    option.classList.remove('selected');
  }
  
  // Update display
  updateDropdownDisplay(id, true);
  
  // Call onChange callback if provided
  const onchangeCallback = select.getAttribute('data-onchange');
  if (onchangeCallback) {
    const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
    const selectedValues = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
    window[onchangeCallback](selectedValues);
  }
}

/**
 * Updates the display of a dropdown based on current selection
 */
function updateDropdownDisplay(id, multiSelect) {
  const select = document.getElementById(id);
  if (!select) return;
  
  const display = select.querySelector('.multi-select-display');
  const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
  
  if (selectedOptions.length === 0) {
    const placeholder = select.getAttribute('data-placeholder') || 'Select...';
    display.innerHTML = `<span class="multi-select-placeholder">${placeholder}</span>`;
  } else if (multiSelect) {
    // Multi-select: show tags
    const tags = Array.from(selectedOptions).map(option => {
      const value = option.getAttribute('data-value');
      const label = option.querySelector('.multi-select-label').textContent;
      const specialClasses = Array.from(option.classList).filter(c => 
        c !== 'multi-select-option' && c !== 'selected' && c !== 'disabled'
      ).join(' ');
      const specialClass = specialClasses ? ` ${specialClasses}` : '';
      return `<span class="multi-select-tag${specialClass}"><span>${label}</span><span class="multi-select-tag-remove" onclick="removeDropdownTag('${id}', '${value}', event)"><span class="material-icons">close</span></span></span>`;
    }).join('');
    display.innerHTML = tags;
  } else {
    // Single-select: show text
    const label = selectedOptions[0].querySelector('.multi-select-label').textContent;
    display.innerHTML = `<span class="multi-select-selected-text">${label}</span>`;
  }
}

/**
 * Gets the selected value(s) from a dropdown
 */
function getDropdownValue(id) {
  const select = document.getElementById(id);
  if (!select) return null;
  
  const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
  const values = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
  
  const isMulti = select.classList.contains('multi-select-multi');
  return isMulti ? values : (values[0] || null);
}

/**
 * Sets the selected value(s) for a dropdown
 */
function setDropdownValue(id, value) {
  const select = document.getElementById(id);
  if (!select) return;
  
  const isMulti = select.classList.contains('multi-select-multi');
  const values = Array.isArray(value) ? value : [value];
  
  // Clear all selections
  select.querySelectorAll('.multi-select-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  
  // Set new selections
  values.forEach(val => {
    const option = select.querySelector(`.multi-select-option[data-value="${val}"]`);
    if (option) {
      option.classList.add('selected');
    }
  });
  
  // Update display
  updateDropdownDisplay(id, isMulti);
}

function addNewUser() {
  if (!users.users) users.users = [];
  users.users.unshift({
    uuid: generateUUID(),
    username: '',
    password_hash: '',
    services: []
  });
  renderUsersEditor();
  showStatus('New user added. Fill in details and save.', 'success');
}

function removeUser(index) {
  const username = users.users[index]?.username || 'this user';
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove User',
    `Are you sure you want to remove ${username}?`,
    (confirmed) => {
      if (confirmed) {
        users.users.splice(index, 1);
        renderUsersEditor();
        showStatus('User removed', 'success');
      }
    }
  );
}

function revertUsers() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Users',
    'Are you sure you want to discard all changes to users?',
    (confirmed) => {
      if (confirmed) {
        users = JSON.parse(JSON.stringify(originalUsers));
        renderUsersEditor();
        showStatus('Users changes reverted', 'success');
      }
    }
  );
}

async function saveUsers() {
  try {
    saveBtn = document.getElementById('saveUsersBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    for (const user of users.users) {
      if (!user.username || user.username.trim() === '') {
        showStatus('All users must have a username', 'error');
        return;
      }
      if (!user.password_hash || user.password_hash.trim() === '') {
        showStatus(`User ${user.username} must have a password`, 'error');
        return;
      }
    }

    const response = await fetch('users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(users)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }
    
    originalUsers = JSON.parse(JSON.stringify(users));
    showStatus('Users saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Users saved. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    const message = parseErrorMessage(error);
    showStatus('<span class="material-icons">error</span> Failed to save users: ' + message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Users';
  }
}

function renderDdnsEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const isActive = ddns.active || false;
  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">public</span> Dynamic DNS Configuration</div>
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
              ${isSecret ? 'class="text-security"' : ''}
            />
    `;
    
    if (isSecret) {
      html += `
            <button 
              class="btn-toggle-password" 
              onclick="togglePasswordVisibility('ddns_${key}', this)"
            ><span class="material-icons">visibility</span> Show</button>
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
      <div class="section-title section-title-spaced"><span class="material-icons">view_list</span> Required IAM Policy</div>
      <div class="hint hint-section">Use this policy when creating your IAM user in AWS. This grants the minimum permissions needed for Dynamic DNS updates.</div>
      <div class="setup-box iam-roles">
        <pre class="setup-record-content">${JSON.stringify(iamPolicy, null, 2)}</pre>
      </div>
  `;

  html += `
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertDdns()"><span class="material-icons">undo</span> Revert Changes</button>
    <button class="btn-save" id="saveDdnsBtn" onclick="saveDdns()"><span class="material-icons">save</span> Save DDNS Config</button>
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
    showStatus('DDNS config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'DDNS config saved. Waiting for the server to restart...');
    await waitForServerRestart();
    
    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving DDNS config: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save DDNS Config';
  }
}

function revertDdns() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert DDNS Config',
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
      showStatus('Theme and favicon saved successfully!', 'success');
    } else {
      showStatus('Theme colors saved successfully!', 'success');
    }
  } catch (error) {
    console.error('Failed to save theme:', error);
    showStatus('Failed to save theme: ' + error.message, 'error');
  }
}

function renderThemeEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">palette</span> Theme Customization</div>
      <div class="hint hint-section">Customize colors and favicon for the configurator interface.</div>
      <div class="grid-two-column">
        <div>
          <div class="subsection-heading"><strong><span class="material-icons">brush</span> Colors</strong></div>
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
          <div class="subsection-heading"><strong><span class="material-icons">image</span> Favicon</strong></div>
          <div class="form-group">
            <label for="faviconUpload">Upload New Favicon</label>
            <input type="file" id="faviconUpload" accept="image/png" class="file-input-hidden">
            <button class="btn-add-field no-top" onclick="document.getElementById('faviconUpload').click()"><span class="material-icons">upload_file</span> Choose File</button>
            <span id="faviconFileName" class="file-name-display"></span>
            <div class="hint">PNG format only, up to 512x512 pixels</div>
          </div>
          <div class="favicon-preview-container">
            <label class="favicon-label">Current Favicon</label>
            <div id="currentFaviconContainer">
              <img id="currentFavicon" src="/global/favicon/favicon-original.png?t=${new Date().getTime()}" class="favicon-image" onerror="this.style.display='none'; document.getElementById('noFaviconWarning').style.display='flex';">
              <div id="noFaviconWarning" class="favicon-warning">
                <div class="favicon-warning-icon"><span class="material-icons warning">warning</span></div>
                <div class="favicon-warning-title">No Favicon</div>
                <div class="favicon-warning-text">Upload a PNG</div>
              </div>
            </div>
          </div>
          <div id="faviconPreview" class="favicon-preview-container" style="display: none;">
            <label class="favicon-label">Preview</label>
            <img id="faviconPreviewImg" class="favicon-image">
          </div>
        </div>
      </div>
    </div>
  `;
  
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertColors()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveThemeBtn" onclick="saveTheme()"><span class="material-icons">save</span> Save Theme</button>
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

    showStatus('Log Rotate Module Installed!', 'success');

    showLoadingOverlay('Server Restarting...', 'Log Rotate Module Installed. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error installing Log Rotate Module, you may have to do it manually: ' + parseErrorMessage(error), 'error');
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
        <span class="update-icon material-icons">sync</span>
        <span class="update-text">Force Update</span>
      </button>
    `;
  } else {
    versionInfo.innerHTML = `
      <button class="btn-update" id="updateBtn" onclick="handleUpdate()" title="${isFirstTimeSetup ? 'Complete application setup first' : 'Check for updates'}" ${isFirstTimeSetup ? 'disabled' : ''}>
        <span class="update-icon material-icons"${isFirstTimeSetup ? ' style="display:none"' : ''}>sync</span>
        <span class="update-text">${isFirstTimeSetup ? 'Initial Setup' : 'Checking...'}</span>
      </button>
    `;
  }

  versionInfo.innerHTML += `
    <span class="version-number">${versionNumber}</span>
  `;
}

async function checkForUpdates() {
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
      '<span class="material-icons">system_update_alt</span> Force Update',
      'Are you sure you want to force an update? This will discard any local changes and pull the latest version from the repository. The server will restart after updating. Continue?',
      () => pullUpdates(true)
    );
  } else if (hasUpdates) {
    showConfirmModal(
      '<span class="material-icons">update</span> Update Available',
      'A new version is available. The server will restart after updating. Continue?',
      () => pullUpdates()
    );
  } else {
    checkForUpdates();
  }
}

async function pullUpdates(force) {
  const updateBtn = document.getElementById('updateBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMessage = document.getElementById('loadingMessage');
  
  loadingTitle.textContent = 'Updating...';
  loadingMessage.textContent = 'Pulling latest changes and restarting the server. This may take a minute.';
  loadingOverlay.classList.add('active');
  updateBtn.disabled = true;

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
    
    reloadPage(true);
  } catch (error) {
    console.error('Update error:', error);
    loadingOverlay.classList.remove('active');
    showStatus('Update failed: ' + error.message, 'error');
  } finally {
    updateBtn.disabled = false;
  }
}

function renderApplicationEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const appName = ecosystem.apps && ecosystem.apps[0] ? ecosystem.apps[0].name : 'Reverse Proxy';
  const isDefault = ecosystem.default === true;
  const buttonText = isDefault ? 'Generate Application Settings' : 'Save Application Settings';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">build</span> Application Settings</div>
      <div class="hint hint-section">Configure your application's display name used by PM2.</div>
      <div class="app-entry">
        <div class="form-group form-group-no-margin">
          <label for="appNameInput">Application Name</label>
          <input type="text" id="appNameInput" placeholder="Enter a nicename for the application (e.g., My Proxy Server)" value="${appName}" onchange="updateEcosystemName(this.value)">
          <div class="hint">This name appears in PM2 process list</div>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertEcosystem()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveEcosystemBtn" onclick="saveEcosystem()"><span class="material-icons">save</span> ${buttonText}</button>
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

    if (ecosystemToSave.apps && Array.isArray(ecosystemToSave.apps)) {
      ecosystemToSave.apps = ecosystemToSave.apps.map(app => {
        if (app.ignore_watch) {
          delete app.ignore_watch;
        }
        app.watch = false;
        return app;
      });
    }
    
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
    showStatus('Application settings saved successfully!', 'success');

    showLoadingOverlay('Server Restarting...', 'Application settings saved. Waiting for the server to restart...');
    await waitForServerRestart();

    if (isDefault) {
      selectItem('management-secrets');
    } else if (currentSelection) {
      selectItem(currentSelection);
    }
    
    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving application settings: ' + parseErrorMessage(error), 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = isDefault ? 'Generate Application Settings' : 'Save Application Settings';
  }
}

function revertEcosystem() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Application Settings',
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
  panel.scrollTop = 0;

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
          <button class="btn-remove" onclick="removeAdvancedParser('${key}')"><span class="material-icons">remove_circle</span> Remove</button>
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
          <button class="btn-remove" onclick="removeAdvancedExtractor('${key}')"><span class="material-icons">remove_circle</span> Remove</button>
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
          <button class="btn-remove advanced-remove-btn" onclick="removeAdvancedQueryType(${index})"><span class="material-icons">remove_circle</span> Remove</button>
        </div>
      `;
    });
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">science</span> Advanced Configuration</div>
      <div class="hint hint-section">Configure custom parsers, extractors, and GameDig query types. These are advanced features for extending healthcheck functionality.</div>
    </div>
    <div class="section">
      <div class="section-title">HTTP Response Body Parsers</div>
      <div class="hint hint-section">Custom parsers for HTTP healthchecks. Must be valid JavaScript function code that takes (body) as parameter and returns boolean.</div>
      ${parsersHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedParser()"><span class="material-icons">add_circle</span> Add Parser</button>
    </div>
    <div class="section">
      <div class="section-title">Metadata Extractors</div>
      <div class="hint hint-section">Custom extractors for pulling metadata from healthcheck responses. Must be valid JavaScript function code that takes (state) as parameter and returns object with online, max, version properties.</div>
      ${extractorsHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedExtractor()"><span class="material-icons">add_circle</span> Add Extractor</button>
    </div>
    <div class="section">
      <div class="section-title">GameDig Query Types</div>
      <div class="hint hint-section">Supported game types for GameDig healthchecks (e.g., "mbe", "valheim").</div>
      ${queryTypesHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedQueryType()"><span class="material-icons">add_circle</span> Add Query Type</button>
    </div>
  `;

  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertAdvanced()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveAdvancedBtn" onclick="saveAdvanced()"><span class="material-icons">save</span> Save Advanced Config</button>
  `;
}

function addAdvancedParser() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add Parser',
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
    '<span class="material-icons">add_circle</span> Add Extractor',
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
    '<span class="material-icons">add_circle</span> Add Query Type',
    'Enter the query type name:',
    'Valid gamedig query type',
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
    '<span class="material-icons">remove_circle</span> Remove Parser',
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
    '<span class="material-icons">remove_circle</span> Remove Extractor',
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
    '<span class="material-icons">remove_circle</span> Remove Query Type',
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
    
    reloadPage();
  } catch (error) {
    console.error('Advanced config save error:', error);
    showStatus('Save failed: ' + error.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Advanced Config';
  }
}

function revertAdvanced() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Changes',
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

function getServiceIcon(serviceType) {
  switch(serviceType) {
    case 'index': return '<span class="material-icons">description</span>';
    case 'proxy': return '<span class="material-icons">swap_horiz</span>';
    case 'dirlist': return '<span class="material-icons">folder_open</span>';
    case 'spa': return '<span class="material-icons">flash_on</span>';
    default: return '<span class="material-icons">settings</span>';
  }
}

function renderServicesList() {
  const list = document.getElementById('servicesList');
  
  // Build all content in a DocumentFragment to preserve scroll position
  const fragment = document.createDocumentFragment();
  
  const isFirstTimeSetup = ecosystem.default === true;
  const certStatus = getCertificateStatus();
  const canProvision = certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0;
  const needsApplicationResave = ecosystem.resave;
  const hasAdminEmail = secrets.admin_email_address && secrets.admin_email_address.trim() !== '';
  const hasDomain = config.domain && config.domain.trim() !== '';
  const secretsEnabled = !isFirstTimeSetup;
  const certificatesEnabled = !isFirstTimeSetup && hasAdminEmail && hasDomain;
  const usersEnabled = secretsEnabled && !isFirstTimeSetup && secretsSaved;
  const ddnsEnabled = !isFirstTimeSetup && hasDomain;

  const monitorHeader = document.createElement('h2');
  monitorHeader.textContent = 'Activity Monitor';
  fragment.appendChild(monitorHeader);

  const logsItem = document.createElement('div');
  logsItem.className = 'service-item' + (currentSelection === 'monitor-logs' ? ' active' : '');
  logsItem.innerHTML = '<span class="material-icons">article</span> Logs';
  if (isFirstTimeSetup) {
    logsItem.style.opacity = '0.5';
    logsItem.style.cursor = 'default';
    logsItem.style.pointerEvents = 'none';
    logsItem.onclick = null;
  } else {
    logsItem.onclick = () => selectItem('monitor-logs');
  }
  fragment.appendChild(logsItem);

  const blocklistItem = document.createElement('div');
  blocklistItem.className = 'service-item' + (currentSelection === 'monitor-blocklist' ? ' active' : '');
  blocklistItem.innerHTML = '<span class="material-icons">shield</span> Blocklist';
  if (isFirstTimeSetup) {
    blocklistItem.style.opacity = '0.5';
    blocklistItem.style.cursor = 'default';
    blocklistItem.style.pointerEvents = 'none';
    blocklistItem.onclick = null;
  } else {
    blocklistItem.onclick = () => selectItem('monitor-blocklist');
  }
  fragment.appendChild(blocklistItem);

  const managementHeader = document.createElement('h2');
  managementHeader.textContent = 'Management';
  fragment.appendChild(managementHeader);

  const appItem = document.createElement('div');
  appItem.className = 'service-item' + (currentSelection === 'management-application' ? ' active' : '') + (needsApplicationResave ? ' insecure' : '');
  appItem.innerHTML = '<span class="material-icons">build</span> Application' + (needsApplicationResave ? ' <span class="hint">Resave to apply PM2 update</span>' : '');;
  appItem.onclick = () => selectItem('management-application');
  fragment.appendChild(appItem);

  const secretsItem = document.createElement('div');
  secretsItem.className = 'service-item' + (currentSelection === 'management-secrets' ? ' active' : '');
  secretsItem.innerHTML = '<span class="material-icons">vpn_key</span> Secrets';
  if (!secretsEnabled) {
    secretsItem.style.opacity = '0.5';
    secretsItem.style.cursor = 'default';
    secretsItem.style.pointerEvents = 'none';
    secretsItem.onclick = null;
  } else {
    secretsItem.onclick = () => selectItem('management-secrets');
  }
  fragment.appendChild(secretsItem);

  const usersItem = document.createElement('div');
  usersItem.className = 'service-item' + (currentSelection === 'management-users' ? ' active' : '');
  usersItem.innerHTML = '<span class="material-icons">group</span> Users';
  if (!usersEnabled) {
    usersItem.style.opacity = '0.5';
    usersItem.style.cursor = 'default';
    usersItem.style.pointerEvents = 'none';
    usersItem.onclick = null;
  } else {
    usersItem.onclick = () => selectItem('management-users');
  }
  fragment.appendChild(usersItem);

  const certsItem = document.createElement('div');
  certsItem.className = 'service-item' + (currentSelection === 'management-certificates' ? ' active' : '') + (canProvision ? ' insecure' : '');
  certsItem.innerHTML = '<span class="material-icons">lock</span> Certificates' + (canProvision ? ' <span class="hint">Provisioning Needed</span>' : '');
  if (!certificatesEnabled) {
    certsItem.style.opacity = '0.5';
    certsItem.style.cursor = 'default';
    certsItem.style.pointerEvents = 'none';
    certsItem.onclick = null;
  } else {
    certsItem.onclick = () => selectItem('management-certificates');
  }
  fragment.appendChild(certsItem);

  const ddnsItem = document.createElement('div');
  ddnsItem.className = 'service-item' + (currentSelection === 'management-ddns' ? ' active' : '');
  ddnsItem.innerHTML = '<span class="material-icons">public</span> Dynamic DNS';
  if (!ddnsEnabled) {
    ddnsItem.style.opacity = '0.5';
    ddnsItem.style.cursor = 'default';
    ddnsItem.style.pointerEvents = 'none';
    ddnsItem.onclick = null;
  } else {
    ddnsItem.onclick = () => selectItem('management-ddns');
  }
  fragment.appendChild(ddnsItem);

  const themeItem = document.createElement('div');
  themeItem.className = 'service-item' + (currentSelection === 'management-theme' ? ' active' : '');
  themeItem.innerHTML = '<span class="material-icons">palette</span> Theme';
  if (isFirstTimeSetup || !secretsSaved) {
    themeItem.style.opacity = '0.5';
    themeItem.style.cursor = 'default';
    themeItem.style.pointerEvents = 'none';
    themeItem.onclick = null;
  } else {
    themeItem.onclick = () => selectItem('management-theme');
  }
  fragment.appendChild(themeItem);

  const advancedItem = document.createElement('div');
  advancedItem.className = 'service-item' + (currentSelection === 'management-advanced' ? ' active' : '');
  advancedItem.innerHTML = '<span class="material-icons">science</span> Advanced';
  if (isFirstTimeSetup || !secretsSaved) {
    advancedItem.style.opacity = '0.5';
    advancedItem.style.cursor = 'default';
    advancedItem.style.pointerEvents = 'none';
    advancedItem.onclick = null;
  } else {
    advancedItem.onclick = () => selectItem('management-advanced');
  }
  fragment.appendChild(advancedItem);

  const configHeader = document.createElement('h2');
  configHeader.textContent = 'Configuration';
  fragment.appendChild(configHeader);

  const domainItem = document.createElement('div');
  const domainName = config.domain;
  domainItem.className = 'service-item' + (currentSelection === 'config-domain' ? ' active' : '');
  domainItem.innerHTML = `<span class="material-icons">public</span> <span id="domainNameContainer" class="name-container"><span class="subdomain-name-container">Domain</span>${domainName ? `<span class="nicename-name-container"> - ${domainName}</span>` : ''}</span>`;
  if (isFirstTimeSetup || !secretsSaved) {
    domainItem.style.opacity = '0.5';
    domainItem.style.cursor = 'default';
    domainItem.style.pointerEvents = 'none';
    domainItem.onclick = null;
  } else {
    domainItem.onclick = () => selectItem('config-domain');
  }
  fragment.appendChild(domainItem);

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
  
  const itemsToProcess = [];
  
  sortedServices.forEach(serviceName => {
    const nicename = config.services[serviceName]?.nicename;
    const rootService = !config.rootservice && serviceName === 'www' || config.rootservice === serviceName;
    const item = document.createElement('div');
    const protocol = config.services[serviceName]?.subdomain?.protocol;
    const serviceType = config.services[serviceName].subdomain?.type;
    const icon = getServiceIcon(serviceType);

    item.className = 'service-item' + (currentSelection === 'config-' + serviceName ? ' active' : '') + (protocol === 'insecure' ? ' insecure' : '') + (rootService ? ' root-service' : '');

    const hintParts = [];
    if (rootService) {
      hintParts.push('Root Service');
    }
    if (config.services[serviceName].subdomain?.protocol === 'insecure') {
      hintParts.push('Not Secure');
    }

    item.innerHTML = `${icon} <span id="${serviceName}NameContainer" class="name-container"><span class="subdomain-name-container">${serviceName}</span>${nicename ? `<span class="nicename-container"> - ${nicename}</span>` : ''}</span>` + (hintParts.length > 0 ? ' <span class="hint">' + hintParts.join(', ') + '</span>' : '');

    if (isFirstTimeSetup || !secretsSaved) {
      item.style.opacity = '0.5';
      item.style.cursor = 'default';
      item.style.pointerEvents = 'none';
      item.onclick = null;
    } else {
      item.onclick = () => selectItem('config-' + serviceName);
    }
    fragment.appendChild(item);

    if (nicename) {
      itemsToProcess.push({ serviceName, nicename });
    }
  });
  
  itemsToProcess.push({ serviceName: 'domain', nicename: domainName });

  list.innerHTML = '';
  list.appendChild(fragment);
  
  itemsToProcess.forEach(({ serviceName, nicename }) => {
    const serviceNameContainer = document.getElementById(serviceName + 'NameContainer');
    if (serviceNameContainer && serviceNameContainer.offsetWidth < serviceNameContainer.scrollWidth) {
      serviceNameContainer.setAttribute('title', nicename);
    }
  });
}

function selectItem(prefixedName, type, folder, path, pushState = true) {
  if (pushState && currentSelection && currentSelection !== prefixedName) {
    if (!canNavigateAway(currentSelection, prefixedName)) {
      showMobilePanel('editor');
      actions = document.getElementById('editorActions');
      actions.insertAdjacentHTML('afterbegin', '<span class="editor-actions-spotlight-text hint" id="spotlightText">Please save your changes or revert them before navigating away.</span>');
      actionsContainer = document.getElementById('editorActionsContainer');
      actionsContainer.classList.add('spotlight');
      return;
    }
  }
  
  currentSelection = prefixedName;
  
  if (pushState) {
    const url = new URL(window.location);
    url.searchParams.set('section', prefixedName);
    url.searchParams.delete('type');
    url.searchParams.delete('folder');
    url.searchParams.delete('path');
    window.history.pushState({}, '', url);
    
    if (currentUrl !== undefined) {
      currentUrl = window.location.href;
    }
  }

  renderServicesList();
  
  const itemName = prefixedName.replace(/^(management-|config-)/, '');
  
  if (prefixedName === 'config-domain') {
    renderDomainEditor();
  } else if (prefixedName === 'management-application') {
    renderApplicationEditor();
  } else if (prefixedName === 'management-certificates') {
    renderCertificatesEditor();
  } else if (prefixedName === 'management-secrets') {
    renderSecretsEditor();
  } else if (prefixedName === 'management-users') {
    renderUsersEditor();
  } else if (prefixedName === 'management-ddns') {
    renderDdnsEditor();
  } else if (prefixedName === 'management-theme') {
    renderThemeEditor();
  } else if (prefixedName === 'management-advanced') {
    renderAdvancedEditor();
  } else if (prefixedName === 'monitor-logs') {
    renderLogsViewer(type, pushState);
  } else if (prefixedName === 'monitor-blocklist') {
    renderBlocklistEditor();
  } else if (prefixedName.startsWith('config-')) {
    if (folder) {
      renderFileManager(itemName, folder, path, pushState);
    } else {
      renderServiceEditor(itemName);
    }
  } else {
    renderPlaceholderEditor();
  }

  // Switch to editor panel on mobile when an item is selected
  if (window.innerWidth <= 1024) {
    showMobilePanel('editor');
  }

  if (prefixedName !== 'monitor-logs' && eventSource) {
    eventSource.close();
  }
}

function renderPlaceholderEditor(message = 'Select an item from the sidebar to view or edit its settings.', actionsHtml = '') {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  panel.classList.remove('scrollable');
  panel.innerHTML = `
    <div class="placeholder-message">
      <p>${message}</p>
    </div>
  `;
  if (!actionsHtml || actionsHtml.trim() === '') {
    actions.classList.add('hidden');
  } else {
    actions.classList.remove('hidden');
  }

  actions.innerHTML = actionsHtml;
}


function renderLogsViewer(type = 'out', pushState = true) {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const url = new URL(window.location);

  if (pushState) {
    url.searchParams.set('type', type);
    window.history.pushState({}, '', url);
  }

  actions.classList.add('hidden');
  panel.classList.remove('scrollable');

  let html = `
    <div class="section logs-section">
      <div class="section-title"><span class="material-icons">article</span> Activity Logs</div>
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
          <button class="tab-log-type${type === 'out' ? ' active' : ''}" id="btnLogOut" onclick="selectItem('monitor-logs', 'out')"><span class="material-icons">terminal</span> Standard Output</button>
          <button class="tab-log-type${type === 'error' ? ' active' : ''}" id="btnLogErr" onclick="selectItem('monitor-logs', 'error')"><span class="material-icons">error</span> Error Output</button>
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
  panel.scrollTop = 0;
  const isEmpty = !config.domain || config.domain.trim() === '';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  // Build service options list (services with subdomain type index or spa, except api)
  const serviceOptions = Object.keys(config.services || {})
    .filter(name => {
      if (name === 'api') return false;
      const service = config.services[name];
      const subdomainType = service?.subdomain?.type;
      return subdomainType === 'index' || subdomainType === 'spa';
    })
    .sort()
    .map(name => {
      const nicename = config.services[name]?.nicename;
      const selected = (config.rootservice || 'www') === name;
      return {
        value: name,
        label: `${name}${nicename ? ` - ${nicename}` : ''}`,
        selected: selected
      };
    });

  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">public</span> Domain Settings</div>
      <div class="hint hint-section">Configure your primary domain</div>
      <div class="domain-entry${isEmpty ? ' highlight-required' : ''}">
        <div class="form-group">
          <label for="domainInput">Domain Name</label>
          <input type="text" id="domainInput" placeholder="example.com" value="${config.domain || ''}" onchange="updateConfig('domain', this.value)">
          <div class="hint">Primary domain name for your services, without "www" or any subdomains</div>
        </div>
        <div class="form-group form-group-no-margin">
          <p class="label" onclick="toggleDropdown('rootServiceSelect', event)">Serve at Root</p>
          ${createDropdown({
            id: 'rootServiceSelect',
            items: serviceOptions,
            placeholder: 'Select service...',
            onChange: 'onRootServiceChange'
          })}
          <div class="hint">The service that will be served at the root domain (e.g., ${config.domain || 'example.com'})</div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title"><span class="material-icons">cell_tower</span> Environment & Setup</div>
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
          <div class="setup-section-title">
            <strong><span class="material-icons">public</span> Route53 DNS Configuration</strong>
          </div>
          <div class="hint hint-section">Configure these records in your Route53 hosted zone</div>
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
          <div class="setup-section-title">
            <strong><span class="material-icons">router</span> Router Port Forwarding</strong>
          </div>
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
    <div class="flex-spacer"></div>
    <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
  `;

  // Fetch and display public IP and local IP
  fetchPublicIp();
  fetchLocalIp();
}

function onRootServiceChange(value) {
  updateConfig('rootservice', value);
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

function hasUnsavedSecretsChanges() {
  return JSON.stringify(secrets) !== JSON.stringify(originalSecrets);
}

function hasUnsavedUsersChanges() {
  return JSON.stringify(users) !== JSON.stringify(originalUsers);
}

function hasUnsavedDdnsChanges() {
  return JSON.stringify(ddns) !== JSON.stringify(originalDdns);
}

function hasUnsavedEcosystemChanges() {
  return JSON.stringify(ecosystem) !== JSON.stringify(originalEcosystem);
}

function hasUnsavedAdvancedChanges() {
  return JSON.stringify(advanced) !== JSON.stringify(originalAdvanced);
}

function hasUnsavedBlocklistChanges() {
  return JSON.stringify(blocklist) !== JSON.stringify(originalBlocklist);
}

function hasUnsavedThemeChanges() {
  return JSON.stringify(colors) !== JSON.stringify(originalColors) || pendingFaviconFile !== null;
}

function hasUnsavedManagementChanges() {
  return hasUnsavedSecretsChanges() || 
         hasUnsavedUsersChanges() || 
         hasUnsavedDdnsChanges() || 
         hasUnsavedEcosystemChanges() || 
         hasUnsavedAdvancedChanges() ||
         hasUnsavedThemeChanges() ||
         hasUnsavedBlocklistChanges();
}

function hasUnsavedChanges() {
  if (rebooting) return false;
  return hasUnsavedManagementChanges() || hasUnsavedConfigChanges();
}

function getSectionType(prefixedName) {
  if (prefixedName.startsWith('management-') || prefixedName.startsWith('monitor-')) return 'management';
  if (prefixedName.startsWith('config-')) return 'config';
  return null;
}

function canNavigateAway(fromSection, toSection) {
  const fromType = getSectionType(fromSection);
  const toType = getSectionType(toSection);
  
  if (fromType === 'management') {
    if (hasUnsavedManagementChanges()) {
      return false;
    }
  }
  
  if (fromType === 'config') {
    if (hasUnsavedConfigChanges()) {
      if (toType === 'config') {
        return true;
      }
      return false;
    }
  }
  
  return true;
}

function getCertificateStatus() {
  const status = {
    provisioned: [],
    needProvisioning: [],
    needDeprovisioning: []
  };
  
  const currentSecureServices = new Set();
  if (originalConfig.services) {
    Object.keys(originalConfig.services).forEach(serviceName => {
      if (originalConfig.services[serviceName].subdomain && 
        originalConfig.services[serviceName].subdomain.protocol === 'secure') {
        currentSecureServices.add(serviceName);
      }
    });
  }
  
  const provisionedServices = new Set(certs.services || []);
  
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
  panel.scrollTop = 0;
  const hasChanges = hasUnsavedConfigChanges();
  const certStatus = getCertificateStatus();
  const canProvision = !hasChanges && (certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0);

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  let warningMessage = '';
  if (hasChanges) {
    warningMessage = '<div class="hint cert-warning"><span class="material-icons warning">warning</span> Please save your configuration before provisioning certificates</div>';
  } else if (!canProvision) {
    warningMessage = '<div class="hint cert-info"><span class="material-icons info">info</span> No certificate changes needed at this time</div>';
  }
  
  // Build certificate status readout
  let statusHtml = '';
  
  if (certStatus.provisioned.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-provisioned"><span class="material-icons success">check_circle</span> Provisioned Certificates</div>
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
        <div class="cert-status-header cert-need-provision"><span class="material-icons warning">pending</span> Need Provisioning</div>
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
        <div class="cert-status-header cert-need-deprovision"><span class="material-icons warning">warning</span> Need Deprovisioning</div>
        <div class="cert-status-list">
          ${certStatus.needDeprovisioning.map(service => 
            `<div class="cert-status-item"><span class="cert-domain">${service}.${config.domain}</span></div>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  if (certStatus.provisioned.length === 0 && certStatus.needProvisioning.length === 0 && certStatus.needDeprovisioning.length === 0) {
    statusHtml = '<div class="hint cert-empty">No secure services configured. Add services with secure protocol to provision certificates.</div>';
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">lock</span> SSL Certificates</div>
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
      <div class="flex-spacer"></div>
      <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
      <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
    `;
  } else {
    actions.innerHTML = `
      <div class="flex-spacer"></div>
      <button class="btn-save" onclick="provisionCertificates()" id="provisionBtn" ${canProvision ? '' : 'disabled'}><span class="material-icons">verified</span> Provision Certificates</button>
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
        <strong><span class="material-icons">check_circle</span> Success!</strong>
        <p class="result-message">${result.message}</p>
        ${result.output ? `<pre class="result-output-pre">${result.output}</pre>` : ''}
      </div>
    `;
    showStatus('Certificates provisioned successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Certificates provisioned. Waiting for the server to restart...');
    await waitForServerRestart();
    
    reloadPage();
  } catch (error) {
    outputEl.innerHTML = `
      <div class="result-error">
        <strong><span class="material-icons">error</span> Error</strong>
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
  panel.scrollTop = 0;
  const service = config.services[serviceName];
  const isDefaultService = serviceName === 'api' || serviceName === 'www';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  const icon = getServiceIcon(service.subdomain?.type);
  
  let html = `
    <div class="section">
      <div class="section-title">${icon} ${serviceName}${service.nicename ? ` - ${service.nicename}` : ''}</div>
      ${!isDefaultService ? `<button class="btn-remove" onclick="removeService('${serviceName}')"><span class="material-icons">remove_circle</span> Remove Service</button>` : ''}
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
          <button class="btn-add-field" onclick="addSubdomain('${serviceName}')"><span class="material-icons">add_circle</span> Add Subdomain</button>
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
            <button class="btn-add-field" onclick="addHealthcheck('${serviceName}')"><span class="material-icons">add_circle</span> Add Health Check</button>
          </div>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
  
  // Add file manager button to actions for index, spa, and dirlist types (except protected services)
  const subdomainType = service.subdomain?.type;
  const isProtectedService = ['api', 'www', 'radio'].includes(serviceName);
  const isFileManageableType = ['index', 'spa', 'dirlist'].includes(subdomainType);
  const isInitiated = originalConfig.services[serviceName]?.subdomain
  if (isInitiated && isFileManageableType && !isProtectedService) {
    actions.innerHTML = `
      <button class="btn-add-field" onclick="renderFileManager('${serviceName}', 'public')"><span class="material-icons">folder</span> Files</button>
      <div class="flex-spacer"></div>
      <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
      <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
    `;
  } else {
    actions.innerHTML = `
      <div class="flex-spacer"></div>
      <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
      <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
    `;
  }

  // Set initial visibility state for conditional fields
  if (service.subdomain) {
    toggleFieldVisibility(serviceName);
    createSubdomainChangeHandlers(serviceName);
  }
  if (service.healthcheck) {
    toggleHealthcheckFieldVisibility(serviceName);
    toggleMetaFieldVisibility(serviceName);
    createHealthcheckChangeHandlers(serviceName);
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
  let html = `<div class="form-group"><p class="label">${label}</p><div class="nested-object">`;
  
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

  html += `<button class="btn-add-field" onclick="addArrayItem('${serviceName}', '${fullPath}')"><span class="material-icons">add_circle</span> Add Item</button>`;
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
          <p class="label" onclick="toggleDropdown('subdomain_type_${serviceName}', event)">Type</p>
          ${createDropdown({
            id: `subdomain_type_${serviceName}`,
            items: [
              { value: 'index', label: 'Index', selected: subdomain.type === 'index' },
              { value: 'spa', label: 'Single-Page Webapp', selected: subdomain.type === 'spa' },
              { value: 'dirlist', label: 'Directory List', selected: subdomain.type === 'dirlist' },
              { value: 'proxy', label: 'Proxy', selected: subdomain.type === 'proxy' }
            ],
            disabled: true
          })}
          <div class="hint">Determines the behavior of the served assets</div>
        </div>
        <div class="form-group">
          <p class="label" onclick="toggleDropdown('subdomain_protocol_${serviceName}', event)">Protocol</p>
          ${createDropdown({
            id: `subdomain_protocol_${serviceName}`,
            items: [
              { value: 'secure', label: 'Secure (HTTPS)', selected: subdomain.protocol === 'secure', disabled: !secrets.admin_email_address },
              { value: 'insecure', label: 'Not Secure (HTTP)', selected: subdomain.protocol === 'insecure' }
            ],
            onChange: `onSubdomainProtocolChange_${serviceName}`
          })}
        </div>
      </div>
      ${isWww ? '<div class="hint">Default www service uses simplified configuration</div>' : '<div class="hint">Default api service uses simplified configuration</div>'}
    </div>
  `;
}

function renderSubdomainSection(serviceName, subdomain) {
  return `
    <div class="section">
      <div class="section-title">Subdomain Settings</div>
      <div class="nested-object">
        <button class="btn-remove" onclick="removeSubdomain('${serviceName}')"><span class="material-icons">remove_circle</span> Remove Subdomain</button>
        <div class="form-group">
          <p class="label" onclick="toggleDropdown('subdomain_type_${serviceName}', event)">Type</p>
          ${createDropdown({
            id: `subdomain_type_${serviceName}`,
            items: [
              { value: 'index', label: 'Index', selected: subdomain.type === 'index' },
              { value: 'spa', label: 'Single-Page Webapp', selected: subdomain.type === 'spa' },
              { value: 'dirlist', label: 'Directory List', selected: subdomain.type === 'dirlist' },
              { value: 'proxy', label: 'Proxy', selected: subdomain.type === 'proxy' }
            ],
            onChange: `onSubdomainTypeChange_${serviceName}`
          })}
          <div class="hint">Determines the behavior of the served assets</div>
        </div>
        <div class="form-group">
          <p class="label" onclick="toggleDropdown('subdomain_protocol_${serviceName}', event)">Protocol</p>
          ${createDropdown({
            id: `subdomain_protocol_${serviceName}`,
            items: [
              { value: 'secure', label: 'Secure (HTTPS)', selected: subdomain.protocol === 'secure' },
              { value: 'insecure', label: 'Not Secure (HTTP)', selected: subdomain.protocol === 'insecure' }
            ],
            onChange: `onSubdomainProtocolChange_${serviceName}`
          })}
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
        <div class="form-group requireauth-field" data-service="${serviceName}">
          <div class="checkbox-item">
            <input type="checkbox" id="subdomain_requireAuth_${serviceName}" ${subdomain.requireAuth ? 'checked' : ''} 
                onchange="updateServiceProperty('${serviceName}', 'subdomain.requireAuth', this.checked)"
                ${!secrets.admin_email_address && (!users.users || users.users.length === 0) ? 'disabled' : ''}>
            <label for="subdomain_requireAuth_${serviceName}" class="inline-label">Require Login</label>
          </div>
          <div class="hint">${!secrets.admin_email_address && (!users.users || users.users.length === 0) ? 'Configure admin credentials in Secrets or add users in Users to enable this option. ' : ''}Admin and configured users can log in to access this service</div>
        </div>
        <div class="form-group form-group-no-margin proxy-field" data-service="${serviceName}">
          <p class="label">Proxy Options</p>
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
        <button class="btn-remove" onclick="removeHealthcheck('${serviceName}')"><span class="material-icons">remove_circle</span> Remove Health Check</button>
        <div class="form-group">
          <label for="hc_id_${serviceName}">Health Check ID (UUID)</label>
          <input type="text" id="hc_id_${serviceName}" value="${healthcheck.id || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.id', this.value)"
              placeholder="UUID for healthchecks.io health check">
          <div class="hint">Optional, used for pinging a healthchecks.io healthcheck</div>
        </div>
      </div>
      <div class="hint">Api service healthcheck only supports healthchecks.io</div>
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
  const parserItems = [{ value: '', label: '-- Select Parser --' }].concat(
    parserOptions.map(parser => ({ 
      value: parser, 
      label: parser, 
      selected: healthcheck.parser === parser 
    }))
  );
  
  // Build extractor options from both defaults and advanced config
  const extractorOptions = ['doom', 'minecraft', 'valheim', 'radio'];
  if (advanced.extractors) {
    Object.keys(advanced.extractors).forEach(key => {
      if (!extractorOptions.includes(key)) {
        extractorOptions.push(key);
      }
    });
  }
  const extractorItems = [{ value: '', label: '-- Select Extractor --' }].concat(
    extractorOptions.map(extractor => ({ 
      value: extractor, 
      label: extractor, 
      selected: healthcheck.extractor === extractor 
    }))
  );
  
  // Build query type options from both defaults and advanced config
  const queryTypeOptions = ['mbe', 'valheim'];
  if (advanced.queryTypes && advanced.queryTypes.length > 0) {
    advanced.queryTypes.forEach(qt => {
      if (!queryTypeOptions.includes(qt)) {
        queryTypeOptions.push(qt);
      }
    });
  }
  const queryTypeItems = [{ value: '', label: '-- Select Query Type --' }].concat(
    queryTypeOptions.map(qt => ({ 
      value: qt, 
      label: qt, 
      selected: healthcheck.queryType === qt 
    }))
  );
  
  const typeItems = [
    { value: '', label: '-- Select Type --' },
    { value: 'http', label: 'HTTP', selected: healthcheck.type === 'http' },
    { value: 'gamedig', label: 'GameDig', selected: healthcheck.type === 'gamedig' },
    { value: 'odalpapi', label: 'OdalPAPI', selected: healthcheck.type === 'odalpapi' }
  ];
  
  const platformItems = [
    { value: '', label: '-- Select Platform --' },
    { value: 'compute', label: 'compute', selected: healthcheck.platform === 'compute' },
    { value: 'storage', label: 'storage', selected: healthcheck.platform === 'storage' },
    { value: 'standalone', label: 'standalone', selected: healthcheck.platform === 'standalone' }
  ];
  
  let html = `
    <div class="section">
      <div class="section-title">Health Check Configuration</div>
      <div class="nested-object">
        <button class="btn-remove" onclick="removeHealthcheck('${serviceName}')"><span class="material-icons">remove_circle</span> Remove Health Check</button>
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
          <p class="label" onclick="toggleDropdown('hc_type_${serviceName}', event)">Type</p>
          ${createDropdown({
            id: `hc_type_${serviceName}`,
            items: typeItems,
            placeholder: '-- Select Type --',
            onChange: `onHealthcheckTypeChange_${serviceName}`
          })}
        </div>
        <div class="form-group http-only-field" data-service="${serviceName}">
          <label for="hc_timeout_${serviceName}">Timeout (ms)</label>
          <input type="number" id="hc_timeout_${serviceName}" value="${healthcheck.timeout || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.timeout', parseInt(this.value) || undefined)">
          <div class="hint">Defaults to 1000ms if left blank</div>
        </div>
        <div class="form-group http-only-field" data-service="${serviceName}">
          <p class="label" onclick="toggleDropdown('hc_parser_${serviceName}', event)">HTML Body Parser</p>
          ${createDropdown({
            id: `hc_parser_${serviceName}`,
            items: parserItems,
            placeholder: '-- Select Parser --',
            onChange: `onHealthcheckParserChange_${serviceName}`
          })}
        </div>
        <div class="form-group gamedig-only-field" data-service="${serviceName}">
          <p class="label" onclick="toggleDropdown('hc_querytype_${serviceName}', event)">Query Type</p>
          ${createDropdown({
            id: `hc_querytype_${serviceName}`,
            items: queryTypeItems,
            placeholder: '-- Select Query Type --',
            onChange: `onHealthcheckQueryTypeChange_${serviceName}`
          })}
        </div>
        <div class="form-group">
          <p class="label" onclick="toggleDropdown('hc_platform_${serviceName}', event)">Platform</p>
          ${createDropdown({
            id: `hc_platform_${serviceName}`,
            items: platformItems,
            placeholder: '-- Select Platform --',
            onChange: `onHealthcheckPlatformChange_${serviceName}`
          })}
          <div class="hint">If Wake-on-LAN secrets are configured, the API page can send a Wake-on-LAN packet if all services on the compute platform are down</div>
        </div>
        <div class="form-group">
          <label for="hc_pollrate_${serviceName}">Polling Rate (s)</label>
          <input type="number" id="hc_pollrate_${serviceName}" value="${healthcheck.pollrate || ''}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.pollrate', parseInt(this.value) || undefined)">
          <div class="hint">How often the API page will poll the service for health status updates, defaults to 30s if left blank</div>
        </div>
        <div class="form-group" data-service="${serviceName}">
          <p class="label" onclick="toggleDropdown('hc_extractor_${serviceName}', event)">Meta Data Extractor</p>
          ${createDropdown({
            id: `hc_extractor_${serviceName}`,
            items: extractorItems,
            placeholder: '-- Select Extractor --',
            onChange: `onHealthcheckExtractorChange_${serviceName}`
          })}
        </div>
        ${renderMetaSection(serviceName, healthcheck.meta || {})}
      </div>
    </div>
  `;
  return html;
}

function renderMetaSection(serviceName, meta) {
  let html = '<div class="form-group form-group-no-margin"><p class="label">Meta Data Defaults</p><div class="nested-object">';
  
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
      `;
    } else {
      html += `
        <div class="${fieldClass}">
          <label for="meta_${serviceName}_${key}">${key.charAt(0).toUpperCase() + key.slice(1)}</label>
          <input type="${inputType}" id="meta_${serviceName}_${key}" value="${value}" 
              onchange="updateServiceProperty('${serviceName}', 'healthcheck.meta.${key}', ${inputType === 'number' ? 'parseInt(this.value) || null' : 'this.value'})">
        </div>
      `;
    }
  });
  html += '</div></div>';
  return html;
}

/* Dropdown change handlers for dynamic service fields */
window.onSubdomainTypeChange = {};
window.onSubdomainProtocolChange = {};

// Create dynamic onChange handlers for each service
function createSubdomainChangeHandlers(serviceName) {
  window[`onSubdomainTypeChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'subdomain.type', value);
    toggleFieldVisibility(serviceName);
  };
  
  window[`onSubdomainProtocolChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'subdomain.protocol', value);
  };
}

// Create dynamic onChange handlers for healthcheck dropdowns
function createHealthcheckChangeHandlers(serviceName) {
  window[`onHealthcheckTypeChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'healthcheck.type', value);
    toggleHealthcheckFieldVisibility(serviceName);
  };
  
  window[`onHealthcheckParserChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'healthcheck.parser', value);
  };
  
  window[`onHealthcheckQueryTypeChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'healthcheck.queryType', value);
  };
  
  window[`onHealthcheckPlatformChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'healthcheck.platform', value);
  };
  
  window[`onHealthcheckExtractorChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'healthcheck.extractor', value);
    toggleMetaFieldVisibility(serviceName);
  };
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
    '<span class="material-icons">remove_circle</span> Remove Health Check',
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
    renderServicesList();
    showStatus('Subdomain added', 'success');
  }
}

function removeSubdomain(serviceName) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Subdomain',
    'Are you sure you want to remove the subdomain configuration?',
    (confirmed) => {
      if (confirmed) {
        delete config.services[serviceName].subdomain;
        renderServiceEditor(serviceName);
        renderServicesList();
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
  const requireAuthFields = document.querySelectorAll(`.requireauth-field[data-service="${serviceName}"]`);
  
  // Basic Auth fields: show only for dirlist
  basicAuthFields.forEach(field => {
    if (selectedType === 'dirlist') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
    }
  });
  
  // Proxy fields: hide for dirlist and spa, show for index and proxy
  proxyFields.forEach(field => {
    if (selectedType === 'dirlist' || selectedType === 'spa') {
      field.classList.add('form-group-hidden');
    } else {
      field.classList.remove('form-group-hidden');
    }
  });

  // Require Auth fields: show only for index and spa
  requireAuthFields.forEach(field => {
    if (selectedType === 'index' || selectedType === 'spa') {
      field.classList.remove('form-group-hidden');
    } else {
      field.classList.add('form-group-hidden');
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
    '<span class="material-icons">remove_circle</span> Remove Service',
    `Are you sure you want to remove the service "${serviceName}"? This action cannot be undone.`,
    (confirmed) => {
      if (confirmed) {
        delete config.services[serviceName];
        currentSelection = null;
        
        const url = new URL(window.location);
        url.searchParams.delete('section');
        window.history.pushState({}, '', url);
        
        const message = 'Service removed. Select another item to continue editing.';
        const actions = `
          <div class="flex-spacer"></div>
          <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
          <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
        `
        renderServicesList();
        renderPlaceholderEditor(message, actions);
        showStatus(`Service "${serviceName}" removed`, 'success');
      }
    }
  );
}

function addNewService() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add New Service',
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

    showStatus('Config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Configuration saved. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving config: ' + parseErrorMessage(error), 'error');
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
    '<span class="material-icons">undo</span> Revert Changes',
    'Are you sure you want to discard all changes and reload the original configuration?',
    (confirmed) => {
      if (confirmed) {
        config = JSON.parse(JSON.stringify(originalConfig));
        showStatus('Changes discarded', 'success');
        renderServicesList();
        console.log('Current selection before reset:', currentSelection);
        if (currentSelection) {
          const serviceName = currentSelection.startsWith('config-') ? currentSelection.replace('config-', '') : null;
          
          if (serviceName && config.services[serviceName]) {
            renderServiceEditor(serviceName);
          } else if (currentSelection === 'manage-certificates') {
            renderCertificatesEditor();
          } else if (currentSelection === 'config-domain') {
            renderDomainEditor();
          } else {
            renderPlaceholderEditor('Service removed. Select an item to edit.');
          }
        } else {
          currentSelection = null;
          renderPlaceholderEditor('Changes reverted. Select an item to edit.');
        }
      }
    }
  );
}

function showStatus(message, type) {
  const container = document.getElementById('statusContainer');
  let icon;
  if (type === 'error') {
    icon = '<span class="material-icons error">error</span>';
  }
  if (type === 'success') {
    icon = '<span class="material-icons success">check_circle</span>';
  }
  const statusEl = document.createElement('div');
  statusEl.className = 'status ' + type;
  statusEl.innerHTML = icon ? icon + ' ' + message : message;
  
  statusEl.addEventListener('click', () => {
    removeStatus(statusEl);
  });
  
  container.appendChild(statusEl);
  
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
  document.getElementById('confirmTitle').innerHTML = title;
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
  const modalContent = `
    <div class="modal-header">${title}</div>
    <div class="modal-body">${message}</div>
    <div class="form-group">
      <input type="text" id="promptInput" class="modal-input" placeholder="${placeholder}" value="${defaultValue}">
      ${hint ? `<div id="promptHint" class="hint prompt-hint">${hint}</div>` : ''}
      <div id="promptError" class="hint prompt-error"></div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-secondary" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="submitPrompt()"><span class="material-icons">check</span> Submit</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = modalContent;
  promptCallback = callback;
  document.getElementById('promptModal').classList.add('active');
  setTimeout(() => {
    const input = document.getElementById('promptInput');
    if (input) {
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitPrompt();
      });
      input.addEventListener('input', () => {
        document.getElementById('promptError').style.display = 'none';
      });
    }
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

function reloadPage(update = false) {
  rebooting = true;
  const url = new URL(window.location);
  setTimeout(() => {
    if (update) {
      url.searchParams.set('updated', 'true');
    } else {
      url.searchParams.set('restarted', 'true');
    }
    window.location.href = url.toString()
  }, 0);
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
        return;
      }
    } catch (error) {
      console.warn('Server not responding yet, continuing to poll...');
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  hideLoadingOverlay();
  showStatus('Server did not restart within expected time. Please check manually.', 'error');
}

/* FILE MANAGEMENT FUNCTIONS */
async function renderFileManager(serviceName, folderType = 'public', currentPath = '', pushState = true) {
  const panel = document.getElementById('editorPanel');
  const actions = document.getElementById('editorActions');
  
  if (pushState) {
    const url = new URL(window.location);
    url.searchParams.set('section', `config-${serviceName}`);
    url.searchParams.set('folder', folderType);
    if (currentPath) {
      url.searchParams.set('path', currentPath);
    } else {
      url.searchParams.delete('path');
    }
    window.history.pushState({}, '', url);
  }
  
  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  try {
    const queryPath = currentPath ? `?path=${encodeURIComponent(currentPath)}` : '';
    const response = await fetch(`/files/${serviceName}/${folderType}${queryPath}`);
    const data = await response.json();
    
    if (!data.success) {
      showStatus(data.error, 'error');
      return;
    }
    
    const files = data.files || [];
    const pathFromServer = data.currentPath || '';
    
    // Get service type to determine if we should show folder type selector
    const service = config.services[serviceName];
    const serviceType = service?.subdomain?.type;
    const showFolderTypeSelector = serviceType === 'index';
    
    // Build breadcrumb navigation
    const pathParts = pathFromServer ? pathFromServer.split('/').filter(p => p) : [];
    const domain = config.domain || 'domain.com';
    const rootUrl = folderType === 'public' 
      ? `${serviceName}.${domain}` 
      : `${serviceName}.${domain}/static`;
    let breadcrumbs = `<a href="#" onclick="renderFileManager('${serviceName}', '${folderType}', ''); return false;" class="breadcrumb-link"><span class="material-icons">folder</span> ${rootUrl}</a>`;
    
    let accumulatedPath = '';
    for (let i = 0; i < pathParts.length; i++) {
      accumulatedPath += (accumulatedPath ? '/' : '') + pathParts[i];
      const displayPath = accumulatedPath;
      breadcrumbs += ` / <a href="#" onclick="renderFileManager('${serviceName}', '${folderType}', '${displayPath}'); return false;" class="breadcrumb-link">${pathParts[i]}</a>`;
    }
    
    let html = `
      <div class="section">
        <div class="section-title"><span class="material-icons">folder</span> File Manager - ${serviceName}</div>
        <div class="hint hint-section">Manage the files hosted by this service</div>
        ${showFolderTypeSelector ? `
        <div class="form-group">
          <label>Folder Type</label>
          <div class="folders-tabs-row">
            <button class="tab-folder-type ${folderType === 'public' ? 'active' : ''}" 
                onclick="renderFileManager('${serviceName}', 'public', '')">
              Public
            </button>
            <button class="tab-folder-type ${folderType === 'static' ? 'active' : ''}" 
                onclick="renderFileManager('${serviceName}', 'static', '')">
              Static
            </button>
          </div>
          <div class="folders-tabs-spacer"></div>
          <div class="hint">${folderType === 'public' ? 'Public files are served directly.' : ' Static files are stored differently and are served at the /static path.'}</div>
        </div>
        ` : ''}
        <div class="form-group">
          <label>Current Path</label>
          <div class="breadcrumb-container">
            ${breadcrumbs}
          </div>
        </div>
        
        <div class="form-group">
          <div class="file-manager-actions" id="file-manager-actions">
            <div class="file-manager-actions-left">
              <button class="btn-add-field secondary" onclick="showUploadDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">upload</span> Upload File</button>
              <button class="btn-add-field secondary" onclick="showCreateDirectoryDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">create_new_folder</span> Create Directory</button>
              <button class="btn-add-field secondary" onclick="showUnpackZipDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">folder_zip</span> Unpack Zip</button>
            </div>
            <button class="btn-add-field secondary" onclick="selectAllFiles()"><span class="material-icons">check_box</span> Select All</button>
          </div>
        </div>
        
        <div class="file-list-container">
          ${renderFileList(files, serviceName, folderType, pathFromServer)}
        </div>
      </div>
    `;
    
    panel.innerHTML = html;
    actions.innerHTML = `
      <button class="btn-add-field" onclick="backToServiceEditor('${serviceName}')"><span class="material-icons">arrow_back</span> Back to Service</button>
    `;
    
    // Initialize file manager context and clear selections
    currentFileManagerContext = { serviceName, folderType, currentPath: pathFromServer, files };
    selectedFiles.clear();
    updateFileManagerActions();
  } catch (error) {
    showStatus('Failed to load files: ' + error.message, 'error');
  }
}

function backToServiceEditor(serviceName) {
  const url = new URL(window.location);
  url.searchParams.delete('folder');
  url.searchParams.delete('path');
  window.history.pushState({}, '', url);
  selectedFiles.clear();
  currentFileManagerContext = null;
  renderServiceEditor(serviceName);
}

function toggleFileSelection(filePath) {
  if (selectedFiles.has(filePath)) {
    selectedFiles.delete(filePath);
  } else {
    selectedFiles.add(filePath);
  }
  updateFileManagerActions();
  updateFileItemStyles();
}

function updateFileItemStyles() {
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    const checkbox = item.querySelector('.file-checkbox');
    if (checkbox && checkbox.checked) {
      item.classList.add('file-item-selected');
    } else {
      item.classList.remove('file-item-selected');
    }
  });
}

function clearFileSelection() {
  selectedFiles.clear();
  
  // Uncheck all checkboxes
  const checkboxes = document.querySelectorAll('.file-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  
  updateFileManagerActions();
  updateFileItemStyles();
}

function selectAllFiles() {
  if (!currentFileManagerContext) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const service = config.services[serviceName];
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    const checkbox = item.querySelector('.file-checkbox');
    if (checkbox) {
      const onchangeAttr = checkbox.getAttribute('onchange');
      if (onchangeAttr) {
        const match = onchangeAttr.match(/toggleFileSelection\('([^']+)'\)/);
        if (match) {
          const filePath = match[1];
          // Skip the protected folder in dirlist services
          if (isDirlist && folderType === 'public' && !currentPath && filePath === 'protected') {
            return;
          }
          selectedFiles.add(filePath);
          checkbox.checked = true;
        }
      }
    }
  });
  
  updateFileManagerActions();
  updateFileItemStyles();
}

function updateFileManagerActions() {
  const actionsDiv = document.getElementById('file-manager-actions');
  if (!actionsDiv || !currentFileManagerContext) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const selectionCount = selectedFiles.size;
  
  if (selectionCount === 0) {
    // No selection - show default actions
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-add-field secondary" onclick="showUploadDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">upload</span> Upload File</button>
        <button class="btn-add-field secondary" onclick="showCreateDirectoryDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">create_new_folder</span> Create Directory</button>
        <button class="btn-add-field secondary" onclick="showUnpackZipDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">folder_zip</span> Unpack Zip</button>
      </div>
      <button class="btn-add-field secondary" onclick="selectAllFiles()"><span class="material-icons">check_box</span> Select All</button>
    `;
  } else if (selectionCount === 1) {
    // Single selection - show delete and rename buttons
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-remove" onclick="deleteSelectedFiles()"><span class="material-icons">delete</span> Delete</button>
        <button class="btn-add-field secondary" onclick="renameSelectedFile()"><span class="material-icons">edit</span> Rename</button>
      </div>
      <button class="btn-add-field secondary" onclick="clearFileSelection()"><span class="material-icons">close</span> Clear Selection</button>
    `;
  } else {
    // Multiple selections - show delete and clear buttons
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-remove" onclick="deleteSelectedFiles()"><span class="material-icons">delete</span> Delete (${selectionCount})</button>
      </div>
      <button class="btn-add-field secondary" onclick="clearFileSelection()"><span class="material-icons">close</span> Clear Selection</button>
    `;
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) {
    return '<span class="material-icons image">image</span>';
  }
  // Videos
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v'].includes(ext)) {
    return '<span class="material-icons video">video_file</span>';
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return '<span class="material-icons audio">audio_file</span>';
  }
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
    return '<span class="material-icons archive">folder_zip</span>';
  }
  // PDFs
  if (ext === 'pdf') {
    return '<span class="material-icons pdf">picture_as_pdf</span>';
  }
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(ext)) {
    return '<span class="material-icons code">code</span>';
  }
  // Web files
  if (ext === 'html' || ext === 'htm') {
    return '<span class="material-icons html">web</span>';
  }
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') {
    return '<span class="material-icons css">style</span>';
  }
  // Data files
  if (['json', 'xml', 'yaml', 'yml', 'toml'].includes(ext)) {
    return '<span class="material-icons data">data_object</span>';
  }
  // Text/Documents
  if (['txt', 'md', 'markdown', 'log'].includes(ext)) {
    return '<span class="material-icons text">article</span>';
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return '<span class="material-icons doc">description</span>';
  }
  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return '<span class="material-icons table">table_chart</span>';
  }
  // Fonts
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) {
    return '<span class="material-icons font">font_download</span>';
  }
  // Executables/Binary
  if (['exe', 'dmg', 'app', 'deb', 'rpm', 'apk'].includes(ext)) {
    return '<span class="material-icons binary">settings_applications</span>';
  }
  // Game files
  if (['wad', 'jsdos', 'rom', 'iso'].includes(ext)) {
    return '<span class="material-icons game">videogame_asset</span>';
  }
  // Web manifests and configs
  if (['webmanifest', 'manifest'].includes(ext)) {
    return '<span class="material-icons manifest">web_asset</span>';
  }
  
  // Default file icon
  return '<span class="material-icons file">insert_drive_file</span>';
}

function renderFileList(files, serviceName, folderType, currentPath) {
  if (!files || files.length === 0) {
    return '<div class="hint">No files found. Upload files to get started.</div>';
  }
  
  // Sort files: directories first, then by name
  const sorted = files.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Check if this is a dirlist service
  const service = config.services[serviceName];
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  let html = '<div class="file-list">';
  
  // Add parent directory entry if we're in a subfolder
  if (currentPath) {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    html += `
      <div class="file-item">
        <span class="file-icon"><span class="material-icons folder">folder</span></span>
        <div class="file-info-clickable" onclick="renderFileManager('${serviceName}', '${folderType}', '${parentPath}')">
          <div class="file-name-primary">../</div>
          <div class="hint file-meta">Go up one level</div>
        </div>
        <span class="file-checkbox-placeholder"></span>
      </div>
    `;
  }
  
  for (const file of sorted) {
    const icon = file.type === 'directory' ? '<span class="material-icons folder">folder</span>' : getFileIcon(file.name);
    const sizeStr = file.type === 'file' ? formatFileSize(file.size) : '';
    const modified = file.type === 'file' && file.modified ? new Date(file.modified).toLocaleString() : '';
    const fullPath = currentPath ? `${currentPath}/${file.path}` : file.path;
    const isSelected = selectedFiles.has(fullPath);
    
    // Check if this is the protected folder in a dirlist service
    const isProtectedFolder = isDirlist && folderType === 'public' && !currentPath && file.name === 'protected' && file.type === 'directory';
    
    if (file.type === 'directory') {
      html += `
        <div class="file-item ${isSelected ? 'file-item-selected' : ''}">
          <span class="file-icon">${icon}</span>
          <div class="file-info-clickable" onclick="renderFileManager('${serviceName}', '${folderType}', '${fullPath}')">
            <div class="file-name-primary">${file.name}</div>
            <div class="hint file-meta">Click to open</div>
          </div>
          ${isProtectedFolder ? '<span class="file-checkbox-placeholder"></span>' : `<input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${fullPath}')" onclick="event.stopPropagation()">`}
        </div>
      `;
    } else {
      html += `
        <div class="file-item ${isSelected ? 'file-item-selected' : ''}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            ${sizeStr || modified ? `<div class="hint file-meta">${sizeStr}${sizeStr && modified ? ' • ' : ''}${modified}</div>` : ''}
          </div>
          <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${fullPath}')" onclick="event.stopPropagation()">
        </div>
      `;
    }
  }
  
  html += '</div>';
  return html;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showUploadDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">upload</span> Upload File</div>
    ${currentPath ? `<div class="modal-body">Uploading to: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="fileInput">Select File</label>
      <input type="file" id="fileInput" class="file-input-hidden">
      <button class="btn-add-field no-top" onclick="document.getElementById('fileInput').click()"><span class="material-icons">upload_file</span> Choose File</button>
      <span id="fileInputName" class="file-name-display"></span>
    </div>
    <div class="form-group">
      <label for="targetPathInput">Filename (optional)</label>
      <input type="text" id="targetPathInput" placeholder="Leave empty to use original filename">
      <div class="hint">Specify a filename (with extension) to use a different name</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="uploadFile('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">upload</span> Upload</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  // Add event listener for file selection
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || '';
    document.getElementById('fileInputName').textContent = fileName;
  });
}

async function uploadFile(serviceName, folderType, currentPath = '', forcedFilename = null, providedFile = null) {
  const fileInput = document.getElementById('fileInput');
  const targetPathInput = document.getElementById('targetPathInput');
  
  // Use provided file or get from input
  const file = providedFile || (fileInput?.files?.[0]);
  
  if (!file) {
    showStatus('Please select a file', 'error');
    return;
  }
  
  const filename = forcedFilename || targetPathInput?.value.trim() || file.name;
  
  // Check for file conflicts before uploading
  if (!forcedFilename && currentFileManagerContext && currentFileManagerContext.files) {
    const existingFile = currentFileManagerContext.files.find(f => f.name === filename && f.type === 'file');
    if (existingFile) {
      // File exists - show overwrite dialog
      showOverwriteDialog(serviceName, folderType, currentPath, file, filename);
      return;
    }
  }
  
  // Build the full target path: currentPath + filename
  const targetPath = currentPath ? `${currentPath}/${filename}` : filename;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetPath', targetPath);
  
  try {
    closePromptModal();
    showLoadingOverlay('Uploading File', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus('File uploaded successfully', 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Upload failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Upload failed: ' + error.message, 'error');
  }
}

function generateAutoRename(filename, existingFiles) {
  const files = existingFiles || [];
  const fileNames = files.filter(f => f.type === 'file').map(f => f.name);
  
  // Parse filename into base and extension
  const lastDotIndex = filename.lastIndexOf('.');
  let baseName, extension;
  
  if (lastDotIndex > 0) {
    baseName = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex);
  } else {
    baseName = filename;
    extension = '';
  }
  
  // Find the next available number
  let counter = 1;
  let newName;
  do {
    newName = `${baseName}(${counter})${extension}`;
    counter++;
  } while (fileNames.includes(newName));
  
  return newName;
}

function showOverwriteDialog(serviceName, folderType, currentPath, file, filename) {
  const suggestedName = generateAutoRename(filename, currentFileManagerContext.files);
  
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">warning</span> File Already Exists</div>
    <div class="modal-body">
      <p>The file <strong>${filename}</strong> already exists in this directory.</p>
    </div>
    <div class="form-group">
      <label for="newFilenameInput">New Filename</label>
      <input type="text" id="newFilenameInput" value="${suggestedName}">
      <div class="hint">Enter a new filename or click Overwrite to replace the existing file</div>
    </div>
    <div class="modal-footer">
      <button class="btn-remove btn-remove-no-margin" onclick="handleOverwrite('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">published_with_changes</span> Overwrite</button>
      <div class="flex-spacer"></div>
      <button class="btn-reset" onclick="closePromptModal(); window._pendingUploadFile = null;"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="handleRename('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">edit</span> Rename</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  // Store the file in a temporary location so handlers can access it
  window._pendingUploadFile = file;
}

function handleOverwrite(serviceName, folderType, currentPath) {
  const file = window._pendingUploadFile;
  if (!file) return;
  
  // Call uploadFile with original filename (overwrite) and provided file
  uploadFile(serviceName, folderType, currentPath, file.name, file);
  
  window._pendingUploadFile = null;
}

function handleRename(serviceName, folderType, currentPath) {
  const file = window._pendingUploadFile;
  if (!file) return;
  
  const newFilename = document.getElementById('newFilenameInput').value.trim();
  if (!newFilename) {
    showStatus('Please enter a valid filename', 'error');
    return;
  }
  
  // Call uploadFile with new filename and provided file
  uploadFile(serviceName, folderType, currentPath, newFilename, file);
  
  window._pendingUploadFile = null;
}

function showCreateDirectoryDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">create_new_folder</span> Create Directory</div>
    ${currentPath ? `<div class="modal-body">Creating in: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="directoryNameInput">Directory Name</label>
      <input type="text" id="directoryNameInput" placeholder="folder-name">
      <div class="hint">Enter the directory name to create</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="createDirectory('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">create_new_folder</span> Create</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
}

function showUnpackZipDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">folder_zip</span> Unpack Zip File</div>
    ${currentPath ? `<div class="modal-body">Extracting to: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="zipFileInput">Select Zip File</label>
      <input type="file" id="zipFileInput" accept=".zip" class="file-input-hidden">
      <button class="btn-add-field no-top" onclick="document.getElementById('zipFileInput').click()"><span class="material-icons">upload_file</span> Choose File</button>
      <span id="zipFileInputName" class="file-name-display"></span>
      <div class="hint">Choose a zip file to extract into the current directory</div>
    </div>
    <div class="form-group">
      <div class="checkbox-item">
        <input type="checkbox" id="deployFromZip">
        <label for="deployFromZip" class="inline-label">Deploy from this file</label>
      </div>
      <div class="hint">Clears the contents of the directory before unpacking the zip file</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="unpackZip('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">folder_zip</span> Extract</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  // Add event listener for file selection
  document.getElementById('zipFileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || '';
    document.getElementById('zipFileInputName').textContent = fileName;
  });
}

async function createDirectory(serviceName, folderType, currentPath = '') {
  const directoryNameInput = document.getElementById('directoryNameInput');
  const directoryName = directoryNameInput.value.trim();
  
  if (!directoryName) {
    showStatus('Please enter a directory name', 'error');
    return;
  }
  
  // Build the full directory path: currentPath + directoryName
  const directoryPath = currentPath ? `${currentPath}/${directoryName}` : directoryName;
  
  try {
    closePromptModal();
    showLoadingOverlay('Creating Directory', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath })
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus('Directory created successfully', 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Creation failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Creation failed: ' + error.message, 'error');
  }
}

async function deleteSelectedFiles() {
  if (!currentFileManagerContext || selectedFiles.size === 0) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const fileCount = selectedFiles.size;
  
  showConfirmModal(
    '<span class="material-icons">delete</span> Delete Files',
    `Are you sure you want to delete ${fileCount} item${fileCount > 1 ? 's' : ''}?\n\nThis action cannot be undone.`,
    async (confirmed) => {
      if (!confirmed) return;
      
      try {
        showLoadingOverlay('Deleting', `Deleting ${fileCount} item${fileCount > 1 ? 's' : ''}...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const filePath of selectedFiles) {
          try {
            const response = await fetch(`/files/${serviceName}/${folderType}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath })
            });
            
            const data = await response.json();
            if (data.success) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            failCount++;
          }
        }
        
        hideLoadingOverlay();
        
        if (failCount === 0) {
          showStatus(`Successfully deleted ${successCount} item${successCount > 1 ? 's' : ''}`, 'success');
        } else {
          showStatus(`Deleted ${successCount} item${successCount > 1 ? 's' : ''}, ${failCount} failed`, 'error');
        }
        
        selectedFiles.clear();
        renderFileManager(serviceName, folderType, currentPath);
      } catch (error) {
        hideLoadingOverlay();
        showStatus('Batch deletion failed: ' + error.message, 'error');
      }
    }
  );
}

async function renameSelectedFile() {
  if (!currentFileManagerContext || selectedFiles.size !== 1) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const filePath = Array.from(selectedFiles)[0];
  const fileName = filePath.split('/').pop();
  
  showPromptModal(
    '<span class="material-icons">edit</span> Rename File',
    'Enter new name:',
    '',
    fileName,
    'Enter new name',
    async (newName) => {
      if (!newName || newName.trim() === '') {
        showPromptError('Please enter a valid name');
        return false;
      }
      
      const trimmedName = newName.trim();
      if (trimmedName === fileName) {
        showStatus('Name unchanged', 'info');
        return;
      }
      
      // Construct new path
      const pathParts = filePath.split('/');
      pathParts[pathParts.length - 1] = trimmedName;
      const newPath = pathParts.join('/');
      
      try {
        showLoadingOverlay('Renaming', 'Please wait...');
        
        const response = await fetch(`/files/${serviceName}/${folderType}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            oldPath: filePath,
            newPath: newPath
          })
        });
        
        const data = await response.json();
        
        hideLoadingOverlay();
        
        if (data.success) {
          showStatus('Renamed successfully', 'success');
          selectedFiles.clear();
          renderFileManager(serviceName, folderType, currentPath);
        } else {
          showStatus(data.error || 'Rename failed', 'error');
        }
      } catch (error) {
        hideLoadingOverlay();
        showStatus('Rename failed: ' + error.message, 'error');
      }
    }
  );
}

async function unpackZip(serviceName, folderType, currentPath = '') {
  const zipFileInput = document.getElementById('zipFileInput');
  const deployCheckbox = document.getElementById('deployFromZip');
  
  if (!zipFileInput.files || zipFileInput.files.length === 0) {
    showStatus('Please select a zip file', 'error');
    return;
  }
  
  const file = zipFileInput.files[0];
  
  // Validate file extension
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showStatus('Please select a valid zip file', 'error');
    return;
  }
  
  const isDeploy = deployCheckbox.checked;
  
  // If not in deploy mode and files exist, warn about potential overwrites
  if (!isDeploy && currentFileManagerContext && currentFileManagerContext.files && currentFileManagerContext.files.length > 0) {
    closePromptModal();
    showConfirmModal(
      '<span class="material-icons">warning</span> Overwrite Warning',
      'Extracting this zip file may overwrite existing files with the same names in this directory.\n\nDo you want to continue?',
      (confirmed) => {
        if (confirmed) {
          performZipExtraction(serviceName, folderType, currentPath, file, isDeploy);
        }
      }
    );
  } else {
    // Deploy mode or empty directory - proceed directly
    performZipExtraction(serviceName, folderType, currentPath, file, isDeploy);
  }
}

async function performZipExtraction(serviceName, folderType, currentPath, file, isDeploy) {
  const formData = new FormData();
  formData.append('zipFile', file);
  formData.append('targetPath', currentPath);
  formData.append('deploy', isDeploy ? 'true' : 'false');
  
  try {
    closePromptModal();
    showLoadingOverlay('Extracting Zip File', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}/unpack`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus(`Extracted ${data.filesExtracted || 'all'} files successfully`, 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Extraction failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Extraction failed: ' + error.message, 'error');
  }
}

loadColors(true);
