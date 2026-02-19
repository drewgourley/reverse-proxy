import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { selectItem } from '../editors.js';
import { reloadPage, waitForServerRestart, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

/**
 * Render the Application editor UI
 * @returns {void}
 */
export function renderApplicationEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  const appName = state.ecosystem.apps && state.ecosystem.apps[0] ? state.ecosystem.apps[0].name : 'Reverse Proxy';
  const isDefault = state.ecosystem.default === true;
  const buttonText = isDefault ? 'Generate Application Settings' : 'Save Application Settings';

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">build</span> Application Settings</div>
      <div class="hint hint-section">Configure your application's display name used by PM2.</div>
      <div class="app-entry">
        <div class="form-group form-group-no-margin">
          <label for="appNameInput">Application Name</label>
          <input type="text" id="appNameInput" placeholder="Enter a nicename for the application (e.g., My Proxy Server)" value="${appName}" onchange="updateEcosystemName(this.value)">
          <div class="hint">This name appears in PM2 process list</div>
        </div>
      </div>
    </div>
  `;

  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertEcosystem()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveEcosystemBtn" onclick="saveEcosystem()"><span class="material-icons">save</span> ${buttonText}</button>
  `;
}

/**
 * Update the application name inside the ecosystem object
 * @param {string} name - New application name
 * @returns {void}
 */
export function updateEcosystemName(name) {
  if (!state.ecosystem.apps) {
    state.ecosystem.apps = [{}];
  }
  if (!state.ecosystem.apps[0]) {
    state.ecosystem.apps[0] = {};
  }
  state.ecosystem.apps[0].name = name;
}

/**
 * Save PM2 ecosystem configuration to the server
 * @returns {Promise<void>}
 */
export async function saveEcosystem() {
  const saveBtn = document.getElementById('saveEcosystemBtn');
  const isDefault = state.ecosystem.default === true;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const ecosystemToSave = JSON.parse(JSON.stringify(state.ecosystem));
    delete ecosystemToSave.default;
    delete ecosystemToSave.resave;

    if (ecosystemToSave.apps && Array.isArray(ecosystemToSave.apps)) {
      ecosystemToSave.apps = ecosystemToSave.apps.map(app => {
        if (app.ignore_watch) {
          delete app.ignore_watch;
        }
        app.watch = false;
        return app;
      });
    }
    
    await api.saveEcosystem(ecosystemToSave);

    delete state.ecosystem.default;
    delete state.ecosystem.resave;

    state.setOriginalEcosystem(JSON.parse(JSON.stringify(state.ecosystem)));
    showStatus('Application settings saved successfully!', 'success');

    showLoadingOverlay('Server Restarting...', 'Application settings saved. Waiting for the server to restart...');

    let reboot = await waitForServerRestart();
    if (reboot) {
      if (isDefault) {
        setTimeout(() => {
          selectItem('management-secrets');
        }, 900);
      }
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error saving application settings: ' + parseErrorMessage(error), 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = isDefault ? 'Generate Application Settings' : 'Save Application Settings';
  }
}

/**
 * Revert application settings to last saved values (after confirmation)
 * @returns {void}
 */
export function revertEcosystem() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Application Settings',
    'Are you sure you want to discard all changes to application settings?',
    (confirmed) => {
      if (confirmed) {
        state.setEcosystem(JSON.parse(JSON.stringify(state.originalEcosystem)));
        renderApplicationEditor();
        showStatus('Application settings changes reverted', 'success');
      }
    }
  );
}
