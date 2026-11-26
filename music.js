/* ==========================================================================
   High & Dry: Pier No. 04 — Harbor Radio & Crowd-Reactive Music Engine
   Synthesizer patches, genre progressions, walking bass, chimes, and parlor
   reverb/wax-crackle buffers adapted from The Whimsy Machine (Zero Assets).
   ========================================================================== */

(() => {
  'use strict';

  const SILENT = 0.0001;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Moves a MIDI note by whole octaves into [low, high], preserving pitch class
  // (ported from whimsy-machine/src/ensemble.mjs).
  function foldIntoRange(midi, low, high = Infinity) {
    let note = midi;
    while (note < low) note += 12;
    while (note > high && note - 12 >= low) note -= 12;
    return note;
  }

  // Deterministic PRNG for procedural acoustic buffers (from vitrine-canvas.mjs)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cleanupOnEnded(source, ...nodes) {
    if (!source) return;
    source.onended = () => {
      for (let i = 0; i < nodes.length; i++) {
        try {
          if (nodes[i] && typeof nodes[i].disconnect === 'function') {
            nodes[i].disconnect();
          }
        } catch (_) {}
      }
    };
  }

  // --------------------------------------------------------------------------
  // Procedural Buffers: Noise, 78-RPM Wax Crackle & Harbor Impulse Reverb
  // (Adapted from whimsy-machine/src/schedulers.mjs)
  // --------------------------------------------------------------------------
  let cachedNoiseBuffer = null;
  let cachedWaxCrackleBuffer = null;
  let cachedImpulseBuffer = null;

  function ensureNoiseBuffer(context) {
    if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === context.sampleRate) {
      return cachedNoiseBuffer;
    }
    const length = Math.floor(context.sampleRate * 0.25);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    const random = mulberry32(0x4d414c42);
    for (let i = 0; i < length; i++) {
      channel[i] = random() * 2 - 1;
    }
    cachedNoiseBuffer = buffer;
    return buffer;
  }

  function ensureWaxCrackleBuffer(context, durationSeconds = 3.6) {
    if (cachedWaxCrackleBuffer && cachedWaxCrackleBuffer.sampleRate === context.sampleRate) {
      return cachedWaxCrackleBuffer;
    }
    const frames = Math.ceil(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(2, frames, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const rand = mulberry32(0x50494552);

    let b0L = 0, b1L = 0, b2L = 0;
    let b0R = 0, b1R = 0, b2R = 0;
    let rumbleL = 0, rumbleR = 0;
    const rotPeriod = 60 / 78;

    for (let i = 0; i < frames; i++) {
      const t = i / context.sampleRate;
      const rotPhase = (t % rotPeriod) / rotPeriod;
      const rotThump = Math.exp(-Math.pow((rotPhase - 0.12) * 12, 2)) * 0.035;
      const rotWobble = 1 + 0.22 * Math.sin(t * (1 / rotPeriod) * 2 * Math.PI) + rotThump;

      const subWhiteL = rand() * 2 - 1;
      const subWhiteR = rand() * 2 - 1;
      rumbleL = rumbleL * 0.96 + subWhiteL * 0.04;
      rumbleR = rumbleR * 0.96 + subWhiteR * 0.04;

      const whiteL = rand() * 2 - 1;
      const whiteR = rand() * 2 - 1;
      b0L = 0.85 * b0L + whiteL * 0.15;
      b1L = 0.72 * b1L + (whiteL - b0L) * 0.28;
      b2L = 0.55 * b2L + b1L * 0.45;

      b0R = 0.85 * b0R + whiteR * 0.15;
      b1R = 0.72 * b1R + (whiteR - b0R) * 0.28;
      b2R = 0.55 * b2R + b1R * 0.45;

      const hornL = (b1L - b2L) * 0.22;
      const hornR = (b1R - b2R) * 0.22;

      left[i] = (hornL + rumbleL * 0.18) * rotWobble;
      right[i] = (hornR + rumbleR * 0.18) * rotWobble;
    }

    for (let i = 0; i < frames; i++) {
      if (rand() < 310 / context.sampleRate) {
        const amp = (rand() * 0.24 + 0.06) * (rand() < 0.5 ? 1 : -1);
        const decayLen = Math.floor(rand() * 12 + 4);
        for (let k = 0; k < decayLen && i + k < frames; k++) {
          const env = Math.exp(-k * 0.42);
          left[i + k] += amp * env;
          right[i + k] += amp * env * (0.7 + rand() * 0.6);
        }
      }
    }

    for (let i = 0; i < frames; i++) {
      if (rand() < 32 / context.sampleRate) {
        const popAmp = (rand() * 0.45 + 0.22) * (rand() < 0.5 ? 1 : -1);
        const popLen = Math.floor(rand() * 28 + 14);
        const ringFreq = 1800 + rand() * 2000;
        for (let k = 0; k < popLen && i + k < frames; k++) {
          const tPop = k / context.sampleRate;
          const env = Math.exp(-k * 0.18) * Math.cos(2 * Math.PI * ringFreq * tPop);
          left[i + k] += popAmp * env;
          right[i + k] += popAmp * env * (0.8 + rand() * 0.4);
        }
      }
    }

    const fadeLen = Math.min(2400, Math.floor(frames / 8));
    for (let j = 0; j < fadeLen; j++) {
      const ramp = j / fadeLen;
      const tailIdx = frames - fadeLen + j;
      left[tailIdx] = left[tailIdx] * (1 - ramp) + left[j] * ramp;
      right[tailIdx] = right[tailIdx] * (1 - ramp) + right[j] * ramp;
    }

    cachedWaxCrackleBuffer = buffer;
    return buffer;
  }

  function ensureParlorImpulseResponse(context, durationSeconds = 1.5) {
    if (cachedImpulseBuffer && cachedImpulseBuffer.sampleRate === context.sampleRate) {
      return cachedImpulseBuffer;
    }
    const frames = Math.ceil(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(2, frames, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const rand = mulberry32(0x444f434b);

    const reflections = [
      { t: 0.008, gL: 0.32, gR: -0.26 },
      { t: 0.017, gL: -0.25, gR: 0.29 },
      { t: 0.028, gL: 0.20, gR: -0.18 },
      { t: 0.041, gL: -0.16, gR: 0.19 },
      { t: 0.059, gL: 0.12, gR: -0.13 },
      { t: 0.084, gL: -0.09, gR: 0.10 }
    ];

    for (const ref of reflections) {
      const idx = Math.min(frames - 1, Math.floor(ref.t * context.sampleRate));
      left[idx] += ref.gL;
      right[idx] += ref.gR;
    }

    let lpL = 0, lpR = 0;
    let hpInL = 0, hpOutL = 0;
    let hpInR = 0, hpOutR = 0;
    const R = 0.985;

    for (let i = 0; i < frames; i++) {
      const t = i / context.sampleRate;
      const decay = Math.exp(-2.9 * t);
      const whiteL = (rand() * 2 - 1) * decay * 0.22;
      const whiteR = (rand() * 2 - 1) * decay * 0.22;

      const filterCoeff = 0.55 + 0.35 * Math.exp(-3.5 * t);
      lpL = lpL * filterCoeff + whiteL * (1 - filterCoeff);
      lpR = lpR * filterCoeff + whiteR * (1 - filterCoeff);

      hpOutL = lpL - hpInL + R * hpOutL;
      hpInL = lpL;
      hpOutR = lpR - hpInR + R * hpOutR;
      hpInR = lpR;

      left[i] += hpOutL * 0.45;
      right[i] += hpOutR * 0.45;
    }

    cachedImpulseBuffer = buffer;
    return buffer;
  }

  // --------------------------------------------------------------------------
  // Whimsy Machine Synth Voice Patches & Schedulers
  // (Adapted from whimsy-machine/src/voices.mjs)
  // --------------------------------------------------------------------------
  const layer = (type, ratio, detune, gain, side = 'center', chorus = false) => ({
    type, ratio, detune, gain, side, chorus
  });
  const tone = (type, ratio, detune, gain) => ({ type, ratio, detune, gain });

  const VOICES = {
    velvet_pad: {
      id: 'velvet_pad',
      label: 'Velvet Pad',
      pad: {
        level: 0.30,
        attack: { share: 0.32, min: 0.14, max: 0.65 },
        sustain: 0.82,
        sustainTau: 0.4,
        release: 0.85,
        tail: 1.5,
        filter: { type: 'lowpass', q: 0.6, base: 440, peak: 1750, settle: 1250, settleTau: 0.5 },
        width: 0.55,
        chorus: { rate: 0.24, depth: 6 },
        root: [layer('triangle', 1, 0, 0.55, 'center', false)],
        upper: [
          layer('sawtooth', 1, -8, 0.28, 'left', true),
          layer('sawtooth', 1, 8, 0.28, 'right', true),
          layer('triangle', 1, 0, 0.32, 'center', false)
        ]
      },
      pluck: {
        level: 0.105,
        accentLevel: 0.145,
        attack: 0.006,
        decay: { share: 1.5, min: 0.14, max: 0.5 },
        tail: 0.05,
        filter: { type: 'lowpass', q: 1.2, base: 2900, accentBase: 3500, to: 680 },
        layers: [tone('triangle', 1, 0, 1), tone('square', 1, 4, 0.18)]
      },
      lead: {
        level: 0.17,
        attack: 0.035,
        sustain: 0.78,
        sustainTau: 0.2,
        releaseTau: 0.07,
        minLength: 0.14,
        tail: 0.3,
        glide: 0.065,
        filter: { type: 'lowpass', q: 0.7, base: 2400 },
        vibrato: { rate: 5.1, depth: 8, delayMax: 0.42, delayShare: 0.55 },
        layers: [tone('sine', 1, 0, 0.6), tone('triangle', 1, 0, 0.32), tone('sine', 2, 0, 0.08)]
      }
    },

    harmonium: {
      id: 'harmonium',
      label: 'Harmonium',
      pad: {
        level: 0.33,
        attack: { share: 0.42, min: 0.20, max: 0.78 },
        sustain: 0.88,
        sustainTau: 0.55,
        release: 0.48,
        tail: 1.5,
        filter: { type: 'lowpass', q: 2.0, base: 680, peak: 2100, settle: 1620, settleTau: 0.55 },
        width: 0.42,
        chorus: { rate: 0.4, depth: 3.5 },
        tremolo: { rate: 4.5, depth: 0.06 },
        root: [layer('square', 1, 0, 0.34), layer('sawtooth', 2, 0, 0.09)],
        upper: [
          layer('square', 1, -4, 0.22, 'left', true),
          layer('square', 1, 4, 0.22, 'right', true),
          layer('sawtooth', 1, 0, 0.12)
        ]
      },
      pluck: {
        level: 0.095,
        accentLevel: 0.13,
        attack: 0.011,
        decay: { share: 1.35, min: 0.14, max: 0.48 },
        tail: 0.05,
        filter: { type: 'lowpass', q: 1.9, base: 2350, accentBase: 2850, to: 880 },
        layers: [tone('square', 1, 0, 0.48), tone('triangle', 1, 3, 0.58)]
      },
      lead: {
        level: 0.175,
        attack: 0.055,
        sustain: 0.88,
        sustainTau: 0.28,
        releaseTau: 0.075,
        minLength: 0.14,
        tail: 0.3,
        glide: 0.045,
        filter: { type: 'lowpass', q: 1.4, base: 1900 },
        vibrato: { rate: 4.9, depth: 5, delayMax: 0.45, delayShare: 0.55 },
        layers: [tone('square', 1, 0, 0.32), tone('triangle', 1, 0, 0.46), tone('sawtooth', 2, 0, 0.05)]
      }
    },

    glass_harmonica: {
      id: 'glass_harmonica',
      label: 'Glass Harmonica',
      pad: {
        level: 0.28,
        attack: { share: 0.48, min: 0.26, max: 1.0 },
        sustain: 0.75,
        sustainTau: 0.75,
        release: 1.4,
        tail: 1.5,
        filter: { type: 'lowpass', q: 0.5, base: 2300, peak: 3900, settle: 3000, settleTau: 0.75 },
        width: 0.58,
        chorus: { rate: 0.16, depth: 4 },
        tremolo: { rate: 3.2, depth: 0.09 },
        root: [layer('sine', 1, 0, 0.58), layer('sine', 2.76, 0, 0.07)],
        upper: [
          layer('sine', 1, -3, 0.38, 'left', true),
          layer('sine', 1, 3, 0.38, 'right', true),
          layer('sine', 2.76, 0, 0.05)
        ]
      },
      pluck: {
        level: 0.085,
        accentLevel: 0.115,
        attack: 0.018,
        decay: { share: 2.3, min: 0.28, max: 1.0 },
        tail: 0.08,
        filter: { type: 'lowpass', q: 0.5, base: 4600, accentBase: 5500, to: 2300 },
        layers: [tone('sine', 1, 0, 0.95), tone('sine', 2.76, 0, 0.16)]
      },
      lead: {
        level: 0.165,
        attack: 0.075,
        sustain: 0.8,
        sustainTau: 0.38,
        releaseTau: 0.14,
        minLength: 0.17,
        tail: 0.5,
        glide: 0.085,
        filter: { type: 'lowpass', q: 0.5, base: 3600 },
        vibrato: { rate: 4.5, depth: 5.5, delayMax: 0.45, delayShare: 0.55 },
        layers: [tone('sine', 1, 0, 0.72), tone('triangle', 1, 0, 0.16), tone('sine', 2.76, 0, 0.05)]
      }
    },

    theatre_organ: {
      id: 'theatre_organ',
      label: 'Boardwalk Organ',
      pad: {
        level: 0.21,
        attack: { share: 0.06, min: 0.02, max: 0.07 },
        sustain: 0.96,
        sustainTau: 0.45,
        release: 0.32,
        tail: 1.6,
        filter: { type: 'lowpass', q: 0.5, base: 3300, peak: 3400, settle: 3200, settleTau: 0.5 },
        width: 0.38,
        chorus: { rate: 0.5, depth: 2.2 },
        tremolo: { rate: 6.5, depth: 0.19 },
        root: [layer('sine', 1, 0, 0.5), layer('sine', 2, 0, 0.28), layer('sine', 3, 0, 0.15)],
        upper: [
          layer('sine', 1, 0, 0.48),
          layer('sine', 2, 0, 0.28, 'left', true),
          layer('sine', 3, 0, 0.15, 'right', true)
        ]
      },
      pluck: {
        level: 0.135,
        accentLevel: 0.18,
        attack: 0.005,
        decay: { share: 1.2, min: 0.12, max: 0.38 },
        tail: 0.05,
        filter: { type: 'lowpass', q: 0.5, base: 3900, accentBase: 4700, to: 2200 },
        layers: [tone('sine', 1, 0, 0.58), tone('sine', 2, 0, 0.32), tone('sine', 3, 0, 0.18)]
      },
      lead: {
        level: 0.22,
        attack: 0.015,
        sustain: 0.94,
        sustainTau: 0.28,
        releaseTau: 0.045,
        minLength: 0.14,
        tail: 0.24,
        glide: 0.035,
        filter: { type: 'lowpass', q: 0.5, base: 4100 },
        vibrato: { rate: 6.5, depth: 9, delayMax: 0.2, delayShare: 0.4 },
        tremolo: { rate: 6.5, depth: 0.17 },
        layers: [tone('sine', 1, 0, 0.54), tone('sine', 2, 0, 0.26), tone('sine', 4, 0, 0.09)]
      }
    },

    string_machine: {
      id: 'string_machine',
      label: 'String Machine',
      pad: {
        level: 0.36,
        attack: { share: 0.38, min: 0.18, max: 0.72 },
        sustain: 0.88,
        sustainTau: 0.5,
        release: 1.0,
        tail: 1.5,
        filter: { type: 'lowpass', q: 0.7, base: 820, peak: 2500, settle: 1950, settleTau: 0.6 },
        width: 0.66,
        chorus: { rate: 4.6, depth: 6.5 },
        root: [
          layer('sawtooth', 1, -6, 0.28, 'left', true),
          layer('sawtooth', 1, 6, 0.28, 'right', true),
          layer('sawtooth', 1, 0, 0.24)
        ],
        upper: [
          layer('sawtooth', 1, -6, 0.28, 'left', true),
          layer('sawtooth', 1, 6, 0.28, 'right', true),
          layer('sawtooth', 1, 0, 0.24)
        ]
      },
      pluck: {
        level: 0.105,
        accentLevel: 0.145,
        attack: 0.01,
        decay: { share: 1.7, min: 0.15, max: 0.55 },
        tail: 0.05,
        filter: { type: 'lowpass', q: 1.0, base: 2700, accentBase: 3300, to: 820 },
        layers: [tone('sawtooth', 1, -5, 0.38), tone('sawtooth', 1, 5, 0.38), tone('triangle', 1, 0, 0.38)]
      },
      lead: {
        level: 0.22,
        attack: 0.048,
        sustain: 0.84,
        sustainTau: 0.28,
        releaseTau: 0.09,
        minLength: 0.14,
        tail: 0.36,
        glide: 0.075,
        filter: { type: 'lowpass', q: 0.8, base: 2200 },
        vibrato: { rate: 5.4, depth: 9, delayMax: 0.38, delayShare: 0.55 },
        layers: [tone('sawtooth', 1, -5, 0.45), tone('sawtooth', 1, 5, 0.45), tone('triangle', 1, 0, 0.2)]
      }
    },

    music_box: {
      id: 'music_box',
      label: 'Music Box',
      pad: {
        level: 0.42,
        attack: { share: 0, min: 0.005, max: 0.005 },
        sustain: 1,
        sustainTau: 0.5,
        release: 0.6,
        tail: 1.5,
        filter: { type: 'lowpass', q: 0.5, base: 5600, peak: 5600, settle: 5600, settleTau: 0.5 },
        width: 0.48,
        chorus: { rate: 0.2, depth: 1 },
        strike: { strum: 0.042, decay: 1.35 },
        root: [layer('triangle', 1, 0, 0.85), layer('sine', 4, 0, 0.15)],
        upper: [
          layer('triangle', 1, 0, 0.80, 'left'),
          layer('sine', 4, 0, 0.13, 'right'),
          layer('sine', 2, 0, 0.15)
        ]
      },
      pluck: {
        level: 0.115,
        accentLevel: 0.155,
        attack: 0.003,
        decay: { share: 2.8, min: 0.24, max: 1.1 },
        tail: 0.06,
        filter: { type: 'lowpass', q: 0.5, base: 5800, accentBase: 6600, to: 2800 },
        layers: [tone('triangle', 1, 0, 0.88), tone('sine', 4, 0, 0.19)]
      },
      lead: {
        level: 0.24,
        attack: 0.004,
        sustain: 0.22,
        sustainTau: 0.28,
        releaseTau: 0.19,
        minLength: 0.14,
        tail: 0.72,
        glide: 0.005,
        filter: { type: 'lowpass', q: 0.5, base: 5600 },
        vibrato: { rate: 0.2, depth: 0, delayMax: 0.1, delayShare: 0.5 },
        layers: [tone('triangle', 1, 0, 0.64), tone('sine', 4, 0, 0.12), tone('sine', 2, 0, 0.1)]
      }
    }
  };

  function connectThroughTremolo(context, env, destination, tremolo, start) {
    if (!tremolo) {
      env.connect(destination);
      return null;
    }
    const swell = context.createGain();
    swell.gain.value = 1 - tremolo.depth;
    const lfo = context.createOscillator();
    const depth = context.createGain();
    depth.gain.value = tremolo.depth;
    swell.gain.setValueAtTime(1 - tremolo.depth, start);
    lfo.frequency.setValueAtTime(tremolo.rate, start);
    depth.gain.setValueAtTime(tremolo.depth, start);
    lfo.connect(depth).connect(swell.gain);
    env.connect(swell).connect(destination);
    return lfo;
  }

  function scheduleVoicePad(context, destination, voice, notes, { start, sounding, level = 1 }) {
    if (!notes || notes.length === 0) return;
    const pad = voice.pad;
    const safeStart = Math.max(context.currentTime + 0.004, start);
    const dur = Math.max(0.12, sounding);
    const attack = clamp(dur * pad.attack.share, pad.attack.min, pad.attack.max);
    const end = safeStart + dur;
    const peak = Math.max(SILENT, (pad.level * level) / Math.sqrt(notes.length));

    const env = context.createGain();
    env.gain.setValueAtTime(SILENT, safeStart);
    env.gain.linearRampToValueAtTime(peak, safeStart + attack);
    env.gain.setTargetAtTime(Math.max(SILENT, peak * pad.sustain), safeStart + attack, pad.sustainTau);
    env.gain.setTargetAtTime(SILENT, end, pad.release / 4);

    const filter = context.createBiquadFilter();
    filter.type = pad.filter.type;
    filter.Q.setValueAtTime(pad.filter.q, safeStart);
    filter.frequency.setValueAtTime(pad.filter.base, safeStart);
    filter.frequency.exponentialRampToValueAtTime(pad.filter.peak, safeStart + attack);
    filter.frequency.setTargetAtTime(pad.filter.settle, safeStart + attack, pad.filter.settleTau);

    const tremolo = connectThroughTremolo(context, filter.connect(env), destination, pad.tremolo, safeStart);

    const canPan = typeof context.createStereoPanner === 'function';
    const left = canPan ? context.createStereoPanner() : null;
    const right = canPan ? context.createStereoPanner() : null;
    if (left && right) {
      left.pan.setValueAtTime(-pad.width, safeStart);
      right.pan.setValueAtTime(pad.width, safeStart);
      left.connect(filter);
      right.connect(filter);
    }
    const sides = { center: filter, left: left || filter, right: right || filter };

    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.frequency.setValueAtTime(pad.chorus.rate, safeStart);
    lfoDepth.gain.setValueAtTime(pad.chorus.depth, safeStart);
    lfo.connect(lfoDepth);

    const stopAt = end + pad.release * pad.tail;
    const strike = pad.strike;

    for (let index = 0; index < notes.length; index++) {
      const midi = notes[index];
      const freq = midiToFrequency(midi);
      const noteStart = strike ? safeStart + Math.min(index * strike.strum, dur * 0.45) : safeStart;
      const layers = index === 0 ? pad.root : pad.upper;
      for (const lyr of layers) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = lyr.type;
        osc.frequency.setValueAtTime(freq * lyr.ratio, noteStart);
        osc.detune.setValueAtTime(lyr.detune, noteStart);
        if (lyr.chorus) lfoDepth.connect(osc.detune);
        if (strike) {
          gain.gain.setValueAtTime(SILENT, noteStart);
          gain.gain.linearRampToValueAtTime(Math.max(SILENT, lyr.gain), noteStart + 0.004);
          gain.gain.exponentialRampToValueAtTime(SILENT, noteStart + strike.decay);
        } else {
          gain.gain.setValueAtTime(lyr.gain, safeStart);
        }
        osc.connect(gain).connect(sides[lyr.side]);
        osc.start(noteStart);
        osc.stop(stopAt);
        cleanupOnEnded(osc, gain);
      }
    }

    lfo.start(safeStart);
    lfo.stop(stopAt);
    if (tremolo) {
      tremolo.start(safeStart);
      tremolo.stop(stopAt);
    }
    cleanupOnEnded(lfo, env, filter, left, right, lfoDepth);
  }

  function scheduleVoicePluck(context, destination, voice, midi, { start, duration, accent = false, pan = 0, detuneCents = 0 }) {
    const pluck = voice.pluck;
    const safeStart = Math.max(context.currentTime + 0.004, start);
    const decay = clamp(duration * pluck.decay.share, pluck.decay.min, pluck.decay.max);
    const peak = Math.max(SILENT, accent ? pluck.accentLevel : pluck.level);
    const freq = midiToFrequency(midi);

    const env = context.createGain();
    env.gain.setValueAtTime(SILENT, safeStart);
    env.gain.linearRampToValueAtTime(peak, safeStart + pluck.attack);
    env.gain.exponentialRampToValueAtTime(SILENT, safeStart + decay);

    const filter = context.createBiquadFilter();
    filter.type = pluck.filter.type;
    filter.Q.setValueAtTime(pluck.filter.q, safeStart);
    filter.frequency.setValueAtTime(accent ? pluck.filter.accentBase : pluck.filter.base, safeStart);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, pluck.filter.to), safeStart + decay);

    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    if (panner) panner.pan.setValueAtTime(clamp(pan, -1, 1), safeStart);
    filter.connect(env);
    (panner ? env.connect(panner) : env).connect(destination);

    let lastOsc = null;
    for (const lyr of pluck.layers) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = lyr.type;
      osc.frequency.setValueAtTime(freq * lyr.ratio, safeStart);
      osc.detune.setValueAtTime(lyr.detune + detuneCents, safeStart);
      gain.gain.setValueAtTime(lyr.gain, safeStart);
      osc.connect(gain).connect(filter);
      osc.start(safeStart);
      osc.stop(safeStart + decay + pluck.tail);
      cleanupOnEnded(osc, gain);
      lastOsc = osc;
    }
    cleanupOnEnded(lastOsc, env, filter, panner);
  }

  function scheduleVoiceLead(context, destination, voice, midi, { start, duration, glideFrom = null, level = 1, detuneCents = 0 }) {
    const lead = voice.lead;
    const safeStart = Math.max(context.currentTime + 0.004, start);
    const sounding = Math.max(lead.minLength, duration);
    const freq = midiToFrequency(midi);
    const fromFreq = glideFrom ? midiToFrequency(glideFrom) : freq;
    const peak = Math.max(SILENT, lead.level * level);

    const env = context.createGain();
    env.gain.setValueAtTime(SILENT, safeStart);
    env.gain.linearRampToValueAtTime(peak, safeStart + lead.attack);
    env.gain.setTargetAtTime(Math.max(SILENT, peak * lead.sustain), safeStart + lead.attack, lead.sustainTau);
    env.gain.setTargetAtTime(SILENT, safeStart + sounding, lead.releaseTau);

    const filter = context.createBiquadFilter();
    filter.type = lead.filter.type;
    filter.frequency.setValueAtTime(lead.filter.base, safeStart);
    filter.Q.setValueAtTime(lead.filter.q, safeStart);

    const tremolo = connectThroughTremolo(context, filter.connect(env), destination, lead.tremolo, safeStart);

    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    vibrato.frequency.setValueAtTime(Math.max(0.1, lead.vibrato.rate), safeStart);
    vibratoDepth.gain.setValueAtTime(0, safeStart);
    vibratoDepth.gain.linearRampToValueAtTime(
      lead.vibrato.depth,
      safeStart + Math.min(lead.vibrato.delayMax, sounding * lead.vibrato.delayShare)
    );
    vibrato.connect(vibratoDepth);

    const stopAt = safeStart + sounding + lead.tail;
    for (const lyr of lead.layers) {
      const osc = context.createOscillator();
      const lvl = context.createGain();
      osc.type = lyr.type;
      osc.frequency.setValueAtTime(fromFreq * lyr.ratio, safeStart);
      osc.frequency.exponentialRampToValueAtTime(freq * lyr.ratio, safeStart + (glideFrom ? lead.glide : 0.005));
      osc.detune.setValueAtTime(lyr.detune + detuneCents, safeStart);
      vibratoDepth.connect(osc.detune);
      lvl.gain.setValueAtTime(lyr.gain, safeStart);
      osc.connect(lvl).connect(filter);
      osc.start(safeStart);
      osc.stop(stopAt);
      cleanupOnEnded(osc, lvl);
    }

    vibrato.start(safeStart);
    vibrato.stop(stopAt);
    if (tremolo) {
      tremolo.start(safeStart);
      tremolo.stop(stopAt);
    }
    cleanupOnEnded(vibrato, env, filter, vibratoDepth);
  }

  // --------------------------------------------------------------------------
  // Whimsy Rhythm Section: Drums, Walking Upright Bass, Just-Intonation Chimes
  // (Adapted from whimsy-machine/src/schedulers.mjs)
  // --------------------------------------------------------------------------
  function scheduleKickAndSnare(context, destination, rootMidi, beatMode, kickVel, snareVel, at, stepDuration, stepIndex) {
    const safeAt = Math.max(context.currentTime + 0.004, at);

    if (kickVel > 0) {
      const kickOsc = context.createOscillator();
      const kickGain = context.createGain();
      const rootBase = midiToFrequency(rootMidi - 5);
      let startFreq = rootBase;
      let endFreq = Math.max(32, midiToFrequency(rootMidi - 24));
      let decay = clamp(stepDuration * 0.62, 0.09, 0.24);
      let kickWave = 'sine';

      if (beatMode === 1) {
        startFreq = rootBase * 0.85;
        endFreq = 30;
        decay = Math.min(0.30, stepDuration * 0.82);
      } else if (beatMode === 2) {
        startFreq = rootBase * 1.32;
        endFreq = 48;
        decay = Math.min(0.14, stepDuration * 0.45);
        kickWave = 'triangle';
      }

      const peak = kickVel === 2 ? 0.24 : 0.135;
      kickOsc.type = kickWave;
      kickOsc.frequency.setValueAtTime(startFreq, safeAt);
      kickOsc.frequency.exponentialRampToValueAtTime(endFreq, safeAt + decay);
      kickGain.gain.setValueAtTime(SILENT, safeAt);
      kickGain.gain.exponentialRampToValueAtTime(peak, safeAt + 0.006);
      kickGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + decay + 0.02);
      kickOsc.connect(kickGain).connect(destination);
      kickOsc.start(safeAt);
      kickOsc.stop(safeAt + decay + 0.04);
      cleanupOnEnded(kickOsc, kickGain);

      if (beatMode === 2 || beatMode === 4) {
        const clickOsc = context.createOscillator();
        const clickGain = context.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(1350, safeAt);
        clickOsc.frequency.exponentialRampToValueAtTime(120, safeAt + 0.012);
        clickGain.gain.setValueAtTime(SILENT, safeAt);
        clickGain.gain.exponentialRampToValueAtTime(peak * 0.42, safeAt + 0.002);
        clickGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + 0.014);
        clickOsc.connect(clickGain).connect(destination);
        clickOsc.start(safeAt);
        clickOsc.stop(safeAt + 0.02);
        cleanupOnEnded(clickOsc, clickGain);
      }
    }

    if (snareVel > 0) {
      const noise = context.createBufferSource();
      const snareFilter = context.createBiquadFilter();
      const snareGain = context.createGain();
      noise.buffer = ensureNoiseBuffer(context);
      snareFilter.type = 'bandpass';

      let centerFreq = 1180 + (stepIndex % 3) * 140;
      let filterQ = 2.4;
      let snareDecay = snareVel === 2 ? 0.115 : 0.068;

      if (beatMode === 1) {
        centerFreq = 820;
        filterQ = 1.8;
        snareDecay = snareVel === 2 ? 0.145 : 0.085;
      } else if (beatMode === 4) {
        centerFreq = 2650;
        filterQ = 3.8;
        snareDecay = 0.052;
      } else if (beatMode === 6) {
        centerFreq = 1020 + Math.sin(stepIndex) * 280;
        filterQ = 2.0;
      }

      snareFilter.frequency.setValueAtTime(centerFreq, safeAt);
      snareFilter.Q.setValueAtTime(filterQ, safeAt);
      const peak = snareVel === 2 ? 0.135 : 0.068;
      snareGain.gain.setValueAtTime(SILENT, safeAt);
      snareGain.gain.exponentialRampToValueAtTime(peak, safeAt + 0.004);
      snareGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + snareDecay);
      noise.connect(snareFilter).connect(snareGain).connect(destination);
      noise.start(safeAt);
      noise.stop(safeAt + snareDecay + 0.02);
      cleanupOnEnded(noise, snareFilter, snareGain);

      const bodyOsc = context.createOscillator();
      const bodyGain = context.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(midiToFrequency(rootMidi - 7), safeAt);
      bodyOsc.frequency.exponentialRampToValueAtTime(midiToFrequency(rootMidi - 14), safeAt + 0.05);
      bodyGain.gain.setValueAtTime(SILENT, safeAt);
      bodyGain.gain.exponentialRampToValueAtTime(peak * 0.48, safeAt + 0.004);
      bodyGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + 0.06);
      bodyOsc.connect(bodyGain).connect(destination);
      bodyOsc.start(safeAt);
      bodyOsc.stop(safeAt + 0.075);
      cleanupOnEnded(bodyOsc, bodyGain);
    }
  }

  function scheduleHat(context, destination, rootMidi, beatMode, hatVel, at) {
    if (hatVel <= 0) return;
    const safeAt = Math.max(context.currentTime + 0.004, at);
    const baseHatFreq = midiToFrequency(rootMidi + (beatMode === 4 ? 26 : 20));
    const ratios = hatVel === 2 ? [1, 1.48] : [1];
    for (let idx = 0; idx < ratios.length; idx++) {
      const hatOsc = context.createOscillator();
      const hatGain = context.createGain();
      hatOsc.type = idx === 0 ? 'triangle' : 'sine';
      hatOsc.frequency.setValueAtTime(baseHatFreq * ratios[idx], safeAt);
      const decay = hatVel === 2 ? 0.125 : 0.046;
      const peak = (hatVel === 2 ? 0.062 : 0.034) * (idx === 0 ? 1 : 0.58);
      hatGain.gain.setValueAtTime(SILENT, safeAt);
      hatGain.gain.exponentialRampToValueAtTime(peak, safeAt + 0.003);
      hatGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + decay);
      hatOsc.connect(hatGain).connect(destination);
      hatOsc.start(safeAt);
      hatOsc.stop(safeAt + decay + 0.02);
      cleanupOnEnded(hatOsc, hatGain);
    }

    // Crisp brush whisper on accented hats
    if (hatVel === 2) {
      const brush = context.createBufferSource();
      const hp = context.createBiquadFilter();
      const g = context.createGain();
      brush.buffer = ensureNoiseBuffer(context);
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(5200, safeAt);
      g.gain.setValueAtTime(0.028, safeAt);
      g.gain.exponentialRampToValueAtTime(SILENT, safeAt + 0.075);
      brush.connect(hp).connect(g).connect(destination);
      brush.start(safeAt);
      brush.stop(safeAt + 0.09);
      cleanupOnEnded(brush, hp, g);
    }
  }

  // Upright double bass ("WALKING CELLAR") with fingerboard pluck transient
  function scheduleWalkingBass(context, destination, midi, nextMidi, at, stepDuration, accent, slide) {
    const safeAt = Math.max(context.currentTime + 0.004, at);
    const baseMidi = foldIntoRange(midi, 31, 52);
    const glideMidi = foldIntoRange(nextMidi, 31, 52);
    const freq = midiToFrequency(baseMidi);
    const glideFreq = midiToFrequency(glideMidi);
    const duration = Math.max(0.09, stepDuration * (accent ? 0.82 : 0.62));
    const peak = accent ? 0.21 : 0.155;

    const subOsc = context.createOscillator();
    const upperOsc = context.createOscillator();
    const upperGain = context.createGain();
    const bassFilter = context.createBiquadFilter();
    const amp = context.createGain();

    subOsc.type = 'sine';
    upperOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq, safeAt);
    upperOsc.frequency.setValueAtTime(freq * 2, safeAt);

    if (slide && glideMidi !== baseMidi) {
      const glideStart = safeAt + duration * 0.55;
      subOsc.frequency.setValueAtTime(freq, glideStart);
      subOsc.frequency.exponentialRampToValueAtTime(glideFreq, safeAt + duration);
      upperOsc.frequency.setValueAtTime(freq * 2, glideStart);
      upperOsc.frequency.exponentialRampToValueAtTime(glideFreq * 2, safeAt + duration);
    }

    upperGain.gain.setValueAtTime(accent ? 0.34 : 0.22, safeAt);
    bassFilter.type = 'lowpass';
    bassFilter.Q.setValueAtTime(accent ? 2.4 : 1.5, safeAt);
    bassFilter.frequency.setValueAtTime(Math.min(1650, freq * (accent ? 5.0 : 3.4) + 140), safeAt);
    bassFilter.frequency.exponentialRampToValueAtTime(Math.max(85, freq * 1.5), safeAt + duration);

    amp.gain.setValueAtTime(SILENT, safeAt);
    amp.gain.exponentialRampToValueAtTime(peak, safeAt + 0.011);
    amp.gain.exponentialRampToValueAtTime(SILENT, safeAt + duration + 0.025);

    subOsc.connect(bassFilter);
    upperOsc.connect(upperGain).connect(bassFilter);
    bassFilter.connect(amp).connect(destination);

    subOsc.start(safeAt);
    upperOsc.start(safeAt);
    subOsc.stop(safeAt + duration + 0.04);
    upperOsc.stop(safeAt + duration + 0.04);
    cleanupOnEnded(subOsc, upperGain, bassFilter, amp);
    cleanupOnEnded(upperOsc);

    // Upright fingerboard pluck transient
    const pluckOsc = context.createOscillator();
    const pluckGain = context.createGain();
    pluckOsc.type = 'sine';
    pluckOsc.frequency.setValueAtTime(freq * 3.5, safeAt);
    pluckOsc.frequency.exponentialRampToValueAtTime(freq * 1.5, safeAt + 0.02);
    pluckGain.gain.setValueAtTime(SILENT, safeAt);
    pluckGain.gain.exponentialRampToValueAtTime(peak * 0.32, safeAt + 0.003);
    pluckGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + 0.025);
    pluckOsc.connect(pluckGain).connect(destination);
    pluckOsc.start(safeAt);
    pluckOsc.stop(safeAt + 0.03);
    cleanupOnEnded(pluckOsc, pluckGain);
  }

  // FRACTRAN Just-Intonation overtone bell + Piet spectral shimmer
  function scheduleHarborChime(context, destination, chordRootMidi, ratioValue, at, stepDuration, accented, detuneCents = 0) {
    const safeAt = Math.max(context.currentTime + 0.004, at);
    const rootMidi = foldIntoRange(chordRootMidi + 12, 60, 79);
    const bellFreq = midiToFrequency(rootMidi) * ratioValue;
    const bellDuration = Math.max(0.16, stepDuration * (accented ? 1.45 : 0.95));
    const bellPeak = accented ? 0.048 : 0.032;

    const bellOsc = context.createOscillator();
    const bellGain = context.createGain();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(Math.min(5200, bellFreq), safeAt);
    bellOsc.detune.setValueAtTime(detuneCents, safeAt);
    bellGain.gain.setValueAtTime(SILENT, safeAt);
    bellGain.gain.exponentialRampToValueAtTime(bellPeak, safeAt + 0.006);
    bellGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + bellDuration);
    bellOsc.connect(bellGain).connect(destination);
    bellOsc.start(safeAt);
    bellOsc.stop(safeAt + bellDuration + 0.04);
    cleanupOnEnded(bellOsc, bellGain);

    if (accented) {
      const overOsc = context.createOscillator();
      const overGain = context.createGain();
      overOsc.type = 'sine';
      overOsc.frequency.setValueAtTime(Math.min(5800, bellFreq * 1.5), safeAt);
      overGain.gain.setValueAtTime(SILENT, safeAt);
      overGain.gain.exponentialRampToValueAtTime(bellPeak * 0.30, safeAt + 0.005);
      overGain.gain.exponentialRampToValueAtTime(SILENT, safeAt + bellDuration * 0.65);
      overOsc.connect(overGain).connect(destination);
      overOsc.start(safeAt);
      overOsc.stop(safeAt + bellDuration * 0.65 + 0.03);
      cleanupOnEnded(overOsc, overGain);
    }
  }

  // --------------------------------------------------------------------------
  // Bespoke-Style Arranged Sections & Pass Parser (Adapted from bespoke/src/audio.zig
  // & bespoke/proofs/music.zig, D-089: 8 written sections `a..d2` + `order()` passes
  // with key transpositions and PartMask mutes so every station runs > 2 minutes)
  // --------------------------------------------------------------------------
  const SECTION_NAMES = ['a', 'a2', 'b', 'b2', 'c', 'c2', 'd', 'd2'];
  const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const _ = null; // Musical rest in 12-step lead melodies

  function chordNameAt(rootMidi, degree, suffix) {
    const pc = (((rootMidi + degree) % 12) + 12) % 12;
    return `${PITCH_NAMES[pc]}${suffix}`;
  }

  function reg(degree, suffix, tones) {
    return { degree, suffix, tones };
  }

  // Parses one arrangement pass token like `a/ldpm`, `b+5`, `c2/dh`, `b2-2`
  // Mute flags:
  //   l = lead, b = bass, c = chords (pad), d = all drums (kick+snare+hat),
  //   k = kick & snare only, h = hats only, p = arp plucks, m = chimes
  function passOf(tok) {
    let nameEnd = tok.length;
    for (let i = 0; i < tok.length; i++) {
      const ch = tok[i];
      if (ch === '+' || ch === '-' || ch === '/') {
        nameEnd = i;
        break;
      }
    }
    const name = tok.slice(0, nameEnd);
    const sectionIdx = SECTION_NAMES.indexOf(name);
    if (sectionIdx === -1) {
      throw new Error(`Unknown section in arrangement: ${tok}`);
    }

    const slashIdx = tok.indexOf('/');
    const muteAt = slashIdx === -1 ? tok.length : slashIdx;
    let transpose = 0;
    if (nameEnd < muteAt) {
      transpose = parseInt(tok.slice(nameEnd, muteAt), 10);
      if (!Number.isFinite(transpose) || transpose < -24 || transpose > 24) {
        throw new Error(`Bad key transposition in arrangement: ${tok}`);
      }
    }

    const mute = {
      lead: false,
      bass: false,
      chords: false,
      drums: false,
      kickSnare: false,
      hats: false,
      arp: false,
      chimes: false
    };

    if (muteAt < tok.length) {
      const flags = tok.slice(muteAt + 1);
      for (let i = 0; i < flags.length; i++) {
        const c = flags[i];
        if (c === 'l') mute.lead = true;
        else if (c === 'b') mute.bass = true;
        else if (c === 'c') mute.chords = true;
        else if (c === 'd') { mute.drums = true; mute.kickSnare = true; mute.hats = true; }
        else if (c === 'k') mute.kickSnare = true;
        else if (c === 'h') mute.hats = true;
        else if (c === 'p') mute.arp = true;
        else if (c === 'm') mute.chimes = true;
        else throw new Error(`Unknown mute flag "${c}" in arrangement token: ${tok}`);
      }
    }

    return { token: tok, sectionName: name, section: sectionIdx, transpose, mute };
  }

  function order(text) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) throw new Error('Empty arrangement order');
    return tokens.map(passOf);
  }

  function makeSection(defaults, spec) {
    const sec = {
      padVoice: spec.padVoice || defaults.padVoice,
      pluckVoice: spec.pluckVoice || defaults.pluckVoice,
      leadVoice: spec.leadVoice || defaults.leadVoice,
      beatMode: spec.beatMode !== undefined ? spec.beatMode : defaults.beatMode,
      regions: spec.regions,
      leadNotes: spec.leadNotes,
      bassWalk: spec.bassWalk || defaults.bassWalk,
      bassGate: spec.bassGate || defaults.bassGate,
      kick: spec.kick || defaults.kick,
      snare: spec.snare || defaults.snare,
      hat: spec.hat || defaults.hat,
      arpSteps: spec.arpSteps || defaults.arpSteps,
      chimeRatios: spec.chimeRatios || defaults.chimeRatios
    };
    if (!sec.regions || sec.regions.length !== 4) {
      throw new Error('Section requires 4 harmonic regions');
    }
    for (const key of ['leadNotes', 'bassWalk', 'bassGate', 'kick', 'snare', 'hat', 'arpSteps', 'chimeRatios']) {
      if (!sec[key] || sec[key].length !== 12) {
        throw new Error(`Section array ${key} must have 12 steps`);
      }
    }
    return sec;
  }

  // --------------------------------------------------------------------------
  // Four Fully Arranged Harbor Stations (8 sections `a..d2` each, > 2m runtime)
  // --------------------------------------------------------------------------

  // 1. 94.2 FM · Sunny Pier Bossa (F major, 102 BPM)
  // A: Ipanema theme; B: sunlit IV -> iv minor-plagal chorus; C: trade-wind salon bridge; D: montuno breeze
  const BOSSA_DEFAULTS = {
    padVoice: 'velvet_pad',
    pluckVoice: 'string_machine',
    leadVoice: 'glass_harmonica',
    beatMode: 6,
    bassWalk: [0, 0, 7, 0, 0, 7, 0, 0, 7, 0, 7, 0],
    bassGate: [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 1, 0],
    kick:     [2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0],
    snare:    [0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 0],
    hat:      [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2],
    arpSteps: [0, 1, 2, 0, 2, 1, 0, 1, 3, 0, 2, 1],
    chimeRatios: [1, 0, 5 / 4, 0, 3 / 2, 0, 9 / 8, 0, 5 / 3, 0, 3 / 2, 0]
  };

  const BOSSA_SECTIONS = [
    // a: Sunny Pier Theme
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(9, 'm7',   [0, 3, 7, 10]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [4, 7, 11, 12, 9, _, 5, 9, 12, 11, 7, _]
    }),
    // a2: Theme's Answer stepping warmly home
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '9',    [0, 4, 7, 10, 14])
      ],
      leadNotes: [7, 9, 12, 11, 7, 4, 5, 7, 9, 7, 4, _],
      snare:     [0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2, 1]
    }),
    // b: Sunlit Chorus (IVmaj7 -> ivm6 minor-plagal glow -> iii7 -> VI7)
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(5, 'm6',   [0, 3, 7, 9]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(9, '7alt', [0, 4, 7, 10])
      ],
      leadNotes: [9, _, 12, 12, 8, 5, 7, _, 11, 9, 4, _],
      bassWalk:  [0, 7, 12, 0, 7, 9, 0, 7, 10, 0, 4, 7],
      bassGate:  [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1],
      chimeRatios: [5 / 4, 0, 3 / 2, 6 / 5, 0, 5 / 3, 1, 0, 3 / 2, 5 / 4, 0, 2]
    }),
    // b2: Chorus Coming Home (ii7 -> V7 -> Imaj7 -> V7)
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [5, 9, 14, 12, 11, 7, 9, 7, 4, _, _, _],
      kick:      [2, 0, 1, 2, 0, 1, 2, 0, 0, 1, 0, 1]
    }),
    // c: Trade-Wind Bridge (spacious half-time salon reverie)
    makeSection(BOSSA_DEFAULTS, {
      leadVoice: 'velvet_pad',
      regions: [
        reg(9, 'm9',   [0, 3, 7, 10, 14]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(4, '7alt', [0, 4, 7, 10])
      ],
      leadNotes: [12, _, _, 11, _, 7, 9, _, _, 8, _, _],
      bassWalk:  [0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 7],
      bassGate:  [2, 0, 0, 2, 0, 1, 2, 0, 0, 2, 0, 1],
      kick:      [2, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0],
      snare:     [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      hat:       [1, 0, 2, 1, 0, 1, 1, 0, 2, 1, 0, 2]
    }),
    // c2: Bridge Turnaround climbing G -> A -> Bb -> C
    makeSection(BOSSA_DEFAULTS, {
      leadVoice: 'velvet_pad',
      regions: [
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [5, _, 9, 7, _, 11, 9, _, 12, 14, 11, _],
      bassWalk:  [0, 0, 7, 0, 0, 7, 0, 4, 7, 0, 7, 10],
      bassGate:  [2, 0, 1, 2, 0, 1, 2, 1, 1, 2, 1, 1],
      snare:     [0, 0, 1, 0, 0, 1, 0, 1, 1, 2, 1, 2]
    }),
    // d: Montuno Breeze (lively syncopated eighth-note dance)
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(2, 'm7',   [0, 3, 7, 10])
      ],
      leadNotes: [12, 9, 7, 9, 5, 9, 11, 7, 4, 9, 7, 5],
      arpSteps:  [0, 2, 3, 1, 3, 2, 0, 2, 3, 1, 2, 3],
      hat:       [2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2]
    }),
    // d2: Sunset Tag settling gently home
    makeSection(BOSSA_DEFAULTS, {
      regions: [
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(9, 'm7',   [0, 3, 7, 10]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [12, 11, 9, 7, 4, _, 5, 9, 7, 4, _, _],
      chimeRatios: [2, 0, 3 / 2, 5 / 4, 0, 1, 3 / 2, 0, 5 / 4, 1, 0, 0]
    })
  ];

  // 40 passes * 3.529 s = 141.2 seconds before repeat
  const BOSSA_ARRANGEMENT = order(
    'a/ldm a/lm a a2 b b2 a a2 c/d c2 d d2 b b2 a/k a2 d/l d d2 b+5 b2+5 a a2 c/dh c2/k d d2 b-2 b2-2 a a2 b/d b2 d d2 a a2 c2/ldp a/ld a2/ldpm'
  );

  // 2. 88.7 FM · Capstan Shanty & Hornpipe (D major / B minor, 114 BPM)
  // Inspired by Bespoke's Brackwater Tidewalk & Tavern Jig + Whimsy's Capstan Shanty
  const SHANTY_DEFAULTS = {
    padVoice: 'harmonium',
    pluckVoice: 'harmonium',
    leadVoice: 'harmonium',
    beatMode: 2,
    bassWalk: [0, 7, 0, 7, 0, 7, 0, 7, 0, 7, 0, 7],
    bassGate: [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 1, 1],
    kick:     [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1],
    snare:    [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 2, 1],
    hat:      [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 2],
    arpSteps: [0, 2, 1, 0, 2, 1, 0, 1, 2, 0, 2, 1],
    chimeRatios: [1, 0, 3 / 2, 1, 0, 4 / 3, 1, 0, 3 / 2, 5 / 4, 0, 2]
  };

  const SHANTY_SECTIONS = [
    // a: Capstan Theme
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(0, ' Maj', [0, 4, 7]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [0, 4, 7, 9, 7, _, 12, 9, 7, 7, 4, 2]
    }),
    // a2: Capstan Answer resolving on tonic D
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(0, ' Maj', [0, 4, 7]),
        reg(9, 'm7',   [0, 3, 7, 10]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(0, ' Maj', [0, 4, 7])
      ],
      leadNotes: [4, 7, 9, 12, 9, 7, 9, 7, 4, 0, _, _],
      snare:     [0, 1, 2, 0, 1, 2, 0, 1, 2, 2, 1, 2]
    }),
    // b: Halyard Singalong Chorus (soaring IV -> V -> iii -> vi)
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(9, 'm7',   [0, 3, 7, 10])
      ],
      leadNotes: [12, _, 14, 16, 14, 12, 11, _, 9, 12, 9, _],
      bassWalk:  [0, 4, 7, 0, 4, 7, 0, 3, 7, 0, 7, 10],
      bassGate:  [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1]
    }),
    // b2: Chorus Coming Into Port (IV -> V7 -> I -> I)
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(0, ' Maj', [0, 4, 7])
      ],
      leadNotes: [12, 14, 16, 14, 12, 11, 12, _, 7, 4, _, _],
      kick:      [2, 0, 1, 2, 0, 1, 2, 0, 2, 2, 0, 0]
    }),
    // c: Sea-Fog Watch Bridge (B minor half-time lament on Glass Harmonica)
    makeSection(SHANTY_DEFAULTS, {
      leadVoice: 'glass_harmonica',
      regions: [
        reg(9, 'm',    [0, 3, 7]),
        reg(4, 'm',    [0, 3, 7]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, 'sus4', [0, 5, 7])
      ],
      leadNotes: [9, _, _, 7, _, 4, 5, _, _, 7, _, _],
      bassWalk:  [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 7],
      bassGate:  [2, 0, 0, 2, 0, 0, 2, 0, 1, 2, 0, 1],
      kick:      [2, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0],
      snare:     [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
      hat:       [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 2]
    }),
    // c2: Watch Bell Rising (snare build back to the capstan)
    makeSection(SHANTY_DEFAULTS, {
      leadVoice: 'glass_harmonica',
      regions: [
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(9, 'm7',   [0, 3, 7, 10]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [5, _, 7, 9, _, 12, 12, 11, 9, 11, _, _],
      bassGate:  [2, 0, 1, 2, 0, 1, 2, 1, 1, 2, 1, 1],
      kick:      [2, 0, 0, 2, 0, 0, 2, 0, 1, 2, 2, 2],
      snare:     [0, 0, 1, 0, 0, 1, 0, 1, 1, 2, 2, 2]
    }),
    // d: Hornpipe Reel (dancing continuous eighth/triplet run!)
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(0, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [12, 9, 7, 9, 7, 4, 5, 7, 9, 11, 9, 7],
      bassGate:  [2, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1],
      hat:       [2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2]
    }),
    // d2: Hornpipe Landing Home
    makeSection(SHANTY_DEFAULTS, {
      regions: [
        reg(9, 'm7',   [0, 3, 7, 10]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, ' Maj', [0, 4, 7])
      ],
      leadNotes: [9, 12, 14, 12, 9, 7, 9, 7, 4, 12, _, _],
      snare:     [0, 1, 2, 0, 1, 2, 0, 2, 2, 2, 0, 0]
    })
  ];

  // 44 passes * 3.158 s = 138.9 seconds before repeat
  const SHANTY_ARRANGEMENT = order(
    'a/ldpm a/lmp a a2 b b2 a a2 c/dh c2 d d2 b b2 a/cp a2 d/l d d2 c/d c2/k b+5 b2+5 a a2 d+2 d2+2 b b2 c/dhp c2 a/k a2 b/d b2 d d2 a a2 b+5 b2+5 a/ld a2/ldpm a2/ldcm'
  );

  // 3. 101.5 FM · Late-Night Harbor Velvet (Eb major / C minor, 78 BPM)
  // A: Cassette velvet theme; B: warm Abmaj7 lantern lift; C: 2 AM music-box dockside bridge; D: head-nod pocket
  const LOFI_DEFAULTS = {
    padVoice: 'velvet_pad',
    pluckVoice: 'music_box',
    leadVoice: 'velvet_pad',
    beatMode: 1,
    bassWalk: [0, 0, 7, 0, 7, 10, 0, 0, 7, 0, 7, 10],
    bassGate: [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1],
    kick:     [2, 0, 0, 0, 1, 1, 2, 0, 0, 1, 0, 0],
    snare:    [0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 1],
    hat:      [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1],
    arpSteps: [0, 2, 3, 1, 0, 3, 0, 2, 3, 1, 2, 0],
    chimeRatios: [5 / 4, 0, 0, 3 / 2, 0, 9 / 8, 1, 0, 0, 5 / 3, 0, 0]
  };

  const LOFI_SECTIONS = [
    // a: Harbor Velvet Theme (ii9 -> V7alt -> Imaj7 -> vi7)
    makeSection(LOFI_DEFAULTS, {
      regions: [
        reg(2, 'm9',   [0, 3, 7, 10, 14]),
        reg(7, '7alt', [0, 4, 7, 10]),
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(9, 'm7',   [0, 3, 7, 10])
      ],
      leadNotes: [5, 9, 12, 11, 7, _, 4, 7, 11, 12, 7, _]
    }),
    // a2: Minor Turnaround into Cm9
    makeSection(LOFI_DEFAULTS, {
      regions: [
        reg(2, 'm9',   [0, 3, 7, 10, 14]),
        reg(4, '7alt', [0, 4, 7, 10]),
        reg(9, 'm9',   [0, 3, 7, 10, 14]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [5, 7, 9, 8, 11, _, 12, 10, 7, 5, _, _],
      snare:     [0, 0, 0, 2, 0, 0, 0, 0, 1, 2, 0, 2]
    }),
    // b: Lantern Chorus (Abmaj7 -> Bb7 -> Gm7 -> Cm9)
    makeSection(LOFI_DEFAULTS, {
      leadVoice: 'glass_harmonica',
      regions: [
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(7, '9',    [0, 4, 7, 10, 14]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(9, 'm9',   [0, 3, 7, 10, 14])
      ],
      leadNotes: [9, _, 12, 14, 11, 9, 11, _, 7, 12, 10, _],
      bassWalk:  [0, 7, 11, 0, 7, 9, 0, 7, 10, 0, 7, 12],
      chimeRatios: [1, 0, 5 / 4, 3 / 2, 0, 0, 6 / 5, 0, 3 / 2, 1, 0, 2]
    }),
    // b2: Chorus Settling on Ebmaj7
    makeSection(LOFI_DEFAULTS, {
      leadVoice: 'glass_harmonica',
      regions: [
        reg(2, 'm9',   [0, 3, 7, 10, 14]),
        reg(7, '7alt', [0, 4, 7, 10]),
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(0, '6',    [0, 4, 7, 9])
      ],
      leadNotes: [9, 12, 16, 14, 11, 7, 11, 9, 7, _, _, _]
    }),
    // c: 2 AM Dockside Bridge (Music Box & Sub Bass over calm water)
    makeSection(LOFI_DEFAULTS, {
      leadVoice: 'music_box',
      regions: [
        reg(9, 'm9',   [0, 3, 7, 10, 14]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(4, '7alt', [0, 4, 7, 10])
      ],
      leadNotes: [12, _, 15, 11, _, 7, 9, _, 12, 8, _, _],
      bassGate:  [2, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0, 1],
      kick:      [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0],
      snare:     [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
      hat:       [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1]
    }),
    // c2: Minor-Plagal Drift (Fm9 -> Abm6 -> Ebmaj7 -> Bb7)
    makeSection(LOFI_DEFAULTS, {
      leadVoice: 'music_box',
      regions: [
        reg(2, 'm9',   [0, 3, 7, 10, 14]),
        reg(5, 'm6',   [0, 3, 7, 9]),
        reg(0, 'maj7', [0, 4, 7, 11]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [9, _, 12, 12, 8, 5, 7, _, 4, 2, _, _],
      snare:     [0, 0, 0, 2, 0, 0, 0, 0, 1, 2, 1, 1]
    }),
    // d: Head-Nod Velvet Pocket (climbing Fm9 -> Gm7 -> Abmaj7 -> Bb7)
    makeSection(LOFI_DEFAULTS, {
      regions: [
        reg(2, 'm9',   [0, 3, 7, 10, 14]),
        reg(4, 'm7',   [0, 3, 7, 10]),
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(7, '9',    [0, 4, 7, 10, 14])
      ],
      leadNotes: [5, 9, 7, 7, 11, 9, 9, 12, 11, 14, 12, 9],
      kick:      [2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0],
      snare:     [0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 1, 2]
    }),
    // d2: Midnight Turnaround
    makeSection(LOFI_DEFAULTS, {
      regions: [
        reg(5, 'maj7', [0, 4, 7, 11]),
        reg(4, '7alt', [0, 4, 7, 10]),
        reg(9, 'm9',   [0, 3, 7, 10, 14]),
        reg(7, '7alt', [0, 4, 7, 10])
      ],
      leadNotes: [12, 9, 5, 8, 11, 7, 12, 7, 3, 2, _, _]
    })
  ];

  // 30 passes * 4.615 s = 138.5 seconds before repeat
  const LOFI_ARRANGEMENT = order(
    'a/ldp a/l a a2 b b2 c/dh c2 a a2 d d2 b b2 c/d c2 b+5 b2+5 a a2 d/l d d2 b-2 b2-2 c/dhp c2 a a2 d2/ldm'
  );

  // 4. 107.9 FM · Boardwalk Parlor Rag (C major, 118 BPM)
  // Classic Joplin multi-strain ragtime form (First Strain, Second Strain, Subdominant Trio, Stride Stomp)
  const RAGTIME_DEFAULTS = {
    padVoice: 'theatre_organ',
    pluckVoice: 'theatre_organ',
    leadVoice: 'theatre_organ',
    beatMode: 4,
    bassWalk: [0, 7, 4, 7, 0, 7, 4, 7, 0, 7, 5, 7],
    bassGate: [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
    kick:     [2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 2, 0],
    snare:    [0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    hat:      [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 2],
    arpSteps: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0],
    chimeRatios: [1, 5 / 4, 0, 3 / 2, 0, 2, 1, 5 / 4, 0, 3 / 2, 5 / 3, 0]
  };

  const RAGTIME_SECTIONS = [
    // a: First Strain
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(0, ' Maj', [0, 4, 7]),
        reg(0, '7',    [0, 4, 7, 10]),
        reg(5, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [4, 7, 9, 10, 9, 7, 9, 12, 14, 11, 14, 7]
    }),
    // a2: First Strain Circle-of-Fifths Close (C -> A7 -> Dm7 -> G7)
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(0, ' Maj', [0, 4, 7]),
        reg(9, '7',    [0, 4, 7, 10]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [7, 12, 16, 13, 9, 7, 5, 9, 12, 12, _, _],
      snare:     [0, 2, 0, 2, 0, 2, 0, 2, 2, 1, 2, 0]
    }),
    // b: Second Strain (bright boardwalk call-and-response)
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, ' Maj', [0, 4, 7])
      ],
      leadNotes: [11, 14, 17, 16, 12, _, 11, 14, 17, 16, _, _],
      bassWalk:  [0, 7, 2, 7, 0, 7, 4, 7, 0, 7, 2, 7]
    }),
    // b2: Second Strain Chromatic Diminished Walk (F -> F#dim7 -> C -> G7)
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(5, ' Maj', [0, 4, 7]),
        reg(6, '°7',   [0, 3, 6, 9]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(7, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [9, 12, 17, 15, 12, 9, 12, 7, 4, 7, _, _]
    }),
    // c: Parlor Trio in Subdominant F (lyrical Harmonium lead)
    makeSection(RAGTIME_DEFAULTS, {
      leadVoice: 'harmonium',
      regions: [
        reg(5, ' Maj', [0, 4, 7]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(5, ' Maj', [0, 4, 7])
      ],
      leadNotes: [9, _, 12, 7, _, 12, 5, 9, 12, 9, _, _],
      bassGate:  [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1],
      kick:      [2, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0, 0],
      snare:     [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1]
    }),
    // c2: Trio Turnaround (Bb -> F -> G7 -> C7)
    makeSection(RAGTIME_DEFAULTS, {
      leadVoice: 'harmonium',
      regions: [
        reg(10, ' Maj', [0, 4, 7]),
        reg(5, ' Maj',  [0, 4, 7]),
        reg(7, '7',     [0, 4, 7, 10]),
        reg(0, '7',     [0, 4, 7, 10])
      ],
      leadNotes: [14, 10, 9, 12, 9, 5, 7, 11, 14, 12, 10, _],
      snare:     [0, 1, 0, 0, 1, 0, 0, 2, 1, 2, 2, 2]
    }),
    // d: Grand Stride Stomp (F -> Fm6 -> C -> A7)
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(5, ' Maj', [0, 4, 7]),
        reg(5, 'm6',   [0, 3, 7, 9]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(9, '7',    [0, 4, 7, 10])
      ],
      leadNotes: [17, 12, 9, 17, 12, 8, 16, 12, 7, 13, 9, 7],
      hat:       [2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 2]
    }),
    // d2: Vaudeville Tag Cadence (Dm7 -> G7 -> C -> C6)
    makeSection(RAGTIME_DEFAULTS, {
      regions: [
        reg(2, 'm7',   [0, 3, 7, 10]),
        reg(7, '7',    [0, 4, 7, 10]),
        reg(0, ' Maj', [0, 4, 7]),
        reg(0, '6',    [0, 4, 7, 9])
      ],
      leadNotes: [14, 12, 9, 11, 14, 7, 12, _, 7, 12, _, _],
      kick:      [2, 0, 1, 2, 0, 1, 2, 0, 2, 2, 0, 0],
      snare:     [0, 2, 0, 0, 2, 1, 2, 0, 2, 0, 0, 0]
    })
  ];

  // 44 passes * 3.051 s = 134.2 seconds before repeat
  const RAGTIME_ARRANGEMENT = order(
    'a/ldp a/l a a2 a a2 b b2 b b2 a a2 c/k c2 c c2 d d2 d d2 a/c a2 b+5 b2+5 a a2 c/dh c2 d/l d d2 b-2 b2-2 a a2 d d2 b/d b2 a a2 d2/l d2/ldpm'
  );

  const GENRES = {
    bossa: {
      code: 'bossa',
      shortLabel: 'Pier Bossa',
      fullTitle: '94.2 FM · Sunny Pier Bossa',
      bpm: 102,
      swing: 0.04,
      rootMidi: 53, // F3
      delayMult: 1.5,
      movementNames: { a: 'Theme', b: 'Chorus', c: 'Bridge', d: 'Montuno' },
      sections: BOSSA_SECTIONS,
      arrangement: BOSSA_ARRANGEMENT
    },
    shanty: {
      code: 'shanty',
      shortLabel: 'Sea Shanty',
      fullTitle: '88.7 FM · Capstan Shanty',
      bpm: 114,
      swing: 0.08,
      rootMidi: 50, // D3
      delayMult: 1.0,
      movementNames: { a: 'Theme', b: 'Chorus', c: 'Fog Bridge', d: 'Hornpipe' },
      sections: SHANTY_SECTIONS,
      arrangement: SHANTY_ARRANGEMENT
    },
    lofi: {
      code: 'lofi',
      shortLabel: 'Harbor Lo-Fi',
      fullTitle: '101.5 FM · Harbor Velvet',
      bpm: 78,
      swing: 0.14,
      rootMidi: 51, // Eb3
      delayMult: 1.5,
      movementNames: { a: 'Theme', b: 'Chorus', c: '2 AM Bridge', d: 'Pocket' },
      sections: LOFI_SECTIONS,
      arrangement: LOFI_ARRANGEMENT
    },
    ragtime: {
      code: 'ragtime',
      shortLabel: 'Boardwalk Rag',
      fullTitle: '107.9 FM · Boardwalk Rag',
      bpm: 118,
      swing: 0.12,
      rootMidi: 48, // C3
      delayMult: 0.75,
      movementNames: { a: 'Strain I', b: 'Strain II', c: 'Trio', d: 'Stride' },
      sections: RAGTIME_SECTIONS,
      arrangement: RAGTIME_ARRANGEMENT
    }
  };

  const STATION_ORDER = ['auto', 'shanty', 'bossa', 'lofi', 'ragtime', 'off'];

  const STATION_META = {
    auto:    { label: 'Auto DJ',       badge: 'AUTO' },
    shanty:  { label: 'Sea Shanty',    badge: '88.7' },
    bossa:   { label: 'Pier Bossa',    badge: '94.2' },
    lofi:    { label: 'Harbor Lo-Fi',  badge: '101.5' },
    ragtime: { label: 'Boardwalk Rag', badge: '107.9' },
    off:     { label: 'Radio Off',     badge: 'OFF' }
  };

  // Resolves the current pass and section for a genre at `arrangementPos`
  function currentPassAndSection(genre, arrangementPos) {
    const pos = ((arrangementPos % genre.arrangement.length) + genre.arrangement.length) % genre.arrangement.length;
    const pass = genre.arrangement[pos];
    const sec = genre.sections[pass.section] || genre.sections[0];
    return { pos, pass, sec };
  }

  function formatMovementLabel(genre, pos, pass) {
    const family = pass.sectionName[0]; // 'a' | 'b' | 'c' | 'd'
    let base = (genre.movementNames && genre.movementNames[family]) || family.toUpperCase();
    if (pos <= 1 && pass.mute.lead && (pass.mute.drums || pass.mute.kickSnare)) {
      base = 'Intro';
    } else if (pos >= genre.arrangement.length - 2 && pass.mute.lead && (pass.mute.drums || pass.mute.chords)) {
      base = 'Coda';
    } else if (pass.mute.drums || pass.mute.kickSnare) {
      base = `${base} Break`;
    }
    if (pass.transpose !== 0) {
      const sign = pass.transpose > 0 ? '+' : '';
      return `${base} (${sign}${pass.transpose})`;
    }
    return base;
  }

  // Bespoke P34-08 shortest-period verifier: computes exact seconds before a genre's
  // full multi-part step stream repeats identically.
  function secondsBeforeRepeat(genreCode) {
    const genre = GENRES[genreCode];
    if (!genre) return 0;
    const stepSec = 60 / genre.bpm / 2;
    const stream = [];

    for (let pIdx = 0; pIdx < genre.arrangement.length; pIdx++) {
      const pass = genre.arrangement[pIdx];
      const sec = genre.sections[pass.section];
      const rootMidi = genre.rootMidi + pass.transpose;

      for (let s = 0; s < 12; s++) {
        const regObj = sec.regions[Math.floor(s / 3) % 4];
        const chordRoot = rootMidi + regObj.degree;
        const padSig = pass.mute.chords ? '-' : `${chordRoot}:${regObj.tones.join(',')}:${sec.padVoice}`;
        const bassSig = (pass.mute.bass || sec.bassGate[s] === 0)
          ? '-'
          : `${chordRoot - 12 + sec.bassWalk[s]}:${sec.bassGate[s]}`;
        const leadNote = sec.leadNotes[s];
        const leadSig = (pass.mute.lead || leadNote === null)
          ? '-'
          : `${rootMidi + 12 + leadNote}:${sec.leadVoice}`;
        const arpSig = pass.mute.arp
          ? '-'
          : `${chordRoot + regObj.tones[sec.arpSteps[s] % regObj.tones.length]}:${sec.pluckVoice}`;
        const chimeSig = (pass.mute.chimes || sec.chimeRatios[s] === 0)
          ? '-'
          : `${chordRoot}:${sec.chimeRatios[s].toFixed(3)}`;
        const kickSig = pass.mute.kickSnare ? 0 : sec.kick[s];
        const snareSig = pass.mute.kickSnare ? 0 : sec.snare[s];
        const hatSig = pass.mute.hats ? 0 : sec.hat[s];

        stream.push(`${padSig}|${bassSig}|${leadSig}|${arpSig}|${chimeSig}|${kickSig},${snareSig},${hatSig}`);
      }
    }

    const n = stream.length;
    let period = n;
    for (let cand = 1; cand <= n; cand++) {
      if (n % cand !== 0) continue;
      let same = true;
      for (let i = 0; i < n; i++) {
        if (stream[i] !== stream[(i + cand) % n]) {
          same = false;
          break;
        }
      }
      if (same) {
        period = cand;
        break;
      }
    }
    return period * stepSec;
  }

  // --------------------------------------------------------------------------
  // Live Harbor Music State, Graph & Lookahead Scheduler
  // --------------------------------------------------------------------------
  let ctx = null;
  let graph = null;
  let schedulerTimer = null;

  const engine = {
    station: 'auto',
    masterMuted: false,
    unlocked: false,

    // Synced from app.js simulation state
    isNight: false,
    rain: false,
    quietTimer: 0,
    scaryHover: false,
    mirrorMode: 'none', // 'none' | 'low' | 'high'
    stressWobble: 0,
    anchoredTotal: 1,
    counts: {
      real: 1,
      cardboard: 1,
      helium: 1,
      hologram: 1,
      bolter: 1,
      paper: 1
    },
    anchoredByType: {
      real: 1,
      cardboard: 0,
      helium: 0,
      hologram: 0,
      bolter: 0,
      paper: 0
    },

    // Sequencer & Arrangement cursor (Bespoke `arrangement_pos` + `current_step`)
    stepIndex: 0,
    arrangementPos: 0,
    nextStepTime: 0,
    lastLeadMidi: null,
    activeGenreCode: 'bossa',
    effectiveBpm: 102,

    // Visual telemetry for Canvas
    lastBeatAudioTime: 0,
    beatIndex: 0,
    noteEmitCounter: 0
  };

  function resolveActiveGenreCode() {
    if (engine.station !== 'auto') return engine.station;
    if (engine.rain || engine.isNight) return 'lofi';
    return 'bossa';
  }

  function computeEffectiveBpm(genre) {
    let bpm = genre.bpm;
    if (engine.station !== 'auto' && engine.isNight && genre.code !== 'lofi') {
      bpm *= 0.94;
    }
    if (engine.rain && genre.code !== 'lofi') {
      bpm *= 0.95;
    }
    if (engine.quietTimer > 0 || engine.mirrorMode === 'low') {
      bpm *= 0.82;
    }
    return clamp(Math.round(bpm), 56, 138);
  }

  function buildGraph(ac) {
    const now = ac.currentTime;

    const padStrip = ac.createGain();
    const bassStrip = ac.createGain();
    const beatStrip = ac.createGain();
    const hatStrip = ac.createGain();
    const arpStrip = ac.createGain();
    const chimeStrip = ac.createGain();
    const leadStrip = ac.createGain();

    const bandSum = ac.createGain();
    bandSum.gain.setValueAtTime(1, now);

    const radioBodyHighpass = ac.createBiquadFilter();
    radioBodyHighpass.type = 'highpass';
    radioBodyHighpass.frequency.setValueAtTime(42, now);
    radioBodyHighpass.Q.setValueAtTime(0.65, now);

    const weatherFilter = ac.createBiquadFilter();
    weatherFilter.type = 'lowpass';
    weatherFilter.frequency.setValueAtTime(5800, now);
    weatherFilter.Q.setValueAtTime(0.65, now);

    const delay = ac.createDelay(1.5);
    const delayFeedback = ac.createGain();
    const delaySend = ac.createGain();
    delay.delayTime.setValueAtTime(0.32, now);
    delayFeedback.gain.setValueAtTime(0.16, now);
    delaySend.gain.setValueAtTime(0.18, now);
    delay.connect(delayFeedback).connect(delay);

    const reverbHP = ac.createBiquadFilter();
    reverbHP.type = 'highpass';
    reverbHP.frequency.setValueAtTime(180, now);
    const reverbSend = ac.createGain();
    reverbSend.gain.setValueAtTime(0.24, now);
    const convolver = ac.createConvolver();
    try { convolver.normalize = false; } catch (_) {}
    try { convolver.buffer = ensureParlorImpulseResponse(ac); } catch (_) {}

    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(18, now);
    compressor.ratio.setValueAtTime(5, now);
    compressor.attack.setValueAtTime(0.005, now);
    compressor.release.setValueAtTime(0.18, now);

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(SILENT, now);

    for (const strip of [padStrip, bassStrip, beatStrip, hatStrip, arpStrip, chimeStrip, leadStrip]) {
      strip.connect(bandSum);
    }
    for (const strip of [padStrip, arpStrip, chimeStrip, leadStrip]) {
      strip.connect(delaySend);
      strip.connect(reverbHP);
    }
    const beatRevTap = ac.createGain();
    beatRevTap.gain.setValueAtTime(0.35, now);
    beatStrip.connect(beatRevTap).connect(reverbHP);

    delaySend.connect(delay).connect(weatherFilter);
    reverbHP.connect(reverbSend).connect(convolver).connect(weatherFilter);

    bandSum.connect(radioBodyHighpass).connect(weatherFilter);
    weatherFilter.connect(compressor);

    const crackleGain = ac.createGain();
    crackleGain.gain.setValueAtTime(0.015, now);
    let crackleSource = null;
    try {
      crackleSource = ac.createBufferSource();
      crackleSource.buffer = ensureWaxCrackleBuffer(ac);
      crackleSource.loop = true;
      crackleSource.connect(crackleGain).connect(compressor);
      crackleSource.start(now);
    } catch (_) {
      crackleSource = null;
    }

    compressor.connect(masterGain).connect(ac.destination);

    return {
      padStrip,
      bassStrip,
      beatStrip,
      hatStrip,
      arpStrip,
      chimeStrip,
      leadStrip,
      radioBodyHighpass,
      weatherFilter,
      delay,
      delaySend,
      reverbSend,
      crackleGain,
      crackleSource,
      masterGain
    };
  }

  function computeStemTargets(activeMute) {
    const c = engine.counts;
    const anchored = engine.anchoredTotal;
    const isReflectiveBox = engine.quietTimer > 0 || engine.mirrorMode === 'low';
    const mute = activeMute || {};

    if (isReflectiveBox) {
      return {
        pad: anchored > 0 ? 0.72 : 0.16,
        bass: anchored > 0 ? 0.36 : SILENT,
        beat: SILENT,
        hat: SILENT,
        arp: SILENT,
        chime: SILENT,
        lead: 0.92
      };
    }

    const totalGuests = c.real + c.cardboard + c.helium + c.hologram + c.bolter + c.paper;
    return {
      pad: mute.chords ? SILENT : (anchored > 0 ? clamp(0.84 + (anchored - 1) * 0.06, 0.84, 1.08) : 0.42),
      bass: mute.bass ? SILENT : (anchored > 0 ? clamp(0.90 + (anchored - 1) * 0.05, 0.90, 1.08) : 0.28),
      beat: mute.kickSnare ? SILENT : (c.cardboard > 0 ? clamp(0.76 + (c.cardboard - 1) * 0.12, 0.76, 1.05) : (totalGuests > 0 ? 0.16 : 0.10)),
      hat: mute.hats ? SILENT : (c.bolter > 0 ? clamp(0.80 + (c.bolter - 1) * 0.12, 0.80, 1.05) : (anchored > 0 ? 0.24 : SILENT)),
      arp: mute.arp ? SILENT : (c.hologram > 0 ? clamp(0.82 + (c.hologram - 1) * 0.10, 0.82, 1.05) : SILENT),
      chime: mute.chimes ? SILENT : (c.helium > 0 ? clamp(0.85 + (c.helium - 1) * 0.12, 0.85, 1.1) : SILENT),
      lead: mute.lead
        ? SILENT
        : (c.paper > 0 ? clamp(0.88 + (c.paper - 1) * 0.08, 0.88, 1.05) : (anchored >= 2 ? 0.48 : SILENT))
    };
  }

  function applyRealtimeMix() {
    if (!ctx || !graph) return;
    const now = ctx.currentTime;
    const shouldSound = engine.unlocked && !engine.masterMuted && engine.station !== 'off';

    const targetMaster = shouldSound ? 0.24 : SILENT;
    graph.masterGain.gain.setTargetAtTime(targetMaster, now, shouldSound ? 0.14 : 0.06);

    if (!shouldSound) return;

    const genre = GENRES[resolveActiveGenreCode()] || GENRES.bossa;
    const { pass } = currentPassAndSection(genre, engine.arrangementPos);
    const stems = computeStemTargets(pass.mute);
    const tau = 0.16;

    graph.padStrip.gain.setTargetAtTime(Math.max(SILENT, stems.pad), now, tau);
    graph.bassStrip.gain.setTargetAtTime(Math.max(SILENT, stems.bass), now, tau);
    graph.beatStrip.gain.setTargetAtTime(Math.max(SILENT, stems.beat), now, tau);
    graph.hatStrip.gain.setTargetAtTime(Math.max(SILENT, stems.hat), now, tau);
    graph.arpStrip.gain.setTargetAtTime(Math.max(SILENT, stems.arp), now, tau);
    graph.chimeStrip.gain.setTargetAtTime(Math.max(SILENT, stems.chime), now, tau);
    graph.leadStrip.gain.setTargetAtTime(Math.max(SILENT, stems.lead), now, tau);

    const hpFreq = engine.anchoredTotal > 0 ? 34 : 245;
    graph.radioBodyHighpass.frequency.setTargetAtTime(hpFreq, now, 0.25);

    let lpFreq = 5800;
    let lpQ = 0.65;
    if (engine.rain) {
      lpFreq = engine.anchoredTotal >= 3 ? 2150 : 1520;
      lpQ = 0.95;
    } else if (engine.quietTimer > 0 || engine.mirrorMode === 'low') {
      lpFreq = 2550;
      lpQ = 0.7;
    } else if (engine.isNight) {
      lpFreq = 3400;
      lpQ = 0.75;
    }
    if (engine.stressWobble > 0.05) {
      lpFreq *= (1 - engine.stressWobble * 0.42);
    }
    graph.weatherFilter.frequency.setTargetAtTime(Math.max(420, lpFreq), now, 0.22);
    graph.weatherFilter.Q.setTargetAtTime(lpQ, now, 0.22);

    let rev = 0.22;
    let crackle = 0.014;
    if (engine.rain) {
      rev = 0.52;
      crackle = 0.068;
    } else if (engine.quietTimer > 0 || engine.mirrorMode === 'low') {
      rev = 0.58;
      crackle = 0.048;
    } else if (engine.isNight || engine.activeGenreCode === 'lofi') {
      rev = 0.38;
      crackle = 0.038;
    }
    graph.reverbSend.gain.setTargetAtTime(rev, now, 0.3);
    graph.crackleGain.gain.setTargetAtTime(crackle, now, 0.3);
  }

  function scheduleSingleStep(stepIdx, stepStart) {
    if (!ctx || !graph) return;

    const resolvedCode = resolveActiveGenreCode();
    // If Auto DJ switched genres (e.g. Day -> Night/Rain), start the new track at its Intro pass (pos 0)
    if (resolvedCode !== engine.activeGenreCode) {
      engine.activeGenreCode = resolvedCode;
      engine.arrangementPos = 0;
      engine.lastLeadMidi = null;
    }

    const genre = GENRES[engine.activeGenreCode] || GENRES.bossa;
    const { pass, sec } = currentPassAndSection(genre, engine.arrangementPos);
    const bpm = computeEffectiveBpm(genre);
    engine.effectiveBpm = bpm;

    const baseStepSec = 60 / bpm / 2;
    const swingOffset = (stepIdx % 2 === 1) ? baseStepSec * genre.swing : 0;
    const at = stepStart + swingOffset;

    const targetDelay = clamp(baseStepSec * genre.delayMult, 0.12, 1.4);
    graph.delay.delayTime.setTargetAtTime(targetDelay, Math.max(ctx.currentTime, at), 0.1);

    const regionIdx = Math.floor(stepIdx / 3) % 4;
    const stepInRegion = stepIdx % 3;
    const region = sec.regions[regionIdx];

    // Look ahead cleanly across section boundaries for upright bass glides
    const nextStepIdx = (stepIdx + 1) % 12;
    const nextArrangementPos = nextStepIdx === 0
      ? (engine.arrangementPos + 1) % genre.arrangement.length
      : engine.arrangementPos;
    const nextBundle = currentPassAndSection(genre, nextArrangementPos);
    const nextRegion = nextBundle.sec.regions[Math.floor(nextStepIdx / 3) % 4];

    const transposedRootMidi = genre.rootMidi + pass.transpose;
    const nextTransposedRootMidi = genre.rootMidi + nextBundle.pass.transpose;
    const chordRootMidi = transposedRootMidi + region.degree;
    const nextChordRootMidi = nextTransposedRootMidi + nextRegion.degree;

    const rawNervous = (engine.scaryHover ? Math.sin(stepIdx * 2.1) * 14 : 0)
      + (engine.stressWobble > 0.05 ? Math.cos(stepIdx * 3.4) * 28 * engine.stressWobble : 0);

    const arpNervous = engine.anchoredByType.hologram > 0 ? 0 : rawNervous;
    const chimeNervous = engine.anchoredByType.helium > 0 ? 0 : rawNervous;
    const leadNervous = engine.anchoredByType.paper > 0 ? 0 : rawNervous * 0.7;

    const isReflectiveBox = engine.quietTimer > 0 || engine.mirrorMode === 'low';
    const isFullSession = engine.anchoredTotal >= 4 || engine.mirrorMode === 'high';

    if (stepIdx % 2 === 0) {
      engine.lastBeatAudioTime = at;
      engine.beatIndex++;
      if (stepIdx % 3 === 0) engine.noteEmitCounter++;
    }

    // 1. PAD CHORD BED (Struck on start of each 3-step harmonic region unless pass mutes `c`)
    if (stepInRegion === 0 && (isReflectiveBox || !pass.mute.chords)) {
      const padVoice = isReflectiveBox ? VOICES.velvet_pad : (VOICES[sec.padVoice] || VOICES.velvet_pad);
      const padNotes = [
        foldIntoRange(chordRootMidi, 45, 56),
        ...region.tones.slice(1, 4).map(t => foldIntoRange(chordRootMidi + t, 55, 76))
      ];
      scheduleVoicePad(ctx, graph.padStrip, padVoice, padNotes, {
        start: at,
        sounding: baseStepSec * 2.88,
        level: isReflectiveBox ? 0.72 : (isFullSession ? 1.02 : 0.92)
      });

      if (isFullSession && !isReflectiveBox) {
        const companionVoice = sec.padVoice === 'harmonium' ? VOICES.velvet_pad : VOICES.harmonium;
        const bloomNotes = [
          foldIntoRange(chordRootMidi + 7, 55, 67),
          foldIntoRange(chordRootMidi + (region.tones[1] || 4) + 12, 62, 79)
        ];
        scheduleVoicePad(ctx, graph.padStrip, companionVoice, bloomNotes, {
          start: at,
          sounding: baseStepSec * 2.6,
          level: 0.42
        });
      }
    }

    // Reflective Music Box mode during "Go Quiet" or Low-Tide Mirror
    if (isReflectiveBox) {
      const rawLead = sec.leadNotes[stepIdx];
      if (rawLead !== null && (stepInRegion === 0 || stepIdx % 2 === 0)) {
        const boxMidi = foldIntoRange(transposedRootMidi + 12 + rawLead, 64, 84);
        scheduleVoicePluck(ctx, graph.leadStrip, VOICES.music_box, boxMidi, {
          start: at,
          duration: baseStepSec * 2.2,
          accent: stepInRegion === 0,
          pan: (stepIdx % 3 - 1) * 0.25
        });
      }
      if (stepInRegion === 0 && engine.anchoredTotal > 0) {
        scheduleWalkingBass(
          ctx, graph.bassStrip,
          chordRootMidi - 12, nextChordRootMidi - 12,
          at, baseStepSec * 2.4, false, false
        );
      }
      return;
    }

    // 2. UPRIGHT WALKING BASS (Anchored Spine, muted when pass has `/b`)
    const bassGate = sec.bassGate[stepIdx];
    if (!pass.mute.bass && bassGate > 0) {
      const walkInt = sec.bassWalk[stepIdx];
      const nextWalkInt = nextBundle.sec.bassWalk[nextStepIdx];
      const bassMidi = chordRootMidi - 12 + walkInt;
      const nextBassMidi = nextChordRootMidi - 12 + nextWalkInt;
      scheduleWalkingBass(
        ctx,
        graph.bassStrip,
        bassMidi,
        nextBassMidi,
        at,
        baseStepSec,
        bassGate === 2,
        stepInRegion === 2
      );
    }

    // 3. DECK PERCUSSION: Kick & Snare (`/d` or `/k`) + Hats (`/d` or `/h`)
    if (!pass.mute.kickSnare) {
      const kickVel = sec.kick[stepIdx];
      const snareVel = sec.snare[stepIdx];
      if (kickVel > 0 || snareVel > 0) {
        scheduleKickAndSnare(
          ctx, graph.beatStrip, genre.rootMidi, sec.beatMode,
          kickVel, snareVel, at, baseStepSec, stepIdx
        );
      }
    }
    if (!pass.mute.hats) {
      const hatVel = sec.hat[stepIdx];
      if (hatVel > 0) {
        scheduleHat(ctx, graph.hatStrip, genre.rootMidi, sec.beatMode, hatVel, at);
      }
    }

    // 4. STEREO ARPEGGIO PLUCKS (Signal Holograms, muted when pass has `/p`)
    if (!pass.mute.arp && engine.counts.hologram > 0) {
      const pluckVoice = VOICES[sec.pluckVoice] || VOICES.velvet_pad;
      const toneIdx = sec.arpSteps[stepIdx] % region.tones.length;
      const arpMidi = foldIntoRange(chordRootMidi + region.tones[toneIdx] + (stepIdx % 4 === 3 ? 12 : 0), 57, 81);
      const pan = ((stepIdx % 4) - 1.5) * 0.34;
      scheduleVoicePluck(ctx, graph.arpStrip, pluckVoice, arpMidi, {
        start: at,
        duration: baseStepSec * 0.92,
        accent: stepInRegion === 0,
        pan,
        detuneCents: arpNervous
      });
    }

    // 5. JUST-INTONATION HARBOR CHIMES (Helium Besties, muted when pass has `/m`)
    const ratio = sec.chimeRatios[stepIdx];
    if (!pass.mute.chimes && ratio > 0 && engine.counts.helium > 0) {
      scheduleHarborChime(
        ctx, graph.chimeStrip, chordRootMidi, ratio,
        at, baseStepSec, stepInRegion === 0, chimeNervous
      );
    }

    // 6. SINGING LEAD MELODY (Origami Sailors or Anchored hum, muted when pass has `/l`)
    if (!pass.mute.lead && (engine.counts.paper > 0 || engine.anchoredTotal >= 2)) {
      const noteSemis = sec.leadNotes[stepIdx];
      if (noteSemis !== null && noteSemis !== undefined) {
        // Look ahead to hold tied/sustained notes across resting steps cleanly
        let holdSteps = 1;
        while (stepIdx + holdSteps < 12 && sec.leadNotes[stepIdx + holdSteps] === null && holdSteps < 3) {
          holdSteps++;
        }
        const leadVoice = VOICES[sec.leadVoice] || VOICES.velvet_pad;
        const leadMidi = foldIntoRange(transposedRootMidi + 12 + noteSemis, 60, 84);
        scheduleVoiceLead(ctx, graph.leadStrip, leadVoice, leadMidi, {
          start: at,
          duration: baseStepSec * (holdSteps * 0.92),
          glideFrom: engine.lastLeadMidi,
          level: engine.counts.paper > 0 ? 0.92 : 0.66,
          detuneCents: engine.counts.paper > 0 ? leadNervous : 0
        });
        engine.lastLeadMidi = leadMidi;
      } else {
        engine.lastLeadMidi = null;
      }
    }
  }

  function tickScheduler() {
    if (!ctx || !graph || !engine.unlocked || engine.masterMuted || engine.station === 'off') {
      return;
    }
    if (ctx.state === 'suspended') return;

    if (engine.stressWobble > 0) {
      engine.stressWobble = Math.max(0, engine.stressWobble - 0.06);
    }

    const lookaheadSec = 0.14;
    const now = ctx.currentTime;
    if (engine.nextStepTime < now - 0.08) {
      engine.nextStepTime = now + 0.02;
    }

    while (engine.nextStepTime < now + lookaheadSec) {
      const genre = GENRES[resolveActiveGenreCode()] || GENRES.bossa;
      const bpm = computeEffectiveBpm(genre);
      const stepDur = 60 / bpm / 2;

      scheduleSingleStep(engine.stepIndex, engine.nextStepTime);

      engine.nextStepTime += stepDur;
      engine.stepIndex = (engine.stepIndex + 1) % 12;
      // Swap cleanly to next arrangement pass at the section boundary (Bespoke `next_section`)
      if (engine.stepIndex === 0) {
        const activeGenre = GENRES[engine.activeGenreCode] || GENRES.bossa;
        engine.arrangementPos = (engine.arrangementPos + 1) % activeGenre.arrangement.length;
      }
    }

    applyRealtimeMix();
  }

  function startSchedulerLoop() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(tickScheduler, 40);
  }

  function playRadioDialSweep(ac, turningOff = false) {
    if (!ac || engine.masterMuted) return;
    const now = ac.currentTime;
    const noise = ac.createBufferSource();
    noise.buffer = ensureNoiseBuffer(ac);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(5.5, now);
    bp.frequency.setValueAtTime(turningOff ? 1800 : 720, now);
    bp.frequency.exponentialRampToValueAtTime(turningOff ? 320 : 2400, now + 0.11);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.055, now);
    g.gain.exponentialRampToValueAtTime(SILENT, now + 0.12);
    noise.connect(bp).connect(g).connect(ac.destination);
    noise.start(now);
    noise.stop(now + 0.14);
    cleanupOnEnded(noise, bp, g);

    if (!turningOff) {
      const pip = ac.createOscillator();
      const pg = ac.createGain();
      pip.type = 'sine';
      pip.frequency.setValueAtTime(520, now + 0.03);
      pip.frequency.exponentialRampToValueAtTime(780, now + 0.11);
      pg.gain.setValueAtTime(SILENT, now + 0.03);
      pg.gain.linearRampToValueAtTime(0.038, now + 0.05);
      pg.gain.exponentialRampToValueAtTime(SILENT, now + 0.13);
      pip.connect(pg).connect(ac.destination);
      pip.start(now + 0.03);
      pip.stop(now + 0.15);
      cleanupOnEnded(pip, pg);
    }
  }

  // --------------------------------------------------------------------------
  // Public API exposed as window.HarborMusic
  // --------------------------------------------------------------------------
  window.HarborMusic = {
    STATIONS: STATION_ORDER,
    STATION_META,
    secondsBeforeRepeat,

    unlock(audioContext) {
      if (!audioContext) return;
      if (!ctx) {
        ctx = audioContext;
        graph = buildGraph(ctx);
      }
      if (!engine.unlocked) {
        engine.unlocked = true;
        engine.nextStepTime = ctx.currentTime + 0.05;
        startSchedulerLoop();
      }
      applyRealtimeMix();
    },

    setMasterMute(muted) {
      engine.masterMuted = Boolean(muted);
      if (ctx && !engine.masterMuted && engine.unlocked) {
        engine.nextStepTime = Math.max(engine.nextStepTime, ctx.currentTime + 0.04);
      }
      applyRealtimeMix();
    },

    getStation() {
      return engine.station;
    },

    setStation(stationId, audioContext) {
      if (!STATION_META[stationId]) return engine.station;
      if (audioContext) this.unlock(audioContext);
      const prev = engine.station;
      engine.station = stationId;
      engine.lastLeadMidi = null;
      if (prev !== stationId) {
        // Start newly tuned station from its arranged Intro (`arrangement_pos = 0`)
        engine.stepIndex = 0;
        engine.arrangementPos = 0;
        if (ctx) {
          playRadioDialSweep(ctx, stationId === 'off');
          if (stationId !== 'off') {
            engine.nextStepTime = ctx.currentTime + 0.05;
          }
        }
      }
      applyRealtimeMix();
      return engine.station;
    },

    cycleStation(audioContext) {
      const idx = STATION_ORDER.indexOf(engine.station);
      const next = STATION_ORDER[(idx + 1) % STATION_ORDER.length];
      return this.setStation(next, audioContext);
    },

    triggerStressWobble(intensity = 0.85) {
      engine.stressWobble = Math.max(engine.stressWobble, clamp(intensity, 0, 1));
      applyRealtimeMix();
    },

    syncHarborState({ isNight, rain, quietTimer, scaryHover, mirrorMode, friends }) {
      engine.isNight = Boolean(isNight);
      engine.rain = Boolean(rain);
      engine.quietTimer = Math.max(0, Number(quietTimer) || 0);
      engine.scaryHover = Boolean(scaryHover);
      engine.mirrorMode = mirrorMode || 'none';

      if (Array.isArray(friends)) {
        const c = { real: 0, cardboard: 0, helium: 0, hologram: 0, bolter: 0, paper: 0 };
        const anc = { real: 0, cardboard: 0, helium: 0, hologram: 0, bolter: 0, paper: 0 };
        let ancTotal = 0;
        for (let i = 0; i < friends.length; i++) {
          const f = friends[i];
          if (!f || f.dead || f.fleeing) continue;
          if (c[f.type] !== undefined) c[f.type]++;
          if (f.type === 'real' || f.anchored) {
            ancTotal++;
            if (anc[f.type] !== undefined) anc[f.type]++;
          }
        }
        engine.counts = c;
        engine.anchoredByType = anc;
        engine.anchoredTotal = ancTotal;
      }

      const nextGenreCode = resolveActiveGenreCode();
      const genre = GENRES[nextGenreCode] || GENRES.bossa;
      engine.effectiveBpm = computeEffectiveBpm(genre);
    },

    getStatus() {
      const isOff = engine.station === 'off';
      const isAudible = engine.unlocked && !engine.masterMuted && !isOff;
      const genreCode = resolveActiveGenreCode();
      const genre = GENRES[genreCode] || GENRES.bossa;
      const { pos, pass, sec } = currentPassAndSection(genre, engine.arrangementPos);
      const region = sec.regions[Math.floor(engine.stepIndex / 3) % 4];
      const transposedRoot = genre.rootMidi + pass.transpose;
      const chordLabel = region ? chordNameAt(transposedRoot, region.degree, region.suffix) : '';
      const movementLabel = formatMovementLabel(genre, pos, pass);
      const isReflectiveBox = engine.quietTimer > 0 || engine.mirrorMode === 'low';

      let beatPulse = 0;
      if (isAudible && ctx) {
        const elapsed = ctx.currentTime - engine.lastBeatAudioTime;
        if (elapsed >= -0.02 && elapsed < 0.35) {
          beatPulse = Math.exp(-Math.max(0, elapsed) * 11);
        }
      }

      let nowPlaying = 'Radio Off';
      if (!isOff) {
        if (engine.mirrorMode === 'low') {
          nowPlaying = 'Low Tide · Mirror Music Box';
        } else if (engine.quietTimer > 0) {
          nowPlaying = engine.anchoredTotal > 0
            ? 'Music Box & Warm Cocoa Pad'
            : 'Lonely Pier Music Box';
        } else if (engine.anchoredTotal >= 4) {
          nowPlaying = `${genre.shortLabel} ★ ${movementLabel}`;
        } else {
          nowPlaying = `${genre.fullTitle} · ${movementLabel}`;
        }
      }

      return {
        station: engine.station,
        stationMeta: STATION_META[engine.station],
        isOff,
        isUnlocked: engine.unlocked,
        isAudible,
        genreCode,
        genreLabel: genre.shortLabel,
        movementLabel,
        passToken: pass.token,
        arrangementPos: pos + 1,
        arrangementLength: genre.arrangement.length,
        nowPlaying,
        chordLabel,
        bpm: engine.effectiveBpm,
        beatPulse,
        noteEmitCounter: engine.noteEmitCounter,
        counts: engine.counts,
        anchoredTotal: engine.anchoredTotal,
        stems: {
          real: (!pass.mute.chords || !pass.mute.bass) && engine.anchoredTotal > 0,
          cardboard: !isReflectiveBox && !pass.mute.kickSnare && engine.counts.cardboard > 0,
          bolter: !isReflectiveBox && !pass.mute.hats && engine.counts.bolter > 0,
          hologram: !isReflectiveBox && !pass.mute.arp && engine.counts.hologram > 0,
          helium: !isReflectiveBox && !pass.mute.chimes && engine.counts.helium > 0,
          paper: !isReflectiveBox && !pass.mute.lead && (engine.counts.paper > 0 || engine.anchoredTotal >= 2)
        }
      };
    }
  };
})();
