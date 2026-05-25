// Web Audio API Retro Synthesizer for ThinkFastBlast
// Programmatically generates game sound effects and background arpeggios.

let audioCtx = null;
let arpeggiatorInterval = null;
let currentArpNote = 0;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
};

export const startArpeggiator = (bpm = 110, scaleType = "minor", intensity = 0.1) => {
  stopArpeggiator();
  initAudio();
  if (!audioCtx) return;

  const intervalMs = (60 / bpm) * 1000 / 2; // eighth notes
  
  // Scales: minor and major chord progressions
  const minorScale = [130.81, 155.56, 196.00, 233.08, 261.63, 311.13, 392.00, 466.16]; // C3 minor chord tones
  const majorScale = [130.81, 164.81, 196.00, 246.94, 261.63, 329.63, 392.00, 493.88]; // C3 major chord tones
  const scale = scaleType === "minor" ? minorScale : majorScale;

  arpeggiatorInterval = setInterval(() => {
    try {
      if (audioCtx.state === "suspended") return;
      const now = audioCtx.currentTime;
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = "triangle";

      // Melodic arpeggio pattern: 0 -> 2 -> 4 -> 6 -> 7 -> 5 -> 3 -> 1
      const pattern = [0, 2, 4, 6, 7, 5, 3, 1];
      const noteIndex = pattern[currentArpNote % pattern.length];
      const freq = scale[noteIndex];

      osc.frequency.setValueAtTime(freq, now);

      // Low-pass filter sweeps open as danger (intensity) increases
      const cutoff = 180 + intensity * 700;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(cutoff, now);

      // Volume adjusts subtly based on intensity (keeps it atmospheric)
      const volume = 0.012 + intensity * 0.015;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (intervalMs / 1000) * 0.85);

      osc.start(now);
      osc.stop(now + (intervalMs / 1000) * 0.85);

      currentArpNote += 1;
    } catch (e) {
      console.warn("Arpeggiator note fail: ", e);
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
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    switch (type) {
      case "correct": {
        // High ascending double chime
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      
      case "incorrect": {
        // Low downward saw buzzer
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sawtooth";
        
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.35);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      
      case "rotate": {
        // Short clean sweep
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "triangle";
        
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      
      case "drop": {
        // Quick high pitch click
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);
        
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        
        osc.start(now);
        osc.stop(now + 0.06);
        break;
      }
      
      case "lock": {
        // Deep thud
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      
      case "match": {
        // Pop sound with pitch raising depending on combo multiplier
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        
        const baseFreq = 440 + comboCount * 110;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, now + 0.18);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }
      
      case "explosion": {
        // White noise explosion for fruit bombs / catalyst bombs
        const bufferSize = audioCtx.sampleRate * 0.45;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(20, now + 0.45);
        
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        
        noise.start(now);
        break;
      }
      
      case "level_win": {
        // Retro victory fanfare
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C major notes
        notes.forEach((freq, index) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = "triangle";
          
          osc.frequency.setValueAtTime(freq, now + index * 0.1);
          gain.gain.setValueAtTime(0.1, now + index * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.25);
          
          osc.start(now + index * 0.1);
          osc.stop(now + index * 0.1 + 0.25);
        });
        break;
      }
      
      case "gameover": {
        // Descending sad minor melody
        const notes = [392.00, 349.23, 311.13, 261.63, 233.08, 196.00]; // G-F-Eb-C-Bb-G
        notes.forEach((freq, index) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = "triangle";
          
          osc.frequency.setValueAtTime(freq, now + index * 0.15);
          gain.gain.setValueAtTime(0.12, now + index * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.15 + 0.35);
          
          osc.start(now + index * 0.15);
          osc.stop(now + index * 0.15 + 0.35);
        });
        break;
      }
      
      default:
        break;
    }
  } catch (e) {
    console.warn("Audio Context playback failed or blocked: ", e);
  }
};
