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

async function shockSystem(password) {
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

async function getServices() {
  try {
    const response = await fetch(`/checklist`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const data = await response.json();
    return { checks: data.filter(service => service.polltime && service.platform), titles: data.find(service => service.name === 'api') };
  } catch (error) {
    console.error('Error fetching JSON:', error);
  }
}

async function init() {
  const $logout = document.getElementById('logout');
  const $pips = document.querySelector('.pips');
  const $pip = document.querySelector('.pip');
  const $shockButton = document.querySelector('#shock');
  const $shockPass = document.querySelector('#shockpass');
  if ($logout) {
    $logout.addEventListener('click', async () => {
      try {
        await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
      } catch (e) {
      // do nothing
      } finally {
        window.location.href = '/login';
      }
    });
  }
  if ($pip && $pips && $shockButton && $shockPass) {
    const services = await getServices();
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
  }
};

init();
