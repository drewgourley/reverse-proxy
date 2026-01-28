const $notifications = document.querySelector('#notifications');
const $tooltips = document.querySelector('#tooltips');
const isMobile = navigator && navigator.userAgentData && navigator.userAgentData.mobile;
const csstrans = 300;
const tipdelay = 1000;
const debdelay = 100;
const bigdelay = 5000;

async function getServiceData(name = 'www') {
  try {
    const response = await fetch(`/global/services.json`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return data.find(service => service.name === name);
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

const uuidv4 = () => {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
};

const debounce = (func, time = debdelay) => {
  let timer;
  return (event) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(func, time, event);
  };
};

const initTooltips = () => {
  const $tippables = document.querySelectorAll('[title],[data-title]');
  $tippables.forEach(($tippable) => {
    let uuid = $tippable.getAttribute('data-uuid');
    let $tooltip;
    let $text;
    if (uuid) {
      $tooltip = document.querySelector(`.tooltip[data-uuid="${uuid}"]`);
      $text = $tooltip.querySelector('p');
    } else {
      uuid = uuidv4();
      $tooltip = document.createElement('div');
      $text = document.createElement('p');
      $tooltip.setAttribute('data-uuid', uuid)
      $tooltip.classList.add('tooltip');
      $tooltip.appendChild($text);
      $tooltips.appendChild($tooltip);
      $tippable.setAttribute('data-uuid', uuid);
      $tippable.addEventListener('mousemove', (event) => {
        tooltipGlobalEvent = event;
      });
      $tippable.addEventListener('mouseenter', () => {
        if (tooltipTimer) clearTimeout(tooltipTimer);
        $tippable.setAttribute('data-title', $tippable.getAttribute('title'));
        $tippable.removeAttribute('title');
        tooltipTimer = setTimeout(() => {
          $tooltip.classList.add('active');
          $tippable.addEventListener('mousemove', handleTooltipPosition);
          handleTooltipPosition();
        }, tipdelay);
      });
      $tippable.addEventListener('mouseleave', () => {
        if (tooltipTimer) clearTimeout(tooltipTimer);
        $tippable.removeEventListener('mousemove', handleTooltipPosition);
        $tippable.setAttribute('title', $tippable.getAttribute('data-title'));
        $tippable.removeAttribute('data-title');
        $tooltip.classList.remove('active');
        setTimeout(() => {
          $tooltip.removeAttribute('style');
        }, csstrans);
      });
    }
    $text.textContent = $tippable.getAttribute('title') || $tippable.getAttribute('data-title');
  });
};

const handleTooltipPosition = (event) => {
  if (!event) event = tooltipGlobalEvent;
  const tooltip = $tooltips.querySelector('.tooltip.active');
  const x = event.clientX;
  const y = event.clientY;
  tooltip.style.bottom = 'auto';
  if (y > window.innerHeight/2) {
    tooltip.style.top = y-tooltip.clientHeight+'px';
  } else {
    tooltip.style.top = y+'px';
  }
  if (x > window.innerWidth/2) {
    tooltip.style.left = 'auto';
    tooltip.style.right = (x-window.innerWidth)*-1+(tooltip.clientHeight/2)+'px';
  } else {
    tooltip.style.right = 'auto';
    tooltip.style.left = x+(tooltip.clientHeight/2)+'px';
  }
};

const notify = (text, status) => {
  const $previous = document.querySelectorAll('.notification');
  const $notification = document.createElement('div');
  const $text = document.createElement('p');
  $previous.forEach(($old) => {
    $old.classList.add('override');
  });
  $notification.classList.add('notification');
  if (status) $notification.classList.add(status);
  $text.textContent = text;
  $notification.appendChild($text);
  $notifications.appendChild($notification);
  setTimeout(() => {
    $notification.classList.add('active');
  }, debdelay);
  setTimeout(() => {
    $notification.classList.remove('active');
    setTimeout(() => {
      $notification.remove();
    }, csstrans)
  }, bigdelay);
};

let tooltipTimer;
let tooltipGlobalEvent;

if ($tooltips && !isMobile) {
  initTooltips();
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

async function applyColors() {
  const colors = await getColors();

  // Calculate text color based on background
  const textColor = getTextColor(colors.background);
  
  // Apply background color to both html and body
  document.documentElement.style.background = colors.background;
  document.body.style.background = colors.background;
  document.body.style.color = textColor;
  
  // Get RGB values for contrasting gradient
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
      .stripes {
        background: ${colors.primary};
      }
      .stripes:before {
        background: ${colors.accent};
      }
      .stripes:after {
        background: ${colors.secondary};
      }
      a, a.link, a.link .name {
        color: ${colors.primary} !important;
      }
      a:hover, a.link:hover, a.link:hover .name {
        color: ${colors.secondary} !important;
      }
      .pip:after {
        background: linear-gradient(180deg, rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0) 0%, rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.4) 100%) !important;
      }
      #palette .icon,
      #trash .icon,
      #lock .icon,
      #transition .icon {
        color: ${textColor};
      }
    `;
  }
}

async function setupTitles() {
  // get current subdomain if window.location has one, else default to 'www' 
  const parts = window.location.hostname.split('.');
  const domain = parts.length > 1 ? parts.slice(-2).join('.') : window.location.hostname;
  const subdomain = parts.length > 2 ? parts.slice(0, -2).join('.') : 'www';
  const serviceData = await getServiceData(subdomain);
  const $domain = document.getElementById('domain');

  let displayText = serviceData && serviceData.nicename ? serviceData.nicename : domain;
  if (displayText.toLowerCase().endsWith('radio')) {
    displayText = displayText.slice(0, -5).trim() || 'Radio';
  }

  if ($domain) {
    $domain.textContent = displayText;
  };
  
  if (serviceData && serviceData.nicename) {
    document.title = serviceData.nicename;
  }
}

async function globalInit() {
  await setupTitles();
  await applyColors();
  document.documentElement.classList.add('ready');
}

globalInit();
