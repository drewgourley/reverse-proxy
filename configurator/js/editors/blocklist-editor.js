// Blocklist Editor Module
// Handles blocklist management and IP blocking

import * as state from '../state.js';
import * as utils from '../utils.js';
import * as api from '../api.js';
import { reloadPage, waitForServerRestart, showPromptModal, showPromptError, showStatus, closePromptModal, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

let blocklistSearchTerm = '';

function filterBlocklist() {
  const searchInput = document.getElementById('blocklistSearchInput');
  if (!searchInput) return;
  
  blocklistSearchTerm = searchInput.value.toLowerCase().trim();
  const entries = document.querySelectorAll('.blocklist-entry');
  
  entries.forEach((entry) => {
    const ipInput = entry.querySelector('input[type="text"]');
    const ip = ipInput.value.toLowerCase();
    const matches = blocklistSearchTerm === '' || ip.includes(blocklistSearchTerm);
    entry.style.display = matches ? '' : 'none';
  });
}

export async function renderBlocklistEditor(reload = true) {
  if (reload) {
    await api.loadBlocklist(true);
  }
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  
  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">shield</span> Blocklist Management (${state.blocklist.length} IPs)</div>
      <div class="hint hint-section">Add or remove IP addresses from the blocklist</div>
      <div class="blocklist-controls">
        <button class="btn-add-field no-top" onclick="addBlocklistEntry()"><span class="material-icons">add_circle</span> Add Blocklist Entry</button>
        <input type="text" id="blocklistSearchInput" class="blocklist-search" placeholder="Filter IPs..." />
      </div>
  `;
  state.blocklist.forEach((ip, index) => {
    html += `
      <div class="blocklist-entry">
        <div class="form-group form-group-no-margin">
          <div class="blocklist-input-group">
            <input type="text" id="blocklist_ip_${index}" value="${ip}" readonly />
            <button class="btn-remove" onclick="removeBlocklistEntry(${index})"><span class="material-icons">remove_circle</span> Remove</button>
          </div>
        </div>
      </div>
    `;
  });
  html += `
    </div>
  `;
  panel.innerHTML = html;
  
  // Attach search input event listener after rendering
  const searchInput = document.getElementById('blocklistSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterBlocklist);
  }
  
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertBlocklist()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveBlocklistBtn" onclick="saveBlocklist()"><span class="material-icons">save</span> Save Blocklist</button>
  `;
}

export function addBlocklistEntry() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add New Blocklist Entry',
    'Enter the ip address to block:',
    'Valid IPv4 address format (e.g., 192.168.1.1)',
    '',
    'e.g., 192.168.1.1',
    (blocklistEntry) => {
      if (!blocklistEntry) return;
      
      if (state.blocklist.includes(blocklistEntry)) {
        showPromptError('A blocklist entry with this IP address already exists!');
        return;
      }
      
      const blocklistEntryRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      
      if (!blocklistEntryRegex.test(blocklistEntry)) {
        showPromptError('Invalid IP address format!');
        return;
      }

      state.blocklist.unshift(blocklistEntry);
      renderBlocklistEditor(false);
      closePromptModal();
    },
  );
}

export function removeBlocklistEntry(index) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Blocklist Entry',
    `Are you sure you want to remove the blocklist entry with IP "${state.blocklist[index]}"?`,
    (confirmed) => {
      if (confirmed) {
        state.blocklist.splice(index, 1);
        renderBlocklistEditor(false);
        showStatus(`Blocklist entry removed`, 'success');
      }
    }
  );
}

export async function saveBlocklist() {
  const saveBtn = document.getElementById('saveBlocklistBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveBlocklist(state.blocklist);

    state.setOriginalBlocklist(JSON.parse(JSON.stringify(state.blocklist)));
    showStatus('Blocklist saved successfully!', 'success');
    showLoadingOverlay('Server Restarting...', 'Blocklist saved. Waiting for the server to restart...');
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    showStatus('<span class="material-icons">error</span> Error saving blocklist: ' + utils.parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Blocklist';
  }
}

export function revertBlocklist() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Blocklist',
    'Are you sure you want to discard all changes to blocklist?',
    (confirmed) => {
      if (confirmed) {
        renderBlocklistEditor();
        showStatus('Blocklist changes reverted', 'success');
      }
    }
  );
}
