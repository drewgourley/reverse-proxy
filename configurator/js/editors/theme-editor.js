import * as state from '../state.js';
import * as api from '../api.js';
import { showStatus, showConfirmModal } from '../ui-components.js';
import { hexToHSL, getInverseColor, darkenColor, lightenFromBackground, darkenFromBackground, clampBackgroundColor } from '../utils.js';

export function initializeTheme() {
  updateTheme();
  
  document.documentElement.classList.add('ready');
  
  const color1 = document.getElementById('color1');
  const color2 = document.getElementById('color2');
  const color3 = document.getElementById('color3');
  const color4 = document.getElementById('color4');
  
  if (color1) color1.value = state.colors.primary || '#667eea';
  if (color2) color2.value = state.colors.secondary || '#764ba2';
  if (color3) color3.value = state.colors.accent || '#48bb78';
  if (color4) color4.value = state.colors.background || '#ffffff';
}

export function updateTheme() {
  const primary = state.colors.primary || '#667eea';
  const secondary = state.colors.secondary || '#764ba2';
  const accent = state.colors.accent || '#48bb78';
  const background = state.colors.background || '#ffffff';
  const inverse = getInverseColor(accent);
  const displayBackground = clampBackgroundColor(background);
  
  const root = document.documentElement;
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-secondary', secondary);
  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-background', displayBackground);
  root.style.setProperty('--color-inverse', inverse);
  
  root.style.setProperty('--color-accent-hover', darkenColor(accent, 10));
  root.style.setProperty('--color-primary-hover', darkenColor(primary, 10));
  root.style.setProperty('--color-secondary-hover', darkenColor(secondary, 10));
  root.style.setProperty('--color-inverse-hover', darkenColor(inverse, 10));
  
  const bgHSL = hexToHSL(displayBackground);
  const isDark = bgHSL.l < 50;
  
  if (isDark) {
    root.style.setProperty('--color-gray-50', lightenFromBackground(displayBackground, 5));
    root.style.setProperty('--color-gray-100', lightenFromBackground(displayBackground, 10));
    root.style.setProperty('--color-gray-200', lightenFromBackground(displayBackground, 15));
    root.style.setProperty('--color-gray-300', lightenFromBackground(displayBackground, 25));
    root.style.setProperty('--color-gray-400', lightenFromBackground(displayBackground, 35));
    root.style.setProperty('--color-gray-500', lightenFromBackground(displayBackground, 45));
    root.style.setProperty('--color-gray-600', lightenFromBackground(displayBackground, 55));
    root.style.setProperty('--color-gray-700', lightenFromBackground(displayBackground, 65));
    root.style.setProperty('--color-gray-800', lightenFromBackground(displayBackground, 75));
    root.style.setProperty('--color-gray-900', lightenFromBackground(displayBackground, 85));
    root.style.setProperty('--color-text-primary', '#ffffff');
    root.style.setProperty('--color-text-secondary', lightenFromBackground(displayBackground, 70));
  } else {
    root.style.setProperty('--color-gray-50', darkenFromBackground(displayBackground, 2));
    root.style.setProperty('--color-gray-100', darkenFromBackground(displayBackground, 5));
    root.style.setProperty('--color-gray-200', darkenFromBackground(displayBackground, 10));
    root.style.setProperty('--color-gray-300', darkenFromBackground(displayBackground, 18));
    root.style.setProperty('--color-gray-400', darkenFromBackground(displayBackground, 38));
    root.style.setProperty('--color-gray-500', darkenFromBackground(displayBackground, 58));
    root.style.setProperty('--color-gray-600', darkenFromBackground(displayBackground, 71));
    root.style.setProperty('--color-gray-700', darkenFromBackground(displayBackground, 78));
    root.style.setProperty('--color-gray-800', darkenFromBackground(displayBackground, 88));
    root.style.setProperty('--color-gray-900', darkenFromBackground(displayBackground, 93));
    root.style.setProperty('--color-text-primary', '#111827');
    root.style.setProperty('--color-text-secondary', '#4b5563');
  }
  
  const darkenAmount = Math.max(0, (50 - bgHSL.l) * 0.9);
  const gradientPrimary = darkenColor(primary, darkenAmount);
  const gradientSecondary = darkenColor(secondary, darkenAmount);
  document.body.style.background = `linear-gradient(135deg, ${gradientPrimary} 0%, ${gradientSecondary} 100%)`;
}

export function revertTheme() {
  showConfirmModal(
    '<span class="material-icons">undo</span> Revert Theme',
    'Are you sure you want to discard all changes to the theme?',
    (confirmed) => {
      if (confirmed) {
        state.setColors(JSON.parse(JSON.stringify(state.originalColors)));
        updateTheme();
        
        const color1 = document.getElementById('color1');
        const color2 = document.getElementById('color2');
        const color3 = document.getElementById('color3');
        const color4 = document.getElementById('color4');
        
        if (color1) color1.value = state.originalColors.primary || '#667eea';
        if (color2) color2.value = state.originalColors.secondary || '#764ba2';
        if (color3) color3.value = state.originalColors.accent || '#48bb78';
        if (color4) color4.value = state.originalColors.background || '#ffffff';
        
        state.setPendingFaviconFile(null);
        const faviconUpload = document.getElementById('faviconUpload');
        const faviconPreview = document.getElementById('faviconPreview');
        if (faviconUpload) faviconUpload.value = '';
        if (faviconPreview) faviconPreview.style.display = 'none';
        
        showStatus('Theme changes reverted', 'success');
      }
    }
  );
}

export async function handleFaviconPreview(event) {
  const file = event.target.files[0];
  if (!file) {
    state.setPendingFaviconFile(null);
    return;
  }
  
  if (!file.type.match('image/png')) {
    showStatus('Please upload a PNG file', 'error');
    setPendingFaviconFile(null);
    return;
  }
  
  const img = new Image();
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    img.onload = async () => {
      if (img.width > 512 || img.height > 512) {
        showStatus('Image must be 512x512 or smaller', 'error');
        state.setPendingFaviconFile(null);
        return;
      }
      
      state.setPendingFaviconFile(file);
      
      document.getElementById('faviconFileName').textContent = file.name;
      document.getElementById('faviconPreviewImg').src = e.target.result;
      document.getElementById('faviconPreview').style.display = 'block';
    }; 
    img.src = e.target.result;
  };
  
  reader.readAsDataURL(file);
}

export async function uploadFavicon() {
  if (!state.pendingFaviconFile) return true;
  
  const formData = new FormData();
  formData.append('favicon', state.pendingFaviconFile);
  
  try {
    await api.uploadFavicon(formData);

    const currentFavicon = document.getElementById('currentFavicon');
    const noFaviconWarning = document.getElementById('noFaviconWarning');
    if (currentFavicon) {
      currentFavicon.src = '/favicon/favicon-original.png?' + new Date().getTime();
      currentFavicon.style.display = 'block';
    }
    if (noFaviconWarning) {
      noFaviconWarning.style.display = 'none';
    }
    
    state.setPendingFaviconFile(null);
    document.getElementById('faviconFileName').textContent = '';
    document.getElementById('faviconPreview').style.display = 'none';
    document.getElementById('faviconUpload').value = '';
    
    return true;
  } catch (error) {
    console.error('Favicon upload failed:', error);
    throw error;
  }
} 

export async function saveTheme() {
  try {
    const colorData = {
      primary: state.colors.primary,
      secondary: state.colors.secondary,
      accent: state.colors.accent,
      background: state.colors.background,
      inverse: getInverseColor(state.colors.accent)
    };
    
    await api.saveColors(colorData);
    
    state.setColors(colorData);
    state.setOriginalColors(JSON.parse(JSON.stringify(colorData)));
    
    if (state.pendingFaviconFile) {
      await uploadFavicon();
      showStatus('Theme and favicon saved successfully!', 'success');
    } else {
      showStatus('Theme colors saved successfully!', 'success');
    }
  } catch (error) {
    console.error('Failed to save theme:', error);
    showStatus('Failed to save theme: ' + error.message, 'error');
  } 
}

export function renderThemeEditor() {
  const actions = document.getElementById('editorActions');
  const panel = document.getElementById('editorPanel');
  panel.scrollTop = 0;

  actions.classList.remove('hidden');
  panel.classList.add('scrollable');

  panel.innerHTML = `
    <div class="section">
      <div class="section-title"><span class="material-icons">palette</span> Theme Customization</div>
      <div class="hint hint-section">Customize colors and favicon for the configurator interface.</div>
      <div class="grid-two-column">
        <div>
          <div class="subsection-heading"><strong><span class="material-icons">brush</span> Colors</strong></div>
          <div class="form-group">
            <label for="color1">Primary Color</label>
            <input type="color" id="color1" value="${state.colors.primary || '#667eea'}">
            <div class="hint">Used for titles, buttons, and highlights</div>
          </div>
          <div class="form-group">
            <label for="color2">Secondary Color</label>
            <input type="color" id="color2" value="${state.colors.secondary || '#764ba2'}">
            <div class="hint">Used for active selections and gradients</div>
          </div>
          <div class="form-group">
            <label for="color3">Accent Color</label>
            <input type="color" id="color3" value="${state.colors.accent || '#48bb78'}">
            <div class="hint">Used for save buttons and success states</div>
          </div>
          <div class="form-group">
            <label for="color4">Background Color</label>
            <input type="color" id="color4" value="${state.colors.background || '#ffffff'}">
            <div class="hint">Base background color for panels (automatically generates grays)</div>
          </div>
        </div>
        <div>
          <div class="subsection-heading"><strong><span class="material-icons">image</span> Favicon</strong></div>
          <div class="form-group">
            <label for="faviconUpload">Upload New Favicon</label>
            <input type="file" id="faviconUpload" accept="image/png" class="file-input-hidden">
            <button class="btn-add-field no-top" onclick="clickItemByID('faviconUpload')"><span class="material-icons">upload_file</span> Choose File</button>
            <span id="faviconFileName" class="file-name-display"></span>
            <div class="hint">PNG format only, up to 512x512 pixels</div>
          </div>
          <div class="favicon-preview-container">
            <label class="favicon-label">Current Favicon</label>
            <div id="currentFaviconContainer">
              <img id="currentFavicon" src="/favicon/favicon-original.png?t=${new Date().getTime()}" class="favicon-image" onerror="this.style.display='none'; document.getElementById('noFaviconWarning').style.display='flex';">
              <div id="noFaviconWarning" class="favicon-warning">
                <div class="favicon-warning-icon"><span class="material-icons warning">warning</span></div>
                <div class="favicon-warning-title">No Favicon</div>
                <div class="favicon-warning-text">Upload a PNG</div>
              </div>
            </div>
          </div>
          <div id="faviconPreview" class="favicon-preview-container" style="display: none;">
            <label class="favicon-label">Preview</label>
            <img id="faviconPreviewImg" class="favicon-image">
          </div>
        </div>
      </div>
    </div>
  `;
  
  actions.innerHTML = `
    <div class="flex-spacer"></div>
    <button class="btn-reset" onclick="revertTheme()"><span class="material-icons">undo</span> Revert</button>
    <button class="btn-save" id="saveThemeBtn" onclick="saveTheme()"><span class="material-icons">save</span> Save Theme</button>
  `;

  document.getElementById('color1').addEventListener('input', (e) => {
    state.colors.primary = e.target.value;
    updateTheme();
  });
  document.getElementById('color2').addEventListener('input', (e) => {
    state.colors.secondary = e.target.value;
    updateTheme();
  });
  document.getElementById('color3').addEventListener('input', (e) => {
    state.colors.accent = e.target.value;
    updateTheme();
  });
  document.getElementById('color4').addEventListener('input', (e) => {
    state.colors.background = e.target.value;
    updateTheme();
  });
  
  document.getElementById('faviconUpload').addEventListener('change', handleFaviconPreview);
}
