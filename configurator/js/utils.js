// Error handling utilities
export function parseErrorMessage(error) {
  try {
    const errorObj = JSON.parse(error.message);
    
    if (errorObj.details && Array.isArray(errorObj.details) && errorObj.details.length > 0) {
      const detail = errorObj.details[0];
      
      if (detail.keyword === 'required' && detail.params?.missingProperty) {
        return `Missing required field: ${detail.params.missingProperty}`;
      }
      
      if (detail.keyword === 'minLength' && detail.params?.limit === 1) {
        const fieldName = detail.instancePath ? detail.instancePath.split('/').pop() : '';
        return fieldName ? `${fieldName} must not be empty` : 'Field must not be empty';
      }
      
      if (detail.keyword === 'pattern' && detail.instancePath) {
        const fieldName = detail.instancePath.split('/').pop();
        return `Invalid format for field: ${fieldName}`;
      }
      
      if (detail.keyword === 'type' && detail.instancePath) {
        const fieldName = detail.instancePath.split('/').pop();
        return `Invalid type for field: ${fieldName}`;
      }
      
      if (detail.message) {
        const fieldName = detail.instancePath ? detail.instancePath.split('/').pop() : '';
        return fieldName ? `${fieldName}: ${detail.message}` : detail.message;
      }
    }
    
    if (errorObj.error) {
      return errorObj.error;
    }
    
    return 'Validation error occurred';
  } catch (e) {
    return error.message || 'An error occurred';
  }
}

// Color utilities
export function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function getInverseColor(hex) {
  const hsl = hexToHSL(hex);
  hsl.h = (hsl.h + 180) % 360;
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

export function darkenColor(hex, percent) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

export function lightenFromBackground(hex, lightenAmount) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.min(100, hsl.l + lightenAmount);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

export function darkenFromBackground(hex, percent) {
  const hsl = hexToHSL(hex);
  hsl.l = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

export function clampBackgroundColor(hex) {
  const hsl = hexToHSL(hex);
  const minLightness = 9.4;
  if (hsl.l < minLightness) {
    return hslToHex(hsl.h, hsl.s, minLightness);
  }
  return hex;
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// File utilities
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext)) {
    return '<span class="material-icons image">image</span>';
  }
  // Videos
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v'].includes(ext)) {
    return '<span class="material-icons video">video_file</span>';
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return '<span class="material-icons audio">audio_file</span>';
  }
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
    return '<span class="material-icons archive">folder_zip</span>';
  }
  // PDFs
  if (ext === 'pdf') {
    return '<span class="material-icons pdf">picture_as_pdf</span>';
  }
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(ext)) {
    return '<span class="material-icons code">code</span>';
  }
  // Web files
  if (ext === 'html' || ext === 'htm') {
    return '<span class="material-icons html">web</span>';
  }
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') {
    return '<span class="material-icons css">style</span>';
  }
  // Data files
  if (['json', 'xml', 'yaml', 'yml', 'toml'].includes(ext)) {
    return '<span class="material-icons data">data_object</span>';
  }
  // Text/Documents
  if (['txt', 'md', 'markdown', 'log'].includes(ext)) {
    return '<span class="material-icons text">article</span>';
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return '<span class="material-icons doc">description</span>';
  }
  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return '<span class="material-icons table">table_chart</span>';
  }
  // Fonts
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) {
    return '<span class="material-icons font">font_download</span>';
  }
  // Executables/Binary
  if (['exe', 'dmg', 'app', 'deb', 'rpm', 'apk'].includes(ext)) {
    return '<span class="material-icons binary">settings_applications</span>';
  }
  // Game files
  if (['wad', 'jsdos', 'rom', 'iso'].includes(ext)) {
    return '<span class="material-icons game">videogame_asset</span>';
  }
  // Web manifests and configs
  if (['webmanifest', 'manifest'].includes(ext)) {
    return '<span class="material-icons manifest">web_asset</span>';
  }
  
  // Default file icon
  return '<span class="material-icons file">insert_drive_file</span>';
}

export function generateAutoRename(filename, existingFiles) {
  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
  const baseName = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
  
  let counter = 1;
  let newName = `${baseName}_${counter}${ext}`;
  
  while (existingFiles.some(f => f.name === newName)) {
    counter++;
    newName = `${baseName}_${counter}${ext}`;
  }
  
  return newName;
}

export function cleanConfig(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== null && item !== undefined)
              .map(item => cleanConfig(item));
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'object') {
          const cleanedValue = cleanConfig(value);
          if (Array.isArray(cleanedValue)) {
            if (cleanedValue.length > 0) {
              cleaned[key] = cleanedValue;
            }
          } else if (Object.keys(cleanedValue).length > 0) {
            cleaned[key] = cleanedValue;
          }
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }
  
  return obj;
}

// Nav and routing utilities
export function parseAppRoute(path) {
  // Remove leading/trailing slashes
  const clean = path.replace(/^\/+|\/+$/g, '');
  const parts = clean.split('/');
  // Map to section/type/folder/path
  if (parts[0] === 'config' && parts[1]) {
    if (parts[2] === 'files') {
      // /config/:service/files(/static)?
      return {
        section: `config-${parts[1]}`,
        folder: parts[3] === 'static' ? 'static' : 'public',
        path: parts.length > 4 ? parts.slice(4).join('/') : '',
      };
    }
    // /config/:service
    return { section: `config-${parts[1]}` };
  }
  if (parts[0] === 'management' && parts[1]) {
    return { section: `management-${parts[1]}` };
  }
  if (parts[0] === 'monitor' && parts[1]) {
    if (parts[1] === 'logs') {
      // /monitor/logs(/error)?
      return { section: 'monitor-logs', type: parts[2] === 'error' ? 'error' : 'out' };
    }
    if (parts[1] === 'blocklist') {
      return { section: 'monitor-blocklist' };
    }
  }
  if (parts[0] === 'config-domain') {
    return { section: 'config-domain' };
  }
  return {};
}

export function buildAppRoute({ section, type, folder, path }) {
  // Returns a path string for pushState
  if (!section) return '/';
  if (section.startsWith('config-')) {
    const service = section.replace('config-', '');
    if (folder) {
      let base = `/config/${service}/files`;
      if (folder === 'static') base += '/static';
      if (path) base += '/' + path.replace(/^\/+/, '');
      return base;
    }
    return `/config/${service}`;
  }
  if (section.startsWith('management-')) {
    return `/management/${section.replace('management-', '')}`;
  }
  if (section === 'monitor-logs') {
    return `/monitor/logs${type === 'error' ? '/error' : ''}`;
  }
  if (section === 'monitor-blocklist') {
    return '/monitor/blocklist';
  }
  if (section === 'config-domain') {
    return '/config/domain';
  }
  return '/';
}

// Misc utilities
export function getServiceIcon(serviceType) {
  switch(serviceType) {
    case 'index': return '<span class="material-icons">description</span>';
    case 'proxy': return '<span class="material-icons">swap_horiz</span>';
    case 'dirlist': return '<span class="material-icons">folder_open</span>';
    case 'spa': return '<span class="material-icons">flash_on</span>';
    default: return '<span class="material-icons">settings</span>';
  }
}

export function preventDefaultThen(callback) {
  return function(event) {
    event.preventDefault();
    callback(event);
  };
}

export function clickItemByID(id) {
  const el = document.getElementById(id);
  if (el) {
    el.click();
  }
}
