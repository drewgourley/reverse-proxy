// Main Application Entry Point
// Initializes the application and coordinates all modules

import * as state from './state.js';
import * as api from './api.js';
import * as editors from './editors.js';
import * as serviceEditor from './editors/service-editor.js';
import * as fileManager from './file-manager.js';
import * as logsViewer from './logs-viewer.js';
import * as update from './update.js';
import * as blocklistEditor from './editors/blocklist-editor.js';
import * as secretsEditor from './editors/secrets-editor.js';
import * as usersEditor from './editors/users-editor.js';
import * as ddnsEditor from './editors/ddns-editor.js';
import * as applicationEditor from './editors/application-editor.js';
import * as certificatesEditor from './editors/certificates-editor.js';
import * as advancedEditor from './editors/advanced-editor.js';
import * as domainEditor from './editors/domain-editor.js';
import * as themeEditor from './editors/theme-editor.js';
import { showMobilePanel, closeConfirmModal, confirmAction, closePromptModal, submitPrompt, toggleDropdown, selectDropdownOption, removeDropdownTag, togglePasswordVisibility, showStatus } from './ui-components.js';

// ============================================================================
// GLOBAL FUNCTION EXPOSURE
// All functions called from HTML onclick/onchange handlers must be on window
// ============================================================================

// UI Components
window.showMobilePanel = showMobilePanel;
window.closeConfirmModal = closeConfirmModal;
window.confirmAction = confirmAction;
window.closePromptModal = closePromptModal;
window.submitPrompt = submitPrompt;
window.toggleDropdown = toggleDropdown;
window.selectDropdownOption = selectDropdownOption;
window.removeDropdownTag = removeDropdownTag;
window.togglePasswordVisibility = togglePasswordVisibility;

// Editors Module - Core Navigation
window.selectItem = editors.selectItem;
window.renderServicesList = editors.renderServicesList;
window.renderPlaceholderEditor = editors.renderPlaceholderEditor;

// Logs Viewer
window.renderLogsViewer = logsViewer.renderLogsViewer;
window.switchLogType = logsViewer.switchLogType;

// Blocklist Editor
window.renderBlocklistEditor = blocklistEditor.renderBlocklistEditor;
window.addBlocklistEntry = blocklistEditor.addBlocklistEntry;
window.removeBlocklistEntry = blocklistEditor.removeBlocklistEntry;
window.saveBlocklist = blocklistEditor.saveBlocklist;
window.revertBlocklist = blocklistEditor.revertBlocklist;

// Secrets Editor
window.renderSecretsEditor = secretsEditor.renderSecretsEditor;
window.updateSecret = secretsEditor.updateSecret;
window.updatePasswordHash = secretsEditor.updatePasswordHash;
window.removeSecret = secretsEditor.removeSecret;
window.saveSecrets = secretsEditor.saveSecrets;
window.revertSecrets = secretsEditor.revertSecrets;

// Users Editor
window.renderUsersEditor = usersEditor.renderUsersEditor;
window.updateUser = usersEditor.updateUser;
window.updateUserPassword = usersEditor.updateUserPassword;
window.addNewUser = usersEditor.addNewUser;
window.removeUser = usersEditor.removeUser;
window.saveUsers = usersEditor.saveUsers;
window.revertUsers = usersEditor.revertUsers;

// DDNS Editor
window.renderDdnsEditor = ddnsEditor.renderDdnsEditor;
window.updateDdns = ddnsEditor.updateDdns;
window.saveDdns = ddnsEditor.saveDdns;
window.revertDdns = ddnsEditor.revertDdns;

// Application Editor
window.renderApplicationEditor = applicationEditor.renderApplicationEditor;
window.updateEcosystemName = applicationEditor.updateEcosystemName;
window.saveEcosystem = applicationEditor.saveEcosystem;
window.revertEcosystem = applicationEditor.revertEcosystem;

// Certificates Editor
window.renderCertificatesEditor = certificatesEditor.renderCertificatesEditor;
window.provisionCertificates = certificatesEditor.provisionCertificates;

// Advanced Editor
window.renderAdvancedEditor = advancedEditor.renderAdvancedEditor;
window.addAdvancedParser = advancedEditor.addAdvancedParser;
window.addAdvancedExtractor = advancedEditor.addAdvancedExtractor;
window.addAdvancedQueryType = advancedEditor.addAdvancedQueryType;
window.updateAdvancedParser = advancedEditor.updateAdvancedParser;
window.updateAdvancedExtractor = advancedEditor.updateAdvancedExtractor;
window.updateAdvancedQueryType = advancedEditor.updateAdvancedQueryType;
window.removeAdvancedParser = advancedEditor.removeAdvancedParser;
window.removeAdvancedExtractor = advancedEditor.removeAdvancedExtractor;
window.removeAdvancedQueryType = advancedEditor.removeAdvancedQueryType;
window.saveAdvanced = advancedEditor.saveAdvanced;
window.revertAdvanced = advancedEditor.revertAdvanced;

// Domain Editor
window.renderDomainEditor = domainEditor.renderDomainEditor;
window.updateConfig = domainEditor.updateConfig;
window.onRootServiceChange = domainEditor.onRootServiceChange;

// Service Editor Module - Main Rendering
window.renderServiceEditor = serviceEditor.renderServiceEditor;
window.getServiceIcon = serviceEditor.getServiceIcon;

// Service Editor Module - Property Updates
window.updateServiceProperty = serviceEditor.updateServiceProperty;

// Service Editor Module - Field Visibility
window.toggleFieldVisibility = serviceEditor.toggleFieldVisibility;
window.toggleHealthcheckFieldVisibility = serviceEditor.toggleHealthcheckFieldVisibility;
window.toggleMetaFieldVisibility = serviceEditor.toggleMetaFieldVisibility;

// Service Editor Module - Subdomain/Healthcheck Management
window.addSubdomain = serviceEditor.addSubdomain;
window.removeSubdomain = serviceEditor.removeSubdomain;
window.addHealthcheck = serviceEditor.addHealthcheck;
window.removeHealthcheck = serviceEditor.removeHealthcheck;

// Service Editor Module - Change Handlers
window.createSubdomainChangeHandlers = serviceEditor.createSubdomainChangeHandlers;
window.createHealthcheckChangeHandlers = serviceEditor.createHealthcheckChangeHandlers;

// Service Editor Module - Service Management
window.addNewService = serviceEditor.addNewService;
window.removeService = serviceEditor.removeService;

// Service Editor Module - Config Operations
window.saveConfig = serviceEditor.saveConfig;
window.resetEditor = serviceEditor.resetEditor;
window.cleanConfig = serviceEditor.cleanConfig;

// File Manager Module - Core
window.renderFileManager = fileManager.renderFileManager;
window.navigateFileManager = fileManager.navigateFileManager;
window.switchFolderType = fileManager.switchFolderType;
window.backToServiceEditor = fileManager.backToServiceEditor;

// File Manager Module - File Selection
window.toggleFileSelection = fileManager.toggleFileSelection;
window.clearFileSelection = fileManager.clearFileSelection;
window.selectAllFiles = fileManager.selectAllFiles;

// File Manager Module - Upload
window.showUploadDialog = fileManager.showUploadDialog;
window.uploadFile = fileManager.uploadFile;
window.handleOverwrite = fileManager.handleOverwrite;
window.handleRename = fileManager.handleRename;

// File Manager Module - Operations
window.showCreateDirectoryDialog = fileManager.showCreateDirectoryDialog;
window.createDirectory = fileManager.createDirectory;
window.deleteSelectedFiles = fileManager.deleteSelectedFiles;
window.renameSelectedFile = fileManager.renameSelectedFile;

// File Manager Module - Zip
window.showUnpackZipDialog = fileManager.showUnpackZipDialog;
window.unpackZip = fileManager.unpackZip;

// Update Module - Git & Updates
window.handleUpdate = update.handleUpdate;
window.forceUpdate = update.forceUpdate;

// Theme Editor
window.revertTheme = themeEditor.revertTheme;
window.saveTheme = themeEditor.saveTheme;

// Logs Viewer
window.installLogRotate = logsViewer.installLogRotate;

// Application initialization
document.addEventListener('DOMContentLoaded', async () => {
  // Load all configuration
  await api.loadConfig(true);
  await api.loadSecrets(true);
  await api.loadUsers(true);
  await api.loadBlocklist(true);
  await api.loadDdns(true);
  await api.loadEcosystem(true);
  await api.loadAdvanced(true);
  await api.loadCerts(true);
  await api.loadGitStatus(true);
  await api.loadLogRotateStatus(true);
  await api.loadColors(true);
  
  // Initialize theme after colors are loaded
  themeEditor.initializeTheme();

  editors.renderServicesList();
  editors.renderPlaceholderEditor();

  // Handle URL parameters and initial view
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
  
  // Initialize UI based on setup state
  const isFirstTimeSetup = state.ecosystem.default === true;
  const certStatus = editors.getCertificateStatus();
  const canProvision = certStatus.needDeprovisioning.length > 0 || certStatus.needProvisioning.length > 0;
  const addServiceBtn = document.getElementById('addServiceBtn');

  if (addServiceBtn && (isFirstTimeSetup || !state.secretsSaved)) {
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
    editors.selectItem('management-application');
  } else if (state.secretsSaved === false) {
    editors.selectItem('management-secrets');
  } else if (state.config.domain === '' || state.config.domain.trim() === '') {
    editors.selectItem('config-domain');
  } else if (canProvision) {
    editors.selectItem('management-certificates');
  } else {
    const section = urlParams.get('section');
    const type = urlParams.get('type');
    const folder = urlParams.get('folder');
    const path = urlParams.get('path');
    
    if (section) {
      const validMonitorSections = ['monitor-logs', 'monitor-blocklist'];
      const validManagementSections = ['management-application', 'management-secrets', 'management-users', 'management-theme', 'management-advanced'];
      if (state.secrets.admin_email_address && state.secrets.admin_email_address.trim() !== '') {
        validManagementSections.push('management-certificates');
      }
      if (state.config.domain && state.config.domain.trim() !== '') {
        validManagementSections.push('management-ddns');
      }
      const validConfigSections = ['config-domain'];
      const isValidMonitor = validMonitorSections.includes(section);
      const isValidManagement = validManagementSections.includes(section);
      const isValidConfig = validConfigSections.includes(section);
      const isService = section.startsWith('config-') && state.config.services && state.config.services[section.replace('config-', '')];

      if (isValidManagement || isValidConfig || isService || isValidMonitor) {
        editors.selectItem(section, type, folder, path, false);
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
  
  // Event listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConfirmModal();
      closePromptModal();
    }
  });

  // Prevent navigation with unsaved changes
  window.addEventListener('beforeunload', (event) => {
    if (editors.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = ''; // Required for Chrome
      return ''; // For older browsers
    }
  });

  // Popstate handler for browser back/forward navigation
  window.addEventListener('popstate', (event) => {
    if (state.allowPopStateNavigation) {
      state.setAllowPopStateNavigation(false);
      state.setCurrentUrl(window.location.href);
    } else if (editors.hasUnsavedConfigChanges() || editors.hasUnsavedManagementChanges()) {
      history.pushState(null, '', state.currentUrl);
      editors.blockNavigation();
      return;
    } else {
      state.setCurrentUrl(window.location.href);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const section = urlParams.get('section');
    const type = urlParams.get('type');
    const folder = urlParams.get('folder');
    const path = urlParams.get('path');
    
    if (section) {
      const validMonitorSections = ['monitor-logs', 'monitor-blocklist'];
      const validManagementSections = ['management-application', 'management-secrets', 'management-users', 'management-theme', 'management-advanced'];
      if (state.secrets.admin_email_address && state.secrets.admin_email_address.trim() !== '') {
        validManagementSections.push('management-certificates');
      }
      if (state.config.domain && state.config.domain.trim() !== '') {
        validManagementSections.push('management-ddns');
      }
      const validConfigSections = ['config-domain'];
      const isValidMonitor = validMonitorSections.includes(section);
      const isValidManagement = validManagementSections.includes(section);
      const isValidConfig = validConfigSections.includes(section);
      const isService = section.startsWith('config-') && state.config.services && state.config.services[section.replace('config-', '')];
      
      if (isValidManagement || isValidConfig || isService || isValidMonitor) {
        editors.selectItem(section, type, folder, path, false);
      }
    } else {
      state.setCurrentSelection(null);
      editors.renderPlaceholderEditor();
      editors.renderServicesList();
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.multi-select')) {
      document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
    }
  });

  document.documentElement.classList.add('loaded');
});
