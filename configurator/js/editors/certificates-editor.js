import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showStatus, showLoadingOverlay, hideLoadingOverlay } from '../ui-components.js';
import { hasUnsavedConfigChanges } from '../editors.js';

// Certbot's Route 53 plugin as the server last reported it (null until asked), and whether a check or install is running
let wildcardStatus = null;
let wildcardBusy = false;

/**
 * Escape text for use inside HTML
 * @param {string} text - Plain text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

/**
 * Whether a service gets a wildcard certificate of its own (the option is on, and so is the service's wildcard flag)
 * @param {object} config - Configuration object
 * @param {object} sub - Service subdomain configuration
 * @returns {boolean}
 */
function hasWildcardCertificate(config, sub) {
  return config.wildcardCerts === true && sub?.wildcard === true;
}

/**
 * The status lines under the wildcard option: plugin state, install directions, and missing credentials
 * @returns {string} HTML
 */
function wildcardStatusHtml() {
  if (state.config.wildcardCerts !== true) return '';

  let html = '';
  if (wildcardBusy || wildcardStatus === null) {
    html += '<div class="hint"><span class="material-icons info">hourglass_empty</span> Checking certbot\'s Route 53 plugin...</div>';
  } else if (wildcardStatus.installed) {
    html += '<div class="hint"><span class="material-icons success">check_circle</span> Certbot\'s Route 53 plugin is installed.</div>';
  } else {
    const detail = wildcardStatus.detail ? ` (${escapeHtml(wildcardStatus.detail)})` : '';
    const directions = (wildcardStatus.directions || []).map(command => `<div class="hint"><code>${escapeHtml(command)}</code></div>`).join('');
    html += `
      <div class="hint"><span class="material-icons warning">warning</span> Certbot's Route 53 plugin is not installed${detail}. Install it automatically, or run these on the server:</div>
      ${directions}
      <div class="secret-actions">
        <button class="btn-save" onclick="installWildcardSupport()"><span class="material-icons">download</span> Install Plugin</button>
      </div>`;
  }

  const hasCredentials = state.secrets.wildcard_aws_access_key_id && state.secrets.wildcard_aws_secret_access_key;
  if (!hasCredentials) {
    html += '<div class="hint"><span class="material-icons warning">warning</span> Add an AWS access key for the DNS challenge in Secrets (and save it) before provisioning.</div>';
  }
  return html;
}

/**
 * Redraw the wildcard status lines in place, if the Certificates page is showing
 * @returns {void}
 */
function refreshWildcardStatus() {
  const container = document.getElementById('wildcardStatus');
  if (container) container.innerHTML = wildcardStatusHtml();
}

/**
 * Ask the server whether the plugin is installed
 * @returns {Promise<void>}
 */
async function checkWildcardSupport() {
  wildcardBusy = true;
  refreshWildcardStatus();
  try {
    wildcardStatus = await api.loadWildcardStatus();
  } catch (error) {
    wildcardStatus = { installed: false, directions: [], detail: parseErrorMessage(error) };
  }
  wildcardBusy = false;
  refreshWildcardStatus();
}

/**
 * Install the plugin on the server when it is missing; on failure the directions stay on the page
 * @returns {Promise<void>}
 */
export async function installWildcardSupport() {
  wildcardBusy = true;
  refreshWildcardStatus();
  showLoadingOverlay('Setting Up Wildcard Certificates', 'Checking certbot\'s Route 53 plugin and installing it if it is missing. This can take a minute...');
  try {
    wildcardStatus = await api.installWildcardSupport();
    hideLoadingOverlay();
    if (wildcardStatus.installed) {
      showStatus('Certbot\'s Route 53 plugin is ready', 'success');
    } else {
      showStatus('The plugin could not be installed automatically, follow the directions on the page', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    wildcardStatus = { installed: false, directions: [], detail: parseErrorMessage(error) };
    showStatus('Error installing the plugin: ' + parseErrorMessage(error), 'error');
  }
  wildcardBusy = false;
  refreshWildcardStatus();
}

/**
 * Turn the wildcard certificate option on or off (saved with the rest of the configuration); turning it on installs the plugin
 * @param {boolean} enabled - Whether wildcard certificates are wanted
 * @returns {Promise<void>}
 */
export async function toggleWildcardCerts(enabled) {
  if (enabled) {
    state.config.wildcardCerts = true;
  } else {
    delete state.config.wildcardCerts;
  }
  renderCertificatesEditor();
  if (enabled) await installWildcardSupport();
}

/**
 * Render the Certificates editor UI and show certificate status
 * @returns {void}
 */
export function renderCertificatesEditor() {
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
    warningMessage = '<div class="hint"><span class="material-icons warning">warning</span> Please save your configuration before provisioning certificates</div>';
  } else if (certStatus.provisioned.length === 0 && certStatus.needProvisioning.length === 0 && certStatus.needDeprovisioning.length === 0) {
    warningMessage = '<div class="hint"><span class="material-icons info">info</span> No secure services configured. Add services with secure protocol to provision certificates.</div>';
  } else if (!canProvision) {
    warningMessage = '<div class="hint"><span class="material-icons info">info</span> No certificate changes needed at this time</div>';
  }
  
  let statusHtml = '';
  
  if (certStatus.provisioned.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-provisioned"><span class="material-icons success">check_circle</span> Provisioned Certificates</div>
        <div class="cert-status-list">
          ${certStatus.provisioned.map(domainLabel => 
            `<div class="cert-status-item"><span class="cert-domain">${domainLabel}</span></div>`
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
          ${certStatus.needProvisioning.map(domainLabel => 
            `<div class="cert-status-item"><span class="cert-domain">${domainLabel}</span></div>`
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
          ${certStatus.needDeprovisioning.map(domainLabel => 
            `<div class="cert-status-item"><span class="cert-domain">${domainLabel}</span></div>`
          ).join('')}
        </div>
      </div>
    `;
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">lock</span> SSL Certificates</div>
      <div class="hint hint-section">Automatically provision SSL certificates for secure routes using Let's Encrypt.</div>
      <div class="cert-status-container">
        ${statusHtml}
      </div>
      ${warningMessage}
    </div>
    <div class="section">
      <div class="section-title"><span class="material-icons">star</span> Wildcard Certificates</div>
      <div class="hint hint-section">A service marked Wildcard also answers for every subdomain of its address. With this on, it gets one certificate covering all of them, issued through a DNS challenge on Route 53 (Let's Encrypt only issues wildcard certificates that way).</div>
      <div class="form-group">
        <div class="checkbox-item">
          <input type="checkbox" id="wildcardCerts" ${state.config.wildcardCerts === true ? 'checked' : ''}
              onchange="toggleWildcardCerts(this.checked)">
          <label for="wildcardCerts" class="inline-label">Enable wildcard certificates</label>
        </div>
        <div class="hint">Needs certbot's Route 53 plugin, which is installed for you, and an AWS access key in Secrets that can edit TXT records in the domain's hosted zone and list hosted zones.</div>
        <div id="wildcardStatus">${wildcardStatusHtml()}</div>
      </div>
    </div>
  `;

  if (state.config.wildcardCerts === true && wildcardStatus === null && !wildcardBusy) checkWildcardSupport();

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

/**
 * Trigger certificate provisioning flow on the server
 * @returns {Promise<void>}
 */
export async function provisionCertificates() {
  const email = state.secrets.admin_email_address;
  const provisionBtn = document.getElementById('provisionBtn');

  if (!email) {
    showStatus('Admin email address is not configured in secrets', 'error');
    return;
  }

  provisionBtn.disabled = true;
  provisionBtn.textContent = 'Provisioning...';
  showLoadingOverlay('Provisioning Certificates...', 'Running certbot commands, this may take a few moments...');

  try {
    await api.provisionCertificates(email);
    hideLoadingOverlay();
    showStatus('Certificates provisioned successfully!', 'success');
    showLoadingOverlay('Server Restarting...', 'Certificates provisioned. Waiting for the server to restart...');
    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error provisioning certificates: ' + parseErrorMessage(error), 'error');
    provisionBtn.disabled = false;
    provisionBtn.textContent = 'Provision Certificates';
  }
}

/**
 * Build the domain label (either the bound alternate domain, exclusively, or the default subdomain)
 * covered by a service's certificate
 * @param {string} serviceName - Service identifier
 * @returns {string[]} Single-element array containing the domain label covered by this service's certificate
 */
function getServiceDomainLabels(serviceName) {
  const sub = state.originalConfig.services?.[serviceName]?.subdomain;
  const host = sub?.altDomain
    ? (sub.altDomainPrefix ? `${sub.altDomainPrefix}.${sub.altDomain}` : sub.altDomain)
    : `${serviceName}.${state.originalConfig.domain}`;
  return hasWildcardCertificate(state.originalConfig, sub) ? [host, `*.${host}`] : [host];
}

/**
 * Determine certificate provisioning status for configured services
 * @returns {{provisioned:string[],needProvisioning:string[],needDeprovisioning:string[]}}
 */
export function getCertificateStatus() {
  const status = {
    provisioned: [],
    needProvisioning: [],
    needDeprovisioning: []
  };
  
  const currentSecureServices = new Set();
  if (state.originalConfig.services) {
    Object.keys(state.originalConfig.services).forEach(serviceName => {
      const sub = state.originalConfig.services[serviceName].subdomain;
      if (sub && sub.protocol === 'secure' && sub.disabled !== true) {
        currentSecureServices.add(serviceName);
      }
    });
  }
  
  const provisionedServices = new Set(state.certs.services || []);
  const provisionedWildcards = new Set(state.certs.wildcards || []);
  
  currentSecureServices.forEach(serviceName => {
    // Switching a service between a shared and a wildcard certificate needs provisioning too
    const wildcardMatches = provisionedWildcards.has(serviceName) === hasWildcardCertificate(state.originalConfig, state.originalConfig.services[serviceName].subdomain);
    if (provisionedServices.has(serviceName) && wildcardMatches) {
      status.provisioned.push(...getServiceDomainLabels(serviceName));
    } else {
      status.needProvisioning.push(...getServiceDomainLabels(serviceName));
    }
  });
  
  provisionedServices.forEach(serviceName => {
    if (!currentSecureServices.has(serviceName)) {
      status.needDeprovisioning.push(...getServiceDomainLabels(serviceName));
    }
  });
  
  return status;
}
