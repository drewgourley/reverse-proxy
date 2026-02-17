import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage, getServiceIcon } from '../utils.js';
import { reloadPage, waitForServerRestart, createDropdown, showStatus, showConfirmModal, showPromptModal, showPromptError, closePromptModal, showLoadingOverlay } from '../ui-components.js';
import { blockNavigation, hasUnsavedManagementChanges, renderPlaceholderEditor, renderServicesList, selectItem } from '../editors.js';
import { renderDomainEditor } from './domain-editor.js';
import { renderCertificatesEditor } from './certificates-editor.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function updateServiceProperty(serviceName, path, value) {
  const parts = path.split('.');
  let obj = state.config.services[serviceName];

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!obj[part] || typeof obj[part] !== 'object') {
      obj[part] = {};
    }
    obj = obj[part];
  }

  obj[parts[parts.length - 1]] = value;
}

export function toggleFieldVisibility(serviceName) {
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

export function toggleHealthcheckFieldVisibility(serviceName) {
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

export function toggleMetaFieldVisibility(serviceName) {
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

// ============================================================================
// SUBDOMAIN & HEALTHCHECK MANAGEMENT
// ============================================================================

export function addSubdomain(serviceName) {
  if (!state.config.services[serviceName].subdomain) {
    state.config.services[serviceName].subdomain = {
      router: null,
      type: 'index',
      protocol: 'secure'
    };
    renderServiceEditor(serviceName);
    renderServicesList();
  }
}

export function removeSubdomain(serviceName) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Subdomain',
    'Are you sure you want to remove the subdomain configuration?',
    (confirmed) => {
      if (confirmed) {
        delete state.config.services[serviceName].subdomain;
        renderServiceEditor(serviceName);
        renderServicesList();
        showStatus('Subdomain removed', 'success');
      }
    }
  );
}

export function addHealthcheck(serviceName) {
  if (!state.config.services[serviceName].healthcheck) {
    state.config.services[serviceName].healthcheck = {
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
  }
}

export function removeHealthcheck(serviceName) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Health Check',
    'Are you sure you want to remove the health check configuration?',
    (confirmed) => {
      if (confirmed) {
        delete state.config.services[serviceName].healthcheck;
        renderServiceEditor(serviceName);
        showStatus('Health check removed', 'success');
      }
    }
  );
}

// ============================================================================
// CHANGE HANDLERS
// ============================================================================

export function createSubdomainChangeHandlers(serviceName) {
  window[`onSubdomainTypeChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'subdomain.type', value);
    toggleFieldVisibility(serviceName);
  };
  
  window[`onSubdomainProtocolChange_${serviceName}`] = function(value) {
    updateServiceProperty(serviceName, 'subdomain.protocol', value);
  };
}

export function createHealthcheckChangeHandlers(serviceName) {
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

// ============================================================================
// RENDER HELPERS
// ============================================================================

function renderDefaultSubdomainSection(serviceName, subdomain) {
  const isWww = serviceName === 'www';
  return `
    <div class="section">
      <div class="section-title">Subdomain Settings - <a class="title-link" href="${subdomain.protocol === 'secure' && state.environment === 'production'  ? 'https' : 'http'}://${isWww ? '' : serviceName + '.'}${state.config.domain}" target="_blank">${isWww ? '' : serviceName + '.'}${state.config.domain}</a></div>
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
              { value: 'secure', label: 'Secure (HTTPS)', selected: subdomain.protocol === 'secure', disabled: !state.secrets.admin_email_address },
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
      <div class="section-title">Subdomain Settings - <a class="title-link" href="${subdomain.protocol === 'secure' && state.environment === 'production'  ? 'https' : 'http'}://${serviceName}.${state.config.domain}" target="_blank">${serviceName}.${state.config.domain}</a></div>
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
                ${!state.secrets.admin_email_address && (!state.users.users || state.users.users.length === 0) ? 'disabled' : ''}>
            <label for="subdomain_requireAuth_${serviceName}" class="inline-label">Require Login</label>
          </div>
          <div class="hint">${!state.secrets.admin_email_address && (!state.users.users || state.users.users.length === 0) ? 'Configure admin credentials in Secrets or add users in Users to enable this option. ' : ''}Admin and configured users can log in to access this service</div>
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
  return `
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
}

function renderHealthcheckSection(serviceName, healthcheck) {
  // Build parser options from both defaults and advanced config
  const parserOptions = ['hass', 'radio', 'body'];
  if (state.advanced.parsers) {
    Object.keys(state.advanced.parsers).forEach(key => {
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
  if (state.advanced.extractors) {
    Object.keys(state.advanced.extractors).forEach(key => {
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
  if (state.advanced.queryTypes && state.advanced.queryTypes.length > 0) {
    state.advanced.queryTypes.forEach(qt => {
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
  
  return `
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

// ============================================================================
// MAIN SERVICE EDITOR
// ============================================================================

export function renderServiceEditor(serviceName) {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const service = state.config.services[serviceName];
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
  const isInitiated = state.originalConfig.services[serviceName]?.subdomain;
  if (isInitiated && isFileManageableType && !isProtectedService) {
    actions.innerHTML = `
      <a href="${window.buildAppRoute ? window.buildAppRoute({ section: `config-${serviceName}`, folder: 'public' }) : '#'}" class="btn-add-field" onclick="(preventDefaultThen(() => renderFileManager('${serviceName}', 'public')))(event)"><span class="material-icons">folder</span> Files</a>
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

// ============================================================================
// SERVICE MANAGEMENT
// ============================================================================

export function removeService(serviceName) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Service',
    `Are you sure you want to remove the service "${serviceName}"? This action cannot be undone.`,
    async (confirmed) => {
      if (confirmed) {
        delete state.config.services[serviceName];
        state.setCurrentSelection(null);
        
        const url = new URL(window.location);
        url.searchParams.delete('section');
        window.history.pushState({}, '', url);
        
        const message = 'Service removed. Select another item to continue editing.';
        const actions = `
          <div class="flex-spacer"></div>
          <button class="btn-reset" id="resetBtn" onclick="resetEditor()"><span class="material-icons">undo</span> Revert</button>
          <button class="btn-save" id="saveBtn" onclick="saveConfig()"><span class="material-icons">save</span> Save Config</button>
        `;
        renderServicesList();
        renderPlaceholderEditor(message, actions);
        showStatus(`Service "${serviceName}" removed`, 'success');
      }
    }
  );
}

export function addNewService() {
  if (hasUnsavedManagementChanges()) {
    blockNavigation();
    return;
  }
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add New Service',
    'Enter a name for the new service:',
    'Lowercase letters, numbers, and hyphens only. Max 63 characters',
    '',
    'e.g., my-service',
    (serviceName) => {
      if (!serviceName) return;
      
      const existingServices = Object.keys(state.config.services).map(s => s.toLowerCase());
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

      state.config.services[serviceName] = {
        subdomain: {
          router: null,
          type: 'index',
          protocol: 'secure'
        }
      };

      renderServicesList();
      selectItem('config-' + serviceName);
      closePromptModal();
    }
  );
}

// ============================================================================
// CONFIG OPERATIONS
// ============================================================================

export function cleanConfig(obj) {
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

export async function saveConfig() {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const configToSave = JSON.parse(JSON.stringify(state.config));
    
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
    
    await api.saveConfig(cleanedConfig);

    showStatus('Config saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Configuration saved. Waiting for the server to restart...');

    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error saving config: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Config';
  }
}

export function resetEditor() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Changes',
    'Are you sure you want to discard all changes and reload the original configuration?',
    async (confirmed) => {
      if (confirmed) {
        state.setConfig(JSON.parse(JSON.stringify(state.originalConfig)));
        showStatus('Changes discarded', 'success');
        renderServiceEditor();
        if (state.currentSelection) {
          const serviceName = state.currentSelection.startsWith('config-') ? state.currentSelection.replace('config-', '') : null;
          
          if (serviceName && state.config.services[serviceName]) {
            renderServiceEditor(serviceName);
          } else if (state.currentSelection === 'management-certificates') {
            renderCertificatesEditor();
          } else if (state.currentSelection === 'config-domain') {
            renderDomainEditor();
          } else {
            renderPlaceholderEditor('Service removed. Select an item to edit.');
          }
        } else {
          state.setCurrentSelection(null);
          renderPlaceholderEditor('Changes reverted. Select an item to edit.');
        }
      }
    }
  );
}
