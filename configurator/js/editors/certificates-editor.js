// Certificates Editor Module
// Handles SSL certificate provisioning with Let's Encrypt

import * as state from '../state.js';
import * as api from '../api.js';
import { reloadPage, waitForServerRestart, showStatus, showLoadingOverlay } from '../ui-components.js';
import { hasUnsavedConfigChanges } from '../editors.js';

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
  } else if (!canProvision) {
    warningMessage = '<div class="hint"><span class="material-icons info">info</span> No certificate changes needed at this time</div>';
  }
  
  // Build certificate status readout
  let statusHtml = '';
  
  if (certStatus.provisioned.length > 0) {
    statusHtml += `
      <div class="cert-status-section">
        <div class="cert-status-header cert-provisioned"><span class="material-icons success">check_circle</span> Provisioned Certificates</div>
        <div class="cert-status-list">
          ${certStatus.provisioned.map(service => 
            `<div class="cert-status-item"><span class="cert-domain">${service}.${state.config.domain}</span></div>`
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
            `<div class="cert-status-item"><span class="cert-domain">${service}.${state.config.domain}</span></div>`
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
            `<div class="cert-status-item"><span class="cert-domain">${service}.${state.config.domain}</span></div>`
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

export async function provisionCertificates() {
  const email = state.secrets.admin_email_address;
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
    const result = await api.provisionCertificates(email);

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
        <p class="result-message">${utils.parseErrorMessage(error)}</p>
      </div>
    `;
    showStatus('Error provisioning certificates: ' + utils.parseErrorMessage(error), 'error');
    provisionBtn.disabled = false;
    provisionBtn.textContent = 'Provision Certificates';
  }
}

export function getCertificateStatus() {
  const status = {
    provisioned: [],
    needProvisioning: [],
    needDeprovisioning: []
  };
  
  const currentSecureServices = new Set();
  if (state.originalConfig.services) {
    Object.keys(state.originalConfig.services).forEach(serviceName => {
      if (state.originalConfig.services[serviceName].subdomain && 
        state.originalConfig.services[serviceName].subdomain.protocol === 'secure') {
        currentSecureServices.add(serviceName);
      }
    });
  }
  
  const provisionedServices = new Set(state.certs.services || []);
  
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
