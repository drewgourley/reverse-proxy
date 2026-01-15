async function getData(service) {
  try {
    const response = await fetch(`${window.location.origin}/health/${service}`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Data:', error);
    return null;
  }
};

async function shockSystem (password) {
  try {
    const response = await fetch(
      `${window.location.origin}/shock`,
      {method: 'POST', headers: {'Content-Type': 'application/json; charset=UTF-8'}, body: JSON.stringify({password})}
    );
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Data:', error);
    return null;
  }
};

function parseData(service, data) {
  const $shocker = document.querySelector('#shocker');
  const $service = document.querySelector('.pip.'+service);
  const $name = $service.querySelector('.name');
  const $link = $service.querySelector('.link');
  let $onlines = [];
  if (data && data.service) {
    const $meta = $service.querySelector('.meta');
    $service.classList.remove('loading');
    if (data.healthy) {
      $service.classList.add('healthy');
      if (data.meta) {
        if ( data.meta.tag && data.meta.online != null && data.meta.max != null ) {
          $meta.textContent = data.meta.tag+': '+data.meta.online+'/'+data.meta.max;
        }
        if ( data.meta.version ) {
          $service.setAttribute('title', data.meta.version);
        }
        if ( data.meta.link ) {
          if (!$link) {
            const outerHTML = $name.outerHTML;
            const newHTML = '<a class="link" href="'+data.meta.link+'" target="_blank">'+outerHTML+'</a>';
            $name.outerHTML = newHTML;
          }
        }
      }
    } else {
      if ($link) {
        $link.replaceWith($name);
      }
      $service.setAttribute('title', '');
      $service.classList.remove('healthy');
      $meta.textContent = '';
    }
  } else {
    $service.classList.remove('healthy');
    $service.classList.add('loading');
  }
  $onlines = document.querySelectorAll('.pip.healthy.compute');
  if ($onlines.length > 0) {
    $shocker.classList.add('hide');
    setTimeout(() => {
      $shocker.classList.add('hidden');
    }, csstrans);
  } else {
    $shocker.classList.remove('hidden');
    setTimeout(() => {
      $shocker.classList.remove('hide');
    }, debdelay);
  }
  initTooltips();
}

async function init() {
  const services = await getServices();
  const $pips = document.querySelector('.pips');
  const $pip = document.querySelector('.pip');
  const $shockButton = document.querySelector('#shock');
  const $shockPass = document.querySelector('#shockpass');
  const colors = await getColors();
  $pip.remove();
  $shockButton.addEventListener('click', async (event) => {
    event.preventDefault();
    const data = await shockSystem($shockPass.value);
    if (data) notify(data.status)
  });
  services.checks.forEach(async (service) => {
    const $service = $pip.cloneNode(true);
    const $name = $service.querySelector('.name');
    $name.textContent = service.nicename || service.name;
    $service.classList.add(service.name);
    $service.classList.add(service.platform);
    $pips.appendChild($service);
    const data = await getData(service.name);
    parseData(service.name, data);
    setInterval(async () => {
      const data = await getData(service.name);
      parseData(service.name, data);
    }, service.polltime);
  });
  setupTitles(services.titles);
  applyColors(colors);
  document.documentElement.classList.add('ready');
};

async function getServices() {
  try {
    const response = await fetch(`/global/services.json`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return { checks: data.filter(service => service.polltime && service.platform), titles: data.find(service => service.name === 'api') };
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
  
  // Get RGB values for gradients
  const bgRgb = hexToRgb(colors.background);
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
      body * {
        color: ${textColor};
      }
      a.link, a.link .name {
        color: ${colors.primary} !important;
      }
      a.link:hover, a.link:hover .name {
        color: ${colors.secondary} !important;
      }
      .pip:after {
        background: linear-gradient(180deg, rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0) 0%, rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.4) 100%) !important;
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

function setupTitles(titles) {
  const serviceData = titles;
  const parts = window.location.hostname.split('.');
  const domain = parts.length > 1 ? parts.slice(-2).join('.') : window.location.hostname;
  
  document.getElementById('domain').textContent = domain;
  
  if (serviceData && serviceData.nicename) {
    document.title = serviceData.nicename;
  }
}

init();
