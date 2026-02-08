// Logs Viewer Module
// Real-time log streaming and display

import { ecosystem, logRotateInstalled } from './state.js';
import { parseErrorMessage } from './utils.js';
import { reloadPage, waitForServerRestart, showStatus, showLoadingOverlay } from './ui-components.js';

// Module-level state for log streaming
let logLines = [];
let logType;
let eventSource;

export function renderLogsViewer(type = 'out', pushState = true) {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const url = new URL(window.location);

  if (pushState) {
    url.searchParams.set('type', type);
    window.history.pushState({}, '', url);
  }

  actions.classList.add('hidden');
  panel.classList.remove('scrollable');

  let html = `
    <div class="section logs-section">
      <div class="section-title"><span class="material-icons">article</span> Activity Logs</div>
      <div class="hint hint-section">View real-time logs of application activity and healthchecks.</div>
  `;

  if (!logRotateInstalled) {
    html += `
      <div class="installation-trigger highlight-recommended">
        <button class="btn-add-logrotate" id="installLogRotateBtn" onclick="installLogRotate()">Install PM2 Log Rotate Module</button>
        <div class="hint hint-section">Log rotate module is highly recommended for managing log files efficiently.</div>
      </div>
    `;
  }

  html += `
      <div class="logs-container">
        <div class="logs-tabs-row">
          <button class="tab-log-type${type === 'out' ? ' active' : ''}" id="btnLogOut" onclick="selectItem('monitor-logs', 'out')"><span class="material-icons">terminal</span> Standard Output</button>
          <button class="tab-log-type${type === 'error' ? ' active' : ''}" id="btnLogErr" onclick="selectItem('monitor-logs', 'error')"><span class="material-icons">error</span> Error Output</button>
        </div>
        <div id="logsBox" class="logs-box">
          <pre id="logsContent" class="logs-content">Loading logs...</pre>
        </div>
      </div>
    </div>
  `;
  panel.innerHTML = html;
  actions.innerHTML = '';

  startLogStream(type);
}

export function startLogStream(type = 'out') {
  const appName = ecosystem?.apps?.[0]?.name ? (ecosystem.apps[0].name).replace(' ', '-') : 'Reverse-Proxy';
  const maxLines = 10000;
  const logsBox = document.getElementById('logsBox');
  const logsContent = document.getElementById('logsContent');
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
  eventSource = new EventSource(`logs/${appName}/${type}`);
  eventSource.onmessage = function(event) {
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

export async function installLogRotate() {
  const installBtn = document.getElementById('installLogRotateBtn');
  try {
    installBtn.disabled = true;
    installButtonTextLoop(installBtn);
    
    const response = await fetch('installlogrotate');

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    showStatus('Log Rotate Module Installed!', 'success');

    showLoadingOverlay('Server Restarting...', 'Log Rotate Module Installed. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error installing Log Rotate Module, you may have to do it manually: ' + parseErrorMessage(error), 'error');
    installBtn.disabled = false;
    installBtn.textContent = 'Install PM2 Log Rotate Module';
  }
}
