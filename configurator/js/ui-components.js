// Global variables to hold current confirm/prompt callbacks
let confirmCallback = null;
let promptCallback = null;

// Status messages
export function showStatus(message, type) {
  const container = document.getElementById('statusContainer');
  let icon;
  if (type === 'error') {
    icon = '<span class="material-icons error">error</span>';
  }
  if (type === 'success') {
    icon = '<span class="material-icons success">check_circle</span>';
  }
  if (type === 'warning') {
    icon = '<span class="material-icons warning">warning</span>';
  }
  if (type === 'info') {
    icon = '<span class="material-icons info">info</span>';
  }
  const statusEl = document.createElement('div');
  statusEl.className = 'status ' + type;
  statusEl.innerHTML = icon ? icon + ' ' + message : message;
  
  statusEl.addEventListener('click', () => {
    removeStatus(statusEl);
  });
  
  container.appendChild(statusEl);
  
  setTimeout(() => {
    removeStatus(statusEl);
  }, 5000);
}

export function removeStatus(statusEl) {
  if (!statusEl || !statusEl.parentNode) return;
  
  statusEl.classList.add('removing');
  setTimeout(() => {
    if (statusEl.parentNode) {
      statusEl.parentNode.removeChild(statusEl);
    }
  }, 300);
}

// Confirm modal
export function showConfirmModal(title, message, callback) {
  document.getElementById('confirmTitle').innerHTML = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  document.getElementById('confirmModal').classList.add('active');
}

export function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('active');
  confirmCallback = null;
}

export function confirmAction() {
  if (confirmCallback) {
    confirmCallback(true);
  }
  closeConfirmModal();
}

// Prompt modal
export function showPromptModal(title, message, hint = '', defaultValue = '', placeholder = 'Enter text here', callback) {
  const modalContent = `
    <div class="modal-header">${title}</div>
    <div class="modal-body">${message}</div>
    <div class="form-group">
      <input type="text" id="promptInput" class="modal-input" placeholder="${placeholder}" value="${defaultValue}">
      ${hint ? `<div id="promptHint" class="hint prompt-hint">${hint}</div>` : ''}
      <div id="promptError" class="hint prompt-error"></div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-secondary" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="submitPrompt()"><span class="material-icons">check</span> Submit</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = modalContent;
  promptCallback = callback;
  document.getElementById('promptModal').classList.add('active');
  setTimeout(() => {
    const input = document.getElementById('promptInput');
    if (input) {
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitPrompt();
      });
      input.addEventListener('input', () => {
        document.getElementById('promptError').style.display = 'none';
      });
    }
  }, 100);
}

export function showPromptError(errorMessage) {
  const errorEl = document.getElementById('promptError');
  errorEl.textContent = errorMessage;
  errorEl.style.display = 'block';
}

export function closePromptModal() {
  document.getElementById('promptModal').classList.remove('active');
  promptCallback = null;
}

export async function submitPrompt() {
  const value = document.getElementById('promptInput').value;
  if (!promptCallback) return;

  const submitBtn = document.querySelector('#promptModalContent .modal-btn-primary');
  const wasDisabled = submitBtn ? submitBtn.disabled : false;
  if (submitBtn) submitBtn.disabled = true;

  try {
    let result;

    try {
      result = promptCallback(value);
    } catch (err) {
      showPromptError(err && err.message ? err.message : String(err));
      return;
    }

    if (result && typeof result.then === 'function') {
      try {
        const resolved = await result;
        if (resolved === false) {
          return;
        }
        closePromptModal();
      } catch (err) {
        showPromptError(err && err.message ? err.message : String(err));
        return;
      }
    } else {
      if (!!result) {
        closePromptModal();
      }
    }
  } finally {
    if (submitBtn) submitBtn.disabled = wasDisabled;
  }
}

// Loading overlay
export function showLoadingOverlay(title, message, error) {
  const overlay = document.getElementById('loadingOverlay');
  const spinner = document.getElementById('loadingSpinner');
  const icon = document.getElementById('loadingIcon');
  
  if (error) {
    spinner.style.display = 'none';
    icon.style.display = 'block';
  } else {
    spinner.style.display = 'block';
    icon.style.display = 'none';
  }

  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingMessage').textContent = message;
  overlay.classList.remove('hiding');
  overlay.classList.add('active');
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hiding');
  overlay.classList.remove('active');
  
  setTimeout(() => {
    overlay.classList.remove('hiding');
  }, 300);
}

// Mobile panel switcher
export function showMobilePanel(panel) {
  const mainContent = document.querySelector('.main-content');
  const servicesBtn = document.getElementById('navServicesBtn');
  const editorBtn = document.getElementById('navEditorBtn');
  
  if (panel === 'services') {
    mainContent.setAttribute('data-mobile-view', 'services');
    servicesBtn.classList.add('active');
    editorBtn.classList.remove('active');
  } else if (panel === 'editor') {
    mainContent.setAttribute('data-mobile-view', 'editor');
    servicesBtn.classList.remove('active');
    editorBtn.classList.add('active');
  }
}

/* REUSABLE DROPDOWN COMPONENT */
/**
 * Creates a reusable dropdown component that supports both single-select and multi-select modes
 * @param {Object} options Configuration object
 * @param {string} options.id Unique identifier for the dropdown
 * @param {Array} options.items Array of items with {value, label, [selected], [disabled], [special]} properties
 * @param {boolean} options.multiSelect Whether to allow multiple selections (default: false)
 * @param {string} options.placeholder Placeholder text when nothing is selected
 * @param {string} options.onChange Name of the callback function to call when selection changes
 * @param {boolean} options.disabled Whether the dropdown is disabled (default: false)
 * @returns {string} HTML string for the dropdown
 */
export function createDropdown(options) {
  const {
    id,
    items = [],
    multiSelect = false,
    placeholder = 'Select...',
    onChange = null,
    disabled = false
  } = options;

  const selectedItems = items.filter(item => item.selected);
  const hasSelection = selectedItems.length > 0;
  
  // Generate display content
  let displayContent;
  if (!hasSelection) {
    displayContent = `<span class="multi-select-placeholder">${placeholder}</span>`;
  } else if (multiSelect) {
    displayContent = selectedItems.map(item => {
      const specialClass = item.special ? ` ${item.special}` : '';
      return `<span class="multi-select-tag${specialClass}"><span>${item.label}</span><span class="multi-select-tag-remove" onclick="removeDropdownTag('${id}', '${item.value}', event)"><span class="material-icons">close</span></span></span>`;
    }).join('');
  } else {
    // Single-select mode: show selected value as plain text
    displayContent = `<span class="multi-select-selected-text">${selectedItems[0].label}</span>`;
  }

  // Generate options HTML
  const optionsHtml = items.map(item => {
    const isSelected = item.selected ? 'selected' : '';
    const isDisabled = item.disabled ? 'disabled' : '';
    const specialClass = item.special ? ` ${item.special}` : '';
    return `
      <div class="multi-select-option ${isSelected} ${isDisabled}${specialClass}" 
          data-value="${item.value}" onclick="selectDropdownOption('${id}', '${item.value}', ${multiSelect}, event)">
        ${multiSelect ? '<div class="multi-select-checkbox"></div>' : ''}
        <span class="multi-select-label">${item.label}</span>
      </div>
    `;
  }).join('');

  const onchangeAttr = onChange ? ` data-onchange="${onChange}"` : '';
  const disabledClass = disabled ? ' disabled' : '';
  const modeClass = multiSelect ? ' multi-select-multi' : ' multi-select-single';
  
  return `
    <div class="multi-select${modeClass}${disabledClass}" id="${id}" onclick="toggleDropdown('${id}', event)"${onchangeAttr} data-placeholder="${placeholder}">
      <div class="multi-select-display">
        ${displayContent}
      </div>
      <div class="multi-select-dropdown">
        ${optionsHtml}
      </div>
    </div>
  `;
}

// Toggles a dropdown open/closed
export function toggleDropdown(id, event) {
  event.stopPropagation();
  
  if (event.target.closest('.multi-select-option') || event.target.closest('.multi-select-tag-remove')) {
    return;
  }
  
  const select = document.getElementById(id);
  if (!select || select.classList.contains('disabled')) return;
  
  const wasOpen = select.classList.contains('open');
  
  // Close all other dropdowns
  document.querySelectorAll('.multi-select.open').forEach(el => {
    el.classList.remove('open');
    const dropdown = el.querySelector('.multi-select-dropdown');
    if (dropdown) dropdown.classList.remove('drop-up');
  });

  if (!wasOpen) {
    select.classList.add('open');
    const dropdown = select.querySelector('.multi-select-dropdown');

    if (dropdown) {
      const rect = select.getBoundingClientRect();
      const dropdownHeight = Math.min(480, dropdown.scrollHeight);
      
      // Find the scrollable container (editor panel or other scrollable parent)
      let scrollableContainer = select.closest('.editor-panel-pane, .sidebar-scrollable');
      
      let spaceBelow, spaceAbove;
      
      if (scrollableContainer) {
        const containerRect = scrollableContainer.getBoundingClientRect();
        spaceBelow = containerRect.bottom - rect.bottom;
        spaceAbove = rect.top - containerRect.top;
      } else {
        spaceBelow = window.innerHeight - rect.bottom;
        spaceAbove = rect.top;
      }
      
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        dropdown.classList.add('drop-up');
      } else {
        dropdown.classList.remove('drop-up');
      }
    }
  }
}

// Handles option selection in dropdown
export function selectDropdownOption(id, value, multiSelect, event) {
  event.stopPropagation();
  
  const select = document.getElementById(id);
  if (!select) return;
  
  const option = event.target.closest('.multi-select-option');
  if (option?.classList.contains('disabled')) return;
  
  const onchangeCallback = select.getAttribute('data-onchange');
  
  if (multiSelect) {
    // Multi-select mode: toggle the option
    if (option.classList.contains('selected')) {
      option.classList.remove('selected');
    } else {
      option.classList.add('selected');
    }
    
    // Get all selected values
    const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
    const selectedValues = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
    
    // Update display
    updateDropdownDisplay(id, multiSelect);
    
    // Call onChange callback if provided
    if (onchangeCallback) {
      window[onchangeCallback](selectedValues);
    }
  } else {
    // Single-select mode: select only this option and close dropdown
    select.querySelectorAll('.multi-select-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');
    
    // Update display
    updateDropdownDisplay(id, multiSelect);
    
    // Close dropdown
    select.classList.remove('open');
    
    // Call onChange callback if provided
    if (onchangeCallback) {
      window[onchangeCallback](value);
    }
  }
}

// Removes a tag from a multi-select dropdown
export function removeDropdownTag(id, value, event) {
  event.stopPropagation();
  
  const select = document.getElementById(id);
  if (!select) return;
  
  const option = select.querySelector(`.multi-select-option[data-value="${value}"]`);
  if (option) {
    option.classList.remove('selected');
  }
  
  // Update display
  updateDropdownDisplay(id, true);
  
  // Call onChange callback if provided
  const onchangeCallback = select.getAttribute('data-onchange');
  if (onchangeCallback) {
    const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
    const selectedValues = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
    window[onchangeCallback](selectedValues);
  }
}

// Updates the display of a dropdown based on current selection
export function updateDropdownDisplay(id, multiSelect) {
  const select = document.getElementById(id);
  if (!select) return;
  
  const display = select.querySelector('.multi-select-display');
  const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
  
  if (selectedOptions.length === 0) {
    const placeholder = select.getAttribute('data-placeholder') || 'Select...';
    display.innerHTML = `<span class="multi-select-placeholder">${placeholder}</span>`;
  } else if (multiSelect) {
    // Multi-select: show tags
    const tags = Array.from(selectedOptions).map(option => {
      const value = option.getAttribute('data-value');
      const label = option.querySelector('.multi-select-label').textContent;
      const specialClasses = Array.from(option.classList).filter(c => 
        c !== 'multi-select-option' && c !== 'selected' && c !== 'disabled'
      ).join(' ');
      const specialClass = specialClasses ? ` ${specialClasses}` : '';
      return `<span class="multi-select-tag${specialClass}"><span>${label}</span><span class="multi-select-tag-remove" onclick="removeDropdownTag('${id}', '${value}', event)"><span class="material-icons">close</span></span></span>`;
    }).join('');
    display.innerHTML = tags;
  } else {
    // Single-select: show text
    const label = selectedOptions[0].querySelector('.multi-select-label').textContent;
    display.innerHTML = `<span class="multi-select-selected-text">${label}</span>`;
  }
}

// Gets the selected value(s) from a dropdown
export function getDropdownValue(id) {
  const select = document.getElementById(id);
  if (!select) return null;
  
  const selectedOptions = select.querySelectorAll('.multi-select-option.selected');
  const values = Array.from(selectedOptions).map(opt => opt.getAttribute('data-value'));
  
  const isMulti = select.classList.contains('multi-select-multi');
  return isMulti ? values : (values[0] || null);
}

// Sets the selected value(s) for a dropdown
export function setDropdownValue(id, value) {
  const select = document.getElementById(id);
  if (!select) return;
  
  const isMulti = select.classList.contains('multi-select-multi');
  const values = Array.isArray(value) ? value : [value];
  
  // Clear all selections
  select.querySelectorAll('.multi-select-option').forEach(opt => {
    opt.classList.remove('selected');
  });
  
  // Set new selections
  values.forEach(val => {
    const option = select.querySelector(`.multi-select-option[data-value="${val}"]`);
    if (option) {
      option.classList.add('selected');
    }
  });
  
  // Update display
  updateDropdownDisplay(id, isMulti);
}

// Password visibility toggle
export function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  const icon = button.querySelector('.material-icons');
  
  if (input.classList.contains('show-password')) {
    input.classList.remove('show-password');
    icon.textContent = 'visibility';
  } else {
    input.classList.add('show-password');
    icon.textContent = 'visibility_off';
  }
}

// Server restart ui functions
export async function waitForServerRestart(delay = 5000) {
  const maxAttempts = 2;
  const pollInterval = 5000;
  let attempts = 0;
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  while (attempts < maxAttempts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        document.documentElement.classList.remove('loaded');
        return true;
      }
    } catch (error) {
      console.warn('Server not responding yet, continuing to poll...');
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  hideLoadingOverlay();
  showLoadingOverlay('Restart Failed', 'Server did not restart within expected time. Please check manually.', true);
  return false;
}

export function reloadPage(update = false) {
  const url = new URL(window.location);
  setTimeout(() => {
    if (update) {
      url.searchParams.set('updated', 'true');
    } else {
      url.searchParams.set('restarted', 'true');
    }
    window.location.href = url.toString();
  }, 1000);
}
