// Complete Configurator - File Manager Module
// This file contains all file management functions for the configurator
// Migrated from the original 5,420-line script.js monolith

import * as state from './state.js';
import * as utils from './utils.js';
import { showStatus, closePromptModal, showLoadingOverlay, hideLoadingOverlay, showPromptModal, showPromptError, showConfirmModal } from './ui-components.js';

// ============================================================================
// FILE MANAGER STATE
// ============================================================================

let currentFileManagerContext = null;
let selectedFiles = new Set();

// ============================================================================
// MAIN FILE MANAGER RENDER
// ============================================================================

export async function renderFileManager(serviceName, folderType = 'public', currentPath = '', pushState = true) {
  const panel = document.getElementById('editorPanel');
  const actions = document.getElementById('editorActions');

  if (pushState) {
    const routePath = window.buildAppRoute({ section: `config-${serviceName}`, folder: folderType, path: currentPath });
    window.history.pushState({}, '', routePath);
  }

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  const service = state.config.services[serviceName];
  const serviceType = service?.subdomain?.type;
  const showFolderTypeSelector = serviceType === 'index';

  let html = `
    <div class="section">
      <div class="section-title"><span class="material-icons">folder</span> File Manager - ${serviceName}</div>
      <div class="hint hint-section">Manage the files hosted by this service</div>
      ${showFolderTypeSelector ? `
      <div class="form-group">
        <label>Folder Type</label>
        <div class="folders-tabs-row">
          <button class="tab-folder-type ${folderType === 'public' ? 'active' : ''}" 
              onclick="switchFolderType('${serviceName}', 'public')">
            <span class="material-icons">public</span> Public
          </button>
          <button class="tab-folder-type ${folderType === 'static' ? 'active' : ''}" 
              onclick="switchFolderType('${serviceName}', 'static')">
            <span class="material-icons">code</span> Static
          </button>
        </div>
        <div class="folders-tabs-spacer"></div>
        <div class="hint" id="folderTypeHint">${folderType === 'public' ? 'Public files are served directly.' : 'Static files are stored differently and are served at the /static path.'}</div>
      </div>
      ` : ''}
      <div id="fileManagerContentContainer"></div>
    </div>
  `;

  panel.innerHTML = html;
  actions.innerHTML = `
    <button class="btn-add-field" onclick="backToServiceEditor('${serviceName}')"><span class="material-icons">arrow_back</span> Back to Service</button>
  `;

  await renderFileManagerContent(serviceName, folderType, currentPath);
}

export async function switchFolderType(serviceName, folderType) {
  const routePath = window.buildAppRoute({ section: `config-${serviceName}`, folder: folderType });
  window.history.pushState({}, '', routePath);

  // Update tab styles
  const tabs = document.querySelectorAll('.tab-folder-type');
  tabs.forEach(tab => {
    const isPublic = tab.textContent.includes('Public');
    const isActive = (isPublic && folderType === 'public') || (!isPublic && folderType === 'static');
    tab.classList.toggle('active', isActive);
  });

  // Update hint text
  const hintEl = document.getElementById('folderTypeHint');
  if (hintEl) {
    hintEl.textContent = folderType === 'public' 
      ? 'Public files are served directly.' 
      : 'Static files are stored differently and are served at the /static path.';
  }

  await renderFileManagerContent(serviceName, folderType, '');
}

export async function renderFileManagerContent(serviceName, folderType, currentPath = '') {
  const container = document.getElementById('fileManagerContentContainer');
  if (!container) return;
  
  try {
    const queryPath = currentPath ? `?path=${encodeURIComponent(currentPath)}` : '';
    const response = await fetch(`/files/${serviceName}/${folderType}${queryPath}`);
    const data = await response.json();
    
    if (!data.success) {
      showStatus(data.error, 'error');
      return;
    }
    
    const files = data.files || [];
    const pathFromServer = data.currentPath || '';
    
    const pathParts = pathFromServer ? pathFromServer.split('/').filter(p => p) : [];
    const domain = state.config.domain || 'domain.com';
    const rootUrl = folderType === 'public' 
      ? `${serviceName}.${domain}` 
      : `${serviceName}.${domain}/static`;
    let breadcrumbs = `<a href="#" onclick="navigateFileManager('${serviceName}', '${folderType}', '')" class="breadcrumb-link"><span class="material-icons">folder</span> ${rootUrl}</a>`;
    
    let accumulatedPath = '';
    for (let i = 0; i < pathParts.length; i++) {
      accumulatedPath += (accumulatedPath ? '/' : '') + pathParts[i];
      const displayPath = accumulatedPath;
      breadcrumbs += ` / <a href="#" onclick="navigateFileManager('${serviceName}', '${folderType}', '${displayPath}')" class="breadcrumb-link">${pathParts[i]}</a>`;
    }
    
    let html = `
      <div class="form-group">
        <label>Current Path</label>
        <div class="breadcrumb-container">
          ${breadcrumbs}
        </div>
      </div>
      
      <div class="form-group">
        <div class="file-manager-actions" id="file-manager-actions">
          <div class="file-manager-actions-left">
            <button class="btn-add-field secondary" onclick="showUploadDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">upload</span> Upload File</button>
            <button class="btn-add-field secondary" onclick="showCreateDirectoryDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">create_new_folder</span> Create Directory</button>
            <button class="btn-add-field secondary" onclick="showUnpackZipDialog('${serviceName}', '${folderType}', '${pathFromServer}')"><span class="material-icons">folder_zip</span> Unpack Zip</button>
          </div>
          <button class="btn-add-field secondary" onclick="selectAllFiles()"><span class="material-icons">check_box</span> Select All</button>
        </div>
      </div>
      
      <div class="file-list-container">
        ${renderFileList(files, serviceName, folderType, pathFromServer)}
      </div>
    `;
    
    container.innerHTML = html;
    
    currentFileManagerContext = { serviceName, folderType, currentPath: pathFromServer, files };
    selectedFiles.clear();
    updateFileManagerActions();
  } catch (error) {
    showStatus('Failed to load files: ' + error.message, 'error');
  }
}

export async function navigateFileManager(serviceName, folderType, currentPath) {
  const url = new URL(window.location);
  if (currentPath) {
    url.searchParams.set('path', currentPath);
  } else {
    url.searchParams.delete('path');
  }
  window.history.pushState({}, '', url);
  
  await renderFileManagerContent(serviceName, folderType, currentPath);
}

export async function backToServiceEditor(serviceName) {
  const url = new URL(window.location);
  url.searchParams.delete('folder');
  url.searchParams.delete('path');
  window.history.pushState({}, '', url);
  selectedFiles.clear();
  currentFileManagerContext = null;
  
  const { renderServiceEditor } = await import('./editors/service-editor.js');
  renderServiceEditor(serviceName);
}

// ============================================================================
// FILE SELECTION
// ============================================================================

export function toggleFileSelection(filePath) {
  if (selectedFiles.has(filePath)) {
    selectedFiles.delete(filePath);
  } else {
    selectedFiles.add(filePath);
  }
  updateFileManagerActions();
  updateFileItemStyles();
}

function updateFileItemStyles() {
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    const checkbox = item.querySelector('.file-checkbox');
    if (checkbox && checkbox.checked) {
      item.classList.add('file-item-selected');
    } else {
      item.classList.remove('file-item-selected');
    }
  });
}

export function clearFileSelection() {
  selectedFiles.clear();
  
  const checkboxes = document.querySelectorAll('.file-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  
  updateFileManagerActions();
  updateFileItemStyles();
}

export function selectAllFiles() {
  if (!currentFileManagerContext) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const service = state.config.services[serviceName];
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    const checkbox = item.querySelector('.file-checkbox');
    if (checkbox) {
      const onchangeAttr = checkbox.getAttribute('onchange');
      if (onchangeAttr) {
        const match = onchangeAttr.match(/toggleFileSelection\('([^']+)'\)/);
        if (match) {
          const filePath = match[1];
          if (isDirlist && folderType === 'public' && !currentPath && filePath === 'protected') {
            return;
          }
          selectedFiles.add(filePath);
          checkbox.checked = true;
        }
      }
    }
  });
  
  updateFileManagerActions();
  updateFileItemStyles();
}

function updateFileManagerActions() {
  const actionsDiv = document.getElementById('file-manager-actions');
  if (!actionsDiv || !currentFileManagerContext) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const selectionCount = selectedFiles.size;
  
  if (selectionCount === 0) {
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-add-field secondary" onclick="showUploadDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">upload</span> Upload File</button>
        <button class="btn-add-field secondary" onclick="showCreateDirectoryDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">create_new_folder</span> Create Directory</button>
        <button class="btn-add-field secondary" onclick="showUnpackZipDialog('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">folder_zip</span> Unpack Zip</button>
      </div>
      <button class="btn-add-field secondary" onclick="selectAllFiles()"><span class="material-icons">check_box</span> Select All</button>
    `;
  } else if (selectionCount === 1) {
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-remove" onclick="deleteSelectedFiles()"><span class="material-icons">delete</span> Delete</button>
        <button class="btn-add-field secondary" onclick="renameSelectedFile()"><span class="material-icons">edit</span> Rename</button>
      </div>
      <button class="btn-add-field secondary" onclick="clearFileSelection()"><span class="material-icons">close</span> Clear Selection</button>
    `;
  } else {
    actionsDiv.innerHTML = `
      <div class="file-manager-actions-left">
        <button class="btn-remove" onclick="deleteSelectedFiles()"><span class="material-icons">delete</span> Delete (${selectionCount})</button>
      </div>
      <button class="btn-add-field secondary" onclick="clearFileSelection()"><span class="material-icons">close</span> Clear Selection</button>
    `;
  }
}

// ============================================================================
// FILE LIST RENDERING
// ============================================================================

function renderFileList(files, serviceName, folderType, currentPath) {
  const service = state.config.services[serviceName];
  const isDirlist = service?.subdomain?.type === 'dirlist';
  
  let html = '<div class="file-list">';
  
  // Always show "../" navigation if we're in a subdirectory
  if (currentPath) {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    html += `
      <div class="file-item">
        <span class="file-icon"><span class="material-icons folder">folder</span></span>
        <div class="file-info-clickable" onclick="navigateFileManager('${serviceName}', '${folderType}', '${parentPath}')">
          <div class="file-name-primary">../</div>
          <div class="hint file-meta">Go up one level</div>
        </div>
        <span class="file-checkbox-placeholder"></span>
      </div>
    `;
  }
  
  // If no files, show empty message
  if (!files || files.length === 0) {
    if (currentPath) {
      // In a subdirectory - show the "../" link and empty message
      html += '<div class="hint" style="margin-top: 12px;">No files found in this directory.</div>';
      html += '</div>';
      return html;
    } else {
      // At root - just show empty message
      return '<div class="hint">No files found. Upload files to get started.</div>';
    }
  }
  
  const sorted = files.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  
  for (const file of sorted) {
    const icon = file.type === 'directory' ? '<span class="material-icons folder">folder</span>' : utils.getFileIcon(file.name);
    const sizeStr = file.type === 'file' ? utils.formatFileSize(file.size) : '';
    const modified = file.type === 'file' && file.modified ? new Date(file.modified).toLocaleString() : '';
    const fullPath = currentPath ? `${currentPath}/${file.path}` : file.path;
    const isSelected = selectedFiles.has(fullPath);
    
    const isProtectedFolder = isDirlist && folderType === 'public' && !currentPath && file.name === 'protected' && file.type === 'directory';
    
    if (file.type === 'directory') {
      html += `
        <div class="file-item ${isSelected ? 'file-item-selected' : ''}">
          <span class="file-icon">${icon}</span>
          <div class="file-info-clickable" onclick="navigateFileManager('${serviceName}', '${folderType}', '${fullPath}')">
            <div class="file-name-primary">${file.name}</div>
            <div class="hint file-meta">Click to open</div>
          </div>
          ${isProtectedFolder ? '<span class="file-checkbox-placeholder"></span>' : `<input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${fullPath}')" onclick="event.stopPropagation()">`}
        </div>
      `;
    } else {
      html += `
        <div class="file-item ${isSelected ? 'file-item-selected' : ''}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            ${sizeStr || modified ? `<div class="hint file-meta">${sizeStr}${sizeStr && modified ? ' • ' : ''}${modified}</div>` : ''}
          </div>
          <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${fullPath}')" onclick="event.stopPropagation()">
        </div>
      `;
    }
  }
  
  html += '</div>';
  return html;
}

// ============================================================================
// FILE UPLOAD
// ============================================================================

export function showUploadDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">upload</span> Upload File</div>
    ${currentPath ? `<div class="modal-body">Uploading to: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="fileInput">Select File</label>
      <input type="file" id="fileInput" class="file-input-hidden">
      <button class="btn-add-field no-top" onclick="document.getElementById('fileInput').click()"><span class="material-icons">upload_file</span> Choose File</button>
      <span id="fileInputName" class="file-name-display"></span>
    </div>
    <div class="form-group">
      <label for="targetPathInput">Filename (optional)</label>
      <input type="text" id="targetPathInput" placeholder="Leave empty to use original filename">
      <div class="hint">Specify a filename (with extension) to use a different name</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="uploadFile('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">upload</span> Upload</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || '';
    document.getElementById('fileInputName').textContent = fileName;
  });
}

export async function uploadFile(serviceName, folderType, currentPath = '', forcedFilename = null, providedFile = null) {
  const fileInput = document.getElementById('fileInput');
  const targetPathInput = document.getElementById('targetPathInput');
  
  const file = providedFile || (fileInput?.files?.[0]);
  
  if (!file) {
    showStatus('Please select a file', 'error');
    return;
  }
  
  const filename = forcedFilename || targetPathInput?.value.trim() || file.name;
  
  if (!forcedFilename && currentFileManagerContext && currentFileManagerContext.files) {
    const existingFile = currentFileManagerContext.files.find(f => f.name === filename && f.type === 'file');
    if (existingFile) {
      showOverwriteDialog(serviceName, folderType, currentPath, file, filename);
      return;
    }
  }
  
  const targetPath = currentPath ? `${currentPath}/${filename}` : filename;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetPath', targetPath);
  
  try {
    closePromptModal();
    showLoadingOverlay('Uploading File', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus('File uploaded successfully', 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Upload failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Upload failed: ' + error.message, 'error');
  }
}

function generateAutoRename(filename, existingFiles) {
  const files = existingFiles || [];
  const fileNames = files.filter(f => f.type === 'file').map(f => f.name);
  
  const lastDotIndex = filename.lastIndexOf('.');
  let baseName, extension;
  
  if (lastDotIndex > 0) {
    baseName = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex);
  } else {
    baseName = filename;
    extension = '';
  }
  
  let counter = 1;
  let newName;
  do {
    newName = `${baseName}(${counter})${extension}`;
    counter++;
  } while (fileNames.includes(newName));
  
  return newName;
}

function showOverwriteDialog(serviceName, folderType, currentPath, file, filename) {
  const suggestedName = generateAutoRename(filename, currentFileManagerContext.files);
  
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">warning</span> File Already Exists</div>
    <div class="modal-body">
      <p>The file <strong>${filename}</strong> already exists in this directory.</p>
    </div>
    <div class="form-group">
      <label for="newFilenameInput">New Filename</label>
      <input type="text" id="newFilenameInput" value="${suggestedName}">
      <div class="hint">Enter a new filename or click Overwrite to replace the existing file</div>
    </div>
    <div class="modal-footer">
      <button class="btn-remove btn-remove-no-margin" onclick="handleOverwrite('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">published_with_changes</span> Overwrite</button>
      <div class="flex-spacer"></div>
      <button class="btn-reset" onclick="closePromptModal(); _pendingUploadFile = null;"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="handleRename('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">edit</span> Rename</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  _pendingUploadFile = file;
}

export function handleOverwrite(serviceName, folderType, currentPath) {
  const file = _pendingUploadFile;
  if (!file) return;
  
  uploadFile(serviceName, folderType, currentPath, file.name, file);
  
  _pendingUploadFile = null;
}

export function handleRename(serviceName, folderType, currentPath) {
  const file = _pendingUploadFile;
  if (!file) return;
  
  const newFilename = document.getElementById('newFilenameInput').value.trim();
  if (!newFilename) {
    showStatus('Please enter a valid filename', 'error');
    return;
  }
  
  uploadFile(serviceName, folderType, currentPath, newFilename, file);
  
  _pendingUploadFile = null;
}

// ============================================================================
// DIRECTORY CREATION
// ============================================================================

export function showCreateDirectoryDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">create_new_folder</span> Create Directory</div>
    ${currentPath ? `<div class="modal-body">Creating in: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="directoryNameInput">Directory Name</label>
      <input type="text" id="directoryNameInput" placeholder="folder-name">
      <div class="hint">Enter the directory name to create</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="createDirectory('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">create_new_folder</span> Create</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
}

export async function createDirectory(serviceName, folderType, currentPath = '') {
  const directoryNameInput = document.getElementById('directoryNameInput');
  const directoryName = directoryNameInput.value.trim();
  
  if (!directoryName) {
    showStatus('Please enter a directory name', 'error');
    return;
  }
  
  const directoryPath = currentPath ? `${currentPath}/${directoryName}` : directoryName;
  
  try {
    closePromptModal();
    showLoadingOverlay('Creating Directory', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath })
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus('Directory created successfully', 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Creation failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Creation failed: ' + error.message, 'error');
  }
}

// ============================================================================
// DELETE/RENAME OPERATIONS
// ============================================================================

export async function deleteSelectedFiles() {
  if (!currentFileManagerContext || selectedFiles.size === 0) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const fileCount = selectedFiles.size;
  
  showConfirmModal(
    '<span class="material-icons">delete</span> Delete Files',
    `Are you sure you want to delete ${fileCount} item${fileCount > 1 ? 's' : ''}?\n\nThis action cannot be undone.`,
    async (confirmed) => {
      if (!confirmed) return;
      
      try {
        showLoadingOverlay('Deleting', `Deleting ${fileCount} item${fileCount > 1 ? 's' : ''}...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const filePath of selectedFiles) {
          try {
            const response = await fetch(`/files/${serviceName}/${folderType}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath })
            });
            
            const data = await response.json();
            if (data.success) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            failCount++;
          }
        }
        
        hideLoadingOverlay();
        
        if (failCount === 0) {
          showStatus(`Successfully deleted ${successCount} item${successCount > 1 ? 's' : ''}`, 'success');
        } else {
          showStatus(`Deleted ${successCount} item${successCount > 1 ? 's' : ''}, ${failCount} failed`, 'error');
        }
        
        selectedFiles.clear();
        renderFileManager(serviceName, folderType, currentPath);
      } catch (error) {
        hideLoadingOverlay();
        showStatus('Batch deletion failed: ' + error.message, 'error');
      }
    }
  );
}

export async function renameSelectedFile() {
  if (!currentFileManagerContext || selectedFiles.size !== 1) return;
  
  const { serviceName, folderType, currentPath } = currentFileManagerContext;
  const filePath = Array.from(selectedFiles)[0];
  const fileName = filePath.split('/').pop();
  
  showPromptModal(
    '<span class="material-icons">edit</span> Rename File',
    'Enter new name:',
    '',
    fileName,
    'Enter new name',
    async (newName) => {
      if (!newName || newName.trim() === '') {
        showPromptError('Please enter a valid name');
        return false;
      }
      
      const trimmedName = newName.trim();
      if (trimmedName === fileName) {
        showStatus('Name unchanged', 'info');
        return;
      }
      
      const pathParts = filePath.split('/');
      pathParts[pathParts.length - 1] = trimmedName;
      const newPath = pathParts.join('/');
      
      try {
        showLoadingOverlay('Renaming', 'Please wait...');
        
        const response = await fetch(`/files/${serviceName}/${folderType}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            oldPath: filePath,
            newPath: newPath
          })
        });
        
        const data = await response.json();
        
        hideLoadingOverlay();
        
        if (data.success) {
          showStatus('Renamed successfully', 'success');
          selectedFiles.clear();
          renderFileManager(serviceName, folderType, currentPath);
        } else {
          showStatus(data.error || 'Rename failed', 'error');
        }
      } catch (error) {
        hideLoadingOverlay();
        showStatus('Rename failed: ' + error.message, 'error');
      }
    }
  );
}

// ============================================================================
// ZIP EXTRACTION
// ============================================================================

export function showUnpackZipDialog(serviceName, folderType, currentPath = '') {
  const pathDisplay = currentPath ? `/${currentPath}` : '';
  const dialogContent = `
    <div class="modal-header"><span class="material-icons">folder_zip</span> Unpack Zip File</div>
    ${currentPath ? `<div class="modal-body">Extracting to: <strong>${pathDisplay}</strong></div>` : ''}
    <div class="form-group">
      <label for="zipFileInput">Select Zip File</label>
      <input type="file" id="zipFileInput" accept=".zip" class="file-input-hidden">
      <button class="btn-add-field no-top" onclick="document.getElementById('zipFileInput').click()"><span class="material-icons">upload_file</span> Choose File</button>
      <span id="zipFileInputName" class="file-name-display"></span>
      <div class="hint">Choose a zip file to extract into the current directory</div>
    </div>
    <div class="form-group">
      <div class="checkbox-item">
        <input type="checkbox" id="deployFromZip">
        <label for="deployFromZip" class="inline-label">Deploy from this file</label>
      </div>
      <div class="hint">Clears the contents of the directory before unpacking the zip file</div>
    </div>
    <div class="modal-footer">
      <button class="btn-reset" onclick="closePromptModal()"><span class="material-icons">close</span> Cancel</button>
      <button class="btn-save" onclick="unpackZip('${serviceName}', '${folderType}', '${currentPath}')"><span class="material-icons">folder_zip</span> Extract</button>
    </div>
  `;
  
  document.getElementById('promptModalContent').innerHTML = dialogContent;
  document.getElementById('promptModal').classList.add('active');
  
  document.getElementById('zipFileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || '';
    document.getElementById('zipFileInputName').textContent = fileName;
  });
}

export async function unpackZip(serviceName, folderType, currentPath = '') {
  const zipFileInput = document.getElementById('zipFileInput');
  const deployCheckbox = document.getElementById('deployFromZip');
  
  if (!zipFileInput.files || zipFileInput.files.length === 0) {
    showStatus('Please select a zip file', 'error');
    return;
  }
  
  const file = zipFileInput.files[0];
  
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showStatus('Please select a valid zip file', 'error');
    return;
  }
  
  const isDeploy = deployCheckbox.checked;
  
  if (!isDeploy && currentFileManagerContext && currentFileManagerContext.files && currentFileManagerContext.files.length > 0) {
    closePromptModal();
    showConfirmModal(
      '<span class="material-icons">warning</span> Overwrite Warning',
      'Extracting this zip file may overwrite existing files with the same names in this directory.\n\nDo you want to continue?',
      (confirmed) => {
        if (confirmed) {
          performZipExtraction(serviceName, folderType, currentPath, file, isDeploy);
        }
      }
    );
  } else {
    performZipExtraction(serviceName, folderType, currentPath, file, isDeploy);
  }
}

async function performZipExtraction(serviceName, folderType, currentPath, file, isDeploy) {
  const formData = new FormData();
  formData.append('zipFile', file);
  formData.append('targetPath', currentPath);
  formData.append('deploy', isDeploy ? 'true' : 'false');
  
  try {
    closePromptModal();
    showLoadingOverlay('Extracting Zip File', 'Please wait...');
    
    const response = await fetch(`/files/${serviceName}/${folderType}/unpack`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    hideLoadingOverlay();
    
    if (data.success) {
      showStatus(`Extracted ${data.filesExtracted || 'all'} files successfully`, 'success');
      renderFileManager(serviceName, folderType, currentPath);
    } else {
      showStatus(data.error || 'Extraction failed', 'error');
    }
  } catch (error) {
    hideLoadingOverlay();
    showStatus('Extraction failed: ' + error.message, 'error');
  }
}
