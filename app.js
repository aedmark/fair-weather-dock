/* ==========================================================================
   High & Dry: The Fair-Weather Dock — Harbor Simulation & Physics Engine
   ========================================================================== */

(() => {
  'use strict';

  const canvas = document.getElementById('harborCanvas');
  const frame = document.getElementById('stageFrame');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const flakesReadout = document.getElementById('flakesCountReadout');
  const pierReadout = document.getElementById('pierCountReadout');
  const realReadout = document.getElementById('realCountReadout');
  const weatherReadout = document.getElementById('weatherReadout');
  const toastEl = document.getElementById('stageToast');
  const logEntryEl = document.getElementById('harborLogEntry');

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const inviteForm = document.getElementById('inviteForm');
  const customNameInput = document.getElementById('customNameInput');
  const resetDockBtn = document.getElementById('resetDockBtn');

  const testCouchBtn = document.getElementById('testCouchBtn');
  const testRainBtn = document.getElementById('testRainBtn');
  const testQuietBtn = document.getElementById('testQuietBtn');
  const testBillBtn = document.getElementById('testBillBtn');
  const testAirportBtn = document.getElementById('testAirportBtn');

  // --------------------------------------------------------------------------
  // Procedural Web Audio Synthesizer (Zero External Audio Assets)
  // --------------------------------------------------------------------------
  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone(type, freqStart, freqEnd, duration, volume = 0.11) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playNoise(duration, filterFreq, volume = 0.1) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const length = Math.max(1, Math.floor(ac.sampleRate * duration));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.4;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    src.start(now);
  }

  const sfx = {
    pop: () => playTone('sine', 330, 660, 0.09, 0.09),
    cardboard: () => {
      playNoise(0.08, 400, 0.14);
      playTone('triangle', 155, 74, 0.1, 0.1);
    },
    helium: () => {
      playTone('sine', 440, 1580, 0.34, 0.08);
      setTimeout(() => playNoise(0.04, 1850, 0.07), 290);
    },
    glitch: () => {
      playTone('square', 680, 150, 0.08, 0.055);
      setTimeout(() => playTone('sawtooth', 940, 210, 0.08, 0.05), 70);
    },
    bolt: () => {
      playTone('triangle', 230, 820, 0.14, 0.085);
      setTimeout(() => playTone('sine', 540, 1220, 0.15, 0.065), 85);
    },
    splash: () => {
      playNoise(0.26, 920, 0.13);
      playTone('sine', 240, 92, 0.17, 0.08);
    },
    thud: () => {
      playTone('sine', 125, 38, 0.25, 0.2);
      playNoise(0.14, 230, 0.12);
    },
    paperFlutter: () => {
      playNoise(0.14, 1300, 0.09);
      setTimeout(() => playNoise(0.1, 1100, 0.07), 110);
    },
    alarmBeep: () => {
      playTone('square', 880, 880, 0.07, 0.055);
      setTimeout(() => playTone('square', 880, 880, 0.07, 0.055), 110);
    },
    cricket: () => {
      playTone('sine', 3950, 4200, 0.045, 0.03);
      setTimeout(() => playTone('sine', 3950, 4200, 0.045, 0.03), 70);
    },
    realChord: () => {
      const notes = [329.63, 415.30, 493.88, 659.25];
      notes.forEach((f, idx) => {
        setTimeout(() => playTone('triangle', f, f, 0.36, 0.065), idx * 48);
      });
    },
    clunk: () => {
      playTone('triangle', 205, 170, 0.1, 0.11);
      playTone('sine', 410, 410, 0.18, 0.05);
    },
    duckSqueak: () => {
      playTone('sine', 780, 1260, 0.09, 0.11);
      setTimeout(() => playTone('sine', 1120, 720, 0.11, 0.1), 85);
    }
  };

  // --------------------------------------------------------------------------
  // Theme Management
  // --------------------------------------------------------------------------
  let isNight = false;

  function applyTheme(night) {
    isNight = night;
    document.documentElement.setAttribute('data-theme', isNight ? 'night' : 'day');
    themeToggleBtn.textContent = isNight ? 'Harbor: Night' : 'Harbor: Day';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isNight ? '#0e1621' : '#f5efe4');
  }

  // Respect OS preference initially if dark
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme(true);
  }

  themeToggleBtn.addEventListener('click', () => {
    applyTheme(!isNight);
  });

  // --------------------------------------------------------------------------
  // Harbor Geometry & Simulation State
  // --------------------------------------------------------------------------
  let W = 900;
  let H = 440;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function dockY() { return H - 86; }
  function dockEndX() { return Math.floor(W * 0.74); }
  function waterY() { return H - 56; }

  const FAKE_TYPES = ['cardboard', 'helium', 'hologram', 'bolter', 'paper'];
  const TYPE_LABELS = {
    cardboard: 'Hype Cutout',
    helium: 'Helium Bestie',
    hologram: 'Signal Hologram',
    bolter: 'Track-Star Bolter',
    paper: 'Origami Sailor',
    real: 'Cast-Iron Real One'
  };

  const HATS = ['beanie', 'crown', 'propeller', 'visor', 'sailor', 'sprout', 'none'];
  // Warm maritime & sun-bleached carnival pigments (zero purple-on-dark)
  const FAKE_COLORS = ['#f97316', '#fb7185', '#eab308', '#38bdf8', '#f43f5e', '#fb923c', '#22d3ee'];
  const REAL_COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#d97706'];

  const DIALOGUE = {
    greetFake: [
      'RIDE OR DIE!!',
      'ALWAYS HERE 4 U!',
      'CALL ME ANYTIME!',
      'DAY ONE SQUAD!',
      '100% GOT UR BACK!',
      'WE HAVE TO HANG!!',
      'LITERAL FAMILY!!',
      'ANYTHING U NEED!'
    ],
    greetReal: [
      'hey.',
      'brought snacks.',
      'need a hand?',
      'good to see ya.',
      'saved you a seat.'
    ],
    pokeFake: {
      cardboard: ['*hollow cardboard thud*', 'watch the fold!', 'easy on the tape!'],
      helium: ['*squeak!*', 'ooh windy up here!', 'whoops my string!'],
      hologram: ['*bzzzt* 1 bar signal!', 'buffering bestie...', 'can u hear me??'],
      bolter: ['*double-knots laces*', 'gotta bounce soon!', 'wild week tbh!'],
      paper: ['is that mist??', 'strictly sunny vibes!', 'no splashes pls!']
    },
    pokeReal: [
      'still solid.',
      'not going anywhere.',
      'want half this sandwich?',
      'boots are bolted.'
    ],
    fleeCouch: [
      'ugh my sciatica!!',
      'omg phone at 1%!',
      'raincheck??',
      'my lease forbids lifting!',
      'wish i could help!!',
      'so slammed rn!!'
    ],
    fleeRain: [
      'not my season!',
      'catch u in August!',
      'my blowout!! bye!',
      'allergies acting up!',
      'too damp, dipping!'
    ],
    fleeQuiet: [
      'Seen 3w ago',
      'typing...',
      'meant to reply!!',
      'lets circle back!',
      'crazy month lol'
    ],
    fleeBill: [
      'VENMO U LATER!!',
      'left wallet in other coat!',
      'i only had sparkling water!',
      'card is Mercury retrograde!',
      'brb restroom!!'
    ],
    fleeAirport: [
      'alarm didnt go off!!',
      'just saw this at 1pm!!',
      '5am is illegal lol!',
      'spiritually driving u!!',
      'uber is builds character!'
    ],
    realCouch: [
      'got the heavy end.',
      'pivot left.',
      'lift with the knees.',
      'easy work.'
    ],
    realRain: [
      'brought a spare slicker.',
      'little rain never hurt.',
      'stay dry.',
      'nice storm.'
    ],
    realQuiet: [
      'made hot cocoa.',
      'no rush to talk.',
      'just checking in.',
      'still in your corner.'
    ],
    realBill: [
      'got my share + tip.',
      'covered the apps.',
      'math is easy.',
      'dont sweat it.'
    ],
    realAirport: [
      'trunk is open.',
      'brought two coffees.',
      '4:55 am. right on time.',
      'hop in, Terminal B?'
    ],
    realStayEdge: [
      'nah, i am staying.',
      'nice flick. boots held.',
      'bolted to the planks.'
    ]
  };

  const state = {
    time: 0,
    rain: false,
    quietTimer: 0,
    scaryHover: false,
    shake: 0,
    flakesExposed: 0,
    spawnCounter: 0,
    friends: [],
    particles: [],
    raindrops: [],
    ghosts: [],
    prop: null, // Active stress-test prop: couch | bill | airport
    duckBounce: 0,
    gulls: [
      { x: 140, y: 68, spd: 18, wing: 0 },
      { x: 420, y: 48, spd: 14, wing: 2.1 }
    ],
    clouds: [
      { x: 90, y: 52, s: 1.05, spd: 7 },
      { x: 340, y: 78, s: 0.82, spd: 5 },
      { x: 620, y: 46, s: 1.18, spd: 6.5 }
    ],
    pointer: {
      x: -999,
      y: -999,
      down: false,
      dragId: null,
      vx: 0,
      vy: 0,
      lastX: 0,
      lastY: 0,
      moved: false
    }
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let nextId = 1;
  let toastTimeout = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 2500);
  }

  function writeLog(entry) {
    logEntryEl.textContent = entry;
  }

  function updateHUD() {
    const alive = state.friends.filter(f => !f.dead && !f.fleeing);
    const reals = state.friends.filter(f => f.type === 'real' && !f.dead);
    flakesReadout.textContent = String(state.flakesExposed);
    pierReadout.textContent = String(alive.length);
    realReadout.textContent = String(reals.length);

    if (state.rain) {
      weatherReadout.textContent = 'CONDITIONS: SQUALL // FAIR-WEATHER ADVISORY';
    } else if (state.quietTimer > 0) {
      weatherReadout.textContent = 'CONDITIONS: RADIO SILENCE // CRICKETS';
    } else {
      weatherReadout.textContent = isNight
        ? 'CONDITIONS: CALM HARBOR NIGHT // 58°F'
        : 'CONDITIONS: SUNNY PIER // 72°F';
    }
  }

  function spawnParticles(x, y, color, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      if (state.particles.length > 220) state.particles.shift();
      const ang = (opts.angle ?? Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
      const spd = (opts.minSpd ?? 35) + Math.random() * ((opts.maxSpd ?? 150) - (opts.minSpd ?? 35));
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (opts.up ?? 45),
        size: (opts.minSize ?? 2.5) + Math.random() * ((opts.maxSize ?? 5.5) - (opts.minSize ?? 2.5)),
        color,
        life: 0.5 + Math.random() * 0.55,
        grav: opts.grav ?? 330,
        shape: opts.shape || 'circle',
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 10
      });
    }
  }

  // --------------------------------------------------------------------------
  // Spawning & Fleeing Mechanics
  // --------------------------------------------------------------------------
  function spawnFriend(xOverride, forceType, customLabel) {
    const active = state.friends.filter(f => !f.fleeing && !f.dead);
    if (active.length >= 16) {
      showToast('Pier is at capacity! Run a stress test to clear the flakes.');
      return null;
    }

    state.spawnCounter++;
    let type = forceType;
    if (!type) {
      const hasReal = state.friends.some(f => f.type === 'real' && !f.dead);
      if (!hasReal && state.spawnCounter % 4 === 0) {
        type = 'real';
      } else {
        type = Math.random() < 0.2 ? 'real' : pick(FAKE_TYPES);
      }
    }

    const isReal = type === 'real';
    const minX = 92;
    const maxX = Math.max(minX + 50, dockEndX() - 40);
    const x = xOverride != null
      ? Math.max(minX, Math.min(maxX, xOverride))
      : minX + Math.random() * (maxX - minX);

    const id = nextId++;
    const label = (customLabel || '').trim();

    const friend = {
      id,
      label,
      type,
      x,
      y: 42 + Math.random() * 28,
      vx: (Math.random() - 0.5) * 28,
      vy: 0,
      w: isReal ? 32 : 28,
      h: isReal ? 38 : 35,
      color: isReal ? pick(REAL_COLORS) : pick(FAKE_COLORS),
      hat: isReal ? (Math.random() < 0.55 ? 'beanie' : 'none') : pick(HATS),
      facing: Math.random() < 0.5 ? 1 : -1,
      targetX: x,
      walkTimer: 1 + Math.random() * 2.5,
      blinkTimer: 1.5 + Math.random() * 3,
      blinking: false,
      speech: isReal ? pick(DIALOGUE.greetReal) : pick(DIALOGUE.greetFake),
      speechTimer: 2.8,
      fleeing: false,
      fleeMode: null,
      fleeTime: 0,
      glitch: 0,
      flatScale: 1,
      opacity: 1,
      rot: 0,
      vrot: 0,
      holdingItem: isReal && state.quietTimer > 0 ? 'cocoa' : null,
      helpingProp: false,
      raincoat: isReal && state.rain,
      grounded: false,
      dead: false,
      bobPhase: Math.random() * Math.PI * 2,
      countedFlake: false
    };

    state.friends.push(friend);
    sfx.pop();
    updateHUD();

    if (label) {
      writeLog(`Guest "${label}" stepped onto Pier 04 claiming "${friend.speech}"`);
    }
    return friend;
  }

  function guestTitle(f) {
    return f.label ? `"${f.label}" (${TYPE_LABELS[f.type]})` : `Guest #${String(f.id).padStart(2, '0')} (${TYPE_LABELS[f.type]})`;
  }

  function markFlakeExposed(f, customNote) {
    if (f.type !== 'real' && !f.countedFlake) {
      f.countedFlake = true;
      state.flakesExposed++;
      updateHUD();
      if (customNote) writeLog(customNote);
    }
  }

  function triggerFlee(f, reason) {
    if (f.fleeing || f.dead || f.type === 'real') return;
    f.fleeing = true;
    f.fleeTime = 0;
    f.fleeMode = f.type;

    const lineMap = {
      couch: DIALOGUE.fleeCouch,
      rain: DIALOGUE.fleeRain,
      quiet: DIALOGUE.fleeQuiet,
      bill: DIALOGUE.fleeBill,
      airport: DIALOGUE.fleeAirport
    };
    f.speech = pick(lineMap[reason] || DIALOGUE.fleeQuiet);
    f.speechTimer = 3.2;

    const reasonText = {
      couch: 'spotted a heavy sofa',
      rain: 'felt two drops of rain',
      quiet: 'went 48 hours without being texted first',
      bill: 'saw an itemized dinner receipt',
      airport: 'heard the phrase "Terminal B at 5 AM"'
    }[reason] || 'encountered mild effort';

    markFlakeExposed(f, `${guestTitle(f)} ${reasonText} and evacuated: "${f.speech}"`);

    if (f.type === 'cardboard') {
      sfx.cardboard();
      f.vy = -175 - Math.random() * 60;
      f.vx = 135 + Math.random() * 95;
      f.vrot = 3.6;
      spawnParticles(f.x, f.y - 16, '#d6b48c', 8, { shape: 'rect' });
    } else if (f.type === 'helium') {
      sfx.helium();
      f.vy = -135;
      f.vx = (Math.random() - 0.3) * 45;
      spawnParticles(f.x, f.y - 10, '#ffffff', 6, { up: 90, grav: -60 });
    } else if (f.type === 'hologram') {
      sfx.glitch();
      f.glitch = 1;
      state.ghosts.push({
        x: f.x,
        y: f.y - 36,
        text: pick(['Seen 3w ago', 'Read 2:14 PM', 'typing...']),
        life: 2.3
      });
      spawnParticles(f.x, f.y - 18, '#38bdf8', 10, { grav: -20, shape: 'rect' });
    } else if (f.type === 'bolter') {
      sfx.bolt();
      f.facing = 1;
      f.vx = 310 + Math.random() * 95;
      f.vy = -70;
      spawnParticles(f.x - 10, f.y, '#e2e8f0', 10, { angle: Math.PI, spread: 0.9, grav: 40 });
    } else if (f.type === 'paper') {
      sfx.paperFlutter();
      f.vx = 120 + Math.random() * 55;
      f.vy = -85;
      spawnParticles(f.x, f.y - 12, '#cbd5e1', 7, { shape: 'rect' });
    }
  }

  // --------------------------------------------------------------------------
  // Five Real-Life Stress Tests
  // --------------------------------------------------------------------------
  function scatterFlakes(reason) {
    state.friends.forEach(f => {
      if (f.type !== 'real' && !f.fleeing) {
        setTimeout(() => triggerFlee(f, reason), 110 + Math.random() * 380);
      }
    });
  }

  function runCouchTest() {
    const cx = Math.min(dockEndX() - 105, Math.max(190, W * 0.44));
    state.prop = {
      kind: 'couch',
      x: cx,
      y: -60,
      vy: 0,
      w: 104,
      h: 46,
      landed: false,
      timer: 5.2,
      liftOffset: 0
    };
    showToast('Stress Test: "Hey, any chance you can help me move a couch?"');
    scatterFlakes('couch');
  }

  function toggleRainTest() {
    state.rain = !state.rain;
    testRainBtn.classList.toggle('is-active', state.rain);
    testRainBtn.innerHTML = state.rain
      ? 'Clear the Skies <span class="kbd-hint">2</span>'
      : 'Make It Rain <span class="kbd-hint">2</span>';

    if (state.rain) {
      showToast('Fair-Weather Check: Harbor skies just opened up.');
      scatterFlakes('rain');
      let realCount = 0;
      state.friends.forEach(f => {
        if (f.type === 'real' && !f.dead) {
          realCount++;
          f.raincoat = true;
          f.speech = pick(DIALOGUE.realRain);
          f.speechTimer = 3.2;
        }
      });
      if (realCount > 0) {
        sfx.realChord();
        writeLog(`${realCount} Real One${realCount > 1 ? 's' : ''} zipped up yellow slickers and stayed on the planks.`);
      }
    } else {
      showToast('Sun is back out. Notice who stayed dry together.');
      state.friends.forEach(f => {
        if (f.type === 'real') f.raincoat = false;
      });
    }
    updateHUD();
  }

  function runSilenceTest() {
    state.quietTimer = 5.0;
    sfx.cricket();
    setTimeout(() => { if (state.quietTimer > 0) sfx.cricket(); }, 780);
    showToast('Silence Test: You stopped sending the first text.');
    scatterFlakes('quiet');

    let reals = 0;
    state.friends.forEach(f => {
      if (f.type === 'real' && !f.dead) {
        reals++;
        f.holdingItem = 'cocoa';
        f.targetX = 82 + Math.random() * 75;
        f.speech = pick(DIALOGUE.realQuiet);
        f.speechTimer = 3.8;
      }
    });
    if (reals > 0) {
      setTimeout(() => sfx.realChord(), 350);
      writeLog(`Radio silence day 14: ${reals} Real One${reals > 1 ? 's' : ''} walked over with hot cocoa anyway.`);
    }
    updateHUD();
  }

  function runBillTest() {
    const bx = Math.min(dockEndX() - 95, Math.max(185, W * 0.46));
    sfx.paperFlutter();
    state.prop = {
      kind: 'bill',
      x: bx,
      y: -50,
      vy: 140,
      w: 72,
      h: 54,
      landed: false,
      timer: 4.8,
      liftOffset: 0
    };
    showToast('Stress Test: The $184 itemized group dinner check arrived.');
    scatterFlakes('bill');
  }

  function runAirportTest() {
    const ax = Math.min(dockEndX() - 95, Math.max(195, W * 0.42));
    sfx.alarmBeep();
    state.prop = {
      kind: 'airport',
      x: ax,
      y: -55,
      vy: 0,
      w: 58,
      h: 52,
      landed: false,
      timer: 5.0,
      liftOffset: 0
    };
    showToast('Stress Test: "My flight boards at 5:00 AM... Terminal B."');
    scatterFlakes('airport');
  }

  function resetPier() {
    state.friends = [];
    state.particles = [];
    state.ghosts = [];
    state.prop = null;
    state.rain = false;
    state.quietTimer = 0;
    state.spawnCounter = 0;

    testRainBtn.classList.remove('is-active');
    testRainBtn.innerHTML = 'Make It Rain <span class="kbd-hint">2</span>';

    const starters = ['cardboard', 'helium', 'bolter', 'hologram', 'paper', 'real'];
    for (let i = starters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [starters[i], starters[j]] = [starters[j], starters[i]];
    }

    const startX = 100;
    const span = Math.max(140, dockEndX() - 160);
    starters.forEach((t, idx) => {
      const x = startX + (span * (idx + 0.5)) / starters.length;
      const f = spawnFriend(x, t);
      if (f) f.y = dockY() - 22 - idx * 12;
    });

    writeLog('Fresh pier planks laid. Six unvetted guests aboard; at least one is cast-iron.');
    updateHUD();
  }

  // --------------------------------------------------------------------------
  // Pointer & Duck Hit-Testing
  // --------------------------------------------------------------------------
  function getDuckCoords() {
    const dEnd = dockEndX();
    const wY = waterY();
    const x = dEnd + (W - dEnd) * 0.54;
    const y = wY + Math.sin(x * 0.038 + state.time * 2.4) * 3.5 - 4 - state.duckBounce;
    return { x, y };
  }

  function getCanvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitFriend(px, py) {
    for (let i = state.friends.length - 1; i >= 0; i--) {
      const f = state.friends[i];
      if (f.dead || f.fleeing) continue;
      if (Math.abs(px - f.x) <= f.w * 0.78 && py >= f.y - f.h - 16 && py <= f.y + 10) {
        return f;
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    const p = getCanvasPos(e);
    state.pointer.down = true;
    state.pointer.x = p.x;
    state.pointer.y = p.y;
    state.pointer.lastX = p.x;
    state.pointer.lastY = p.y;
    state.pointer.vx = 0;
    state.pointer.vy = 0;
    state.pointer.moved = false;

    // Check Rubber Duck in Excuse Sea!
    const duck = getDuckCoords();
    if (Math.hypot(p.x - duck.x, p.y - duck.y) < 26) {
      sfx.duckSqueak();
      state.duckBounce = 18;
      spawnParticles(duck.x, duck.y - 8, '#facc15', 8, { up: 85 });
      writeLog('Harbor Rubber Duck inspected: 100% buoyant, never once cancelled plans.');
      return;
    }

    const hit = hitFriend(p.x, p.y);
    if (hit) {
      state.pointer.dragId = hit.id;
      hit.grounded = false;
      canvas.setPointerCapture(e.pointerId);
    } else if (p.x < dockEndX() - 10 && p.y < dockY() + 20) {
      const customLabel = customNameInput.value.trim();
      spawnFriend(p.x, null, customLabel);
      if (customLabel) customNameInput.value = '';
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = getCanvasPos(e);
    state.pointer.vx = (p.x - state.pointer.lastX) * 28;
    state.pointer.vy = (p.y - state.pointer.lastY) * 28;
    if (Math.hypot(p.x - state.pointer.lastX, p.y - state.pointer.lastY) > 3) {
      state.pointer.moved = true;
    }
    state.pointer.lastX = p.x;
    state.pointer.lastY = p.y;
    state.pointer.x = p.x;
    state.pointer.y = p.y;
  });

  function releasePointer() {
    if (!state.pointer.down) return;
    const id = state.pointer.dragId;
    if (id != null) {
      const f = state.friends.find(fr => fr.id === id);
      if (f && !f.dead) {
        if (!state.pointer.moved) {
          // Diagnostic poke!
          f.vy = -130;
          if (f.type === 'real') {
            sfx.clunk();
            f.speech = pick(DIALOGUE.pokeReal);
            f.speechTimer = 2.6;
            spawnParticles(f.x, f.y - 18, '#fbbf24', 6, { up: 75 });
            writeLog(`${guestTitle(f)} rang with a solid cast-iron clunk.`);
          } else {
            if (f.type === 'cardboard') { sfx.cardboard(); f.flatScale = 0.25; }
            else if (f.type === 'hologram') { sfx.glitch(); f.glitch = 0.75; }
            else if (f.type === 'helium') { sfx.pop(); f.vy = -210; }
            else { sfx.pop(); }
            f.speech = pick(DIALOGUE.pokeFake[f.type]);
            f.speechTimer = 2.6;
            writeLog(`Poked ${guestTitle(f)} — suspiciously light: "${f.speech}"`);
          }
        } else {
          // Flick / Toss!
          const cap = f.type === 'real' ? 250 : 660;
          f.vx = Math.max(-cap, Math.min(cap, state.pointer.vx));
          f.vy = Math.max(-cap, Math.min(cap, state.pointer.vy));
          if (f.type === 'real') sfx.clunk();
        }
      }
    }
    state.pointer.down = false;
    state.pointer.dragId = null;
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', () => {
    if (!state.pointer.down) {
      state.pointer.x = -999;
      state.pointer.y = -999;
    }
  });

  // --------------------------------------------------------------------------
  // UI Controls & Keyboard Shortcuts
  // --------------------------------------------------------------------------
  inviteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    ensureAudio();
    const label = customNameInput.value.trim();
    spawnFriend(null, null, label);
    customNameInput.value = '';
  });

  testCouchBtn.addEventListener('click', () => { ensureAudio(); runCouchTest(); });
  testRainBtn.addEventListener('click', () => { ensureAudio(); toggleRainTest(); });
  testQuietBtn.addEventListener('click', () => { ensureAudio(); runSilenceTest(); });
  testBillBtn.addEventListener('click', () => { ensureAudio(); runBillTest(); });
  testAirportBtn.addEventListener('click', () => { ensureAudio(); runAirportTest(); });
  resetDockBtn.addEventListener('click', () => { ensureAudio(); resetPier(); });

  soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggleBtn.textContent = soundOn ? 'Audio: On' : 'Audio: Off';
    soundToggleBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) sfx.pop();
  });

  document.querySelectorAll('[data-scary="1"]').forEach((btn) => {
    btn.addEventListener('mouseenter', () => { state.scaryHover = true; });
    btn.addEventListener('mouseleave', () => { state.scaryHover = false; });
  });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === customNameInput) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'i') { ensureAudio(); spawnFriend(); }
    else if (key === '1') { ensureAudio(); runCouchTest(); }
    else if (key === '2') { ensureAudio(); toggleRainTest(); }
    else if (key === '3') { ensureAudio(); runSilenceTest(); }
    else if (key === '4') { ensureAudio(); runBillTest(); }
    else if (key === '5') { ensureAudio(); runAirportTest(); }
    else if (key === 'r') { ensureAudio(); resetPier(); }
    else if (key === 'm') { soundToggleBtn.click(); }
  });

  // --------------------------------------------------------------------------
  // Simulation Step
  // --------------------------------------------------------------------------
  function activateRealHelpersForProp(prop) {
    const reals = state.friends.filter(f => f.type === 'real' && !f.dead);
    if (reals.length === 0) return;

    reals.forEach((rf, idx) => {
      rf.helpingProp = true;
      rf.targetX = prop.x + (idx % 2 === 0 ? -prop.w * 0.48 : prop.w * 0.48);
      if (prop.kind === 'couch') {
        rf.speech = pick(DIALOGUE.realCouch);
      } else if (prop.kind === 'bill') {
        rf.speech = pick(DIALOGUE.realBill);
        rf.holdingItem = 'cash';
      } else if (prop.kind === 'airport') {
        rf.speech = pick(DIALOGUE.realAirport);
        rf.holdingItem = 'coffee';
      }
      rf.speechTimer = 3.5;
    });

    setTimeout(() => sfx.realChord(), 260);
    const desc = {
      couch: 'grabbed the sofa frame without complaining.',
      bill: 'put down cash + tip before the receipt stopped fluttering.',
      airport: 'pulled up to the curb five minutes early with hot coffee.'
    }[prop.kind];
    writeLog(`${reals.length} Real One${reals.length > 1 ? 's' : ''} ${desc}`);
  }

  function update(dt) {
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);
    if (state.duckBounce > 0) state.duckBounce = Math.max(0, state.duckBounce - dt * 36);

    if (state.quietTimer > 0) {
      state.quietTimer = Math.max(0, state.quietTimer - dt);
      if (state.quietTimer === 0) {
        state.friends.forEach(f => {
          if (f.holdingItem === 'cocoa') f.holdingItem = null;
        });
        updateHUD();
      }
    }

    // Clouds & Gulls
    for (const c of state.clouds) {
      c.x += c.spd * (state.rain ? 2.2 : 1) * dt;
      if (c.x > W + 90) c.x = -90;
    }
    for (const g of state.gulls) {
      g.x += g.spd * dt;
      g.wing += dt * 7;
      if (g.x > W + 60) g.x = -60;
    }

    // Raindrops
    if (state.rain) {
      for (let i = 0; i < 5; i++) {
        if (state.raindrops.length < 150) {
          state.raindrops.push({
            x: Math.random() * (W + 90) - 20,
            y: -12,
            vy: 390 + Math.random() * 150,
            len: 10 + Math.random() * 8
          });
        }
      }
    }
    for (let i = state.raindrops.length - 1; i >= 0; i--) {
      const r = state.raindrops[i];
      r.x -= 58 * dt;
      r.y += r.vy * dt;
      const surfaceY = r.x < dockEndX() ? dockY() : waterY();
      if (r.y >= surfaceY) {
        if (Math.random() < 0.22) {
          spawnParticles(r.x, surfaceY, isNight ? '#7dd3fc' : '#38bdf8', 2, {
            minSpd: 15, maxSpd: 55, up: 35, minSize: 1.5, maxSize: 2.4
          });
        }
        state.raindrops.splice(i, 1);
      }
    }

    // Active Stress-Test Prop (Couch / Dinner Bill / 5AM Suitcase)
    if (state.prop) {
      const p = state.prop;
      if (!p.landed) {
        if (p.kind === 'bill') {
          // Gentle fluttering descent
          p.y += 135 * dt;
          p.x += Math.sin(state.time * 9) * 38 * dt;
        } else {
          p.vy += 980 * dt;
          p.y += p.vy * dt;
        }
        if (p.y >= dockY()) {
          p.y = dockY();
          p.landed = true;
          if (p.kind === 'couch') {
            state.shake = 7.5;
            sfx.thud();
            spawnParticles(p.x, dockY(), '#eab308', 14, { up: 95, spread: Math.PI });
          } else if (p.kind === 'airport') {
            state.shake = 3.5;
            sfx.clunk();
          }
          activateRealHelpersForProp(p);
        }
      } else {
        p.timer -= dt;
        if (p.kind === 'couch') {
          const helpers = state.friends.filter(
            f => f.type === 'real' && !f.dead && Math.abs(f.x - p.x) < p.w * 0.78
          );
          const targetLift = helpers.length > 0 ? 20 : 0;
          p.liftOffset += (targetLift - p.liftOffset) * Math.min(1, dt * 7);
        }
        if (p.timer <= 0) {
          spawnParticles(p.x, p.y - 22, '#f59e0b', 10, { up: 75 });
          state.prop = null;
          state.friends.forEach(f => {
            f.helpingProp = false;
            if (f.holdingItem === 'cash' || f.holdingItem === 'coffee') f.holdingItem = null;
          });
        }
      }
    }

    // Friends Physics & Behavior
    const dY = dockY();
    const dEnd = dockEndX();
    const wY = waterY();

    for (const f of state.friends) {
      if (f.dead) continue;
      f.bobPhase += dt * 4.5;
      if (f.speechTimer > 0) f.speechTimer -= dt;
      if (f.glitch > 0) f.glitch = Math.max(0, f.glitch - dt * 1.4);
      if (f.flatScale < 1 && !f.fleeing) f.flatScale = Math.min(1, f.flatScale + dt * 2.5);

      f.blinkTimer -= dt;
      if (f.blinkTimer <= 0) {
        f.blinking = !f.blinking;
        f.blinkTimer = f.blinking ? 0.11 : (1.8 + Math.random() * 3.2);
      }

      // Pointer drag
      if (state.pointer.down && state.pointer.dragId === f.id) {
        f.x += (state.pointer.x - f.x) * Math.min(1, dt * 22);
        f.y += (state.pointer.y + 12 - f.y) * Math.min(1, dt * 22);
        f.vx = 0;
        f.vy = 0;
        f.rot = Math.max(-0.4, Math.min(0.4, state.pointer.vx * 0.0012));
        continue;
      }

      // Fleeing animations
      if (f.fleeing) {
        f.fleeTime += dt;
        if (f.fleeMode === 'helium') {
          f.vy -= 145 * dt;
          f.x += (f.vx + Math.sin(f.fleeTime * 8) * 34) * dt;
          f.y += f.vy * dt;
          f.rot = Math.sin(f.fleeTime * 7) * 0.18;
          if (f.y < -70) f.dead = true;
        } else if (f.fleeMode === 'hologram') {
          f.glitch = 1;
          f.y -= 18 * dt;
          f.opacity = Math.max(0, 1 - f.fleeTime * 0.92);
          if (f.opacity <= 0.02) f.dead = true;
        } else if (f.fleeMode === 'cardboard') {
          f.flatScale = Math.max(0.16, 1 - f.fleeTime * 2.5);
          f.vy += 270 * dt;
          f.vx += 80 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rot += f.vrot * dt;
          if (f.x > W + 80 || f.y > H + 70) f.dead = true;
        } else if (f.fleeMode === 'paper') {
          f.vy += 430 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.x < dEnd && f.y > dY) { f.y = dY; f.vy = -55; }
          if (f.x >= dEnd && f.y > wY + 2) {
            f.y = wY + 2;
            f.vy = 0;
            f.vx = Math.max(f.vx, 100);
          }
          if (f.x > W + 80) f.dead = true;
        } else {
          // bolter
          f.vy += 700 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.x < dEnd && f.y > dY) {
            f.y = dY;
            f.vy = 0;
          }
          if (f.x >= dEnd && f.y > wY + 14) {
            sfx.splash();
            spawnParticles(f.x, wY, '#38bdf8', 14, { up: 130 });
            f.dead = true;
          }
          if (f.x > W + 80) f.dead = true;
        }
        continue;
      }

      // Standard Pier Physics
      f.vy += 780 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot *= Math.pow(0.08, dt);

      if (f.x < 38) {
        f.x = 38;
        f.vx = Math.abs(f.vx) * 0.4;
      }

      if (f.x <= dEnd - 6) {
        if (f.y >= dY) {
          f.y = dY;
          f.vy = Math.abs(f.vy) > 135 ? -f.vy * 0.22 : 0;
          f.vx *= Math.pow(0.002, dt);
          f.grounded = true;
        }
      } else {
        // Past the edge of Pier 04
        if (f.type === 'real') {
          f.x = dEnd - 18;
          f.vx = -90;
          f.vy = Math.min(f.vy, -95);
          f.speech = pick(DIALOGUE.realStayEdge);
          f.speechTimer = 2.6;
          sfx.clunk();
          writeLog(`${guestTitle(f)} planted cast-iron boots at the pier edge and refused to fall.`);
        } else if (f.y >= wY + 8) {
          sfx.splash();
          markFlakeExposed(f, `Flicked ${guestTitle(f)} straight into Excuse Sea.`);
          spawnParticles(f.x, wY, '#38bdf8', 18, { up: 155, spread: Math.PI });
          state.ghosts.push({
            x: Math.min(W - 64, f.x),
            y: wY - 20,
            text: pick(['splash!', 'lets touch base!', 'raincheck!!']),
            life: 1.9
          });
          f.dead = true;
          continue;
        }
      }

      // Autonomous walking on planks
      if (f.grounded) {
        if (f.helpingProp && state.prop) {
          const dx = f.targetX - f.x;
          if (Math.abs(dx) > 5) {
            f.x += Math.sign(dx) * 95 * dt;
            f.facing = Math.sign(dx);
          }
        } else if (f.holdingItem === 'cocoa') {
          const dx = f.targetX - f.x;
          if (Math.abs(dx) > 5) {
            f.x += Math.sign(dx) * 58 * dt;
            f.facing = Math.sign(dx);
          }
        } else {
          f.walkTimer -= dt;
          if (f.walkTimer <= 0) {
            f.walkTimer = 1.6 + Math.random() * 3.0;
            f.targetX = 82 + Math.random() * Math.max(70, dEnd - 130);
          }
          const dx = f.targetX - f.x;
          if (Math.abs(dx) > 6) {
            const spd = f.type === 'real' ? 30 : 42;
            f.x += Math.sign(dx) * spd * dt;
            f.facing = Math.sign(dx);
          }
        }
      }
    }

    const prevLen = state.friends.length;
    state.friends = state.friends.filter(f => !f.dead);
    if (state.friends.length !== prevLen) updateHUD();

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }

    for (let i = state.ghosts.length - 1; i >= 0; i--) {
      const g = state.ghosts[i];
      g.life -= dt;
      g.y -= 18 * dt;
      if (g.life <= 0) state.ghosts.splice(i, 1);
    }
  }

  // --------------------------------------------------------------------------
  // Canvas Diorama Renderer
  // --------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawSkyAndHorizon() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (state.rain) {
      if (isNight) {
        g.addColorStop(0, '#0b131e');
        g.addColorStop(1, '#1c2b3a');
      } else {
        g.addColorStop(0, '#64748b');
        g.addColorStop(1, '#cbd5e1');
      }
    } else if (state.quietTimer > 0) {
      if (isNight) {
        g.addColorStop(0, '#09111b');
        g.addColorStop(1, '#1e3a4c');
      } else {
        g.addColorStop(0, '#93c5fd');
        g.addColorStop(1, '#fde68a');
      }
    } else if (isNight) {
      g.addColorStop(0, '#0b1320');
      g.addColorStop(0.62, '#142338');
      g.addColorStop(1, '#23384e');
    } else {
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(0.62, '#e0f2fe');
      g.addColorStop(1, '#fef3c7');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun or Crescent Moon
    const sx = W - 76;
    const sy = 56;
    if (!state.rain) {
      ctx.save();
      ctx.translate(sx, sy);
      if (!isNight) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + state.time * 0.3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
          ctx.lineTo(Math.cos(a) * 35, Math.sin(a) * 35);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0e1929';
        ctx.beginPath();
        ctx.arc(7, -4, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Night Stars & Distant Lighthouse on the Horizon
    if (isNight && !state.rain) {
      ctx.fillStyle = '#f8fafc';
      const stars = [[64, 34], [160, 62], [280, 28], [410, 50], [550, 30], [700, 66], [810, 26]];
      stars.forEach(([x, y], idx) => {
        ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(state.time * 1.3 + idx));
        ctx.beginPath();
        ctx.arc(x % W, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Distant headland + lighthouse silhouette on far right horizon
    const lhX = W - 42;
    const wY = waterY();
    ctx.fillStyle = isNight ? '#0f1c2b' : 'rgba(100, 116, 139, 0.28)';
    ctx.beginPath();
    ctx.moveTo(W - 140, wY + 2);
    ctx.quadraticCurveTo(W - 75, wY - 16, W, wY - 8);
    ctx.lineTo(W, wY + 4);
    ctx.closePath();
    ctx.fill();

    // Lighthouse tower
    ctx.fillStyle = isNight ? '#334155' : 'rgba(248, 250, 252, 0.75)';
    ctx.beginPath();
    ctx.moveTo(lhX - 5, wY - 8);
    ctx.lineTo(lhX - 3, wY - 36);
    ctx.lineTo(lhX + 3, wY - 36);
    ctx.lineTo(lhX + 5, wY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(lhX - 3.5, wY - 26, 7, 6);

    if (isNight) {
      // Sweeping warm lighthouse beam
      const sweep = Math.sin(state.time * 1.1);
      ctx.save();
      ctx.translate(lhX, wY - 38);
      const beamGrad = ctx.createLinearGradient(0, 0, -180, 0);
      beamGrad.addColorStop(0, 'rgba(253, 224, 71, 0.34)');
      beamGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-180, -24 + sweep * 18);
      ctx.lineTo(-180, 14 + sweep * 18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Drifting Harbor Gulls (Daytime clear weather)
    if (!isNight && !state.rain) {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1.6;
      for (const g of state.gulls) {
        const flap = Math.sin(g.wing) * 4;
        ctx.beginPath();
        ctx.moveTo(g.x - 8, g.y + flap);
        ctx.quadraticCurveTo(g.x - 4, g.y - 4, g.x, g.y);
        ctx.quadraticCurveTo(g.x + 4, g.y - 4, g.x + 8, g.y + flap);
        ctx.stroke();
      }
    }

    // Clouds
    for (const c of state.clouds) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.s, c.s);
      ctx.fillStyle = state.rain
        ? (isNight ? 'rgba(30, 41, 59, 0.88)' : 'rgba(100, 116, 139, 0.76)')
        : (isNight ? 'rgba(148, 163, 184, 0.14)' : 'rgba(255, 255, 255, 0.86)');
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.arc(17, -6, 21, 0, Math.PI * 2);
      ctx.arc(36, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPierAndWater() {
    const dY = dockY();
    const dEnd = dockEndX();
    const wY = waterY();

    // Excuse Sea Waves
    ctx.fillStyle = isNight ? '#0c4a6e' : '#0284c7';
    ctx.beginPath();
    ctx.moveTo(0, wY);
    for (let x = 0; x <= W; x += 18) {
      ctx.lineTo(x, wY + Math.sin(x * 0.038 + state.time * 2.4) * 3.5);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Secondary foreground wave shimmer
    ctx.fillStyle = isNight ? 'rgba(14, 116, 144, 0.45)' : 'rgba(56, 189, 248, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, wY + 14);
    for (let x = 0; x <= W; x += 22) {
      ctx.lineTo(x, wY + 14 + Math.cos(x * 0.032 - state.time * 1.9) * 3);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Interactive Bobbing Rubber Duck
    const duck = getDuckCoords();
    ctx.save();
    ctx.translate(duck.x, duck.y);
    ctx.rotate(Math.sin(state.time * 2.7) * 0.13);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-6.5, -7, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-12, -7);
    ctx.lineTo(-16.5, -5.2);
    ctx.lineTo(-12, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-8, -8, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Water label
    ctx.fillStyle = isNight ? 'rgba(186, 230, 253, 0.55)' : 'rgba(255, 255, 255, 0.86)';
    ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXCUSE SEA', dEnd + (W - dEnd) * 0.52, H - 16);

    // Timber Pilings & Swaying Mooring Rope
    const pilingXs = [];
    for (let px = 32; px < dEnd - 12; px += 86) pilingXs.push(px);

    ctx.strokeStyle = isNight ? '#78350f' : '#92400e';
    ctx.lineWidth = 2;
    for (let i = 0; i < pilingXs.length - 1; i++) {
      const x1 = pilingXs[i] + 6;
      const x2 = pilingXs[i + 1] + 6;
      const sag = 12 + Math.sin(state.time * 1.8 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, dY + 18);
      ctx.quadraticCurveTo((x1 + x2) / 2, dY + 18 + sag, x2, dY + 18);
      ctx.stroke();
    }

    for (const px of pilingXs) {
      ctx.fillStyle = isNight ? '#3f1d0b' : '#78350f';
      ctx.fillRect(px, dY + 10, 13, H - dY);
      ctx.fillStyle = isNight ? '#78350f' : '#92400e';
      roundRect(px - 1.5, dY - 6, 16, 9, 3);
      ctx.fill();
    }

    // Pier Deck Planks
    ctx.fillStyle = isNight ? '#5c2d10' : '#b45309';
    roundRect(0, dY, dEnd, 15, [0, 5, 5, 0]);
    ctx.fill();
    ctx.fillStyle = isNight ? '#7c3f16' : '#d97706';
    ctx.fillRect(0, dY, dEnd - 4, 4.5);

    // Plank seam ticks
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let sx = 18; sx < dEnd - 8; sx += 24) {
      ctx.beginPath();
      ctx.moveTo(sx, dY);
      ctx.lineTo(sx, dY + 14);
      ctx.stroke();
    }

    // Harbor Lantern & "Real Ones" Bench on Left
    const reals = state.friends.filter(f => f.type === 'real' && !f.dead).length;
    ctx.fillStyle = isNight ? '#64748b' : '#475569';
    ctx.fillRect(24, dY - 72, 4.5, 72);
    ctx.fillRect(24, dY - 72, 20, 4);

    const glowR = (isNight ? 34 : 22) + Math.min(28, reals * 9);
    const lg = ctx.createRadialGradient(42, dY - 59, 2, 42, dY - 59, glowR);
    lg.addColorStop(0, 'rgba(253, 224, 71, 0.85)');
    lg.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(42, dY - 59, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fde047';
    roundRect(37, dY - 65, 9, 12, 2);
    ctx.fill();

    // Wooden Bench
    ctx.fillStyle = isNight ? '#572a15' : '#7c2d12';
    ctx.fillRect(50, dY - 13, 52, 4.5);
    ctx.fillRect(54, dY - 9, 4, 9);
    ctx.fillRect(94, dY - 9, 4, 9);
    ctx.fillRect(50, dY - 24, 52, 5.5);
    ctx.fillRect(53, dY - 24, 3, 15);
    ctx.fillRect(95, dY - 24, 3, 15);
  }

  function drawProp() {
    if (!state.prop) return;
    const p = state.prop;
    const py = p.y - p.liftOffset;

    ctx.save();
    ctx.translate(p.x, py);

    if (p.landed) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, p.liftOffset + 2, p.w * 0.48, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.kind === 'couch') {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-p.w / 2 + 6, -6, 6, 6);
      ctx.fillRect(p.w / 2 - 12, -6, 6, 6);

      ctx.fillStyle = '#dc2626';
      roundRect(-p.w / 2 + 4, -p.h, p.w - 8, p.h - 14, 9);
      ctx.fill();

      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.lineWidth = 2;
      for (let sx = -p.w / 2 + 16; sx < p.w / 2 - 12; sx += 16) {
        ctx.beginPath();
        ctx.moveTo(sx, -p.h + 3);
        ctx.lineTo(sx, -16);
        ctx.stroke();
      }

      ctx.fillStyle = '#ef4444';
      roundRect(-p.w / 2 + 6, -22, p.w - 12, 16, 5);
      ctx.fill();

      ctx.fillStyle = '#b91c1c';
      roundRect(-p.w / 2, -28, 12, 22, 5);
      ctx.fill();
      roundRect(p.w / 2 - 12, -28, 12, 22, 5);
      ctx.fill();

      ctx.fillStyle = '#fef9c3';
      ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SLEEPER SOFA', 0, -29);
    } else if (p.kind === 'bill') {
      // Oversized Itemized Dinner Receipt
      ctx.rotate(p.landed ? -0.04 : Math.sin(state.time * 10) * 0.16);
      ctx.fillStyle = '#fffbeb';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      roundRect(-p.w / 2, -p.h, p.w, p.h, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DINNER CHECK', 0, -p.h + 13);
      ctx.strokeStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(-26, -p.h + 19);
      ctx.lineTo(26, -p.h + 19);
      ctx.moveTo(-26, -p.h + 27);
      ctx.lineTo(20, -p.h + 27);
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('$184.50', 0, -10);
    } else if (p.kind === 'airport') {
      // Rolling Suitcase + 5:00 AM Tag
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-8, -p.h + 8);
      ctx.lineTo(-8, -p.h - 10);
      ctx.lineTo(8, -p.h - 10);
      ctx.lineTo(8, -p.h + 8);
      ctx.stroke();

      ctx.fillStyle = '#0f766e';
      roundRect(-22, -p.h + 6, 44, p.h - 10, 6);
      ctx.fill();
      ctx.strokeStyle = '#14b8a6';
      ctx.lineWidth = 1.5;
      roundRect(-22, -p.h + 6, 44, p.h - 10, 6);
      ctx.stroke();

      // Wheels
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-14, -2, 3.5, 0, Math.PI * 2);
      ctx.arc(14, -2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Luggage tag
      ctx.fillStyle = '#fde047';
      roundRect(-17, -30, 34, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('5:00 AM', 0, -20);
    }

    ctx.restore();
  }

  function drawHat(f) {
    const topY = -f.h;
    if (f.raincoat) {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, topY + 2, 13.5, Math.PI, 0);
      ctx.fill();
      roundRect(-17, topY, 34, 5, 2.5);
      ctx.fill();
      return;
    }
    if (f.hat === 'beanie') {
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, topY + 3, 12, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#fecaca';
      ctx.beginPath();
      ctx.arc(0, topY - 9.5, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.hat === 'crown') {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-9, topY + 2);
      ctx.lineTo(-10, topY - 8);
      ctx.lineTo(-4, topY - 3);
      ctx.lineTo(0, topY - 10);
      ctx.lineTo(4, topY - 3);
      ctx.lineTo(10, topY - 8);
      ctx.lineTo(9, topY + 2);
      ctx.closePath();
      ctx.fill();
    } else if (f.hat === 'propeller') {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(0, topY + 2, 10.5, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5;
      const spin = Math.sin(state.time * 18 + f.id) * 11;
      ctx.beginPath();
      ctx.moveTo(-spin, topY - 9);
      ctx.lineTo(spin, topY - 9);
      ctx.stroke();
    } else if (f.hat === 'visor') {
      ctx.fillStyle = '#f97316';
      roundRect(-11, topY - 3, 22, 5, 2);
      ctx.fill();
      roundRect(0, topY, 16 * f.facing, 3.5, 1.5);
      ctx.fill();
    } else if (f.hat === 'sailor') {
      ctx.fillStyle = '#f8fafc';
      roundRect(-11, topY - 7, 22, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-11, topY - 1, 22, 2.5);
    } else if (f.hat === 'sprout') {
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, topY + 1);
      ctx.quadraticCurveTo(2, topY - 7, 0, topY - 11);
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(5, topY - 10, 5, 2.8, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFriend(f) {
    ctx.save();
    ctx.globalAlpha = f.opacity;
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);

    // Origami boat form when paper guest sails away
    if (f.fleeing && f.fleeMode === 'paper') {
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-19, -5);
      ctx.lineTo(19, -5);
      ctx.lineTo(12, 4);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(0, -20);
      ctx.lineTo(8, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawLabelsAndSpeech(f);
      return;
    }

    const isDragged = state.pointer.down && state.pointer.dragId === f.id;
    const bob = f.grounded && !f.fleeing ? Math.sin(f.bobPhase) * 1.5 : 0;
    const jitterX = f.glitch > 0 ? (Math.random() - 0.5) * 6 * f.glitch : 0;

    ctx.translate(jitterX, bob);
    ctx.scale(f.flatScale, 1);

    // Balloon when Helium Bestie floats off
    if (f.fleeing && f.fleeMode === 'helium') {
      ctx.strokeStyle = isNight ? '#cbd5e1' : '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -f.h);
      ctx.lineTo(0, -f.h - 24);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.ellipse(0, -f.h - 36, 10.5, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pier shadow
    if (f.grounded && !f.fleeing) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 1, f.w * 0.48, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legs
    ctx.strokeStyle = isNight ? '#e2e8f0' : '#1e293b';
    ctx.lineWidth = f.type === 'real' ? 3.4 : 2.6;
    ctx.lineCap = 'round';
    const swing = isDragged
      ? Math.sin(state.time * 28) * 6
      : (f.fleeing && f.fleeMode === 'bolter' ? Math.sin(state.time * 42) * 10 : Math.sin(f.bobPhase * 1.5) * 2.5);
    ctx.beginPath();
    ctx.moveTo(-5.5, -8);
    ctx.lineTo(-5.5 + swing, 0);
    ctx.moveTo(5.5, -8);
    ctx.lineTo(5.5 - swing, 0);
    ctx.stroke();

    // Body
    ctx.fillStyle = f.raincoat ? '#facc15' : f.color;
    roundRect(-f.w / 2, -f.h, f.w, f.h - 6, 12);
    ctx.fill();

    // Subtle warm rim once Real One proves themselves
    if (f.type === 'real' && (f.raincoat || f.holdingItem || f.helpingProp)) {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      roundRect(-f.w / 2, -f.h, f.w, f.h - 6, 12);
      ctx.stroke();
    }

    if (f.flatScale < 0.75) {
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      roundRect(-f.w / 2, -f.h, f.w, f.h - 6, 6);
      ctx.stroke();
    }

    if (f.glitch > 0.05) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
      for (let sy = -f.h + 4; sy < -8; sy += 6) {
        ctx.fillRect(-f.w / 2 - 2, sy, f.w + 4, 2);
      }
    }

    drawHat(f);

    // Eyes
    const eyeY = -f.h + 13.5;
    let lookX = f.facing * 1.5;
    let lookY = 0;
    if (state.scaryHover && f.type !== 'real') {
      lookX = 2.7; // Nervous side-eye toward Excuse Sea!
    } else if (state.pointer.x > 0) {
      const ang = Math.atan2(state.pointer.y - (f.y + eyeY), state.pointer.x - f.x);
      lookX = Math.cos(ang) * 2.0;
      lookY = Math.sin(ang) * 1.4;
    }

    if (f.blinking) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-7.5, eyeY); ctx.lineTo(-2.5, eyeY);
      ctx.moveTo(2.5, eyeY); ctx.lineTo(7.5, eyeY);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-5, eyeY, 3.8, 0, Math.PI * 2);
      ctx.arc(5, eyeY, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-5 + lookX, eyeY + lookY, 1.9, 0, Math.PI * 2);
      ctx.arc(5 + lookX, eyeY + lookY, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    if (f.fleeing || (state.scaryHover && f.type !== 'real')) {
      ctx.arc(0, eyeY + 8.5, 2.6, 0, Math.PI * 2);
    } else if (f.type === 'real') {
      ctx.moveTo(-3.8, eyeY + 7.5);
      ctx.quadraticCurveTo(0, eyeY + 9.8, 3.8, eyeY + 7.5);
    } else {
      ctx.arc(0, eyeY + 6, 4.6, 0.15, Math.PI - 0.15);
    }
    ctx.stroke();

    // Nervous sweat bead on scary hover
    if (state.scaryHover && f.type !== 'real' && !f.fleeing) {
      const dropY = -f.h + 5 + ((state.time * 22 + f.id * 5) % 9);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(f.w / 2 + 2.5, dropY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Held items for Real Ones (Cocoa, Coffee, Cash)
    if (f.holdingItem === 'cocoa' || f.holdingItem === 'coffee') {
      ctx.fillStyle = f.holdingItem === 'coffee' ? '#fde68a' : '#f8fafc';
      roundRect(f.w / 2 - 2, -21, 8.5, 10, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.2;
      const st = Math.sin(state.time * 6) * 2;
      ctx.beginPath();
      ctx.moveTo(f.w / 2 + 2, -23);
      ctx.quadraticCurveTo(f.w / 2 + 2 + st, -28, f.w / 2 + 2, -32);
      ctx.stroke();
    } else if (f.holdingItem === 'cash') {
      ctx.fillStyle = '#22c55e';
      roundRect(f.w / 2 - 2, -20, 12, 7, 1.5);
      ctx.fill();
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 1;
      roundRect(f.w / 2 - 2, -20, 12, 7, 1.5);
      ctx.stroke();
    }

    ctx.restore();
    drawLabelsAndSpeech(f);
  }

  function drawLabelsAndSpeech(f) {
    // Optional custom nickname tag
    if (f.label && !f.dead) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.92, f.opacity);
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isNight ? '#fde68a' : '#1e293b';
      ctx.fillText(f.label, f.x, f.y - f.h - 14);
      ctx.restore();
    }

    if (!f.speech || f.speechTimer <= 0) return;
    const alpha = Math.min(1, f.speechTimer * 2, f.opacity);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 11.5px "Plus Jakarta Sans", sans-serif';
    const padX = 8;
    const tw = ctx.measureText(f.speech).width;
    const bw = tw + padX * 2;
    const bh = 23;
    let bx = f.x - bw / 2;
    let by = f.y - f.h - (f.label ? 46 : 36);
    bx = Math.max(8, Math.min(W - bw - 8, bx));
    by = Math.max(8, by);

    ctx.fillStyle = f.type === 'real'
      ? (isNight ? '#064e3b' : '#ecfdf5')
      : (isNight ? '#1e293b' : '#ffffff');
    ctx.strokeStyle = f.type === 'real'
      ? '#10b981'
      : (isNight ? '#475569' : '#cbd5e1');
    ctx.lineWidth = 1.3;
    roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = f.type === 'real'
      ? (isNight ? '#d1fae5' : '#065f46')
      : (isNight ? '#f1f5f9' : '#0f172a');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.speech, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  }

  function drawWeatherAndParticles() {
    if (state.raindrops.length > 0) {
      ctx.strokeStyle = isNight ? 'rgba(125, 211, 252, 0.48)' : 'rgba(37, 99, 235, 0.48)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const r of state.raindrops) {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 2.5, r.y + r.len);
      }
      ctx.stroke();
    }

    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const g of state.ghosts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, g.life));
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isNight ? '#bae6fd' : '#1e293b';
      ctx.fillText(g.text, g.x, g.y);
      ctx.restore();
    }
  }

  function render() {
    ctx.save();
    if (state.shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawSkyAndHorizon();
    drawPierAndWater();
    drawProp();

    const ordered = [...state.friends].sort((a, b) => {
      if (a.id === state.pointer.dragId) return 1;
      if (b.id === state.pointer.dragId) return -1;
      return a.y - b.y;
    });
    for (const f of ordered) drawFriend(f);

    drawWeatherAndParticles();
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // Responsive Canvas Sizing & Animation Loop
  // --------------------------------------------------------------------------
  function resize() {
    const rect = frame.getBoundingClientRect();
    W = Math.max(300, Math.floor(rect.width));
    H = Math.max(280, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const maxX = dockEndX() - 20;
    state.friends.forEach(f => {
      if (!f.fleeing && f.x > maxX) f.x = maxX;
      if (f.grounded) f.y = dockY();
    });
  }

  new ResizeObserver(() => resize()).observe(frame);

  resize();
  resetPier();

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
