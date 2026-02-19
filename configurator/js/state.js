// All application state variables in one place
export let config = {};
export let originalConfig = {};
export let secrets = {};
export let originalSecrets = {};
export let users = {};
export let originalUsers = {};
export let ddns = {};
export let originalDdns = {};
export let ecosystem = {};
export let originalEcosystem = {};
export let advanced = {};
export let originalAdvanced = {};
export let certs = {};
export let originalCerts = {};
export let gitStatus = {};
export let blocklist = [];
export let originalBlocklist = [];
export let colors = {};
export let originalColors = {};
export let pendingFaviconFile = null;
export let rebooting = false;
export let secretsSaved = false;
export let logRotateInstalled = false;
export let currentSelection = null;
export let currentFileManagerContext = null;
export let selectedFiles = new Set();
export let allowPopStateNavigation = false;
export let currentUrl = window.location.href;
export let environment = ''; // defaulting to blank, will be overridden by server data

/**
 * Set the global `config` state
 * @param {Object} value - New config object
 * @returns {void}
 */
export function setConfig(value) { config = value; }

/**
 * Set the saved/original `config` snapshot
 * @param {Object} value - Original config object
 * @returns {void}
 */
export function setOriginalConfig(value) { originalConfig = value; }

/**
 * Set the global `secrets` state
 * @param {Object} value - New secrets object
 * @returns {void}
 */
export function setSecrets(value) { secrets = value; }

/**
 * Set the saved/original `secrets` snapshot
 * @param {Object} value - Original secrets object
 * @returns {void}
 */
export function setOriginalSecrets(value) { originalSecrets = value; }

/**
 * Set the global `users` state
 * @param {Object} value - New users object
 * @returns {void}
 */
export function setUsers(value) { users = value; }

/**
 * Set the saved/original `users` snapshot
 * @param {Object} value - Original users object
 * @returns {void}
 */
export function setOriginalUsers(value) { originalUsers = value; }

/**
 * Set the global `ddns` state
 * @param {Object} value - New DDNS object
 * @returns {void}
 */
export function setDdns(value) { ddns = value; }

/**
 * Set the saved/original `ddns` snapshot
 * @param {Object} value - Original DDNS object
 * @returns {void}
 */
export function setOriginalDdns(value) { originalDdns = value; }

/**
 * Set the global `ecosystem` state
 * @param {Object} value - New ecosystem object
 * @returns {void}
 */
export function setEcosystem(value) { ecosystem = value; }

/**
 * Set the saved/original `ecosystem` snapshot
 * @param {Object} value - Original ecosystem object
 * @returns {void}
 */
export function setOriginalEcosystem(value) { originalEcosystem = value; }

/**
 * Set the global `advanced` state
 * @param {Object} value - New advanced settings
 * @returns {void}
 */
export function setAdvanced(value) { advanced = value; }

/**
 * Set the saved/original `advanced` snapshot
 * @param {Object} value - Original advanced settings
 * @returns {void}
 */
export function setOriginalAdvanced(value) { originalAdvanced = value; }

/**
 * Set the global `certs` state
 * @param {Object} value - New certs object
 * @returns {void}
 */
export function setCerts(value) { certs = value; }

/**
 * Set the saved/original `certs` snapshot
 * @param {Object} value - Original certs object
 * @returns {void}
 */
export function setOriginalCerts(value) { originalCerts = value; }

/**
 * Set the global `gitStatus` state
 * @param {Object} value - Git status object
 * @returns {void}
 */
export function setGitStatus(value) { gitStatus = value; }

/**
 * Set the global `blocklist` state
 * @param {Array} value - Blocklist array
 * @returns {void}
 */
export function setBlocklist(value) { blocklist = value; }

/**
 * Set the saved/original `blocklist` snapshot
 * @param {Array} value - Original blocklist array
 * @returns {void}
 */
export function setOriginalBlocklist(value) { originalBlocklist = value; }

/**
 * Set the global `colors` state
 * @param {Object} value - Colors object
 * @returns {void}
 */
export function setColors(value) { colors = value; }

/**
 * Set the saved/original `colors` snapshot
 * @param {Object} value - Original colors object
 * @returns {void}
 */
export function setOriginalColors(value) { originalColors = value; }

/**
 * Set a pending favicon upload file reference
 * @param {File|null} value - Favicon file or null
 * @returns {void}
 */
export function setPendingFaviconFile(value) { pendingFaviconFile = value; }

/**
 * Set rebooting indicator state
 * @param {boolean} value - Rebooting flag
 * @returns {void}
 */
export function setRebooting(value) { rebooting = value; }

/**
 * Set flag indicating whether secrets have been saved
 * @param {boolean} value - Secrets saved flag
 * @returns {void}
 */
export function setSecretsSaved(value) { secretsSaved = value; }

/**
 * Set flag indicating whether log-rotate is installed
 * @param {boolean} value - Log rotate installed flag
 * @returns {void}
 */
export function setLogRotateInstalled(value) { logRotateInstalled = value; }

/**
 * Set current editor selection
 * @param {string|null} value - Current selection identifier
 * @returns {void}
 */
export function setCurrentSelection(value) { currentSelection = value; }

/**
 * Set current file manager context
 * @param {Object|null} value - File manager context
 * @returns {void}
 */
export function setCurrentFileManagerContext(value) { currentFileManagerContext = value; }

/**
 * Set selected files (file manager)
 * @param {Set} value - Set of selected file paths
 * @returns {void}
 */
export function setSelectedFiles(value) { selectedFiles = value; }

/**
 * Set whether popstate navigation is allowed
 * @param {boolean} value - Allow popstate navigation
 * @returns {void}
 */
export function setAllowPopStateNavigation(value) { allowPopStateNavigation = value; }

/**
 * Set the current URL (for history management)
 * @param {string} value - Current URL
 * @returns {void}
 */
export function setCurrentUrl(value) { currentUrl = value; }

/**
 * Set the application environment string
 * @param {string} value - Environment value (e.g., "production")
 * @returns {void}
 */
export function setEnvironment(value) { environment = value; }
