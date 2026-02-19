import * as state from '../state.js';
import * as api from '../api.js';
import { createDropdown } from '../ui-components.js';

/**
 * Render the Domain editor UI and setup route/port instructions
 * @returns {void}
 */
export function renderDomainEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const isEmpty = !state.config.domain || state.config.domain.trim() === '';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const serviceOptions = Object.keys(state.config.services || {})
    .filter(name => {
      if (name === 'api') return false;
      const service = state.config.services[name];
      const subdomainType = service?.subdomain?.type;
      return subdomainType === 'index' || subdomainType === 'spa';
    })
    .sort()
    .map(name => {
      const nicename = state.config.services[name]?.nicename;
      const selected = (state.config.rootservice || 'www') === name;
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
          <input type="text" id="domainInput" placeholder="example.com" value="${state.config.domain || ''}" onchange="updateConfig('domain', this.value)">
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
          <div class="hint">The service that will be served at the root domain (e.g., ${state.config.domain || 'example.com'})</div>
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
                <strong>Name:</strong> <span id="route53Record1" class="setup-value-domain">${state.config.domain || '(set domain above)'}</span><br>
                <strong>Type:</strong> A<br>
                <strong>Value:</strong> <span id="route53Ip1" class="setup-value-ip">Loading...</span><br>
                <strong>TTL:</strong> 300
              </div>
            </div>
            <div class="setup-record">
              <div class="setup-record-label">Record 2 (Wildcard for all subdomains):</div>
              <div class="setup-record-content">
                <strong>Name:</strong> <span id="route53Record2" class="setup-value-domain">*.${state.config.domain || '(set domain above)'}</span><br>
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

  fetchPublicIp();
  fetchLocalIp();
}

/**
 * Update a top-level configuration key in-memory
 * @param {string} key - Config key to update
 * @param {string} value - New value
 * @returns {void}
 */
export function updateConfig(key, value) {
  state.config[key] = value;
}

/**
 * Handler for changing which service is served at the root domain
 * @param {string} value - Selected service name
 * @returns {void}
 */
export function onRootServiceChange(value) {
  updateConfig('rootservice', value);
}

/**
 * Fetch and display the public IP in the Domain editor
 * @returns {Promise<void>}
 */
export async function fetchPublicIp() {
  const displayElement = document.getElementById('publicIpDisplay');
  const route53Ip1 = document.getElementById('route53Ip1');
  const route53Ip2 = document.getElementById('route53Ip2');
  
  if (displayElement) displayElement.textContent = 'Loading...';
  if (route53Ip1) route53Ip1.textContent = 'Loading...';
  if (route53Ip2) route53Ip2.textContent = 'Loading...';
  
  try {
    const data = await api.fetchPublicIp();
    
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
    const errorMsg = 'Error loading IP';
    if (displayElement) displayElement.textContent = errorMsg;
    if (route53Ip1) route53Ip1.textContent = errorMsg;
    if (route53Ip2) route53Ip2.textContent = errorMsg;
  }
}

/**
 * Fetch and display the local IP in the Domain editor
 * @returns {Promise<void>}
 */
export async function fetchLocalIp() {
  const localIpDisplay = document.getElementById('localIpDisplay');
  const localIp1 = document.getElementById('localIp1');
  const localIp2 = document.getElementById('localIp2');
  
  if (localIpDisplay) localIpDisplay.textContent = 'Loading...';
  if (localIp1) localIp1.textContent = 'Loading...';
  if (localIp2) localIp2.textContent = 'Loading...';
  
  try {
    const data = await api.fetchLocalIp();
    
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
    const errorMsg = 'Error loading IP';
    if (localIpDisplay) localIpDisplay.textContent = errorMsg;
    if (localIp1) localIp1.textContent = errorMsg;
    if (localIp2) localIp2.textContent = errorMsg;
  }
}
