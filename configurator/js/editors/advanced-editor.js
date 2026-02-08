// Advanced Editor Module
// Handles advanced configuration including parsers, extractors, and query types

import * as state from '../state.js';
import * as api from '../api.js';
import { reloadPage, waitForServerRestart, showPromptModal, showStatus, showConfirmModal, showLoadingOverlay } from '../ui-components.js';

export function renderAdvancedEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');
  
  // Build parsers list
  let parsersHtml = '';
  if (state.advanced.parsers) {
    Object.keys(state.advanced.parsers).forEach(key => {
      parsersHtml += `
        <div class="form-group">
          <label for="parser_${key}">${key}</label>
          <textarea id="parser_${key}" rows="5" onchange="updateAdvancedParser('${key}', this.value)">${state.advanced.parsers[key] || ''}</textarea>
          <button class="btn-remove" onclick="removeAdvancedParser('${key}')"><span class="material-icons">remove_circle</span> Remove</button>
        </div>
      `;
    });
  }
  
  // Build extractors list
  let extractorsHtml = '';
  if (state.advanced.extractors) {
    Object.keys(state.advanced.extractors).forEach(key => {
      extractorsHtml += `
        <div class="form-group">
          <label for="extractor_${key}">${key}</label>
          <textarea id="extractor_${key}" rows="5" onchange="updateAdvancedExtractor('${key}', this.value)">${state.advanced.extractors[key] || ''}</textarea>
          <button class="btn-remove" onclick="removeAdvancedExtractor('${key}')"><span class="material-icons">remove_circle</span> Remove</button>
        </div>
      `;
    });
  }
  
  // Build query types list
  let queryTypesHtml = '';
  if (state.advanced.queryTypes && state.advanced.queryTypes.length > 0) {
    state.advanced.queryTypes.forEach((qt, index) => {
      queryTypesHtml += `
        <div class="form-group">
          <input type="text" id="querytype_${index}" value="${qt}" onchange="updateAdvancedQueryType(${index}, this.value)">
          <button class="btn-remove advanced-remove-btn" onclick="removeAdvancedQueryType(${index})"><span class="material-icons">remove_circle</span> Remove</button>
        </div>
      `;
    });
  }
  
  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">science</span> Advanced Configuration</div>
      <div class="hint hint-section">Configure custom parsers, extractors, and GameDig query types. These are advanced features for extending healthcheck functionality.</div>
    </div>
    <div class="section">
      <div class="section-title">HTTP Response Body Parsers</div>
      <div class="hint hint-section">Custom parsers for HTTP healthchecks. Must be valid JavaScript function code that takes (body) as parameter and returns boolean.</div>
      ${parsersHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedParser()"><span class="material-icons">add_circle</span> Add Parser</button>
    </div>
    <div class="section">
      <div class="section-title">Metadata Extractors</div>
      <div class="hint hint-section">Custom extractors for pulling metadata from healthcheck responses. Must be valid JavaScript function code that takes (state) as parameter and returns object with online, max, version properties.</div>
      ${extractorsHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedExtractor()"><span class="material-icons">add_circle</span> Add Extractor</button>
    </div>
    <div class="section">
      <div class="section-title">GameDig Query Types</div>
      <div class="hint hint-section">Supported game types for GameDig healthchecks (e.g., "mbe", "valheim").</div>
      ${queryTypesHtml}
      <button class="btn-add-field on-top" onclick="addAdvancedQueryType()"><span class="material-icons">add_circle</span> Add Query Type</button>
    </div>
  `;

  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertAdvanced()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveAdvancedBtn" onclick="saveAdvanced()"><span class="material-icons">save</span> Save Advanced Config</button>
  `;
}

export function addAdvancedParser() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add Parser',
    'Enter the name for the new parser:',
    'lowercase letters, numbers, and underscores',
    '',
    'e.g., my_parser',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Parser name cannot be empty', 'error');
        return false;
      }
      if (state.advanced.parsers[name]) {
        showStatus('Parser with that name already exists', 'error');
        return false;
      }
      state.advanced.parsers[name] = '(body) => {\n  // Your parser code here\n  return true;\n}';
      renderAdvancedEditor();
      return true;
    }
  );
}

export function addAdvancedExtractor() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add Extractor',
    'Enter the name for the new extractor:',
    'lowercase letters, numbers, and underscores',
    '',
    'e.g., my_extractor',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Extractor name cannot be empty', 'error');
        return false;
      }
      if (state.advanced.extractors[name]) {
        showStatus('Extractor with that name already exists', 'error');
        return false;
      }
      state.advanced.extractors[name] = '(state) => ({\n  online: 0,\n  max: 0,\n  version: "1.0"\n})';
      renderAdvancedEditor();
      return true;
    }
  );
}

export function addAdvancedQueryType() {
  showPromptModal(
    '<span class="material-icons">add_circle</span> Add Query Type',
    'Enter the query type name:',
    'Valid gamedig query type',
    '',
    'e.g., mbe, valheim, csgo',
    (name) => {
      if (!name || name.trim() === '') {
        showStatus('Query type cannot be empty', 'error');
        return false;
      }
      if (state.advanced.queryTypes.includes(name)) {
        showStatus('Query type already exists', 'error');
        return false;
      }
      state.advanced.queryTypes.push(name);
      renderAdvancedEditor();
      return true;
    }
  );
}

export function updateAdvancedParser(name, value) {
  state.advanced.parsers[name] = value;
}

export function updateAdvancedExtractor(name, value) {
  state.advanced.extractors[name] = value;
}

export function updateAdvancedQueryType(index, value) {
  state.advanced.queryTypes[index] = value;
}

export function removeAdvancedParser(name) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Parser',
    `Are you sure you want to remove the parser "${name}"?`,
    (confirmed) => {
      if (confirmed) {
        delete state.advanced.parsers[name];
        renderAdvancedEditor();
        showStatus('Parser removed', 'success');
      }
    }
  );
}

export function removeAdvancedExtractor(name) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Extractor',
    `Are you sure you want to remove the extractor "${name}"?`,
    (confirmed) => {
      if (confirmed) {
        delete state.advanced.extractors[name];
        renderAdvancedEditor();
        showStatus('Extractor removed', 'success');
      }
    }
  );
}

export function removeAdvancedQueryType(index) {
  showConfirmModal(
    '<span class="material-icons">remove_circle</span> Remove Query Type',
    `Are you sure you want to remove the query type "${state.advanced.queryTypes[index]}"?`,
    (confirmed) => {
      if (confirmed) {
        state.advanced.queryTypes.splice(index, 1);
        renderAdvancedEditor();
        showStatus('Query type removed', 'success');
      }
    }
  );
}

export async function saveAdvanced() {
  const saveBtn = document.getElementById('saveAdvancedBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    await api.saveAdvanced(state.advanced);

    state.setOriginalAdvanced(JSON.parse(JSON.stringify(state.advanced)));
    showStatus('Advanced configuration saved successfully!', 'success');
    
    showLoadingOverlay(
      'Server Restarting...', 'Advanced configuration saved. Waiting for the server to restart...');
    
    await waitForServerRestart();
    
    reloadPage();
  } catch (error) {
    console.error('Advanced config save error:', error);
    showStatus('Save failed: ' + error.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Advanced Config';
  }
}

export function revertAdvanced() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Changes',
    'Are you sure you want to discard all changes to the advanced configuration?',
    (confirmed) => {
      if (confirmed) {
        state.setAdvanced(JSON.parse(JSON.stringify(state.originalAdvanced)));
        renderAdvancedEditor();
        showStatus('Advanced configuration changes reverted', 'success');
      }
    }
  );
}
