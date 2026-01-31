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

// const requestPalettes = (callback = (data) => {console.log(data)}) => {
//   const json_data = {"num_colors":5,"temperature":"1.3","num_results":1,"adjacency":[0,"15","30","45","60","15",0,"15","30","45","30","15",0,"15","30","45","30","15",0,"15","60","45","30","15",0],"palette":["-","-","-","-","-"],"mode":"transformer","palette_multi":[["#1ae1a8","-","-","-","#bfd111"],["#fece58","-","-","-","#e51275"],["#03dfbc","-","-","-","#8e04e1"],["#fecb97","-","-","-","#d518ba"],["#77df23","-","-","-","#dc3c04"],["#7f17ed","-","-","-","#fd7725"],["#8d15da","-","-","-","#bad223"],["#fd7709","-","-","-","#d5450f"],["#1eacc7","-","-","-","#25e197"],["#16e389","-","-","-","#178dc0"]],"preset":"hyper-color"};
//   const xhr = new XMLHttpRequest();
//   xhr.open('POST', 'https://api.huemint.com/color', true);
//   xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
//   xhr.onload = () => {
//     const data = JSON.parse(xhr.response);
//     callback(data);
//   };
//   xhr.onerror = () => {
//     callback();
//   }
//   xhr.send(JSON.stringify(json_data));
// };

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
let colorbank = [
  {
      "palette": [
          "#1ae1a8",
          "#00a766",
          "#0f8636",
          "#18622a",
          "#bfd111"
      ],
      "score": -2.6869711875915527
  },
  {
      "palette": [
          "#1ae1a8",
          "#aee8dc",
          "#06af94",
          "#048978",
          "#bfd111"
      ],
      "score": -3.366466522216797
  },
  {
      "palette": [
          "#1ae1a8",
          "#07b245",
          "#29ad59",
          "#137134",
          "#bfd111"
      ],
      "score": -3.4853856563568115
  },
  {
      "palette": [
          "#1ae1a8",
          "#29ad59",
          "#0e8b09",
          "#185f1b",
          "#bfd111"
      ],
      "score": -3.642435073852539
  },
  {
      "palette": [
          "#1ae1a8",
          "#70f290",
          "#07b245",
          "#216230",
          "#bfd111"
      ],
      "score": -4.255603790283203
  },
  {
      "palette": [
          "#1ae1a8",
          "#515360",
          "#787887",
          "#898e97",
          "#bfd111"
      ],
      "score": -4.270240783691406
  },
  {
      "palette": [
          "#1ae1a8",
          "#0fae5e",
          "#063a8d",
          "#08382e",
          "#bfd111"
      ],
      "score": -5.177116394042969
  },
  {
      "palette": [
          "#1ae1a8",
          "#18d08c",
          "#129b5e",
          "#2c6a4c",
          "#bfd111"
      ],
      "score": -5.707634449005127
  },
  {
      "palette": [
          "#1ae1a8",
          "#605845",
          "#139472",
          "#02604b",
          "#bfd111"
      ],
      "score": -5.712996006011963
  },
  {
      "palette": [
          "#1ae1a8",
          "#04e19b",
          "#0494a6",
          "#726458",
          "#bfd111"
      ],
      "score": -5.879493236541748
  },
  {
      "palette": [
          "#fece58",
          "#f7b224",
          "#f59023",
          "#eb561c",
          "#e51275"
      ],
      "score": -2.7798984050750732
  },
  {
      "palette": [
          "#fece58",
          "#f9ae17",
          "#f56e05",
          "#ee3224",
          "#e51275"
      ],
      "score": -3.242903232574463
  },
  {
      "palette": [
          "#fece58",
          "#eeac55",
          "#c46c21",
          "#a63208",
          "#e51275"
      ],
      "score": -3.9340686798095703
  },
  {
      "palette": [
          "#fece58",
          "#e9e1a7",
          "#fffdfc",
          "#dfe0ee",
          "#e51275"
      ],
      "score": -4.370492935180664
  },
  {
      "palette": [
          "#fece58",
          "#f2e8d8",
          "#a5d1c2",
          "#5da2a1",
          "#e51275"
      ],
      "score": -4.645215034484863
  },
  {
      "palette": [
          "#fece58",
          "#f5a43c",
          "#f16600",
          "#f93218",
          "#e51275"
      ],
      "score": -4.6616291999816895
  },
  {
      "palette": [
          "#fece58",
          "#9c548a",
          "#a9598f",
          "#f36b9d",
          "#e51275"
      ],
      "score": -4.827987194061279
  },
  {
      "palette": [
          "#fece58",
          "#ffa10b",
          "#ef6437",
          "#a46d58",
          "#e51275"
      ],
      "score": -5.091287136077881
  },
  {
      "palette": [
          "#fece58",
          "#fdaf1d",
          "#ddd8b7",
          "#00526b",
          "#e51275"
      ],
      "score": -5.313780784606934
  },
  {
      "palette": [
          "#fece58",
          "#faa72d",
          "#051f3f",
          "#b85273",
          "#e51275"
      ],
      "score": -5.486392021179199
  },
  {
      "palette": [
          "#03dfbc",
          "#28b799",
          "#00945c",
          "#277057",
          "#8e04e1"
      ],
      "score": -3.310105800628662
  },
  {
      "palette": [
          "#03dfbc",
          "#00cab3",
          "#24b8c9",
          "#a46ce6",
          "#8e04e1"
      ],
      "score": -4.266520977020264
  },
  {
      "palette": [
          "#03dfbc",
          "#2aab8d",
          "#fe9bfc",
          "#dda2f1",
          "#8e04e1"
      ],
      "score": -4.464075565338135
  },
  {
      "palette": [
          "#03dfbc",
          "#6eeaa3",
          "#98f541",
          "#e0c908",
          "#8e04e1"
      ],
      "score": -4.557644844055176
  },
  {
      "palette": [
          "#03dfbc",
          "#9ae5c6",
          "#f9eb21",
          "#98f347",
          "#8e04e1"
      ],
      "score": -4.820611476898193
  },
  {
      "palette": [
          "#03dfbc",
          "#00ab8d",
          "#349979",
          "#007142",
          "#8e04e1"
      ],
      "score": -5.06513786315918
  },
  {
      "palette": [
          "#03dfbc",
          "#1d9d9f",
          "#00c9cc",
          "#444b6b",
          "#8e04e1"
      ],
      "score": -5.180643558502197
  },
  {
      "palette": [
          "#03dfbc",
          "#3decac",
          "#94f449",
          "#52392a",
          "#8e04e1"
      ],
      "score": -5.187658786773682
  },
  {
      "palette": [
          "#03dfbc",
          "#ddf8fd",
          "#49e0f7",
          "#9cfdfe",
          "#8e04e1"
      ],
      "score": -5.75106954574585
  },
  {
      "palette": [
          "#03dfbc",
          "#38b78c",
          "#01985d",
          "#157614",
          "#8e04e1"
      ],
      "score": -5.927518367767334
  },
  {
      "palette": [
          "#fecb97",
          "#ff9129",
          "#f36000",
          "#d53a16",
          "#d518ba"
      ],
      "score": -3.5866379737854004
  },
  {
      "palette": [
          "#fecb97",
          "#f0a025",
          "#f06b00",
          "#e5171b",
          "#d518ba"
      ],
      "score": -3.8875937461853027
  },
  {
      "palette": [
          "#fecb97",
          "#f79525",
          "#f05a23",
          "#c43c4b",
          "#d518ba"
      ],
      "score": -3.915961265563965
  },
  {
      "palette": [
          "#fecb97",
          "#ffa6cb",
          "#e2669a",
          "#af2970",
          "#d518ba"
      ],
      "score": -4.503582954406738
  },
  {
      "palette": [
          "#fecb97",
          "#f6e5db",
          "#e7bdbf",
          "#ff59ff",
          "#d518ba"
      ],
      "score": -4.668840408325195
  },
  {
      "palette": [
          "#fecb97",
          "#ffc238",
          "#fc8800",
          "#ff7210",
          "#d518ba"
      ],
      "score": -4.847839832305908
  },
  {
      "palette": [
          "#fecb97",
          "#f7b257",
          "#f4dbcb",
          "#db94f4",
          "#d518ba"
      ],
      "score": -4.8969292640686035
  },
  {
      "palette": [
          "#fecb97",
          "#efd6c9",
          "#10579f",
          "#3593e4",
          "#d518ba"
      ],
      "score": -5.142733573913574
  },
  {
      "palette": [
          "#fecb97",
          "#975890",
          "#c9807f",
          "#dd5173",
          "#d518ba"
      ],
      "score": -5.289631366729736
  },
  {
      "palette": [
          "#fecb97",
          "#fae4e3",
          "#4b3cfc",
          "#af00a3",
          "#d518ba"
      ],
      "score": -5.647000312805176
  },
  {
      "palette": [
          "#77df23",
          "#699f0d",
          "#266a20",
          "#214b03",
          "#dc3c04"
      ],
      "score": -3.2828733921051025
  },
  {
      "palette": [
          "#77df23",
          "#6d9e08",
          "#4d750a",
          "#0c5506",
          "#dc3c04"
      ],
      "score": -3.7638089656829834
  },
  {
      "palette": [
          "#77df23",
          "#a39d05",
          "#91cd03",
          "#5e6005",
          "#dc3c04"
      ],
      "score": -4.234847545623779
  },
  {
      "palette": [
          "#77df23",
          "#92cf03",
          "#01b574",
          "#007070",
          "#dc3c04"
      ],
      "score": -4.37498140335083
  },
  {
      "palette": [
          "#77df23",
          "#8dcb31",
          "#ffc100",
          "#f46713",
          "#dc3c04"
      ],
      "score": -4.3962812423706055
  },
  {
      "palette": [
          "#77df23",
          "#5bdc88",
          "#1e926e",
          "#1b5c5e",
          "#dc3c04"
      ],
      "score": -4.42244291305542
  },
  {
      "palette": [
          "#77df23",
          "#cffa50",
          "#478c04",
          "#efedf4",
          "#dc3c04"
      ],
      "score": -4.675139427185059
  },
  {
      "palette": [
          "#77df23",
          "#71ac39",
          "#eaccb0",
          "#fb8d62",
          "#dc3c04"
      ],
      "score": -4.798901557922363
  },
  {
      "palette": [
          "#77df23",
          "#f6c321",
          "#ffe1b4",
          "#f7732e",
          "#dc3c04"
      ],
      "score": -5.064640998840332
  },
  {
      "palette": [
          "#77df23",
          "#48ea45",
          "#fba304",
          "#e66c08",
          "#dc3c04"
      ],
      "score": -5.13908052444458
  },
  {
      "palette": [
          "#7f17ed",
          "#fc9800",
          "#fc7304",
          "#e76000",
          "#fd7725"
      ],
      "score": -3.6441478729248047
  },
  {
      "palette": [
          "#7f17ed",
          "#952ae8",
          "#c850f2",
          "#00afff",
          "#fd7725"
      ],
      "score": -3.992360830307007
  },
  {
      "palette": [
          "#7f17ed",
          "#4b01b4",
          "#150167",
          "#0d042d",
          "#fd7725"
      ],
      "score": -4.2148261070251465
  },
  {
      "palette": [
          "#7f17ed",
          "#482db4",
          "#686bd8",
          "#aca9fa",
          "#fd7725"
      ],
      "score": -4.479813575744629
  },
  {
      "palette": [
          "#7f17ed",
          "#6c30f7",
          "#cc14e8",
          "#6c3b41",
          "#fd7725"
      ],
      "score": -4.56207275390625
  },
  {
      "palette": [
          "#7f17ed",
          "#fb00fb",
          "#ac37f7",
          "#f69885",
          "#fd7725"
      ],
      "score": -4.693778038024902
  },
  {
      "palette": [
          "#7f17ed",
          "#8d3ba4",
          "#ea128a",
          "#f18aaf",
          "#fd7725"
      ],
      "score": -5.156704425811768
  },
  {
      "palette": [
          "#7f17ed",
          "#a855f6",
          "#513834",
          "#cb7737",
          "#fd7725"
      ],
      "score": -5.345703125
  },
  {
      "palette": [
          "#7f17ed",
          "#8139e4",
          "#639bea",
          "#5fbef6",
          "#fd7725"
      ],
      "score": -5.399535179138184
  },
  {
      "palette": [
          "#7f17ed",
          "#002ae4",
          "#0987f8",
          "#1f99fa",
          "#fd7725"
      ],
      "score": -5.678346157073975
  },
  {
      "palette": [
          "#8d15da",
          "#6a04aa",
          "#d12ccb",
          "#f844db",
          "#bad223"
      ],
      "score": -2.8907527923583984
  },
  {
      "palette": [
          "#8d15da",
          "#780dca",
          "#24066f",
          "#00143c",
          "#bad223"
      ],
      "score": -2.9944701194763184
  },
  {
      "palette": [
          "#8d15da",
          "#6110d2",
          "#ad03c6",
          "#d300f7",
          "#bad223"
      ],
      "score": -3.2822816371917725
  },
  {
      "palette": [
          "#8d15da",
          "#711bd1",
          "#fd116d",
          "#fa5062",
          "#bad223"
      ],
      "score": -3.456385612487793
  },
  {
      "palette": [
          "#8d15da",
          "#5f02d5",
          "#3b066d",
          "#051c28",
          "#bad223"
      ],
      "score": -3.587259292602539
  },
  {
      "palette": [
          "#8d15da",
          "#5e03b0",
          "#1a0b41",
          "#bb4dea",
          "#bad223"
      ],
      "score": -3.6060287952423096
  },
  {
      "palette": [
          "#8d15da",
          "#a6007c",
          "#6b046f",
          "#d4631a",
          "#bad223"
      ],
      "score": -4.181088924407959
  },
  {
      "palette": [
          "#8d15da",
          "#8e0dff",
          "#f175bd",
          "#f1a5d7",
          "#bad223"
      ],
      "score": -4.479951858520508
  },
  {
      "palette": [
          "#8d15da",
          "#4c1973",
          "#642166",
          "#b9498f",
          "#bad223"
      ],
      "score": -4.875873565673828
  },
  {
      "palette": [
          "#8d15da",
          "#3e9e9c",
          "#add0ce",
          "#f9f9f9",
          "#bad223"
      ],
      "score": -5.154029846191406
  },
  {
      "palette": [
          "#fd7709",
          "#fd7a02",
          "#a75014",
          "#703209",
          "#d5450f"
      ],
      "score": -3.0402863025665283
  },
  {
      "palette": [
          "#fd7709",
          "#e66125",
          "#a43206",
          "#702616",
          "#d5450f"
      ],
      "score": -3.303323984146118
  },
  {
      "palette": [
          "#fd7709",
          "#db6f05",
          "#b74419",
          "#a40404",
          "#d5450f"
      ],
      "score": -3.6819679737091064
  },
  {
      "palette": [
          "#fd7709",
          "#dd4806",
          "#a61c07",
          "#691f07",
          "#d5450f"
      ],
      "score": -3.9894323348999023
  },
  {
      "palette": [
          "#fd7709",
          "#f09432",
          "#c91e08",
          "#96250a",
          "#d5450f"
      ],
      "score": -4.131546497344971
  },
  {
      "palette": [
          "#fd7709",
          "#fc5838",
          "#b50404",
          "#6e0c0d",
          "#d5450f"
      ],
      "score": -4.517032623291016
  },
  {
      "palette": [
          "#fd7709",
          "#fbad4d",
          "#9a5520",
          "#3c2f21",
          "#d5450f"
      ],
      "score": -4.797667980194092
  },
  {
      "palette": [
          "#fd7709",
          "#ef5922",
          "#afb267",
          "#7a8644",
          "#d5450f"
      ],
      "score": -5.370352268218994
  },
  {
      "palette": [
          "#fd7709",
          "#fb6b54",
          "#d42f06",
          "#a61c07",
          "#d5450f"
      ],
      "score": -5.8183064460754395
  },
  {
      "palette": [
          "#fd7709",
          "#cdc3da",
          "#fff9f7",
          "#76053b",
          "#d5450f"
      ],
      "score": -6.0316243171691895
  },
  {
      "palette": [
          "#1eacc7",
          "#0099bf",
          "#00777b",
          "#095052",
          "#25e197"
      ],
      "score": -2.3490092754364014
  },
  {
      "palette": [
          "#1eacc7",
          "#2aada8",
          "#0c6665",
          "#22526b",
          "#25e197"
      ],
      "score": -3.1443164348602295
  },
  {
      "palette": [
          "#1eacc7",
          "#00c6f4",
          "#1789b9",
          "#1b7091",
          "#25e197"
      ],
      "score": -3.6747853755950928
  },
  {
      "palette": [
          "#1eacc7",
          "#9af8fa",
          "#e5fafb",
          "#3ed69e",
          "#25e197"
      ],
      "score": -4.1018195152282715
  },
  {
      "palette": [
          "#1eacc7",
          "#0099ab",
          "#1e4ab9",
          "#0e465f",
          "#25e197"
      ],
      "score": -4.3118133544921875
  },
  {
      "palette": [
          "#1eacc7",
          "#12d0e5",
          "#98f6fa",
          "#ff6134",
          "#25e197"
      ],
      "score": -4.55828332901001
  },
  {
      "palette": [
          "#1eacc7",
          "#92d2ed",
          "#ebeeed",
          "#5b4eec",
          "#25e197"
      ],
      "score": -5.171307563781738
  },
  {
      "palette": [
          "#1eacc7",
          "#0fd3d2",
          "#1191a5",
          "#950bfe",
          "#25e197"
      ],
      "score": -5.473203659057617
  },
  {
      "palette": [
          "#1eacc7",
          "#1587ac",
          "#126a9d",
          "#163d63",
          "#25e197"
      ],
      "score": -5.581483364105225
  },
  {
      "palette": [
          "#1eacc7",
          "#eecb87",
          "#938e86",
          "#846f66",
          "#25e197"
      ],
      "score": -5.684009552001953
  },
  {
      "palette": [
          "#16e389",
          "#0dbcae",
          "#1192a5",
          "#086997",
          "#178dc0"
      ],
      "score": -2.6220295429229736
  },
  {
      "palette": [
          "#16e389",
          "#26a688",
          "#068b93",
          "#005469",
          "#178dc0"
      ],
      "score": -2.833385944366455
  },
  {
      "palette": [
          "#16e389",
          "#079871",
          "#007348",
          "#005033",
          "#178dc0"
      ],
      "score": -3.673499822616577
  },
  {
      "palette": [
          "#16e389",
          "#28e8d1",
          "#a3dee7",
          "#1692ad",
          "#178dc0"
      ],
      "score": -4.112473011016846
  },
  {
      "palette": [
          "#16e389",
          "#0ab79a",
          "#8bd8e8",
          "#43b7dd",
          "#178dc0"
      ],
      "score": -4.163054466247559
  },
  {
      "palette": [
          "#16e389",
          "#158e67",
          "#266a94",
          "#1f5564",
          "#178dc0"
      ],
      "score": -4.176105976104736
  },
  {
      "palette": [
          "#16e389",
          "#23b851",
          "#487c40",
          "#204749",
          "#178dc0"
      ],
      "score": -4.4071807861328125
  },
  {
      "palette": [
          "#16e389",
          "#b0d76f",
          "#3598a7",
          "#1a6768",
          "#178dc0"
      ],
      "score": -4.9993085861206055
  },
  {
      "palette": [
          "#16e389",
          "#27ba8e",
          "#009a98",
          "#295a6a",
          "#178dc0"
      ],
      "score": -5.146370887756348
  },
  {
      "palette": [
          "#16e389",
          "#6feed6",
          "#2fb6cb",
          "#068596",
          "#178dc0"
      ],
      "score": -5.334968090057373
  }
];

// requestPalettes((palettes) => {
//   if ( palettes && palettes.results && palettes.results.length ) {
//     colorbank = palettes.results;
//   }
init();
// });
