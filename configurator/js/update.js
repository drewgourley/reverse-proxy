// Update Module
// Git status, updates, and system management functions
// Migrated from original script.js

import * as state from './state.js';
import * as api from './api.js';
import { reloadPage, waitForServerRestart, showConfirmModal, showStatus } from './ui-components.js';

// ============================================================================
// GIT STATUS RENDERING
// ============================================================================

export function renderGitStatus(status, showForceUpdate = false) {
  const versionInfo = document.getElementById('versionInfo');
  const isFirstTimeSetup = state.ecosystem.default === true;

  if (status.error) {
    versionInfo.innerHTML = `
      <button class="btn-update" id="updateBtn" disabled title="Version Tracking Unavailable">
        <span class="update-icon material-icons">sync</span>
        <span class="update-text">Unknown</span>
      </button>
      <span class="version-number">Unavailable</span>
    `;
    return;
  }
  
  const versionNumber = status.version || 'Unknown';
  
  if (showForceUpdate) {
    versionInfo.innerHTML = `
      <button class="btn-update must-force-update" id="updateBtn" onclick="handleUpdate(true)" title="Force Update">
        <span class="update-icon material-icons">sync</span>
        <span class="update-text">Force Update</span>
      </button>
    `;
  } else {
    versionInfo.innerHTML = `
      <button class="btn-update" id="updateBtn" onclick="handleUpdate()" title="${isFirstTimeSetup ? 'Complete application setup first' : 'Check for updates'}" ${isFirstTimeSetup ? 'disabled' : ''}>
        <span class="update-icon material-icons"${isFirstTimeSetup ? ' style="display:none"' : ''}>sync</span>
        <span class="update-text">${isFirstTimeSetup ? 'Initial Setup' : 'Checking...'}</span>
      </button>
    `;
  }

  versionInfo.innerHTML += `
    <span class="version-number">${versionNumber}</span>
  `;
}

// ============================================================================
// UPDATE CHECKING
// ============================================================================

export async function checkForUpdates() {
  const updateBtn = document.getElementById('updateBtn');
  const isFirstTimeSetup = state.ecosystem.default === true;
  if (!updateBtn || isFirstTimeSetup) return;
  
  const updateIcon = updateBtn.querySelector('.update-icon');
  const updateText = updateBtn.querySelector('.update-text');
  updateIcon.attributes.style = '';
  updateIcon.classList.add('spinning');
  updateText.textContent = 'Checking...';
  
  try {
    const response = await fetch('/git/check');
    if (!response.ok) {
      throw new Error('Failed to check for updates');
    }
    
    const data = await response.json();
    updateIcon.classList.remove('spinning');
    
    if (data.success && data.updatesAvailable) {
      updateBtn.classList.add('updates-available');
      updateText.textContent = data.message || 'Updates Available';
      updateBtn.setAttribute('data-has-updates', 'true');
      updateBtn.disabled = false;
      updateBtn.title = 'Update available - click to install';
    } else {
      updateText.textContent = 'Up to Date';
      updateBtn.setAttribute('data-has-updates', 'false');
      updateBtn.disabled = false;
      updateBtn.title = 'Check for updates';
    }
  } catch (error) {
    console.error('Update check error:', error);
    updateIcon.classList.remove('spinning');
    updateText.textContent = 'Check Updates';
    updateBtn.disabled = false;
    updateBtn.title = 'Check for updates';
  }
}

// ============================================================================
// UPDATE HANDLING
// ============================================================================

export function handleUpdate(force = false) {
  const updateBtn = document.getElementById('updateBtn');
  const hasUpdates = updateBtn?.getAttribute('data-has-updates') === 'true';
  
  if (force) {
    showConfirmModal(
      '<span class="material-icons">system_update_alt</span> Force Update',
      'Are you sure you want to force an update? This will discard any local changes and pull the latest version from the repository. The server will restart after updating. Continue?',
      () => pullUpdates(true)
    );
  } else if (hasUpdates) {
    showConfirmModal(
      '<span class="material-icons">update</span> Update Available',
      'A new version is available. The server will restart after updating. Continue?',
      () => pullUpdates()
    );
  } else {
    checkForUpdates();
  }
}

async function pullUpdates(force) {
  const updateBtn = document.getElementById('updateBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingMessage = document.getElementById('loadingMessage');
  
  loadingTitle.textContent = 'Updating...';
  loadingMessage.textContent = 'Pulling latest changes and restarting the server. This may take a minute.';
  loadingOverlay.classList.add('active');
  updateBtn.disabled = true;

  try {
    let response;
    if (force) {
      response = await fetch('/git/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      response = await fetch('/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!response.ok) {
      const data = await response.json();
      await api.loadGitStatus(true, true);
      throw new Error(data.error || 'Update failed');
    }
    
    await waitForServerRestart(10000);
    
    reloadPage(true);
  } catch (error) {
    console.error('Update error:', error);
    loadingOverlay.classList.remove('active');
    showStatus('Update failed: ' + error.message, 'error');
  } finally {
    updateBtn.disabled = false;
  }
}

// Expose forceUpdate as alias for backwards compatibility
export function forceUpdate() {
  handleUpdate(true);
}
