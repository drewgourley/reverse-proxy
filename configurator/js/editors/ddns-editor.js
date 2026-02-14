import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

export function renderDdnsEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const isActive = state.ddns.active || false;
  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">public</span> Dynamic DNS Configuration</div>
      <div class="hint hint-section">Configure AWS Route 53 credentials for Dynamic DNS updates. The hostname will be set to your domain from the configuration.</div>
      
      <div class="form-group">
        <label>
          <input type="checkbox" id="ddns_active" ${isActive ? 'checked' : ''} onchange="updateDdns('active', this.checked)">
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
    const value = state.ddns[key] || '';
    const isSecret = key.includes('secret') || key.includes('key');
    
    html += `
        <div class="entry-field">
          <label for="ddns_${key}">${label}</label>
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
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertDdns()"><span class="material-icons">undo</span> Revert Changes</button>
    <button class="btn-save" id="saveDdnsBtn" onclick="saveDdns()"><span class="material-icons">save</span> Save DDNS Config</button>
  `;
}

export function updateDdns(key, value) {
  state.ddns[key] = value;
}

export async function saveDdns() {
  const saveBtn = document.getElementById('saveDdnsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveDdns(state.ddns);

    state.setOriginalDdns(JSON.parse(JSON.stringify(state.ddns)));
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

export function revertDdns() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert DDNS Config',
    'Are you sure you want to discard all changes to DDNS configuration?',
    (confirmed) => {
      if (confirmed) {
        state.setDdns(JSON.parse(JSON.stringify(state.originalDdns)));
        renderDdnsEditor();
        showStatus('DDNS config reverted', 'success');
      }
    }
  );
}
