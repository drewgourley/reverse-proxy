// Complete Configurator - Core Editors Module
// This file contains core navigation, rendering, and helper functions
// Individual editors have been separated into their own modules

import * as state from './state.js';
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

// ============================================================================
// CORE NAVIGATION & RENDERING
// ============================================================================

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

export function selectItem(prefixedName, type, folder, path, pushState = true) {
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
}

export function renderServicesList() {
  const list = document.getElementById('servicesList');
  
  const fragment = document.createDocumentFragment();
  
  const isFirstTimeSetup = state.ecosystem.default === true;
  const secretsEnabled = !isFirstTimeSetup;
  const usersEnabled = secretsEnabled && !isFirstTimeSetup && state.secretsSaved;

  const monitorHeader = document.createElement('h2');
  monitorHeader.textContent = 'Activity Monitor';
  fragment.appendChild(monitorHeader);

  const logsItem = document.createElement('div');
  logsItem.className = 'service-item' + (state.currentSelection === 'monitor-logs' ? ' active' : '');
  logsItem.innerHTML = '<span class="material-icons">article</span> Logs';
  if (isFirstTimeSetup) {
    logsItem.style.opacity = '0.5';
    logsItem.style.cursor = 'default';
    logsItem.style.pointerEvents = 'none';
  } else {
    logsItem.onclick = () => selectItem('monitor-logs');
  }
  fragment.appendChild(logsItem);

  const blocklistItem = document.createElement('div');
  blocklistItem.className = 'service-item' + (state.currentSelection === 'monitor-blocklist' ? ' active' : '');
  blocklistItem.innerHTML = `<span class="material-icons">shield</span> Blocklist`;
  if (isFirstTimeSetup) {
    blocklistItem.style.opacity = '0.5';
    blocklistItem.style.cursor = 'default';
    blocklistItem.style.pointerEvents = 'none';
  } else {
    blocklistItem.onclick = () => selectItem('monitor-blocklist');
  }
  fragment.appendChild(blocklistItem);

  const managementHeader = document.createElement('h2');
  managementHeader.textContent = 'Management';
  fragment.appendChild(managementHeader);

  const appItem = document.createElement('div');
  appItem.className = 'service-item' + (state.currentSelection === 'management-application' ? ' active' : '');
  appItem.innerHTML = '<span class="material-icons">settings</span> Application';
  appItem.onclick = () => selectItem('management-application');
  fragment.appendChild(appItem);

  const secretsItem = document.createElement('div');
  secretsItem.className = 'service-item' + (state.currentSelection === 'management-secrets' ? ' active' : '');
  secretsItem.innerHTML = '<span class="material-icons">vpn_key</span> Secrets';
  if (!secretsEnabled) {
    secretsItem.style.opacity = '0.5';
    secretsItem.style.cursor = 'default';
    secretsItem.style.pointerEvents = 'none';
  } else {
    secretsItem.onclick = () => selectItem('management-secrets');
  }
  fragment.appendChild(secretsItem);

  const usersItem = document.createElement('div');
  usersItem.className = 'service-item' + (state.currentSelection === 'management-users' ? ' active' : '');
  usersItem.innerHTML = '<span class="material-icons">group</span> Users';
  if (!usersEnabled) {
    usersItem.style.opacity = '0.5';
    usersItem.style.cursor = 'default';
    usersItem.style.pointerEvents = 'none';
  } else {
    usersItem.onclick = () => selectItem('management-users');
  }
  fragment.appendChild(usersItem);

  const certsItem = document.createElement('div');
  certsItem.className = 'service-item' + (state.currentSelection === 'management-certificates' ? ' active' : '');
  certsItem.innerHTML = '<span class="material-icons">lock</span> Certificates';
  if (!usersEnabled) {
    certsItem.style.opacity = '0.5';
    certsItem.style.cursor = 'default';
    certsItem.style.pointerEvents = 'none';
  } else {
    certsItem.onclick = () => selectItem('management-certificates');
  }
  fragment.appendChild(certsItem);

  const ddnsItem = document.createElement('div');
  ddnsItem.className = 'service-item' + (state.currentSelection === 'management-ddns' ? ' active' : '');
  ddnsItem.innerHTML = '<span class="material-icons">public</span> Dynamic DNS';
  if (!usersEnabled) {
    ddnsItem.style.opacity = '0.5';
    ddnsItem.style.cursor = 'default';
    ddnsItem.style.pointerEvents = 'none';
  } else {
    ddnsItem.onclick = () => selectItem('management-ddns');
  }
  fragment.appendChild(ddnsItem);

  const themeItem = document.createElement('div');
  themeItem.className = 'service-item' + (state.currentSelection === 'management-theme' ? ' active' : '');
  themeItem.innerHTML = '<span class="material-icons">palette</span> Theme';
  if (isFirstTimeSetup || !state.secretsSaved) {
    themeItem.style.opacity = '0.5';
    themeItem.style.cursor = 'default';
    themeItem.style.pointerEvents = 'none';
  } else {
    themeItem.onclick = () => selectItem('management-theme');
  }
  fragment.appendChild(themeItem);

  const advancedItem = document.createElement('div');
  advancedItem.className = 'service-item' + (state.currentSelection === 'management-advanced' ? ' active' : '');
  advancedItem.innerHTML = '<span class="material-icons">science</span> Advanced';
  if (isFirstTimeSetup || !state.secretsSaved) {
    advancedItem.style.opacity = '0.5';
    advancedItem.style.cursor = 'default';
    advancedItem.style.pointerEvents = 'none';
  } else {
    advancedItem.onclick = () => selectItem('management-advanced');
  }
  fragment.appendChild(advancedItem);

  const configHeader = document.createElement('h2');
  configHeader.textContent = 'Configuration';
  fragment.appendChild(configHeader);

  const domainItem = document.createElement('div');
  const domainName = state.config.domain;
  domainItem.className = 'service-item' + (state.currentSelection === 'config-domain' ? ' active' : '');
  domainItem.innerHTML = `<span class="material-icons">public</span> <span id="domainNameContainer" class="name-container"><span class="subdomain-name-container">Domain</span>${domainName ? `<span class="nicename-name-container"> - ${domainName}</span>` : ''}</span>`;
  if (isFirstTimeSetup || !state.secretsSaved) {
    domainItem.style.opacity = '0.5';
    domainItem.style.cursor = 'default';
    domainItem.style.pointerEvents = 'none';
  } else {
    domainItem.onclick = () => selectItem('config-domain');
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
    
    // Get icon dynamically based on service type
    let icon = 'settings';
    if (serviceType === 'index') icon = 'description';
    else if (serviceType === 'proxy') icon = 'swap_horiz';
    else if (serviceType === 'dirlist') icon = 'folder_open';
    else if (serviceType === 'spa') icon = 'flash_on';
    
    const serviceItem = document.createElement('div');
    serviceItem.className = 'service-item' 
      + (isActive ? ' active' : '') 
      + (protocol === 'insecure' ? ' insecure' : '') 
      + (rootService ? ' root-service' : '');
    
    const hintParts = [];
    if (rootService) {
      hintParts.push('Root Service');
    }
    if (protocol === 'insecure') {
      hintParts.push('Not Secure');
    }
    
    serviceItem.innerHTML = `<span class="material-icons">${icon}</span> <span id="${serviceName}NameContainer" class="name-container"><span class="subdomain-name-container">${serviceName}</span>${nicename ? `<span class="nicename-container"> - ${nicename}</span>` : ''}</span>` + (hintParts.length > 0 ? ' <span class="hint">' + hintParts.join(', ') + '</span>' : '');
    
    if (isFirstTimeSetup || !state.secretsSaved) {
      serviceItem.style.opacity = '0.5';
      serviceItem.style.cursor = 'default';
      serviceItem.style.pointerEvents = 'none';
    } else {
      serviceItem.onclick = () => selectItem(`config-${serviceName}`);
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getSectionType(prefixedName) {
  if (prefixedName.startsWith('management-') || prefixedName.startsWith('monitor-')) return 'management';
  if (prefixedName.startsWith('config-')) return 'config';
  return null;
}

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

export function blockNavigation() {
  showMobilePanel('editor');
  const actions = document.getElementById('editorActions');
  actions.insertAdjacentHTML('afterbegin', '<span class="editor-actions-spotlight-text hint" id="spotlightText">Please save your changes or revert them before navigating away.</span>');
  const actionsContainer = document.getElementById('editorActionsContainer');
  actionsContainer.classList.add('spotlight');
}

export function hasUnsavedConfigChanges() {
  return JSON.stringify(state.config) !== JSON.stringify(state.originalConfig);
}

export function hasUnsavedSecretsChanges() {
  return JSON.stringify(state.secrets) !== JSON.stringify(state.originalSecrets);
}

export function hasUnsavedUsersChanges() {
  return JSON.stringify(state.users) !== JSON.stringify(state.originalUsers);
}

export function hasUnsavedDdnsChanges() {
  return JSON.stringify(state.ddns) !== JSON.stringify(state.originalDdns);
}

export function hasUnsavedBlocklistChanges() {
  return JSON.stringify(state.blocklist) !== JSON.stringify(state.originalBlocklist);
}

export function hasUnsavedThemeChanges() {
  return JSON.stringify(state.colors) !== JSON.stringify(state.originalColors) || state.pendingFaviconFile !== null;
}

export function hasUnsavedEcosystemChanges() {
  return JSON.stringify(state.ecosystem) !== JSON.stringify(state.originalEcosystem);
}

export function hasUnsavedAdvancedChanges() {
  return JSON.stringify(state.advanced) !== JSON.stringify(state.originalAdvanced);
}

export function hasUnsavedManagementChanges() {
  return hasUnsavedEcosystemChanges() || 
         hasUnsavedSecretsChanges() || 
         hasUnsavedUsersChanges() || 
         hasUnsavedDdnsChanges() ||
         hasUnsavedThemeChanges() ||
         hasUnsavedAdvancedChanges() ||
         hasUnsavedBlocklistChanges();
}

export function hasUnsavedChanges() {
  return hasUnsavedConfigChanges() || hasUnsavedManagementChanges();
}

export function getCertificateStatus() {
  return gcs();
}
