// Secrets Editor Module
// Handles secrets management and sensitive configuration

import * as state from '../state.js';
import * as utils from '../utils.js';
import * as api from '../api.js';
import { reloadPage, waitForServerRestart, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

const { getDefaultSecrets } = api;

export function renderSecretsEditor() {
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

  const secretKeys = Object.keys(state.secrets);
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
    const value = state.secrets[key];
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
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertSecrets()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveSecretsBtn" onclick="saveSecrets()"><span class="material-icons">save</span> Save Secrets</button>
  `;
}

export function updateSecret(key, value) {
  state.secrets[key] = value;
}

export function updatePasswordHash(key, value, wasExistingHash) {
  if (value.trim() !== '') {
    state.secrets[key] = value;
  }
}

export function removeSecret(key) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Secret',
    `Are you sure you want to remove the secret "${key}"?`,
    (confirmed) => {
      if (confirmed) {
        if (key === 'api_password_hash') {
          state.secrets[key] = '';
        } else {
          delete state.secrets[key];
        }
        renderSecretsEditor();
        showStatus(`Secret "${key}" removed`, 'success');
      }
    }
  );
}

export async function saveSecrets() {
  const saveBtn = document.getElementById('saveSecretsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveSecrets(state.secrets);

    state.setOriginalSecrets(JSON.parse(JSON.stringify(state.secrets)));
    state.setSecretsSaved(true);
    showStatus('Secrets saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Secrets saved. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving secrets: ' + utils.parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Secrets';
  }
}

export function revertSecrets() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Secrets',
    'Are you sure you want to discard all changes to secrets?',
    (confirmed) => {
      if (confirmed) {
        state.setSecrets(JSON.parse(JSON.stringify(state.originalSecrets)));
        renderSecretsEditor();
        showStatus('Secrets changes reverted', 'success');
      }
    }
  );
}
