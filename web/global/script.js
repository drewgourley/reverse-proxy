const $notifications = document.querySelector('#notifications');
const $tooltips = document.querySelector('#tooltips');
const isMobile = navigator && navigator.userAgentData && navigator.userAgentData.mobile;
const csstrans = 300;
const tipdelay = 1000;
const debdelay = 100;
const bigdelay = 5000;

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
