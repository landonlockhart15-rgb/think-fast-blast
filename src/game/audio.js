// Web Audio API Retro Synthesizer for ThinkFastBlast
// Programmatically generates game sound effects and layered background music.

let audioCtx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let limiter = null;
let arpeggiatorInterval = null;
let currentArpNote = 0;
let audioEnabled = true;

let masterVolume = 1.0;
let musicVolume = 1.0;
let sfxVolume = 1.0;

const loadVolumeSettings = () => {
  try {
    const master = localStorage.getItem("think-fast-blast-master-volume");
    const music = localStorage.getItem("think-fast-blast-music-volume");
    const sfx = localStorage.getItem("think-fast-blast-sfx-volume");
    if (master !== null) masterVolume = parseFloat(master);
    if (music !== null) musicVolume = parseFloat(music);
    if (sfx !== null) sfxVolume = parseFloat(sfx);
  } catch (e) {
    console.error("Failed to load volume settings", e);
  }
};

const getAudioContext = () => {
  const scope = typeof window !== "undefined" ? window : globalThis;
  return scope.AudioContext || scope.webkitAudioContext || null;
};

const connectNodeChain = (...nodes) => {
  for (let i = 0; i < nodes.length - 1; i += 1) {
    nodes[i].connect(nodes[i + 1]);
  }
};

const ensureGraph = () => {
  if (!audioCtx) {
    const AudioContext = getAudioContext();
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    musicGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    limiter = audioCtx.createDynamicsCompressor();

    loadVolumeSettings();

    musicGain.gain.value = 1.35 * musicVolume;
    sfxGain.gain.value = 1.3 * sfxVolume;
    masterGain.gain.value = audioEnabled ? masterVolume : 0;
    limiter.threshold.value = -10;
    limiter.knee.value = 18;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    connectNodeChain(musicGain, masterGain, limiter, audioCtx.destination);
    connectNodeChain(sfxGain, masterGain);
  }
  return audioCtx;
};

const initAudio = () => {
  if (!audioEnabled) return null;
  ensureGraph();
  if (audioCtx?.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

export const setAudioEnabled = (enabled) => {
  audioEnabled = Boolean(enabled);
  if (!audioCtx) return;
  const target = audioEnabled ? masterVolume : 0;
  masterGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.02);
  if (!audioEnabled) {
    stopArpeggiator();
  } else if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
};

export const setMasterVolume = (vol) => {
  masterVolume = vol;
  try {
    localStorage.setItem("think-fast-blast-master-volume", String(vol));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
  ensureGraph();
  if (masterGain && audioCtx) {
    const target = audioEnabled ? masterVolume : 0;
    masterGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.02);
  }
};

export const setMusicVolume = (vol) => {
  musicVolume = vol;
  try {
    localStorage.setItem("think-fast-blast-music-volume", String(vol));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
  ensureGraph();
  if (musicGain && audioCtx) {
    musicGain.gain.setTargetAtTime(1.35 * musicVolume, audioCtx.currentTime, 0.02);
  }
};

export const setSFXVolume = (vol) => {
  sfxVolume = vol;
  try {
    localStorage.setItem("think-fast-blast-sfx-volume", String(vol));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
  ensureGraph();
  if (sfxGain && audioCtx) {
    sfxGain.gain.setTargetAtTime(1.3 * sfxVolume, audioCtx.currentTime, 0.02);
  }
};

export const getVolumeSettings = () => {
  loadVolumeSettings();
  return { masterVolume, musicVolume, sfxVolume };
};

const playTone = ({
  destination = sfxGain,
  type = "sine",
  frequency = 440,
  startTime = 0,
  duration = 0.1,
  gain = 0.1,
  endFrequency = null,
  filterType = null,
  filterFrequency = null,
  detune = 0,
  attack = 0.004,
  release = 0.08,
}) => {
  if (!audioCtx || !destination) return;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  if (filterType) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency ?? 800, startTime);
    osc.connect(filter);
    filter.connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(destination);
  osc.type = type;
  osc.detune.setValueAtTime(detune, startTime);
  osc.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency !== null) {
    osc.frequency.linearRampToValueAtTime(endFrequency, startTime + duration * 0.85);
  }
  amp.gain.setValueAtTime(0.0001, startTime);
  amp.gain.linearRampToValueAtTime(gain, startTime + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + release);
};

const playNoiseBurst = ({
  destination = sfxGain,
  duration = 0.2,
  gain = 0.15,
  filterFrequency = 1200,
  filterDecay = 120,
  startTime = null,
}) => {
  if (!audioCtx || !destination) return;
  const now = startTime ?? audioCtx.currentTime;
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const amp = audioCtx.createGain();
  noise.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFrequency, now);
  filter.frequency.exponentialRampToValueAtTime(filterDecay, now + duration);
  noise.connect(filter);
  filter.connect(amp);
  amp.connect(destination);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.start(now);
};

const gameProgression = [
  { root: 73.42, fifth: 110.0, tones: [146.83, 174.61, 220.0, 261.63], melody: [293.66, 329.63, 349.23, 392.0, 440.0] },
  { root: 98.0, fifth: 146.83, tones: [196.0, 246.94, 293.66, 349.23], melody: [293.66, 349.23, 392.0, 440.0, 493.88] },
  { root: 65.41, fifth: 98.0, tones: [130.81, 164.81, 196.0, 246.94], melody: [261.63, 293.66, 329.63, 392.0, 440.0] },
  { root: 110.0, fifth: 164.81, tones: [220.0, 277.18, 329.63, 392.0], melody: [277.18, 329.63, 392.0, 440.0, 554.37] },
];

const menuProgression = [
  { root: 65.41, fifth: 98.0, tones: [130.81, 164.81, 196.0, 246.94], melody: [261.63, 293.66, 329.63, 392.0, 440.0] },
  { root: 73.42, fifth: 110.0, tones: [146.83, 174.61, 220.0, 261.63], melody: [293.66, 329.63, 392.0, 440.0, 523.25] },
  { root: 82.41, fifth: 123.47, tones: [164.81, 196.0, 246.94, 293.66], melody: [329.63, 392.0, 440.0, 493.88, 587.33] },
  { root: 98.0, fifth: 146.83, tones: [196.0, 246.94, 293.66, 349.23], melody: [392.0, 440.0, 493.88, 523.25, 659.25] },
];

const scheduleMusicStep = ({ now, step, scene, scaleType, intensity, intervalMs, fever = false }) => {
  const progression = scene === "menu" || scene === "victory" ? menuProgression : gameProgression;
  const bar = (fever && scene !== "menu" && scene !== "victory")
    ? Math.floor((step % 16) / 4)
    : Math.floor((step % 32) / 8);
  const beat = step % 8;
  const chord = progression[bar];
  const isMajor = scaleType === "major";

  if (beat === 0 || beat === 4) {
    playTone({
      destination: musicGain,
      type: (fever && scene !== "menu") ? "sawtooth" : "triangle",
      frequency: beat === 0 ? chord.root : chord.fifth,
      startTime: now,
      duration: (intervalMs / 1000) * 1.7,
      gain: (0.08 + intensity * 0.03) * ((fever && scene !== "menu") ? 1.25 : 1.0),
      filterType: "lowpass",
      filterFrequency: (160 + intensity * 120) * ((fever && scene !== "menu") ? 2.5 : 1.0),
    });
  }

  if (beat === 2 || beat === 5 || beat === 7) {
    chord.tones.forEach((freq, index) => {
      playTone({
        destination: musicGain,
        type: (fever && scene !== "menu") ? "sawtooth" : "sine",
        frequency: freq,
        startTime: now + index * 0.004,
        duration: (intervalMs / 1000) * 0.85,
        gain: (0.024 + intensity * 0.012) * ((fever && scene !== "menu") ? 0.7 : 1.0),
        filterType: "lowpass",
        filterFrequency: (420 + intensity * 480) * ((fever && scene !== "menu") ? 2.2 : 1.0),
      });
    });
  }

  if (beat === 1 || beat === 3 || beat === 6) {
    const melIdx = (bar + beat) % chord.melody.length;
    const baseFreq = chord.melody[melIdx];
    playTone({
      destination: musicGain,
      type: (fever && scene !== "menu") ? "sawtooth" : (isMajor ? "sine" : "triangle"),
      frequency: baseFreq,
      startTime: now,
      duration: (intervalMs / 1000) * 0.78,
      gain: (0.018 + intensity * 0.008) * ((fever && scene !== "menu") ? 1.2 : 1.0),
      filterType: "lowpass",
      filterFrequency: (900 + intensity * 1000) * ((fever && scene !== "menu") ? 2.5 : 1.0),
      detune: Math.sin(now * 10) * ((fever && scene !== "menu") ? 18 : 8),
    });
  }

  if (scene !== "menu" && (beat === 0 || beat === 2 || beat === 4 || beat === 6)) {
    playTone({
      destination: musicGain,
      type: "triangle",
      frequency: beat === 0 || beat === 4 ? chord.root / 2 : chord.root / 1.5,
      startTime: now,
      duration: (intervalMs / 1000) * 0.55,
      gain: 0.04 + intensity * 0.015,
      filterType: "lowpass",
      filterFrequency: 120 + intensity * 90,
    });
  }

  if (scene !== "menu" && (beat === 0 || beat === 4)) {
    playNoiseBurst({
      destination: musicGain,
      duration: (intervalMs / 1000) * 0.08,
      gain: 0.018 + intensity * 0.008,
      filterFrequency: 4200,
      filterDecay: 1800,
      startTime: now,
    });
  }

  if (scene !== "menu" && intensity > 0.38 && beat % 2 === 0) {
    playTone({
      destination: musicGain,
      type: "sine",
      frequency: beat === 0 || beat === 4 ? 72 : 92,
      startTime: now,
      duration: 0.11,
      gain: 0.045 + intensity * 0.025,
      endFrequency: 42,
      filterType: "lowpass",
      filterFrequency: 180,
    });
  }

  if (scene !== "menu" && intensity > 0.62 && (beat === 1 || beat === 3 || beat === 5 || beat === 7)) {
    playNoiseBurst({
      destination: musicGain,
      duration: 0.045,
      gain: 0.02 + intensity * 0.012,
      filterFrequency: 7200,
      filterDecay: 3800,
      startTime: now,
    });
  }

  if (scene !== "menu" && intensity > 0.78 && beat === 7) {
    [880, 1174.66, 1567.98].forEach((frequency, index) => {
      playTone({
        destination: musicGain,
        type: "square",
        frequency,
        startTime: now + index * 0.035,
        duration: 0.055,
        gain: 0.022,
        filterType: "highpass",
        filterFrequency: 700,
      });
    });
  }

  if (beat === 0 && bar === 0) {
    playTone({
      destination: musicGain,
      type: "sine",
      frequency: scene === "menu" ? 523.25 : 659.25,
      startTime: now,
      duration: 0.18,
      gain: 0.022 + intensity * 0.008,
      filterType: "highpass",
      filterFrequency: 300,
    });
  }
};

export const startArpeggiator = (bpm = 110, scaleType = "minor", intensity = 0.1, scene = "game", fever = false) => {
  if (!audioEnabled) return;
  stopArpeggiator();
  initAudio();
  if (!audioCtx) return;

  let effectiveBpm = bpm;
  if (fever) {
    effectiveBpm = Math.min(240, Math.floor(bpm * 1.3));
  }
  const intervalMs = (60 / effectiveBpm) * 1000 / 2;
  let localStep = currentArpNote;

  arpeggiatorInterval = setInterval(() => {
    try {
      if (!audioCtx || audioCtx.state === "suspended" || !audioEnabled) return;
      const now = audioCtx.currentTime;
      scheduleMusicStep({ now, step: localStep, scene, scaleType, intensity, intervalMs, fever });
      localStep += 1;
      currentArpNote = localStep;
    } catch (e) {
      console.warn("Background music playback failed: ", e);
    }
  }, intervalMs);
};

export const stopArpeggiator = () => {
  if (arpeggiatorInterval) {
    clearInterval(arpeggiatorInterval);
    arpeggiatorInterval = null;
  }
};

export const playSFX = (type, comboCount = 0) => {
  try {
    if (!audioEnabled) return;
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    switch (type) {
      case "button": {
        playTone({
          frequency: 440,
          startTime: now,
          duration: 0.07,
          gain: 0.045,
          type: "triangle",
          filterType: "highpass",
          filterFrequency: 220,
          destination: sfxGain,
        });
        break;
      }

      case "unlock": {
        playTone({
          frequency: 523.25,
          startTime: now,
          duration: 0.14,
          gain: 0.08,
          type: "triangle",
          endFrequency: 1046.5,
          filterType: "lowpass",
          filterFrequency: 1200,
          destination: sfxGain,
        });
        playTone({
          frequency: 783.99,
          startTime: now + 0.05,
          duration: 0.16,
          gain: 0.05,
          type: "sine",
          endFrequency: 1174.66,
          filterType: "lowpass",
          filterFrequency: 1600,
          destination: sfxGain,
        });
        break;
      }

      case "daily": {
        playTone({
          frequency: 392.0,
          startTime: now,
          duration: 0.18,
          gain: 0.06,
          type: "sine",
          endFrequency: 523.25,
          filterType: "lowpass",
          filterFrequency: 1300,
          destination: sfxGain,
        });
        playTone({
          frequency: 659.25,
          startTime: now + 0.08,
          duration: 0.16,
          gain: 0.045,
          type: "sine",
          endFrequency: 783.99,
          filterType: "highpass",
          filterFrequency: 700,
          destination: sfxGain,
        });
        break;
      }

      case "race_start": {
        playNoiseBurst({
          duration: 0.14,
          gain: 0.08,
          filterFrequency: 1800,
          filterDecay: 900,
          destination: sfxGain,
        });
        playTone({
          frequency: 196.0,
          startTime: now,
          duration: 0.16,
          gain: 0.08,
          type: "triangle",
          endFrequency: 98.0,
          filterType: "lowpass",
          filterFrequency: 400,
          destination: sfxGain,
        });
        break;
      }

      case "level_start": {
        playTone({
          frequency: 329.63,
          startTime: now,
          duration: 0.12,
          gain: 0.06,
          type: "triangle",
          endFrequency: 523.25,
          filterType: "highpass",
          filterFrequency: 280,
          destination: sfxGain,
        });
        playTone({
          frequency: 523.25,
          startTime: now + 0.05,
          duration: 0.12,
          gain: 0.05,
          type: "sine",
          endFrequency: 783.99,
          filterType: "highpass",
          filterFrequency: 300,
          destination: sfxGain,
        });
        break;
      }

      case "theme": {
        playTone({
          frequency: 587.33,
          startTime: now,
          duration: 0.18,
          gain: 0.05,
          type: "sine",
          endFrequency: 932.33,
          filterType: "lowpass",
          filterFrequency: 1600,
          destination: sfxGain,
        });
        break;
      }

      case "mutator": {
        playNoiseBurst({
          duration: 0.1,
          gain: 0.045,
          filterFrequency: 2400,
          filterDecay: 1200,
          destination: sfxGain,
        });
        playTone({
          frequency: 110.0,
          startTime: now,
          duration: 0.1,
          gain: 0.05,
          type: "square",
          endFrequency: 55.0,
          filterType: "lowpass",
          filterFrequency: 500,
          destination: sfxGain,
        });
        break;
      }

      case "correct": {
        // Streak-pitched reward ladder: each consecutive correct answer lifts the
        // chime by a semitone (capped) so the player literally hears momentum build.
        const semis = Math.min(Math.max(comboCount - 1, 0), 12);
        const shift = Math.pow(2, semis / 12);
        playTone({ frequency: 523.25 * shift, startTime: now, duration: 0.16, gain: 0.1, type: "sine", endFrequency: 659.25 * shift, destination: sfxGain });
        playTone({ frequency: 659.25 * shift, startTime: now + 0.08, duration: 0.14, gain: 0.09, type: "sine", endFrequency: 783.99 * shift, destination: sfxGain });
        playTone({ frequency: 783.99 * shift, startTime: now + 0.16, duration: 0.14, gain: 0.08, type: "triangle", endFrequency: 1046.5 * shift, destination: sfxGain });
        // A bright sparkle tops the chord once the player is on a real streak.
        if (comboCount >= 3) {
          playTone({ frequency: 1318.51 * shift, startTime: now + 0.2, duration: 0.12, gain: 0.05, type: "sine", endFrequency: 1567.98 * shift, filterType: "highpass", filterFrequency: 800, destination: sfxGain });
        }
        break;
      }

      case "coin": {
        // Soft ascending blip used to "tick" the animated score counter upward.
        const base = 880 + Math.min(comboCount, 8) * 60;
        playTone({ frequency: base, startTime: now, duration: 0.05, gain: 0.035, type: "triangle", endFrequency: base * 1.5, filterType: "highpass", filterFrequency: 500, destination: sfxGain });
        break;
      }

      case "incorrect": {
        playTone({ frequency: 150, startTime: now, duration: 0.35, gain: 0.14, type: "sawtooth", endFrequency: 90, destination: sfxGain });
        break;
      }

      case "rotate": {
        playTone({ frequency: 300, startTime: now, duration: 0.08, gain: 0.07, type: "triangle", endFrequency: 600, destination: sfxGain });
        break;
      }

      case "hold": {
        playTone({ frequency: 360, startTime: now, duration: 0.09, gain: 0.06, type: "square", endFrequency: 240, destination: sfxGain });
        break;
      }

      case "drop": {
        playTone({ frequency: 800, startTime: now, duration: 0.06, gain: 0.055, type: "sine", endFrequency: 200, destination: sfxGain });
        break;
      }

      case "lock": {
        playTone({ frequency: 120, startTime: now, duration: 0.15, gain: 0.16, type: "sine", endFrequency: 40, destination: sfxGain });
        break;
      }

      case "match": {
        const baseFreq = 440 + comboCount * 110;
        playTone({ frequency: baseFreq, startTime: now, duration: 0.18, gain: 0.11, type: "sine", endFrequency: baseFreq * 2, destination: sfxGain });
        if (comboCount >= 1) {
          playTone({ frequency: baseFreq * 1.5, startTime: now + 0.04, duration: 0.16, gain: 0.08, type: "triangle", endFrequency: baseFreq * 2.5, destination: sfxGain });
        }
        break;
      }

      case "streak": {
        playTone({ frequency: 659.25, startTime: now, duration: 0.1, gain: 0.055, type: "triangle", endFrequency: 880.0, destination: sfxGain });
        playTone({ frequency: 880.0, startTime: now + 0.06, duration: 0.11, gain: 0.05, type: "sine", endFrequency: 1174.66, destination: sfxGain });
        break;
      }

      case "drill": {
        playTone({ frequency: 210, startTime: now, duration: 0.34, gain: 0.11, type: "sawtooth", endFrequency: 70, filterType: "lowpass", filterFrequency: 900, destination: sfxGain });
        [0, 0.07, 0.14, 0.21].forEach((offset, index) => {
          playNoiseBurst({
            duration: 0.065,
            gain: 0.075 - index * 0.008,
            filterFrequency: 2600 - index * 350,
            filterDecay: 700,
            startTime: now + offset,
            destination: sfxGain,
          });
        });
        break;
      }

      case "fruit_apple": {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          playTone({
            frequency,
            startTime: now + index * 0.045,
            duration: 0.14,
            gain: 0.075,
            type: "sine",
            endFrequency: frequency * 1.18,
            destination: sfxGain,
          });
        });
        break;
      }

      case "fruit_orange": {
        playNoiseBurst({ duration: 0.24, gain: 0.15, filterFrequency: 3200, filterDecay: 480, destination: sfxGain });
        [220, 330, 440].forEach((frequency, index) => {
          playTone({
            frequency,
            startTime: now + index * 0.035,
            duration: 0.2,
            gain: 0.08,
            type: "triangle",
            endFrequency: frequency * 0.62,
            destination: sfxGain,
          });
        });
        break;
      }

      case "fruit_banana": {
        [880, 659.25, 987.77, 739.99, 1174.66].forEach((frequency, index) => {
          playTone({
            frequency,
            startTime: now + index * 0.055,
            duration: 0.09,
            gain: 0.065,
            type: "square",
            endFrequency: frequency * 1.28,
            filterType: "highpass",
            filterFrequency: 500,
            destination: sfxGain,
          });
        });
        break;
      }

      case "explosion": {
        playNoiseBurst({ duration: 0.45, gain: 0.22, filterFrequency: 800, filterDecay: 30, destination: sfxGain });
        playTone({ frequency: 140, startTime: now, duration: 0.28, gain: 0.09, type: "triangle", endFrequency: 55, destination: sfxGain });
        break;
      }

      case "thunder": {
        // Electric crackle + rolling boom for the Lightning blast.
        playNoiseBurst({ duration: 0.12, gain: 0.18, filterFrequency: 6000, filterDecay: 2500, destination: sfxGain });
        playNoiseBurst({ duration: 0.5, gain: 0.16, filterFrequency: 1400, filterDecay: 40, startTime: now + 0.04, destination: sfxGain });
        playTone({ frequency: 90, startTime: now + 0.02, duration: 0.4, gain: 0.12, type: "triangle", endFrequency: 40, destination: sfxGain });
        // Rapid zap arpeggio sells the "electrify".
        [1760, 1320, 2093, 1568, 2637].forEach((freq, i) => {
          playTone({ frequency: freq, startTime: now + i * 0.035, duration: 0.06, gain: 0.05, type: "square", filterType: "highpass", filterFrequency: 900, destination: sfxGain });
        });
        break;
      }

      case "level_win": {
        const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, index) => {
          playTone({
            frequency: freq,
            startTime: now + index * 0.09,
            duration: 0.22,
            gain: 0.09,
            type: "triangle",
            endFrequency: freq * 1.12,
            destination: sfxGain,
          });
        });
        break;
      }

      case "gameover": {
        const notes = [392.0, 349.23, 311.13, 261.63, 233.08, 196.0];
        notes.forEach((freq, index) => {
          playTone({
            frequency: freq,
            startTime: now + index * 0.14,
            duration: 0.32,
            gain: 0.1,
            type: "triangle",
            endFrequency: freq * 0.92,
            destination: sfxGain,
          });
        });
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.warn("Audio playback failed or blocked: ", e);
  }
};
