import * as state from './state.js';
import { getServiceIcon, preventDefaultThen } from './utils.js';
import { showMobilePanel } from './ui-components.js';
import { renderDomainEditor } from './editors/domain-editor.js';
import { renderApplicationEditor } from './editors/application-editor.js';
import { renderCertificatesEditor, getCertificateStatus as gcs } from './editors/certificates-editor.js';
import { renderSecretsEditor } from './editors/secrets-editor.js';
import { renderUsersEditor } from './editors/users-editor.js';
import { renderDdnsEditor } from './editors/ddns-editor.js';
import { renderThemeEditor } from './editors/theme-editor.js';
import { renderAdvancedEditor } from './editors/advanced-editor.js';
import { renderLogsViewer } from './logs-viewer.js';
import { renderBlocklistEditor } from './editors/blocklist-editor.js';
import { renderFileManager } from './file-manager.js';
import { renderServiceEditor } from './editors/service-editor.js';

/**
 * Render a placeholder editor view with optional actions
 * @param {string} [message='Select an item from the sidebar to view or edit its settings.'] - Message to display
 * @param {string} [actionsHtml=''] - HTML for editor actions
 * @returns {void}
 */
export function renderPlaceholderEditor(message = 'Select an item from the sidebar to view or edit its settings.', actionsHtml = '') {
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

/**
 * Select and render a sidebar item (editor or monitor view)
 * @param {string} prefixedName - Item identifier (e.g. 'config-api' or 'management-theme')
 * @param {string} type - Type parameter (used for logs etc.)
 * @param {string} folder - Folder context for file manager
 * @param {string} path - Path context for file manager
 * @param {boolean} [pushState=true] - Whether to push a history state
 * @returns {void}
 */
export function selectItem(prefixedName, type, folder, path, pushState = true) {
  try { 
    if (pushState && state.currentSelection && state.currentSelection !== prefixedName) {
      if (!canNavigateAway(state.currentSelection, prefixedName)) {
        blockNavigation();
        return;
      }
    }

    state.setCurrentSelection(prefixedName);

    if (pushState) {
      const routePath = window.buildAppRoute({ section: prefixedName, type, folder, path });
      window.history.pushState({}, '', routePath);
      if (state.currentUrl !== undefined) {
        state.setCurrentUrl(window.location.href);
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
      renderLogsViewer(type || 'out', pushState);
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

    if (window.innerWidth <= 1024) {
      showMobilePanel('editor');
    }
  } catch (error) {
    window.history.replaceState({}, '', window.location.origin);
    renderPlaceholderEditor();
  }
}

/**
 * Render the left-hand services and management list in the sidebar
 * @returns {void}
 */
export function renderServicesList() {
  const list = document.getElementById('servicesList');
  
  const fragment = document.createDocumentFragment();
  
  const isFirstTimeSetup = state.ecosystem.default === true;

  const monitorHeader = document.createElement('h2');
  monitorHeader.textContent = 'Activity Monitor';
  fragment.appendChild(monitorHeader);

  const logsItem = document.createElement('a');
  logsItem.className = 'service-item' + (state.currentSelection === 'monitor-logs' ? ' active' : '');
  logsItem.innerHTML = '<span class="material-icons">article</span> Logs';
  logsItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'monitor-logs' }) : '#monitor-logs';
  if (isFirstTimeSetup || !state.secretsSaved) {
    logsItem.style.opacity = '0.5';
    logsItem.style.cursor = 'default';
    logsItem.style.pointerEvents = 'none';
  } else {
    logsItem.onclick = preventDefaultThen(() => selectItem('monitor-logs'));
  }
  fragment.appendChild(logsItem);

  const blocklistItem = document.createElement('a');
  blocklistItem.className = 'service-item' + (state.currentSelection === 'monitor-blocklist' ? ' active' : '');
  blocklistItem.innerHTML = `<span class="material-icons">shield</span> Blocklist`;
  blocklistItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'monitor-blocklist' }) : '#monitor-blocklist';
  if (isFirstTimeSetup || !state.secretsSaved) {
    blocklistItem.style.opacity = '0.5';
    blocklistItem.style.cursor = 'default';
    blocklistItem.style.pointerEvents = 'none';
  } else {
    blocklistItem.onclick = preventDefaultThen(() => selectItem('monitor-blocklist'));
  }
  fragment.appendChild(blocklistItem);

  const managementHeader = document.createElement('h2');
  managementHeader.textContent = 'Management';
  fragment.appendChild(managementHeader);

  const appItem = document.createElement('a');
  appItem.className = 'service-item' + (state.currentSelection === 'management-application' ? ' active' : '');
  appItem.innerHTML = '<span class="material-icons">settings</span> Application';
  appItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-application' }) : '#management-application';
  if (!isFirstTimeSetup && !state.secretsSaved) {
    appItem.style.opacity = '0.5';
    appItem.style.cursor = 'default';
    appItem.style.pointerEvents = 'none';
  } else {
    appItem.onclick = preventDefaultThen(() => selectItem('management-application'));
  }
  fragment.appendChild(appItem);

  const secretsItem = document.createElement('a');
  secretsItem.className = 'service-item' + (state.currentSelection === 'management-secrets' ? ' active' : '');
  secretsItem.innerHTML = '<span class="material-icons">vpn_key</span> Secrets';
  secretsItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-secrets' }) : '#management-secrets';
  if (isFirstTimeSetup) {
    secretsItem.style.opacity = '0.5';
    secretsItem.style.cursor = 'default';
    secretsItem.style.pointerEvents = 'none';
  } else {
    secretsItem.onclick = preventDefaultThen(() => selectItem('management-secrets'));
  }
  fragment.appendChild(secretsItem);

  const usersItem = document.createElement('a');
  usersItem.className = 'service-item' + (state.currentSelection === 'management-users' ? ' active' : '');
  usersItem.innerHTML = '<span class="material-icons">group</span> Users';
  usersItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-users' }) : '#management-users';
  if (isFirstTimeSetup || !state.secretsSaved) {
    usersItem.style.opacity = '0.5';
    usersItem.style.cursor = 'default';
    usersItem.style.pointerEvents = 'none';
  } else {
    usersItem.onclick = preventDefaultThen(() => selectItem('management-users'));
  }
  fragment.appendChild(usersItem);

  const certsItem = document.createElement('a');
  const cerStatus = getCertificateStatus();
  const canProvision = cerStatus.needDeprovisioning.length > 0 || cerStatus.needProvisioning.length > 0;
  certsItem.className = 'service-item' + (state.currentSelection === 'management-certificates' ? ' active' : '') + (canProvision ? ' insecure' : '');
  certsItem.innerHTML = '<span class="material-icons">lock</span> Certificates ' + (canProvision ? '<span class="hint">Reprovision</span>' : '') + '</span>';
  certsItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-certificates' }) : '#management-certificates';
  if (isFirstTimeSetup || !state.secretsSaved) {
    certsItem.style.opacity = '0.5';
    certsItem.style.cursor = 'default';
    certsItem.style.pointerEvents = 'none';
  } else {
    certsItem.onclick = preventDefaultThen(() => selectItem('management-certificates'));
  }
  fragment.appendChild(certsItem);

  const ddnsItem = document.createElement('a');
  ddnsItem.className = 'service-item' + (state.currentSelection === 'management-ddns' ? ' active' : '');
  ddnsItem.innerHTML = '<span class="material-icons">public</span> Dynamic DNS';
  ddnsItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-ddns' }) : '#management-ddns';
  if (isFirstTimeSetup || !state.secretsSaved) {
    ddnsItem.style.opacity = '0.5';
    ddnsItem.style.cursor = 'default';
    ddnsItem.style.pointerEvents = 'none';
  } else {
    ddnsItem.onclick = preventDefaultThen(() => selectItem('management-ddns'));
  }
  fragment.appendChild(ddnsItem);

  const themeItem = document.createElement('a');
  themeItem.className = 'service-item' + (state.currentSelection === 'management-theme' ? ' active' : '');
  themeItem.innerHTML = '<span class="material-icons">palette</span> Theme';
  themeItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-theme' }) : '#management-theme';
  if (isFirstTimeSetup || !state.secretsSaved) {
    themeItem.style.opacity = '0.5';
    themeItem.style.cursor = 'default';
    themeItem.style.pointerEvents = 'none';
  } else {
    themeItem.onclick = preventDefaultThen(() => selectItem('management-theme'));
  }
  fragment.appendChild(themeItem);

  const advancedItem = document.createElement('a');
  advancedItem.className = 'service-item' + (state.currentSelection === 'management-advanced' ? ' active' : '');
  advancedItem.innerHTML = '<span class="material-icons">science</span> Advanced';
  advancedItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'management-advanced' }) : '#management-advanced';
  if (isFirstTimeSetup || !state.secretsSaved) {
    advancedItem.style.opacity = '0.5';
    advancedItem.style.cursor = 'default';
    advancedItem.style.pointerEvents = 'none';
  } else {
    advancedItem.onclick = preventDefaultThen(() => selectItem('management-advanced'));
  }
  fragment.appendChild(advancedItem);

  const configHeader = document.createElement('h2');
  configHeader.textContent = 'Configuration';
  fragment.appendChild(configHeader);

  const domainItem = document.createElement('a');
  const domainName = state.config.domain;
  domainItem.className = 'service-item' + (state.currentSelection === 'config-domain' ? ' active' : '');
  domainItem.innerHTML = `<span class="material-icons">public</span> <span id="domainNameContainer" class="name-container"><span class="subdomain-name-container">Domain</span>${domainName ? `<span class="nicename-name-container"> - ${domainName}</span>` : ''}</span>`;
  domainItem.href = window.buildAppRoute ? window.buildAppRoute({ section: 'config-domain' }) : '#config-domain';
  if (isFirstTimeSetup || !state.secretsSaved) {
    domainItem.style.opacity = '0.5';
    domainItem.style.cursor = 'default';
    domainItem.style.pointerEvents = 'none';
  } else {
    domainItem.onclick = preventDefaultThen(() => selectItem('config-domain'));
  }
  fragment.appendChild(domainItem);

  // Add services
  const defaultServices = ['www', 'api'];
  const services = state.config.services || {};
  const sortedServices = Object.keys(services).sort((a, b) => {
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
    const service = services[serviceName];
    const nicename = service?.nicename;
    const rootService = !state.config.rootservice && serviceName === 'www' || state.config.rootservice === serviceName;
    const isActive = state.currentSelection === `config-${serviceName}`;
    const protocol = service?.subdomain?.protocol;
    const serviceType = service?.subdomain?.type;
    const disabled = service?.subdomain?.disabled;
    const icon = getServiceIcon(serviceType);
    const serviceItem = document.createElement('a');

    serviceItem.className = 'service-item' 
      + (isActive ? ' active' : '') 
      + (protocol === 'insecure' ? ' insecure' : '') 
      + (rootService ? ' root-service' : '');
    
    let hintParts = [];

    if (rootService) {
      hintParts.push('Root Service');
    }

    if (protocol === 'insecure') {
      hintParts.push('Not Secure');
    }

    if (disabled) {
      hintParts = ['Disabled'];
    }
    
    serviceItem.innerHTML = `${icon} <span id="${serviceName}NameContainer" class="name-container"><span class="subdomain-name-container">${serviceName}</span>${nicename ? `<span class="nicename-container"> - ${nicename}</span>` : ''}</span>` + (hintParts.length > 0 ? ' <span class="hint">' + hintParts.join(', ') + '</span>' : '');
    serviceItem.href = window.buildAppRoute ? window.buildAppRoute({ section: `config-${serviceName}` }) : `#config-${serviceName}`;
    
    if (isFirstTimeSetup || !state.secretsSaved) {
      serviceItem.style.opacity = '0.5';
      serviceItem.style.cursor = 'default';
      serviceItem.style.pointerEvents = 'none';
    } else {
      serviceItem.onclick = preventDefaultThen(() => selectItem(`config-${serviceName}`));
    }
    
    fragment.appendChild(serviceItem);

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

/**
 * Get the section type based on the prefixed name
 * @param {string} prefixedName - The prefixed name of the section
 * @returns {string|null} - 'management', 'config', or null if unknown
 */
function getSectionType(prefixedName) {
  if (prefixedName.startsWith('management-') || prefixedName.startsWith('monitor-')) return 'management';
  if (prefixedName.startsWith('config-')) return 'config';
  return null;
}

/**
 * Determine if navigation away from a section is allowed (checks unsaved changes)
 * @param {string} fromSection - Current section identifier
 * @param {string} toSection - Target section identifier
 * @returns {boolean} True if navigation is allowed
 */
export function canNavigateAway(fromSection, toSection) {
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

/**
 * Block navigation and show a UI hint to save or revert changes
 * @returns {void}
 */
export function blockNavigation() {
  showMobilePanel('editor');
  const actions = document.getElementById('editorActions');
  actions.insertAdjacentHTML('afterbegin', '<span class="editor-actions-spotlight-text hint" id="spotlightText">Please save your changes or revert them before navigating away.</span>');
  const actionsContainer = document.getElementById('editorActionsContainer');
  actionsContainer.classList.add('spotlight');
}

/**
 * Check whether there are unsaved configuration changes
 * @returns {boolean} True if config has unsaved changes
 */
export function hasUnsavedConfigChanges() {
  return JSON.stringify(state.config) !== JSON.stringify(state.originalConfig);
}

/**
 * Check whether there are unsaved secrets changes
 * @returns {boolean} True if secrets have unsaved changes
 */
export function hasUnsavedSecretsChanges() {
  return JSON.stringify(state.secrets) !== JSON.stringify(state.originalSecrets);
}

/**
 * Check whether there are unsaved users changes
 * @returns {boolean} True if users have unsaved changes
 */
export function hasUnsavedUsersChanges() {
  return JSON.stringify(state.users) !== JSON.stringify(state.originalUsers);
}

/**
 * Check whether there are unsaved DDNS changes
 * @returns {boolean} True if DDNS has unsaved changes
 */
export function hasUnsavedDdnsChanges() {
  return JSON.stringify(state.ddns) !== JSON.stringify(state.originalDdns);
}

/**
 * Check whether there are unsaved blocklist changes
 * @returns {boolean} True if blocklist has unsaved changes
 */
export function hasUnsavedBlocklistChanges() {
  return JSON.stringify(state.blocklist) !== JSON.stringify(state.originalBlocklist);
}

/**
 * Check whether there are unsaved theme (colors/favicon) changes
 * @returns {boolean} True if theme has unsaved changes
 */
export function hasUnsavedThemeChanges() {
  return JSON.stringify(state.colors) !== JSON.stringify(state.originalColors) || state.pendingFaviconFile !== null;
}

/**
 * Check whether there are unsaved ecosystem (PM2) changes
 * @returns {boolean} True if ecosystem has unsaved changes
 */
export function hasUnsavedEcosystemChanges() {
  return JSON.stringify(state.ecosystem) !== JSON.stringify(state.originalEcosystem);
}

/**
 * Check whether there are unsaved advanced-settings changes
 * @returns {boolean} True if advanced settings have unsaved changes
 */
export function hasUnsavedAdvancedChanges() {
  return JSON.stringify(state.advanced) !== JSON.stringify(state.originalAdvanced);
}

/**
 * Check whether there are any unsaved management-related changes
 * @returns {boolean} True if any management area has unsaved changes
 */
export function hasUnsavedManagementChanges() {
  return hasUnsavedEcosystemChanges() || 
         hasUnsavedSecretsChanges() || 
         hasUnsavedUsersChanges() || 
         hasUnsavedDdnsChanges() ||
         hasUnsavedThemeChanges() ||
         hasUnsavedAdvancedChanges() ||
         hasUnsavedBlocklistChanges();
}

/**
 * Check whether there are any unsaved changes across the entire UI
 * @returns {boolean} True if any unsaved changes exist
 */
export function hasUnsavedChanges() {
  return hasUnsavedConfigChanges() || hasUnsavedManagementChanges();
}

/**
 * Get certificate provisioning status summary for the UI
 * @returns {object} Certificate status object
 */
export function getCertificateStatus() {
  return gcs();
}
