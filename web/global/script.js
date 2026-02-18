const $notifications = document.querySelector('#notifications');
const $tooltips = document.querySelector('#tooltips');
const isMobile = navigator && navigator.userAgentData && navigator.userAgentData.mobile;
const csstrans = 300;
const tipdelay = 1000;
const debdelay = 100;
const bigdelay = 5000;

const globalColors = {
  _data: null,
  _subscribers: [],
  
  get data() {
    return this._data;
  },
  
  set data(value) {
    this._data = value;
    this._notify();
  },
  
  subscribe(callback) {
    this._subscribers.push(callback);
    if (this._data) {
      callback(this._data);
    }
    return () => {
      this._subscribers = this._subscribers.filter(cb => cb !== callback);
    };
  },
  
  _notify() {
    this._subscribers.forEach(callback => callback(this._data));
  }
};

async function getServiceData(name = 'www') {
  const domain = window.location.hostname.split('.').slice(-2).join('.');
  try {
    const response = await fetch(`//api.${domain}/service/${name}`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching JSON:', error);
  }
}

async function getColors() {
  const domain = window.location.hostname.split('.').slice(-2).join('.');
  try {
    const response = await fetch(`//api.${domain}/colors`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return await response.json();
  } catch (error) {
    console.error('Cannot fetch colors:', error);
    return {
      "primary": "#667eea",
      "secondary": "#764ba2",
      "accent": "#48bb78",
      "background": "#ffffff",
      "inverse": "#b84878"
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

async function redirectNext() {
  try {
    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get('next') || '/';

    const r = await fetch('/', { method: 'GET', credentials: 'same-origin' });
    if (r.ok) {
      window.location.href = nextParam;
      return;
    }
  } catch (e) {
    // do nothing
  }
};

const initLogin = async () => {
  const $submit = document.getElementById('submit');
  const $message = document.getElementById('message');
  if ($submit && $message) {
    await redirectNext();
    $submit.addEventListener('click', async (event) => {
      event.preventDefault();
      $message.textContent = '';
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      if (!username || !password) {
        $message.textContent = 'Please enter username and password';
        $message.className = 'msg error';
        return;
      }
      $submit.disabled = true;
      try {
        const params = new URLSearchParams(window.location.search);
        const nextParam = params.get('next') || '/';

        const res = await fetch('/login' + (nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'same-origin'
        });
        if (res.ok) {
          $message.textContent = 'Signed in — redirecting...';
          $message.className = 'success';
          window.location.href = nextParam;
          return;
        }
        if (res.status === 401) {
          $message.textContent = 'Invalid username or password';
          $message.className = 'error';
        } else {
          const text = await res.text();
          $message.textContent = text || 'Login failed';
          $message.className = 'error';
        }
      } catch (e) {
        $message.textContent = 'Network error';
        $message.className = 'error';
      } finally {
        $submit.disabled = false;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $submit.click();
    });
  }  
}

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
  if (!hex) return { r: 0, g: 0, b: 0 };
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map(ch => ch + ch).join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
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
  
  if (!colors) return;

  // Update subscribable globalColors
  globalColors.data = colors;
  
  // Calculate text color based on background
  const textColor = getTextColor(colors.background);

  // Get RGB values for gradients
  const primaryRgb = hexToRgb(colors.primary);
  const bgRgb = hexToRgb(colors.background);
  const textRgb = hexToRgb(textColor);

  // Update CSS variables on :root so styles react automatically
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-background', colors.background);
  root.style.setProperty('--color-bg-rgb', `${bgRgb.r},${bgRgb.g},${bgRgb.b}`);
  root.style.setProperty('--color-inverse', colors.inverse || '');
  root.style.setProperty('--color-text', textColor);
  root.style.setProperty('--color-text-rgb', `${textRgb.r},${textRgb.g},${textRgb.b}`);
  root.style.setProperty('--color-focus-border', `rgba(${primaryRgb.r},${primaryRgb.g},${primaryRgb.b},0.6)`);
  root.style.setProperty('--radio-color-1', colors.primary);
  root.style.setProperty('--radio-color-2', colors.secondary);
  root.style.setProperty('--radio-color-3', colors.accent);
  root.style.setProperty('--radio-color-4', colors.secondary);
  root.style.setProperty('--radio-color-5', colors.primary);

  // Muted color based on text luminance for inputs/secondary elements
  const muted = getLuminance(textColor) > 0.5 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)';
  root.style.setProperty('--color-muted', muted);

  // Notification text should contrast with primary color
  const notificationText = getTextColor(colors.primary);
  root.style.setProperty('--color-notification-text', notificationText);

  // Text contrast color for vibrant backgrounds
  const textOnPrimary = getTextColor(colors.primary);
  const textOnPrimaryRgb = hexToRgb(textOnPrimary);
  root.style.setProperty('--color-text-alternate', textOnPrimary);
  root.style.setProperty('--color-text-alternate-rgb', `${textOnPrimaryRgb.r},${textOnPrimaryRgb.g},${textOnPrimaryRgb.b}`);

  // Compute inverted vignette color based on background luminance
  const bgLuminance = getLuminance(colors.background);
  const invRgb = bgLuminance > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  root.style.setProperty('--color-bg-vignette', `rgb(${invRgb.r},${invRgb.g},${invRgb.b})`);
  root.style.setProperty('--color-bg-vignette-rgb', `${invRgb.r},${invRgb.g},${invRgb.b}`);
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
  await initLogin();
  document.documentElement.classList.add('ready');
}

globalInit();
