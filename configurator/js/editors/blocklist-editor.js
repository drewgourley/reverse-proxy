import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showPromptModal, showPromptError, showStatus, closePromptModal, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

// Search filter state
let blocklistSearchTerm = '';
const BLOCKLIST_PAGE_SIZE = 50;
let blocklistPage = 1;
let blocklistTotalPages = 1;
let blocklistSelected = new Set(); // original state.blocklist indices

function getCurrentPageIndices() {
  const filtered = state.blocklist
    .map((ip, index) => ({ ip, index }))
    .filter(entry => blocklistSearchTerm === '' || entry.ip.toLowerCase().includes(blocklistSearchTerm));
  const totalPages = Math.max(1, Math.ceil(filtered.length / BLOCKLIST_PAGE_SIZE));
  const page = Math.min(blocklistPage, totalPages);
  const pageStart = (page - 1) * BLOCKLIST_PAGE_SIZE;
  return filtered.slice(pageStart, pageStart + BLOCKLIST_PAGE_SIZE).map(e => e.index);
}

function updateBlocklistSelectionUI() {
  const count = blocklistSelected.size;
  const btn = document.getElementById('blocklistBulkRemoveBtn');
  if (btn) {
    btn.style.display = count > 0 ? '' : 'none';
    btn.innerHTML = `<span class="material-icons">delete_sweep</span> Remove Selected (${count})`;
  }
  const selectAllCb = document.getElementById('blocklistSelectAll');
  if (selectAllCb) {
    const pageIndices = getCurrentPageIndices();
    const selectedOnPage = pageIndices.filter(i => blocklistSelected.has(i));
    selectAllCb.checked = selectedOnPage.length > 0 && selectedOnPage.length === pageIndices.length;
    selectAllCb.indeterminate = selectedOnPage.length > 0 && selectedOnPage.length < pageIndices.length;
  }
}

/**
 * Filter visible blocklist entries in the UI based on search input
 * @returns {void}
 */
export async function filterBlocklist() {
  const searchInput = document.getElementById('blocklistSearchInput');
  blocklistSearchTerm = searchInput?.value.toLowerCase().trim() || '';
  blocklistPage = 1;
  blocklistSelected.clear();
  await renderBlocklistEditor(false);
  const newInput = document.getElementById('blocklistSearchInput');
  if (newInput) {
    newInput.focus();
    newInput.setSelectionRange(newInput.value.length, newInput.value.length);
  }
}

function persistBlocklistFiltersToUrl() {
  const url = new URL(window.location);

  if (blocklistSearchTerm && blocklistSearchTerm.trim() !== '') {
    url.searchParams.set('blocklist_search', blocklistSearchTerm);
  } else {
    url.searchParams.delete('blocklist_search');
  }

  const basePath = blocklistPage > 1
    ? `/monitor/blocklist/page/${blocklistPage}`
    : '/monitor/blocklist';

  const newUrl = new URL(basePath, window.location.origin);
  if (blocklistSearchTerm && blocklistSearchTerm.trim() !== '') {
    newUrl.searchParams.set('blocklist_search', blocklistSearchTerm);
  }

  window.history.replaceState(null, '', newUrl.toString());
}

/**
 * Clear any blocklist search filters and refresh display
 * @returns {void}
 */
export function clearBlocklistSearch() {
  blocklistSearchTerm = '';
  blocklistPage = 1;
  blocklistSelected.clear();
  const searchInput = document.getElementById('blocklistSearchInput');

  if (searchInput) {
    searchInput.value = '';
  }

  renderBlocklistEditor(false);
} 

export function gotoPreviousBlocklistPage() {
  if (blocklistPage > 1) {
    blocklistPage -= 1;
    renderBlocklistEditor(false);
  }
}

export function gotoNextBlocklistPage() {
  blocklistPage += 1;
  renderBlocklistEditor(false);
}

export function navigateBlocklistPage() {
  const pageInput = document.getElementById('blocklistPageInput');
  if (!pageInput) return;

  let page = Number(pageInput.value);
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  blocklistPage = Math.min(Math.max(1, Math.floor(page)), blocklistTotalPages);
  renderBlocklistEditor(false);
}

/**
 * Render the Blocklist editor UI (optionally reload data first)
 * @param {boolean} [reload=true] - Whether to reload data from server
 * @returns {Promise<void>}
 */
export async function renderBlocklistEditor(reload = true) {
  if (reload) {
    await api.loadBlocklist(true);
    await api.loadBlocklistEnabled(true);
    blocklistSelected.clear();
  }
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;
  
  try {
    const params = new URL(window.location).searchParams;
    if (reload) {
      const q = params.get('blocklist_search');
      if (q !== null) {
        blocklistSearchTerm = String(q).toLowerCase();
      }

      const pathParts = window.location.pathname.split('/');
      const pageIdx = pathParts.indexOf('page');
      if (pageIdx !== -1 && pathParts[pageIdx + 1]) {
        const parsedPage = parseInt(pathParts[pageIdx + 1], 10);
        blocklistPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      }
    }
  } catch (err) {
    /* ignore malformed url */
  }

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const filteredBlocklist = state.blocklist
    .map((ip, index) => ({ ip, index }))
    .filter((entry) => {
      return blocklistSearchTerm === '' || entry.ip.toLowerCase().includes(blocklistSearchTerm);
    });

  const totalItems = filteredBlocklist.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / BLOCKLIST_PAGE_SIZE));
  blocklistTotalPages = totalPages;
  if (blocklistPage > totalPages) {
    blocklistPage = totalPages;
  }

  const pageStart = (blocklistPage - 1) * BLOCKLIST_PAGE_SIZE;
  const pageEntries = filteredBlocklist.slice(pageStart, pageStart + BLOCKLIST_PAGE_SIZE);

  let html = `
    <div class="section">
      <div class="section-title">
        <span class="material-icons">shield</span> Blocklist Management (${state.blocklist.length} IPs)
        <button class="btn-toggle${state.blocklistEnabled ? ' btn-toggle-on' : ''} blocklist-enabled-toggle" onclick="updateBlocklistEnabled(${!state.blocklistEnabled})" title="${state.blocklistEnabled ? 'Blocklist is active — click to disable' : 'Blocklist is disabled — click to enable'}">
          <span class="btn-toggle-area"><span class="btn-toggle-handle"></span><span class="btn-toggle-label">Active</span><span class="btn-toggle-label">Disabled</span></span>
        </button>
      </div>
      <div class="hint hint-section">Add or remove IP addresses from the blocklist</div>
      <div class="blocklist-controls">
        <button class="btn-add-field no-top" onclick="addBlocklistEntry()"><span class="material-icons">add_circle</span> Add Blocklist Entry</button>
        <input type="text" id="blocklistSearchInput" class="blocklist-search" placeholder="Filter IPs..." value="${blocklistSearchTerm}" oninput="filterBlocklist()" />
      </div>
  `;

  if (totalItems === 0) {
    html += `
      <div class="no-results-message">
        <p class="placeholder-message">${blocklistSearchTerm ? 'No matching IP addresses found' : 'No blocklist entries'}</p>
        <button class="${blocklistSearchTerm ? 'btn-remove' : 'btn-add-field'}" onclick="${blocklistSearchTerm ? 'clearBlocklistSearch()' : 'addBlocklistEntry()'}">
          <span class="material-icons">${blocklistSearchTerm ? 'search_off' : 'add_circle'}</span> ${blocklistSearchTerm ? 'Clear Search' : 'Add Blocklist Entry'}
        </button>
      </div>
    `;
  } else {
    html += `
      <div class="blocklist-select-bar">
        <label class="blocklist-select-all-label" title="Select / deselect all entries on this page">
          <input type="checkbox" id="blocklistSelectAll" class="file-checkbox" onchange="toggleSelectAllBlocklist(this.checked)" />
          Select page
        </label>
        <button id="blocklistBulkRemoveBtn" class="btn-remove" onclick="removeSelectedBlocklistEntries()" style="display:${blocklistSelected.size > 0 ? '' : 'none'}"><span class="material-icons">delete_sweep</span> Remove Selected (${blocklistSelected.size})</button>
      </div>
    `;
    pageEntries.forEach((entry) => {
      const checked = blocklistSelected.has(entry.index) ? 'checked' : '';
      html += `
        <div class="blocklist-entry${blocklistSelected.has(entry.index) ? ' selected' : ''}">
          <div class="form-group form-group-no-margin">
            <div class="blocklist-input-group">
              <input type="checkbox" class="file-checkbox blocklist-cb" ${checked} onchange="toggleBlocklistSelection(${entry.index}, this.checked)" />
              <input type="text" id="blocklist_ip_${entry.index}" value="${entry.ip}" readonly />
              <button class="btn-remove" onclick="removeBlocklistEntry(${entry.index})"><span class="material-icons">remove_circle</span> Remove</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  html += `
    </div>
  `;
  panel.innerHTML = html;
  
  actions.innerHTML = `
    <div class="blocklist-pagination">
      <button class="btn-pagination btn-icon" onclick="gotoPreviousBlocklistPage()" ${blocklistPage === 1 ? 'disabled' : ''} aria-label="Previous page" title="Previous page"><span class="material-icons">chevron_left</span></button>
      <input id="blocklistPageInput" type="number" min="1" max="${totalPages}" value="${blocklistPage}" onblur="navigateBlocklistPage()" onkeydown="if (event.key === 'Enter') { navigateBlocklistPage(); this.blur(); }" />
      <button class="btn-pagination btn-icon" onclick="gotoNextBlocklistPage()" ${blocklistPage === totalPages ? 'disabled' : ''} aria-label="Next page" title="Next page"><span class="material-icons">chevron_right</span></button>
      <span class="page-count">of ${totalPages}</span>
    </div>
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertBlocklist()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveBlocklistBtn" onclick="saveBlocklist()"><span class="material-icons">save</span> Save Blocklist</button>
  `;
  
  persistBlocklistFiltersToUrl();
  updateBlocklistSelectionUI();
}

export function toggleSelectAllBlocklist(checked) {
  const pageIndices = getCurrentPageIndices();
  pageIndices.forEach(i => {
    if (checked) {
      blocklistSelected.add(i);
    } else {
      blocklistSelected.delete(i);
    }
    const inputEl = document.getElementById(`blocklist_ip_${i}`);
    if (inputEl) {
      const row = inputEl.closest('.blocklist-entry');
      const cb = row?.querySelector('.blocklist-cb');
      if (row) row.classList.toggle('selected', checked);
      if (cb) cb.checked = checked;
    }
  });
  updateBlocklistSelectionUI();
}

export function removeSelectedBlocklistEntries() {
  const count = blocklistSelected.size;
  if (count === 0) return;
  showConfirmModal(
    '<span class="material-icons">delete_sweep</span> Remove Selected Entries',
    `Are you sure you want to remove ${count} selected IP ${count === 1 ? 'address' : 'addresses'} from the blocklist?`,
    (confirmed) => {
      if (!confirmed) return;
      const sortedIndices = [...blocklistSelected].sort((a, b) => b - a);
      sortedIndices.forEach(i => state.blocklist.splice(i, 1));
      blocklistSelected.clear();
      renderBlocklistEditor(false);
      showStatus(`${count} blocklist ${count === 1 ? 'entry' : 'entries'} removed`, 'success');
    }
  );
}

export function updateBlocklistEnabled(enabled) {
  state.setBlocklistEnabled(enabled);
  renderBlocklistEditor(false);
}

export function toggleBlocklistSelection(index, checked) {
  if (checked) {
    blocklistSelected.add(index);
  } else {
    blocklistSelected.delete(index);
  }
  updateBlocklistSelectionUI();

  // Keep row highlight in sync without full re-render
  const inputEl = document.getElementById(`blocklist_ip_${index}`);
  if (inputEl) {
    const row = inputEl.closest('.blocklist-entry');
    if (row) row.classList.toggle('selected', checked);
  }
}

/**
 * Prompt the user and add a new IP to the blocklist
 * @returns {void}
 */
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

/**
 * Remove a blocklist entry after confirmation
 * @param {number} index - Index of entry to remove
 * @returns {void}
 */
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

/**
 * Persist blocklist to server and handle restart flow
 * @returns {Promise<void>}
 */
export async function saveBlocklist() {
  const saveBtn = document.getElementById('saveBlocklistBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveBlocklistEnabled(state.blocklistEnabled);
    await api.saveBlocklist(state.blocklist);

    state.setOriginalBlocklist(JSON.parse(JSON.stringify(state.blocklist)));
    showStatus('Blocklist saved successfully!', 'success');
    showLoadingOverlay('Server Restarting...', 'Blocklist saved. Waiting for the server to restart...');

    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    showStatus('Error saving blocklist: ' + parseErrorMessage(error), 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Blocklist';
  }
}

/**
 * Revert blocklist UI to last saved state (after confirmation)
 * @returns {void}
 */
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
