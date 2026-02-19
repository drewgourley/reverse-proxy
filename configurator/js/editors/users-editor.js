import * as state from '../state.js';
import * as api from '../api.js';
import { parseErrorMessage, generateUUID } from '../utils.js';
import { reloadPage, waitForServerRestart, createDropdown, setDropdownValue, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

// Search filter state
let usersSearchUsername = '';
let usersSearchServices = [];

/**
 * Filter displayed users based on search criteria (username/UUID and service access)
 * @returns {void}
 */
function filterUsers() {
  const panel = document.getElementById('editorPanel');
  const entries = document.querySelectorAll('.user-entry');
  let entryCount = 0;

  entries.forEach((entry) => {
    const usernameInput = entry.querySelector('input[type="text"][id*="user_username_"]');
    const username = usernameInput ? usernameInput.value.toLowerCase() : '';
    const indexMatch = usernameInput?.id.match(/user_username_(\d+)/);
    const userIndex = indexMatch ? parseInt(indexMatch[1]) : -1;
    const user = userIndex >= 0 ? state.users.users[userIndex] : null;
    const userServices = user ? (user.services || []) : [];
    const uuid = (user && user.uuid) ? String(user.uuid).toLowerCase() : '';

    // Always show new/unsaved users (no uuid or no password_hash)
    const isNew = user && (!user.uuid || !user.password_hash);
    if (isNew) {
      entry.style.display = '';
      entryCount++;
      return;
    }

    const search = usersSearchUsername;
    const matches =
      search === '' ||
      username.includes(search) ||
      uuid.includes(search);

    let serviceMatches = usersSearchServices.length === 0;
    if (usersSearchServices.length > 0) {
      serviceMatches = usersSearchServices.some(service => userServices.includes(service));
    }

    if (matches && serviceMatches) {
      entry.style.display = '';
      entryCount++;
    } else {
      entry.style.display = 'none';
    }
  });

  const noResultsMessage = document.getElementById('noResultsMessage');
  if (state.users.users.length > 0 && entryCount === 0) {
    if (!noResultsMessage) {
      const noResultsMessageEl = document.createElement('div');
      noResultsMessageEl.id = 'noResultsMessage';
      noResultsMessageEl.className = 'no-results-message';
      noResultsMessageEl.innerHTML = '<p class="placeholder-message">No matching users found</p><button class="btn-remove" onclick="clearUsersSearch()"><span class="material-icons">search_off</span> Clear Search</button>';
      panel.appendChild(noResultsMessageEl);
    }
  } else if (state.users.users.length === 0) {
    if (!noResultsMessage) {
      const noResultsMessageEl = document.createElement('div');
      noResultsMessageEl.id = 'noResultsMessage';
      noResultsMessageEl.className = 'no-results-message';
      noResultsMessageEl.innerHTML = '<p class="placeholder-message">No users configured</p><button class="btn-add-field" onclick="addNewUser()"><span class="material-icons">add_circle</span> Add New User</button>';
      panel.appendChild(noResultsMessageEl);
    }
  } else {
    if (noResultsMessage) {
      noResultsMessage.remove();
    }
  }
}

/**
 * Persist current user search filters to the URL query parameters for shareable links
 * @returns {void}
 */
function persistUsersFiltersToUrl() {
  const url = new URL(window.location);

  if (usersSearchUsername && usersSearchUsername.trim() !== '') {
    url.searchParams.set('users_search', usersSearchUsername);
  } else {
    url.searchParams.delete('users_search');
  }

  if (usersSearchServices && usersSearchServices.length > 0) {
    url.searchParams.set('users_services', usersSearchServices.join(','));
  } else {
    url.searchParams.delete('users_services');
  }

  window.history.replaceState(null, '', url.toString());
}

/**
 * Update username search filter and refresh user list
 * @returns {void}
 */
export function filterUsersUsername() {
  const searchInput = document.getElementById('usersSearchInput');
  usersSearchUsername = searchInput ? searchInput.value.toLowerCase().trim() : '';
  persistUsersFiltersToUrl();
  filterUsers();
}

/**
 * Handler for changes to the users-service filter dropdown
 * @param {string[]} selectedValues - Selected service values
 * @returns {void}
 */
export function onUsersServiceFilterChange(selectedValues) {
  usersSearchServices = selectedValues.filter(v => v !== '_no_services');
  persistUsersFiltersToUrl();
  filterUsers();
}

/**
 * Clear all user list filters and refresh display
 * @returns {void}
 */
export function clearUsersSearch() {
  usersSearchUsername = '';
  usersSearchServices = [];

  const searchInput = document.getElementById('usersSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }

  // Reset the services dropdown (if present)
  setDropdownValue('usersServiceFilter', []);

  persistUsersFiltersToUrl();
  filterUsers();
}

/**
 * Render the Users editor UI and user list
 * @returns {void}
 */
export function renderUsersEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const authServices = Object.keys(state.config.services || {}).filter(name => {
    if (name === 'api' || name === 'www') return false;
    return state.config.services[name]?.subdomain?.requireAuth === true;
  });

  try {
    const url = new URL(window.location);
    const params = url.searchParams;
    const qSearch = params.get('users_search');
    if (qSearch !== null) {
      usersSearchUsername = String(qSearch).toLowerCase();
    }

    const qServices = params.get('users_services');
    if (qServices) {
      const parsed = qServices.split(',').map(s => s.trim()).filter(Boolean);
      usersSearchServices = parsed.filter(s => authServices.includes(s));
    }
  } catch (err) {
    // ignore malformed url
  }

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">group</span> User Management</div>
      <div class="hint hint-section">Manage users and their service access. Users can log into services that have "Require Login" enabled. The admin account (from Secrets) always has access to all services.</div>
      <div class="users-controls">
        <button class="btn-add-field no-top" onclick="addNewUser()"><span class="material-icons">add_circle</span> Add New User</button>
        <input type="text" id="usersSearchInput" class="users-search-input" placeholder="Filter by username or UUID..." value="${usersSearchUsername}" oninput="filterUsersUsername()" />
        <div class="flex-break"></div>
        ${createDropdown({
          id: 'usersServiceFilter',
          items: [
            ...authServices.map(serviceName => ({
              value: serviceName,
              label: state.config.services[serviceName]?.nicename || serviceName,
              selected: usersSearchServices.includes(serviceName)
            })),
            ...(authServices.length === 0 ? [{
              value: '_no_services',
              label: 'No services with "Require Login" configured',
              disabled: true
            }] : [])
          ],
          multiSelect: true,
          placeholder: 'Filter by services...',
          onChange: 'onUsersServiceFilterChange'
        })}
      </div>
  `;

  state.users.users.forEach((user, index) => {
    const isExistingHash = user.password_hash && user.password_hash.startsWith('$2b$');
    html += `
    <div class="secret-entry user-entry">
      <div class="form-group">
        <label for="user_username_${index}">Username</label>
        <input type="text" id="user_username_${index}" value="${user.username || ''}" 
            onchange="updateUser(${index}, 'username', this.value)"
            autocomplete="off"
            placeholder="Enter username">
        <div class="hint">UUID: ${user.uuid || 'Will be generated on save'}</div>
      </div>
      <div class="form-group">
        <label for="user_password_${index}">Password</label>
        <div class="password-input-group">
          <input type="text" id="user_password_${index}" value="${isExistingHash ? '' : (user.password_hash || '')}"
              class="text-security"
              onchange="updateUserPassword(${index}, this.value)"
              placeholder="${isExistingHash ? 'Password set - enter new to change' : 'Enter password'}"
              autocomplete="new-password">
          <button class="btn-toggle-password" onclick="togglePasswordVisibility('user_password_${index}', this)"><span class="material-icons">visibility</span> Show</button>
        </div>
        <div class="hint">${isExistingHash ? 'Leave empty to keep current password' : 'Password will be hashed when saved'}</div>
      </div>
      <div class="form-group">
        <p class="label color-primary" onclick="toggleDropdown('user_services_select_${index}', event)">Service Access</p>
        ${createDropdown({
          id: `user_services_select_${index}`,
          items: [
            {
              value: '*',
              label: '<span class="material-icons">star</span> All Services',
              selected: user.services?.includes('*'),
              special: 'all-services'
            },
            ...authServices.map(serviceName => ({
              value: serviceName,
              label: state.config.services[serviceName]?.nicename || serviceName,
              selected: user.services?.includes(serviceName) && !user.services?.includes('*'),
              disabled: user.services?.includes('*')
            })),
            ...(authServices.length === 0 ? [{
              value: '_no_services',
              label: 'No services with "Require Login" configured',
              disabled: true
            }] : [])
          ],
          multiSelect: true,
          placeholder: 'Select services...',
          onChange: `onUserServicesChange_${index}`
        })}
        <div class="hint">Choose "<span class="material-icons star">star</span> All Services" for full access or select individual services this user can access</div>
      </div>
      <div class="secret-actions">
        <button class="btn-remove" onclick="removeUser(${index})"><span class="material-icons">remove_circle</span> Remove User</button>
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
    <button class="btn-reset" onclick="revertUsers()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveUsersBtn" onclick="saveUsers()"><span class="material-icons">save</span> Save Users</button>
  `;
  
  // Create onChange handlers for each user's service selector
  if (state.users.users && state.users.users.length > 0) {
    state.users.users.forEach((user, index) => {
      createUserServicesChangeHandler(index);
    });
  }

  persistUsersFiltersToUrl();
  filterUsers();
}

/**
 * Create change handler for a user's service-access dropdown
 * @param {number} index - User index
 * @returns {void}
 */
export function createUserServicesChangeHandler(index) {
  window[`onUserServicesChange_${index}`] = function(selectedValues) {
    if (!state.users.users[index]) return;
    
    const hasAllServices = selectedValues.includes('*');
    
    if (hasAllServices) {
      // If "All Services" is selected, set to only that
      state.users.users[index].services = ['*'];
    } else {
      // Filter out the placeholder and set selected services
      state.users.users[index].services = selectedValues.filter(v => v !== '_no_services');
    }
    
    // Re-render to update disabled states when * is selected/deselected
    renderUsersEditor();
  };
}

/**
 * Update an in-memory user field
 * @param {number} index - Index of user in state.users.users
 * @param {string} field - Field name to update
 * @param {*} value - New value
 * @returns {void}
 */
export function updateUser(index, field, value) {
  if (!state.users.users[index]) return;
  state.users.users[index][field] = value;
}

/**
 * Update a user's password (plain text) in-memory; will be hashed on save
 * @param {number} index - Index of the user
 * @param {string} value - Plain-text password
 * @returns {void}
 */
export function updateUserPassword(index, value) {
  if (!state.users.users[index]) return;
  if (value.trim() !== '') {
    state.users.users[index].password_hash = value;
  }
}

/**
 * Add a new user entry to the UI (client-only until saved)
 * @returns {void}
 */
export function addNewUser() {
  if (!state.users.users) state.setUsers({ users: [] });
  state.users.users.unshift({
    uuid: generateUUID(),
    username: '',
    password_hash: '',
    services: []
  });
  renderUsersEditor();

  setTimeout(() => {
    const input = document.getElementById('user_username_0');
    if (input) {
      input.focus();
      input.select();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 0);
}

/**
 * Remove a user after confirmation
 * @param {number} index - Index of user to remove
 * @returns {void}
 */
export function removeUser(index) {
  const username = state.users.users[index]?.username || 'this user';
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove User',
    `Are you sure you want to remove ${username}?`,
    (confirmed) => {
      if (confirmed) {
        state.users.users.splice(index, 1);
        renderUsersEditor();
        showStatus('User removed', 'success');
      }
    }
  );
}

/**
 * Revert user changes to last saved state (after confirmation)
 * @returns {void}
 */
export function revertUsers() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Users',
    'Are you sure you want to discard all changes to users?',
    (confirmed) => {
      if (confirmed) {
        state.setUsers(JSON.parse(JSON.stringify(state.originalUsers)));
        renderUsersEditor();
        showStatus('Users changes reverted', 'success');
      }
    }
  );
}

/**
 * Validate and persist users to the server, then handle restart flow
 * @returns {Promise<void>}
 */
export async function saveUsers() {
  const saveBtn = document.getElementById('saveUsersBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    for (const user of state.users.users) {
      if (!user.username || user.username.trim() === '') {
        showStatus('All users must have a username', 'error');
        return;
      }
      if (!user.password_hash || user.password_hash.trim() === '') {
        showStatus(`User ${user.username} must have a password`, 'error');
        return;
      }
    }

    await api.saveUsers(state.users);
    
    state.setOriginalUsers(JSON.parse(JSON.stringify(state.users)));
    showStatus('Users saved successfully!', 'success');
    
    showLoadingOverlay('Server Restarting...', 'Users saved. Waiting for the server to restart...');

    let reboot = await waitForServerRestart();
    if (reboot) {
      state.setRebooting(true);
      reloadPage();
    }
  } catch (error) {
    const message = parseErrorMessage(error);
    showStatus('Failed to save users: ' + message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Users';
  }
}
