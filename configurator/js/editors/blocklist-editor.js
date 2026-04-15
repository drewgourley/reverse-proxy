import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage } from '../utils.js';
import { reloadPage, waitForServerRestart, showPromptModal, showPromptError, showStatus, closePromptModal, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

// Search filter state
let blocklistSearchTerm = '';
const BLOCKLIST_PAGE_SIZE = 50;
let blocklistPage = 1;
let blocklistTotalPages = 1;

/**
 * Filter visible blocklist entries in the UI based on search input
 * @returns {void}
 */
export async function filterBlocklist() {
  const searchInput = document.getElementById('blocklistSearchInput');
  blocklistSearchTerm = searchInput?.value.toLowerCase().trim() || '';
  blocklistPage = 1;
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
      <div class="section-title"><span class="material-icons">shield</span> Blocklist Management (${state.blocklist.length} IPs)</div>
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
    pageEntries.forEach((entry) => {
      html += `
        <div class="blocklist-entry">
          <div class="form-group form-group-no-margin">
            <div class="blocklist-input-group">
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
