const $body = document.body;
const $player = document.querySelector('#player');
const $visualizer = document.querySelector('#visualizer');
const $fullscreen = document.querySelector('#fullscreen');
const $palette = document.querySelector('#palette');
const $lock = document.querySelector('#lock');
const $trash = document.querySelector('#trash');
const $transition = document.querySelector('#transition');
const pointers = { intro: -1, fullscreen: -1, palette: -1 };
const visdelay = 2000;
const visduration = 30000;
const wave = new Wave($player, $visualizer);

const isFullscreen = () => {
  return document.webkitIsFullScreen || document.mozFullScreen || false;
};

const randomIndex = (array, excludeIndex) => {
  let indexes = Object.keys(array);
  if (excludeIndex > -1) {
    indexes.splice(excludeIndex, 1);
  }
  return indexes[Math.floor(Math.random() * indexes.length)];
};

const requestNewColors = () => {
  const $style = document.getElementById('style');
  if ($style) $style.remove();
  pointers.palette = randomIndex(colorbank, pointers.palette);
  colors = colorbank[pointers.palette].palette;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors[3]);
  root.style.setProperty('--color-secondary', colors[1]);
  root.style.setProperty('--color-accent', colors[2]);
  for (let i = 1; i <= 5; i++) {
    root.style.setProperty(`--radio-color-${i}`, colors[i - 1]);
  }
  setupAnimations();
};

const toggleFullscreen = () => {
  $body.requestFullScreen = $body.requestFullScreen || $body.webkitRequestFullScreen || $body.mozRequestFullScreen || function() {
    return false;
  };
  document.cancelFullScreen = document.cancelFullScreen || document.webkitCancelFullScreen || document.mozCancelFullScreen || function() {
    return false;
  };
  $body.classList.add('fullscreen-change-requested');
  if (isFullscreen()) {
    document.cancelFullScreen();
  } else {
    $body.requestFullScreen();
  }
};

const handleFullscreenChange = debounce(() => {
  const $icon = $fullscreen.querySelector('.icon')
  const requested = $body.classList.contains('fullscreen-change-requested');
  const hotkey = $body.classList.contains('by-hotkey');
  const mousecount = $body.classList.contains('mousecount');
  const mouseout = $body.classList.contains('mouseout');
  if (isFullscreen()) {
    if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('landscape').catch(() => {});
    }
    $icon.textContent = 'fullscreen_exit';
    $body.classList.add('fullscreen');
    if (isMobile || hotkey && $body.classList.contains('playing')) {
      runFullscreenAnimations();
    }
    if (isMobile) {
      $body.addEventListener('touchend', fullscreenEvent);
      $body.addEventListener('touchstart', introEvent);
    }
    debounce(() => {
      $body.addEventListener('mouseleave', fullscreenEvent);
      $body.addEventListener('mouseenter', introEvent);
    })();
  } else {
    if (screen && screen.orientation && typeof screen.orientation.unlock === 'function') {
      screen.orientation.unlock();
    }
    $icon.textContent = 'fullscreen';
    $body.classList.remove('fullscreen');
    $body.removeEventListener('mouseleave', fullscreenEvent);
    $body.removeEventListener('mouseenter', introEvent);
    if (mousecount) {
      cancelMouseout();
    } else if (hotkey && mouseout || !requested && mouseout) {
      runIntroAnimations();
    }
  }
  $body.classList.remove('fullscreen-change-requested');
  $body.classList.remove('by-hotkey');
});

const handleHotkeys = (e) => {
  if (e.code === 'KeyM') {
    $player.muted = !$player.muted;
  }
  if (e.code === 'KeyD') {
    if (!lockColor) {
      trashColors();
    } else {
      notify('Colors are locked.', 'error');
    }
  }
  if (e.code === 'KeyL') {
    if (colorbank.length > 1) {
      lockColors();
    } else {
      notify('Not enough color palettes.', 'error')
    }
  }
  if (e.code === 'KeyC') {
    if (!lockColor) {
      changeColors();
    } else {
      notify('Colors are locked.', 'error');
    }
  }
  if (e.code === 'KeyV') {
    changeVisualizer();
  }
  if (e.code === 'KeyF') {
    toggleFullscreen();
    $body.classList.add('by-hotkey');
  }
  if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && document.activeElement === $fullscreen) {
    $body.classList.add('by-hotkey');
  }
};

const handleMute = () => {
  if ($player.muted) {
    if (mouseoutTimer) clearTimeout(mouseoutTimer);
    $body.classList.add('muted')
  } else {
    $body.classList.remove('muted')
  }
};

const setupIntroCubesAnimation = () => {
  const cubecount = Math.min(Math.round($visualizer.getAttribute('width')/20), 100);
  const cubeWidth = Math.round(($visualizer.getAttribute('width')/cubecount));
  const cubeheight = cubeWidth-4;
  wave.addAnimation(new wave.animations.Cubes({
    top:true,
    count:cubecount,
    cubeHeight:cubeheight,
    fillColor: {
        gradient:[colors[1], colors[2]],
    },
    frequencyBand:'highs',
    lineColor:'transparent',
    gap:2,
    radius:Math.round(cubeheight/2),
  }));
  wave.addAnimation(new wave.animations.Cubes({
    bottom:true,
    count:cubecount,
    cubeHeight:cubeheight,
    fillColor: {
        gradient:[colors[3], colors[4]],
    },
    frequencyBand:'mids',
    lineColor:'transparent',
    radius:Math.round(cubeheight/2),
  }));
};

const setupIntroWaveAnimation = () => {
  wave.addAnimation(new wave.animations.Wave({
    count:60,
    frequencyBand:'highs',
    top:true,
    lineColor: {
      gradient:[colors[1], colors[2]],
    },
    lineWidth:8,
    fillColor:'transparent',
    rounded:false,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:60,
    frequencyBand:'mids',
    bottom:true,
    lineColor: {
      gradient:[colors[3], colors[4]],
    },
    lineWidth:8,
    fillColor:'transparent',
    rounded:false,
  }));
};

const setupCubesAnimation = () => {
  const cubecount = Math.min(Math.round($visualizer.getAttribute('width')/20), 100);
  const cubeWidth = Math.round(($visualizer.getAttribute('width')/cubecount));
  const cubeheight = cubeWidth-4;
  wave.addAnimation(new wave.animations.Cubes({
    center:true,
    count:cubecount,
    cubeHeight:cubeheight,
    fillColor: {
        gradient:[colors[1], colors[2], colors[3], colors[4]],
    },
    frequencyBand:'mids',
    lineColor:'transparent',
    gap:2,
    mirroredY:true,
    radius:Math.round(cubeheight/2),
  }));
};

const setupTurntableAnimation = () => {
  const maxDiameter = Math.min($visualizer.getAttribute('width'), $visualizer.getAttribute('height'));
  const globDiameter = Math.round(maxDiameter*0.5);
  const midsDiameter = Math.round(maxDiameter*0.4);
  const lowsDiameter = Math.round(maxDiameter*0.2);
  wave.addAnimation(new wave.animations.Glob({
    count:120,
    diameter:globDiameter+128,
    frequencyBand:'base',
    lineColor:colors[3],
    lineWidth:64,
  }));
  wave.addAnimation(new wave.animations.Glob({
    count:120,
    diameter:globDiameter+64,
    frequencyBand:'base',
    lineColor:colors[2],
    lineWidth:64,
  }));
  wave.addAnimation(new wave.animations.Glob({
    count:120,
    diameter:globDiameter,
    frequencyBand:'base',
    lineColor:colors[4],
    lineWidth:64,
  }));
  wave.addAnimation(new wave.animations.Turntable({
    count:20,
    cubeHeight:16,
    diameter:midsDiameter,
    fillColor: {
        gradient:[colors[2], colors[1]],
    },
    frequencyBand:'mids',
    lineColor:'transparent',
  }));
  wave.addAnimation(new wave.animations.Turntable({
    count:20,
    cubeHeight:16,
    diameter:lowsDiameter,
    fillColor: {
        gradient:[colors[3], colors[4]],
    },
    frequencyBand:'lows',
    lineColor:'transparent',
  }));
};

const setupLineAnimation = () => {
  const count = 20;
  const diameter = Math.min($visualizer.getAttribute('width'), $visualizer.getAttribute('height'))*0.5;
  const largeLine = Math.round($visualizer.getAttribute('height')/count);
  const mediumLine = Math.round(largeLine*0.6);
  const smallLine = Math.round(largeLine*0.3);
  wave.addAnimation(new wave.animations.Shine({
    count:count,
    diameter: diameter,
    frequencyBand:'mids',
    lineColor: {
      gradient:[colors[2], colors[1]],
    },
    lineWidth:largeLine*2,
  }));
  wave.addAnimation(new wave.animations.Shine({
    count:count,
    diameter: diameter,
    frequencyBand:'lows',
    lineColor: {
      gradient:[colors[3], colors[4]],
    },
    lineWidth:mediumLine*2,
  }));
  wave.addAnimation(new wave.animations.Shine({
    count:count,
    diameter: diameter,
    frequencyBand:'base',
    lineColor:colors[0],
    lineWidth:smallLine*2,
  }));
  wave.addAnimation(new wave.animations.Lines({
    count:count,
    frequencyBand:'mids',
    left:true,
    right:true,
    lineColor:colors[4],
    lineWidth:largeLine,
  }));
  wave.addAnimation(new wave.animations.Lines({
    count:count,
    frequencyBand:'lows',
    left:true,
    right:true,
    lineColor:colors[3],
    lineWidth:mediumLine,
  }));
  wave.addAnimation(new wave.animations.Lines({
    count:count,
    frequencyBand:'base',
    left:true,
    right:true,
    lineColor:colors[2],
    lineWidth:smallLine,
  }));
};

const setupGlobAnimation = () => {
  const maxDiameter = Math.min($visualizer.getAttribute('width'), $visualizer.getAttribute('height'));
  wave.addAnimation(new wave.animations.Glob({
    count:30,
    diameter:maxDiameter*0.6,
    frequencyBand:'base',
    fillColor:colors[3],
    lineColor:'transparent',
  }));
  wave.addAnimation(new wave.animations.Glob({
    count:30,
    diameter:maxDiameter*0.4,
    frequencyBand:'mids',
    fillColor:colors[2],
    lineColor:'transparent',
  }));
  wave.addAnimation(new wave.animations.Glob({
    count:30,
    diameter:maxDiameter*0.2,
    frequencyBand:'lows',
    fillColor:colors[4],
    lineColor:'transparent',
  }));
};

const setupWaveAnimation = () => {
  const count = 30;
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'mids',
    center:true,
    fillColor:colors[4],
    lineColor:'transparent',
    rounded:false,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'base',
    center:true,
    fillColor:colors[4],
    lineColor:'transparent',
    rounded:false,
    mirroredY:true,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'base',
    center:true,
    fillColor:colors[3],
    lineColor:'transparent',
    rounded:false,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'mids',
    center:true,
    fillColor:colors[3],
    lineColor:'transparent',
    rounded:false,
    mirroredY:true,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'lows',
    center:true,
    fillColor:colors[2],
    lineColor:'transparent',
    rounded:false,
  }));
  wave.addAnimation(new wave.animations.Wave({
    count:count,
    frequencyBand:'mids',
    center:true,
    fillColor:colors[2],
    lineColor:'transparent',
    rounded:false,
    mirroredY:true,
  }));
};

const setupAnimations = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (isMobile) {
    const dpi = window.devicePixelRatio;
    $visualizer.setAttribute('width', width*dpi);
    $visualizer.setAttribute('height', height*dpi);
  } else {
    $visualizer.setAttribute('width', width);
    $visualizer.setAttribute('height', height);
  }
  wave.clearAnimations();
  if (forceAnimation) {
    forceAnimation();
  } else if ( currentAnimation ) {
    currentAnimation.setup();
  }
};

const transitionVisualizer = (changeColor) => {
  if (transitionTimer) clearTimeout(transitionTimer);
  $body.classList.remove('ready');
  transitionTimer = setTimeout(() => {
    if ( !currentAnimation ) {
      pointers[currentPointer] = 0;
    } else {
      pointers[currentPointer] = randomIndex(currentSource, pointers[currentPointer])
    }
    currentAnimation = currentSource[pointers[currentPointer]];
    if (currentAnimation.rotate) {
      $body.classList.add('rotate');
    } else {
      $body.classList.remove('rotate');
    }
    if (currentAnimation.zoom) {
      $body.classList.add('zoom');
    } else {
      $body.classList.remove('zoom');
    }
    $body.classList.add('ready');
    if (changeColor && !lockColor) {
      requestNewColors();
    } else {
      setupAnimations();
    }
  }, visdelay)
};

const runFullscreenAnimations = () => {
  if (mouseoutTimer) clearTimeout(mouseoutTimer);
  if ($body.classList.contains('playing') && !$body.classList.contains('muted') && !$body.classList.contains('deadair')) {
    resetNextInterval();
    $body.classList.add('mousecount');
    mouseoutTimer = setTimeout(() => {
      $body.classList.remove('mousecount');
      $body.classList.add('mouseout');
      currentSource = fullscreenAnimations;
      currentPointer = 'fullscreen';
      transitionVisualizer(true);
    }, bigdelay);
  }
};

const runIntroAnimations = () => {
  if (mouseoutTimer) clearTimeout(mouseoutTimer);
  resetNextInterval();
  $body.classList.remove('mouseout');
  currentSource = introAnimations;
  currentPointer = 'intro';
  transitionVisualizer(false);
};

const cancelMouseout = () => {
  if (mouseoutTimer) clearTimeout(mouseoutTimer);
  $body.classList.remove('mousecount');
};

const resetNextInterval = () => {
  if (nextInterval) clearInterval(nextInterval);
  nextInterval = setInterval(() => {
    transitionVisualizer(true);
  }, visduration);
};

const fullscreenEvent = debounce(() => {
  if ($body.classList.contains('fullscreen') && !$body.classList.contains('mousecount') && !$body.classList.contains('mouseout')) {
    runFullscreenAnimations();
  }
});

const introEvent = debounce(() => {
  if ($body.classList.contains('mousecount')) {
    cancelMouseout();
  } else if ($body.classList.contains('fullscreen') && $body.classList.contains('mouseout')) {
    runIntroAnimations();
  }
});

const changeColors = () => {
  requestNewColors();
  notify('Color palette changed.');
};

const lockColors = () => {
  const $icon = $lock.querySelector('.icon');
  lockColor = !lockColor;
  $palette.disabled = lockColor;
  $trash.disabled = lockColor;
  title = $lock.getAttribute('title');
  data_title = $lock.getAttribute('data-title');
  if (lockColor) {
    $icon.classList.add('filled');
    $icon.textContent = 'lock';
    if (title) $lock.setAttribute('title', 'Unlock color palette (L)');
    if (data_title) $lock.setAttribute('data-title', 'Unlock color palette (L)');
    notify('Color palette locked.', 'info');
  } else {
    $icon.classList.remove('filled');
    $icon.textContent = 'lock_open';
    if (title) $lock.setAttribute('title', 'Lock color palette (L)');
    if (data_title) $lock.setAttribute('data-title', 'Lock color palette (L)');
    notify('Color palette unlocked.', 'info');
  }
  initTooltips();
};

const trashColors = () => {
  if ( colorbank.length == 2 ) {
    $trash.disabled = true;
    $palette.disabled = true;
    $lock.disabled = true;
    lockColors();
  }
  if (pointers.palette > -1) {
    colorbank.splice(pointers.palette, 1);
    pointers.palette = -1;
  }
  requestNewColors();
  notify('Color palette removed.', 'info')
};

const changeVisualizer = () => {
  transitionVisualizer(true);
  notify('Visualizer changed.', 'info');
};

const colorReview = () => {
  $color1 = document.querySelector('.color-review.color-1');
  $color2 = document.querySelector('.color-review.color-2');
  $color3 = document.querySelector('.color-review.color-3');
  $color4 = document.querySelector('.color-review.color-4');
  $color5 = document.querySelector('.color-review.color-5');
  $color1.classList.remove('color-1');
  $color1.classList.add('color-5');
  $color2.classList.remove('color-2');
  $color2.classList.add('color-1');
  $color3.classList.remove('color-3');
  $color3.classList.add('color-2');
  $color4.classList.remove('color-4');
  $color4.classList.add('color-3');
  $color5.classList.remove('color-5');
  $color5.classList.add('color-4');
};

const handleStreamAnalysis = () => {
  if (isFullscreen() && $body.classList.contains('playing')) {
    const deadair = $body.classList.contains('deadair') || $body.classList.contains('deadcount');
    const mousecount = $body.classList.contains('mousecount');
    const mouseout = $body.classList.contains('mouseout');
    const sum = globalFrequencyData.reduce((acc, val) => {
      return acc + val
    }, 0);
    if (sum < 100 && !deadair) {
      $body.classList.add('deadcount');
      if (deadairTimer) clearTimeout(deadairTimer);
      deadairTimer = setTimeout(() => {
        $body.classList.add('deadair');
        $body.classList.remove('deadcount');
        if (mousecount) {
          cancelMouseout();
        } else if (mouseout) {
          runIntroAnimations();
        }
      }, visdelay);
    } else if (sum >= 100 && deadair) {
      $body.classList.remove('deadair');
      $body.classList.remove('deadcount');
      if (deadairTimer) clearTimeout(deadairTimer);
      if (!mousecount && !mouseout) {
        runFullscreenAnimations();
      }
    }
  }
  debounce(window.requestAnimationFrame(handleStreamAnalysis));
};

const handleStreamStart = () => {
  $body.classList.add('playing');
  if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
    navigator.wakeLock.request().then((wakeLock) => {
      screenBlocker = wakeLock;
    });
  }
};

const handleStreamEnd = () => {
  $body.classList.remove('playing');
  screenBlocker.release().then(() => {
    screenBlocker = null;
  });
};

const init = async () => {
  if (reviewInterval) clearInterval(reviewInterval);
  reviewInterval = setInterval(colorReview, csstrans);
  window.addEventListener('resize', debounce(setupAnimations));
  window.requestAnimationFrame(handleStreamAnalysis);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('keyup', handleHotkeys);
  $fullscreen.addEventListener('click', toggleFullscreen);
  $fullscreen.removeAttribute('disabled');
  $palette.addEventListener('click', changeColors);
  $palette.removeAttribute('disabled');
  $lock.addEventListener('click', lockColors);
  $lock.removeAttribute('disabled');
  $trash.addEventListener('click', trashColors);
  $trash.removeAttribute('disabled');
  $transition.addEventListener('click', changeVisualizer);
  $transition.removeAttribute('disabled');
  $player.addEventListener('volumechange', handleMute);
  $player.addEventListener('play', handleStreamStart);
  $player.addEventListener('ended', handleStreamEnd);
  $player.addEventListener('pause', handleStreamEnd);
  
  setupAnimations();
  runIntroAnimations();
};

const requestPalettes = async (colors) => {
  const json_data = {"num_colors":5,"temperature":"1.3","num_results":1,"adjacency":[0,"15","30","45","60","15",0,"15","30","45","30","15",0,"15","30","45","30","15",0,"15","60","45","30","15",0],"palette":["-","-","-","-","-"],"mode":"transformer","palette_multi":[[colors.primary,"-","-","-",colors.secondary],[colors.primary,"-","-","-",colors.inverse],[colors.secondary,"-","-","-",colors.inverse],[colors.primary,"-","-","-",colors.accent],[colors.secondary,"-","-","-",colors.accent],[colors.accent,"-","-","-",colors.inverse]],"preset":"hyper-color"};
  const xhr = new XMLHttpRequest();
  xhr.open('POST', 'https://api.huemint.com/color', true);
  xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
  xhr.onload = () => {
    colorbank = [{palette: [colors.primary, colors.secondary, colors.accent, colors.secondary, colors.primary], score: 0}];
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.response);
      if (data && data.results && data.results.length > 0) {
        data.results.forEach((palette) => {
          colorbank.push(palette);
        });
      }
    }
  };
  xhr.onerror = () => {
    // Do nothing.
  }
  xhr.send(JSON.stringify(json_data));
};

const fullscreenAnimations = [
  {zoom: false, rotate: false, setup: setupCubesAnimation},
  {zoom: true, rotate: false, setup: setupWaveAnimation},
  {zoom: false, rotate: true, setup: setupTurntableAnimation},
  {zoom: false, rotate: true, setup: setupGlobAnimation},
  {zoom: false, rotate: false, setup: setupLineAnimation},
];
const introAnimations = [
  {zoom: false, rotate: false, setup: setupIntroCubesAnimation},
  {zoom: true, rotate: false, setup: setupIntroWaveAnimation},
];

let screenBlocker = null;
let currentSource;
let currentPointer;
let currentAnimation;
let mouseoutTimer;
let deadairTimer;
let transitionTimer;
let nextInterval;
let reviewInterval;
let forceAnimation;
let lockColor = false;
let colors = [];
let themeColors = null;
let colorbank = [{palette: [colors.primary, colors.secondary, colors.accent, colors.secondary, colors.primary], score: 0}];

if ( globalColors ) {
  globalColors.subscribe((colors) => {
    requestPalettes(colors);
  });
}
init();
