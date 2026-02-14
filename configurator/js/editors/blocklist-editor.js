import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showPromptModal, showPromptError, showStatus, closePromptModal, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

// Search filter state
let blocklistSearchTerm = '';

export function filterBlocklist() {
  const searchInput = document.getElementById('blocklistSearchInput');
  const panel = document.getElementById('editorPanel');
  const entries = document.querySelectorAll('.blocklist-entry');
  let entryCount = 0;
  
  blocklistSearchTerm = searchInput?.value.toLowerCase().trim() || '';
  
  entries.forEach((entry) => {
    const ipInput = entry.querySelector('input[type="text"]');
    const ip = ipInput.value.toLowerCase();
    const matches = blocklistSearchTerm === '' || ip.includes(blocklistSearchTerm);
    if (matches) {
      entry.style.display = '';
      entryCount++;
    } else {
      entry.style.display = 'none';
    }
  });

  const noResultsMessage = document.getElementById('noResultsMessage');
  if (entryCount === 0) {
    if (!noResultsMessage) {
      const noResultsMessageEl = document.createElement('div');
      noResultsMessageEl.id = 'noResultsMessage';
      noResultsMessageEl.className = 'no-results-message';
      noResultsMessageEl.innerHTML = '<p class="hint">No matching IP addresses found</p><button class="btn-remove result-output" onclick="clearBlocklistSearch()"><span class="material-icons">search_off</span> Clear Search</button>';
      panel.appendChild(noResultsMessageEl);
    }
  } else {
    if (noResultsMessage) {
      noResultsMessage.remove();
    }
  }

  persistBlocklistFiltersToUrl();
}

function persistBlocklistFiltersToUrl() {
  const url = new URL(window.location);

  if (blocklistSearchTerm && blocklistSearchTerm.trim() !== '') {
    url.searchParams.set('blocklist_search', blocklistSearchTerm);
  } else {
    url.searchParams.delete('blocklist_search');
  }

  window.history.replaceState(null, '', url.toString());
}

export function clearBlocklistSearch() {
  blocklistSearchTerm = '';
  const searchInput = document.getElementById('blocklistSearchInput');

  if (searchInput) {
    searchInput.value = '';
  }

  persistBlocklistFiltersToUrl();
  filterBlocklist();
} 

export async function renderBlocklistEditor(reload = true) {
  if (reload) {
    await api.loadBlocklist(true);
  }
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  
  try {
    const params = new URL(window.location).searchParams;
    const q = params.get('blocklist_search');
    if (q !== null) {
      blocklistSearchTerm = String(q).toLowerCase();
    }
  } catch (err) {
    /* ignore malformed url */
  }

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">shield</span> Blocklist Management (${state.blocklist.length} IPs)</div>
      <div class="hint hint-section">Add or remove IP addresses from the blocklist</div>
      <div class="blocklist-controls">
        <button class="btn-add-field no-top" onclick="addBlocklistEntry()"><span class="material-icons">add_circle</span> Add Blocklist Entry</button>
        <input type="text" id="blocklistSearchInput" class="blocklist-search" placeholder="Filter IPs..." value="${blocklistSearchTerm}" oninput="filterBlocklist()" />
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
  
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertBlocklist()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveBlocklistBtn" onclick="saveBlocklist()"><span class="material-icons">save</span> Save Blocklist</button>
  `;
  
  persistBlocklistFiltersToUrl();
  filterBlocklist();
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
    showStatus('<span class="material-icons">error</span> Error saving blocklist: ' + parseErrorMessage(error), 'error');
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
