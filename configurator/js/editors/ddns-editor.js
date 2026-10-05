import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

/**
 * Render the DDNS editor UI
 * @returns {void}
 */
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

  const altDomains = state.config.altDomains || [];
  if (altDomains.length > 0) {
    html += `
    <div class="section">
      <div class="section-title"><span class="material-icons">domain_add</span> Alternate Domain DDNS</div>
      <div class="hint hint-section">Optionally update each alternate domain's A record in its own Route 53 hosted zone (uses the AWS credentials above). Leave inactive to manage a domain's DNS manually.</div>
      ${altDomains.map(domain => {
        const entry = (state.ddns.altDomains && state.ddns.altDomains[domain]) || {};
        return `
        <div class="secret-entry">
          <div class="form-group">
            <label>
              <input type="checkbox" id="ddns_alt_active_${domain}" ${entry.active ? 'checked' : ''} onchange="updateDdnsAltDomain('${domain}', 'active', this.checked)">
              Enable Dynamic DNS for ${domain}
            </label>
          </div>
          <div class="entry-field">
            <label for="ddns_alt_zone_${domain}">Route 53 Hosted Zone ID</label>
            <input type="text" id="ddns_alt_zone_${domain}" value="${entry.route53_hosted_zone_id || ''}" onchange="updateDdnsAltDomain('${domain}', 'route53_hosted_zone_id', this.value)">
            <div class="hint">The ID of the Route 53 hosted zone for ${domain}</div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
    `;
  }

  panel.innerHTML = html;
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertDdns()"><span class="material-icons">undo</span> Revert Changes</button>
    <button class="btn-save" id="saveDdnsBtn" onclick="saveDdns()"><span class="material-icons">save</span> Save DDNS Config</button>
  `;
}

/**
 * Update a per-alternate-domain DDNS setting (active flag or hosted zone id)
 * @param {string} domain - Alternate domain name
 * @param {string} key - Property to update ('active' or 'route53_hosted_zone_id')
 * @param {*} value - New value
 * @returns {void}
 */
export function updateDdnsAltDomain(domain, key, value) {
  if (!state.ddns.altDomains) state.ddns.altDomains = {};
  if (!state.ddns.altDomains[domain]) state.ddns.altDomains[domain] = {};
  state.ddns.altDomains[domain][key] = value;
}

/**
 * Update in-memory DDNS config value
 * @param {string} key - DDNS property name
 * @param {string} value - New value
 * @returns {void}
 */
export function updateDdns(key, value) {
  state.ddns[key] = value;
}

/**
 * Persist DDNS configuration and handle server restart flow
 * @returns {Promise<void>}
 */
export async function saveDdns() {
  const saveBtn = document.getElementById('saveDdnsBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveDdns(state.ddns);

    state.setOriginalDdns(JSON.parse(JSON.stringify(state.ddns)));
    showStatus('DDNS config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'DDNS config saved. Waiting for the server to restart...');

    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error saving DDNS config: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save DDNS Config';
  }
}

/**
 * Revert DDNS UI to last saved state (after confirmation)
 * @returns {void}
 */
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
