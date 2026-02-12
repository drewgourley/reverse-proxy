// Users Editor Module
// Handles user management and service access control

import * as state from '../state.js';
import * as utils from '../utils.js';
import * as api from '../api.js';
import { reloadPage, waitForServerRestart, createDropdown, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

// Search filter state
let usersSearchUsername = '';
let usersSearchServices = [];

function filterUsers() {
  const entries = document.querySelectorAll('.user-entry');
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
      return;
    }

    // Check username or uuid match
    const search = usersSearchUsername;
    const matches =
      search === '' ||
      username.includes(search) ||
      uuid.includes(search);

    // Check service match
    let serviceMatches = usersSearchServices.length === 0;
    if (usersSearchServices.length > 0) {
      serviceMatches = usersSearchServices.some(service => userServices.includes(service));
    }

    entry.style.display = (matches && serviceMatches) ? '' : 'none';
  });
}

export function filterUsersUsername() {
  const searchInput = document.getElementById('usersSearchInput');
  usersSearchUsername = searchInput ? searchInput.value.toLowerCase().trim() : '';
  filterUsers();
}

export function onUsersServiceFilterChange(selectedValues) {
  usersSearchServices = selectedValues.filter(v => v !== '_no_services');
  filterUsers();
}

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

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">group</span> User Management</div>
      <div class="hint hint-section">Manage users and their service access. Users can log into services that have "Require Login" enabled. The admin account (from Secrets) always has access to all services.</div>
      <div class="users-controls">
        <button class="btn-add-field no-top" onclick="addNewUser()"><span class="material-icons">add_circle</span> Add New User</button>
        <input type="text" id="usersSearchInput" class="users-search-input" placeholder="Filter by username or UUID..." oninput="filterUsersUsername()" />
        <div class="flex-break"></div>
        ${createDropdown({
          id: 'usersServiceFilter',
          items: [
            ...authServices.map(serviceName => ({
              value: serviceName,
              label: state.config.services[serviceName]?.nicename || serviceName,
              selected: false
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

  if (state.users.users && state.users.users.length > 0) {
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
  } else {
    html += `
      <div class="hint">No users configured. Add a user to allow login to protected services.</div>
    `;
  }

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
  
  // Reset search filters when re-rendering
  usersSearchUsername = '';
  usersSearchServices = [];
}

// Create onChange handler for user services dropdown
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

export function updateUser(index, field, value) {
  if (!state.users.users[index]) return;
  state.users.users[index][field] = value;
}

export function updateUserPassword(index, value) {
  if (!state.users.users[index]) return;
  if (value.trim() !== '') {
    state.users.users[index].password_hash = value;
  }
}

export function addNewUser() {
  if (!state.users.users) state.setUsers({ users: [] });
  state.users.users.unshift({
    uuid: utils.generateUUID(),
    username: '',
    password_hash: '',
    services: []
  });
  renderUsersEditor();
}

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
    await waitForServerRestart();

    reloadPage();
  } catch (error) {
    const message = utils.parseErrorMessage(error);
    showStatus('<span class="material-icons">error</span> Failed to save users: ' + message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Users';
  }
}
