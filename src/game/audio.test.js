import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage
const mockStorage = {
  store: {},
  getItem(key) {
    return this.store[key] ?? null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  clear() {
    this.store = {};
  }
};
globalThis.localStorage = mockStorage;

// Track mock nodes created to verify audio routing graph connections
const createdNodes = [];
const audioContextInstances = [];

class MockAudioParam {
  constructor(value = 1.0) {
    this.value = value;
    this.calls = [];
  }
  setValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: "setValueAtTime", val, time });
  }
  setTargetAtTime(val, time, constant) {
    this.value = val;
    this.calls.push({ method: "setTargetAtTime", val, time, constant });
  }
  linearRampToValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: "linearRampToValueAtTime", val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this.value = val;
    this.calls.push({ method: "exponentialRampToValueAtTime", val, time });
  }
}

class MockAudioNode {
  constructor(nodeType) {
    this.type = nodeType; // Web Audio nodes often overwrite 'type' property
    this.nodeType = nodeType;
    this.connections = [];
    createdNodes.push(this);
  }
  connect(dest) {
    this.connections.push(dest);
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super("gain");
    this.gain = new MockAudioParam(1.0);
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor() {
    super("compressor");
    this.threshold = new MockAudioParam(-10);
    this.knee = new MockAudioParam(18);
    this.ratio = new MockAudioParam(8);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.18);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super("oscillator");
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this.started = false;
    this.stopped = false;
  }
  start(time) {
    this.started = true;
  }
  stop(time) {
    this.stopped = true;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super("filter");
    this.frequency = new MockAudioParam(800);
  }
}

class MockAudioBuffer {
  constructor(channels, size, rate) {
    this.numberOfChannels = channels;
    this.length = size;
    this.sampleRate = rate;
  }
  getChannelData(channel) {
    return new Float32Array(this.length);
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super("bufferSource");
    this.buffer = null;
    this.started = false;
  }
  start(time) {
    this.started = true;
  }
}

class MockAudioContext {
  constructor() {
    audioContextInstances.push(this);
    this.state = "suspended";
    this.currentTime = 12.34;
    this.sampleRate = 44100;
    this.destination = new MockAudioNode("destination");
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return new MockGainNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createBuffer(channels, size, rate) {
    return new MockAudioBuffer(channels, size, rate);
  }
  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }
}

globalThis.AudioContext = MockAudioContext;
if (typeof globalThis.window !== "undefined") {
  globalThis.window.AudioContext = MockAudioContext;
}

// Import audio after setting up global mocks
const {
  playSFX,
  startArpeggiator,
  stopArpeggiator,
  setAudioEnabled,
  setMasterVolume,
  setMusicVolume,
  setSFXVolume,
  getVolumeSettings
} = await import("./audio.js");

let freshImportCounter = 0;
const importFreshAudioModule = async () => {
  freshImportCounter += 1;
  return import(`./audio.js?fresh=${freshImportCounter}`);
};

test("Audio settings and volume boundaries", () => {
  mockStorage.clear();
  
  // Test defaults
  let settings = getVolumeSettings();
  assert.equal(settings.masterVolume, 1.0);
  assert.equal(settings.musicVolume, 1.0);
  assert.equal(settings.sfxVolume, 1.0);

  // Test set functions
  setMasterVolume(0.5);
  setMusicVolume(0.7);
  setSFXVolume(0.2);

  settings = getVolumeSettings();
  assert.equal(settings.masterVolume, 0.5);
  assert.equal(settings.musicVolume, 0.7);
  assert.equal(settings.sfxVolume, 0.2);

  // Verify persistence in mocked localStorage
  assert.equal(mockStorage.getItem("think-fast-blast-master-volume"), "0.5");
  assert.equal(mockStorage.getItem("think-fast-blast-music-volume"), "0.7");
  assert.equal(mockStorage.getItem("think-fast-blast-sfx-volume"), "0.2");
});

test("Audio context initialization and toggle mute", () => {
  // Ensure audio is enabled at the start of this test
  setAudioEnabled(true);
  
  // Triggering playSFX builds the audio graph if not already built
  playSFX("button");
  
  // Find nodes from the entire lifetime of MockAudioContext
  const compressor = createdNodes.find(n => n.nodeType === "compressor");
  const destination = createdNodes.find(n => n.nodeType === "destination");
  
  assert.ok(compressor, "Compressor should be created");
  assert.ok(destination, "Destination node should exist");

  const masterGain = createdNodes.find(n => n.nodeType === "gain");
  assert.ok(masterGain, "Master gain node should be created");

  try {
    setAudioEnabled(false);
    // Verify master gain target updated towards 0
    const setTargetCalls = masterGain.gain.calls.filter(c => c.method === "setTargetAtTime");
    const targetCall = setTargetCalls[setTargetCalls.length - 1];
    assert.ok(targetCall, "Should have a setTargetAtTime call");
    assert.equal(targetCall.val, 0);
  } finally {
    // Ensure we ALWAYS leave audio enabled for subsequent tests
    setAudioEnabled(true);
  }
});

test("Sound effects play tones and noises correctly based on types", () => {
  setAudioEnabled(true);

  // Clear createdNodes of transient nodes before playing SFX
  createdNodes.length = 0;

  // 1. playSFX for correct chime (starts at combo count, pitch escalates)
  playSFX("correct", 1);
  const oscillators1 = createdNodes.filter(n => n.nodeType === "oscillator");
  assert.ok(oscillators1.length >= 2, "A correct chime chord should start multiple oscillators");

  // 2. playSFX for correct streak chime
  createdNodes.length = 0;
  playSFX("correct", 4);
  const oscillators2 = createdNodes.filter(n => n.nodeType === "oscillator");
  assert.ok(oscillators2.length >= 3, "Streak correct answer gets high sparkle oscillator");

  // 3. playSFX for incorrect sound (low pitch descending sawtooth + thud noise burst)
  createdNodes.length = 0;
  playSFX("incorrect", 1);
  const oscIncorrect = createdNodes.find(n => n.nodeType === "oscillator");
  assert.ok(oscIncorrect);
  assert.equal(oscIncorrect.type, "sawtooth");
  const noiseIncorrect = createdNodes.find(n => n.nodeType === "bufferSource");
  assert.ok(noiseIncorrect, "Incorrect answer should play a thud noise burst");
  assert.ok(noiseIncorrect.started);

  // 4. playSFX for explosions
  createdNodes.length = 0;
  playSFX("explosion");
  const noiseSource = createdNodes.find(n => n.nodeType === "bufferSource");
  assert.ok(noiseSource, "Explosion should play a noise burst buffer source");
  assert.ok(noiseSource.started);

  // 5. playSFX for lightning (thunder)
  createdNodes.length = 0;
  playSFX("thunder");
  const thunderNoises = createdNodes.filter(n => n.nodeType === "bufferSource");
  assert.ok(thunderNoises.length >= 2, "Thunder should use multiple noise bursts");
});

test("Arpeggiator lifecycle setup and teardown", async () => {
  setAudioEnabled(true);
  
  // Clear createdNodes of transient nodes before starting arpeggiator
  createdNodes.length = 0;
  
  // Start arpeggiator (high bpm to trigger fast)
  startArpeggiator(200, "minor", 0.5, "game", false);
  
  // Wait a small timeout to let the interval trigger at least once
  await new Promise(resolve => setTimeout(resolve, 300));
  
  stopArpeggiator();
  
  // Verify that nodes were created for arpeggio music steps
  const arpeggioOscs = createdNodes.filter(n => n.nodeType === "oscillator");
  assert.ok(arpeggioOscs.length > 0, "Arpeggiator should play backing track tones");
});

test("Arpeggiator cold-starts audio graph before any sound effect has played", async () => {
  const freshAudio = await importFreshAudioModule();
  mockStorage.clear();
  createdNodes.length = 0;
  audioContextInstances.length = 0;

  freshAudio.startArpeggiator(240, "minor", 0.5, "game", false);

  try {
    assert.equal(audioContextInstances.length, 1, "Starting music from silence should create an AudioContext");
    assert.equal(audioContextInstances[0].state, "running", "Cold-started music should resume the suspended AudioContext");
    assert.ok(
      createdNodes.some(n => n.nodeType === "compressor"),
      "Cold-started music should build the limiter/master routing graph"
    );

    await new Promise(resolve => setTimeout(resolve, 280));

    assert.ok(
      createdNodes.some(n => n.nodeType === "oscillator" || n.nodeType === "bufferSource"),
      "Cold-started arpeggiator should schedule audible music nodes"
    );
  } finally {
    freshAudio.stopArpeggiator();
  }
});

test("Arpeggiator remains a no-op when audio is disabled before first playback", async () => {
  const freshAudio = await importFreshAudioModule();
  createdNodes.length = 0;
  audioContextInstances.length = 0;

  freshAudio.setAudioEnabled(false);
  freshAudio.startArpeggiator(240, "minor", 0.5, "game", false);

  await new Promise(resolve => setTimeout(resolve, 80));

  assert.equal(audioContextInstances.length, 0, "Disabled audio should not allocate an AudioContext");
  assert.equal(createdNodes.length, 0, "Disabled audio should not create or schedule Web Audio nodes");
});

test("Arpeggiator combo track is scheduled based on streak", async () => {
  setAudioEnabled(true);
  
  // Clear createdNodes
  createdNodes.length = 0;
  
  // Start arpeggiator with combo streak of 5
  startArpeggiator(240, "minor", 0.5, "game", false, 5);
  
  // Wait a small timeout to let the interval trigger at least once
  await new Promise(resolve => setTimeout(resolve, 300));
  
  stopArpeggiator();
  
  // High-pitched combo track oscillators should be created (frequency > 500)
  const comboOscs = createdNodes.filter(n => n.nodeType === "oscillator" && n.frequency.value > 500);
  assert.ok(comboOscs.length > 0, "Combo track should schedule high-pitched oscillators during a streak");
});
