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
import * as utils from './utils.js';
import * as ui from './ui-components.js';

// ============================================================================
// GLOBAL FUNCTION EXPOSURE
// All functions called from HTML onclick/onchange handlers must be on window
// ============================================================================

// Expose Utility Functions
window.buildAppRoute = utils.buildAppRoute;
window.parseAppRoute = utils.parseAppRoute;
window.preventDefaultThen = utils.preventDefaultThen;
window.clickItemByID = utils.clickItemByID;

// UI Components
window.showMobilePanel = ui.showMobilePanel;
window.closeConfirmModal = ui.closeConfirmModal;
window.confirmAction = ui.confirmAction;
window.closePromptModal = ui.closePromptModal;
window.submitPrompt = ui.submitPrompt;
window.toggleDropdown = ui.toggleDropdown;
window.selectDropdownOption = ui.selectDropdownOption;
window.removeDropdownTag = ui.removeDropdownTag;
window.togglePasswordVisibility = ui.togglePasswordVisibility;

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
window.filterBlocklist = blocklistEditor.filterBlocklist;
window.clearBlocklistSearch = blocklistEditor.clearBlocklistSearch;
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
window.filterUsersUsername = usersEditor.filterUsersUsername;
window.onUsersServiceFilterChange = usersEditor.onUsersServiceFilterChange;
window.clearUsersSearch = usersEditor.clearUsersSearch;

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
  await api.loadDdns(true);
  await api.loadEcosystem(true);
  await api.loadAdvanced(true);
  await api.loadCerts(true);
  await api.loadGitStatus(true);
  await api.loadLogRotateStatus(true);
  await api.loadColors(true);
  // Blocklist is loaded on demand when navigating to blocklist editor 
  // because the system can write to it outside of the configurator.
  
  // Initialize theme after colors are loaded
  themeEditor.initTheme();

  editors.renderServicesList();
  editors.renderPlaceholderEditor();

  // Handle path-based routing and initial view
  const url = new URL(window.location);
  const justUpdated = url.searchParams.get('updated') === 'true';
  const justRestarted = url.searchParams.get('restarted') === 'true';

  if (justUpdated) {
    url.searchParams.delete('updated');
    ui.showStatus('Update completed successfully!', 'success');
  }
  if (justRestarted) {
    url.searchParams.delete('restarted');
    ui.showStatus('Server restarted successfully!', 'success');
  }
  if (justUpdated || justRestarted) {
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

  // Parse path for route
  const route = parseAppRoute(window.location.pathname);

  if (isFirstTimeSetup) {
    editors.selectItem('management-application');
  } else if (state.secretsSaved === false) {
    editors.selectItem('management-secrets');
  } else if (state.config.domain === '' || state.config.domain.trim() === '') {
    editors.selectItem('config-domain');
  } else if (canProvision) {
    editors.selectItem('management-certificates');
  } else if (route.section) {
    editors.selectItem(route.section, route.type, route.folder, route.path, false);
  }
  
  // Event listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ui.closeConfirmModal();
      ui.closePromptModal();
    }
  });

  // Prevent navigation with unsaved changes
  window.addEventListener('beforeunload', (event) => {
    if (!state.rebooting && editors.hasUnsavedChanges()) {
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

    const route = parseAppRoute(window.location.pathname);
    if (route.section) {
      editors.selectItem(route.section, route.type, route.folder, route.path, false);
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
