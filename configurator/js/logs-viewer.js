import * as state from './state.js';
import * as api from './api.js';
import { parseErrorMessage } from './utils.js';
import { reloadPage, waitForServerRestart, showStatus, showLoadingOverlay } from './ui-components.js';

// Module-level state for log streaming
let logLines = [];
let logType;
let eventSource;

/**
 * Render the Logs viewer panel
 * @param {string} [type='out'] - Log type ('out' or 'error')
 * @param {boolean} [pushState=true] - Whether to push a history state
 * @returns {void}
 */
export function renderLogsViewer(type = 'out', pushState = true) {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  if (pushState) {
    const routePath = window.buildAppRoute({ section: 'monitor-logs', type });
    window.history.pushState({}, '', routePath);
  }

  actions.classList.add('hidden');
  panel.classList.remove('scrollable');

  let html = `
    <div class="section logs-section">
      <div class="section-title"><span class="material-icons">article</span> Activity Logs</div>
      <div class="hint hint-section">View real-time logs of application activity and healthchecks.</div>
  `;

  if (!state.logRotateInstalled) {
    html += `
      <div class="installation-trigger highlight-recommended">
        <button class="btn-add-logrotate" id="installLogRotateBtn" onclick="installLogRotate()">Install PM2 Log Rotate Module</button>
        <div class="hint hint-section">Log rotate module is highly recommended for managing log files efficiently.</div>
      </div>
    `;
  }

  const routeOut = window.buildAppRoute ? window.buildAppRoute({ section: 'monitor-logs', type: 'out' }) : '#monitor-logs-out';
  const routeErr = window.buildAppRoute ? window.buildAppRoute({ section: 'monitor-logs', type: 'error' }) : '#monitor-logs-error';

  html += `
      <div class="logs-container">
        <div class="logs-tabs-row">
          <a href="${routeOut}" class="tab-log-type${type === 'out' ? ' active' : ''}" id="btnLogOut" onclick="(preventDefaultThen(() => switchLogType('out')))(event)"><span class="material-icons">terminal</span> Standard Output</a>
          <a href="${routeErr}" class="tab-log-type${type === 'error' ? ' active' : ''}" id="btnLogErr" onclick="(preventDefaultThen(() => switchLogType('error')))(event)"><span class="material-icons">error</span> Error Output</a>
        </div>
        <div id="logsContentContainer"></div>
      </div>
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = '';

  renderLogsViewerContent(type);
}

/**
 * Switch between log types (standard/error) in the Logs viewer
 * @param {string} type - 'out' or 'error'
 * @returns {void}
 */
export function switchLogType(type) {
  const routePath = window.buildAppRoute({ section: 'monitor-logs', type });
  window.history.pushState({}, '', routePath);

  // Update tab styles
  const btnOut = document.getElementById('btnLogOut');
  const btnErr = document.getElementById('btnLogErr');
  if (btnOut && btnErr) {
    btnOut.classList.toggle('active', type === 'out');
    btnErr.classList.toggle('active', type === 'error');
  }

  renderLogsViewerContent(type);
}

/**
 * Render the inner content container for the Logs viewer
 * @param {string} [type='out'] - Log type to display
 * @returns {void}
 */
export function renderLogsViewerContent(type = 'out') {
  const container = document.getElementById('logsContentContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div id="logsBox" class="logs-box">
      <pre id="logsContent" class="logs-content">Loading logs...</pre>
    </div>
  `;

  startLogStream(type);
}

/**
 * Start streaming logs from the server via EventSource
 * @param {string} [type='out'] - Log stream type ('out' or 'error')
 * @returns {void}
 */
export function startLogStream(type = 'out') {
  const appName = state.ecosystem?.apps?.[0]?.name ? (state.ecosystem.apps[0].name).replace(' ', '-') : 'Reverse-Proxy';
  const maxLines = 10000;
  const logsBox = document.getElementById('logsBox');
  const logsContent = document.getElementById('logsContent');
  
  if (!logsBox || !logsContent) {
    return;
  }
  
  let isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
  if (logType !== type) {
    logLines = [];
    logType = type;
    logLines.push(`Connecting to ${type === 'out' ? 'standard output' : 'error output'} log stream...`);
    logsContent.textContent = logLines.join('\n') + '\n';
  }
  if (eventSource) {
    eventSource.close();
  }
  eventSource = new EventSource(`/logs/${appName}/${type}`);
  eventSource.onmessage = function(event) {
    if (!logsBox || !logsContent) return;
    // Only auto-scroll if user is already at the bottom
    isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
    logLines.push(event.data);
    const lastIndex = logLines.length - 1;
    const zuluTimeMatch = logLines[lastIndex].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z):\s(.*)$/);
    if (zuluTimeMatch) {
      const zuluTime = zuluTimeMatch[1];
      const message = zuluTimeMatch[2];
      const localDate = new Date(zuluTime);
      const formattedDate = localDate.toLocaleString();
      logLines[lastIndex] = `[${formattedDate}] ${message}`;
    }
    if (logLines.length > maxLines) {
      logLines = logLines.slice(logLines.length - maxLines);
    }
    logsContent.textContent = logLines.join('\n') + '\n';
    if (isAtBottom) {
      logsBox.scrollTop = logsBox.scrollHeight;
    }
  };
  eventSource.onerror = function() {
    if (!logsBox || !logsContent) return;
    isAtBottom = Math.abs(logsBox.scrollTop + logsBox.clientHeight - logsBox.scrollHeight) < 5;
    logLines.push('[Error] Connection lost. Attempting to reconnect...');
    logsContent.textContent = logLines.join('\n') + '\n';
    // Only auto-scroll if user is already at the bottom
    if (isAtBottom) {
      logsBox.scrollTop = logsBox.scrollHeight;
    }
    eventSource.close();
    setTimeout(() => { startLogStream(type) }, 5000);
  }
  logsContent.textContent = logLines.join('\n') + '\n';
  if (isAtBottom) {
    logsBox.scrollTop = logsBox.scrollHeight;
  }
}

/**
 * Animate install button text while installation is in progress
 * @param {HTMLElement} installBtn - Button element to animate
 * @returns {void}
 */
export function installButtonTextLoop(installBtn) {
  installBtn.textContent = 'Installing';
  let dotCount = 0;
  const interval = setInterval(() => {
    if (!installBtn || !installBtn.disabled) {
      clearInterval(interval);
      return;
    }
    dotCount = (dotCount + 1) % 4;
    installBtn.textContent = 'Installing' + '.'.repeat(dotCount);
  }, 500);
}

/**
 * Handle installation of PM2 log-rotate from the UI
 * @returns {Promise<void>}
 */
export async function installLogRotate() {
  const installBtn = document.getElementById('installLogRotateBtn');
  try {
    installBtn.disabled = true;
    installButtonTextLoop(installBtn);

    await api.installLogRotate();

    showStatus('Log Rotate Module Installed!', 'success');

    showLoadingOverlay('Server Restarting...', 'Log Rotate Module Installed. Waiting for the server to restart...');
    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error installing Log Rotate Module, you may have to do it manually: ' + parseErrorMessage(error), 'error');
    installBtn.disabled = false;
    installBtn.textContent = 'Install PM2 Log Rotate Module';
  }
}
