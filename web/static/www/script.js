async function getServiceData() {
  try {
    const response = await fetch(`/global/services.json`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return data.find(service => service.name === 'www');
  } catch (error) {
    console.error('Error fetching JSON:', error);
  }
}

async function getColors() {
  try {
    const response = await fetch(`/global/colors.json`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching colors:', error);
    // Return defaults if fetch fails
    return {
      primary: '#667eea',
      secondary: '#764ba2',
      accent: '#48bb78',
      background: '#ffffff',
      inverse: '#b84878'
    };
  }
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function getLuminance(hex) {
  const rgb = hexToRgb(hex);
  // Calculate relative luminance
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getTextColor(bgColor) {
  const luminance = getLuminance(bgColor);
  // If background is light, use dark text; if dark, use light text
  return luminance > 0.5 ? '#111827' : '#ffffff';
}

function applyColors(colors) {
  // Calculate text color based on background
  const textColor = getTextColor(colors.background);
  
  // Apply background color to both html and body
  document.documentElement.style.background = colors.background;
  document.body.style.background = colors.background;
  document.body.style.color = textColor;
  
  // Get RGB values for contrasting gradient
  const textRgb = hexToRgb(textColor);
  
  // Apply radial gradient to main element
  const main = document.querySelector('main');
  if (main) {
    main.style.background = `radial-gradient(circle, rgba(${textRgb.r},${textRgb.g},${textRgb.b},0) 50%, rgba(${textRgb.r},${textRgb.g},${textRgb.b},0.05) 100%)`;
  }
  
  // Apply colors to stripes
  const stripes = document.querySelector('.stripes');
  if (stripes) {
    stripes.style.background = colors.primary;
    
    // Create style element for pseudo-elements since we can't directly style them
    const styleId = 'dynamic-stripe-colors';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    
    styleElement.textContent = `
      body {
        color: ${textColor} !important;
      }
      .stripes:before {
        background: ${colors.accent} !important;
      }
      .stripes:after {
        background: ${colors.secondary} !important;
      }
    `;
  }
}

async function setupTitles() {
  const serviceData = await getServiceData();
  const parts = window.location.hostname.split('.');
  const domain = parts.length > 1 ? parts.slice(-2).join('.') : window.location.hostname;
  
  document.getElementById('domain').textContent = domain;
  
  if (serviceData && serviceData.nicename) {
    document.title = serviceData.nicename;
  }
}

async function init() {
  await setupTitles();
  const colors = await getColors();
  applyColors(colors);
  document.documentElement.classList.add('ready');
}

init();
