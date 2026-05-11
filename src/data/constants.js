// ==========================================
// GAME CONFIGURATION & SCORING
// ==========================================
// These values are intentionally isolated so difficulty, scoring, and board
// size can be tuned without touching the game engine.
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 16;
export const WIN_SCORE_TARGET = 500;
export const STRIKES_ALLOWED = 3;

export const POINTS = {
  CORRECT_ANSWER: 10,
  COLOR_MATCH: 30,
  LINE_CLEAR: 100,
  FRUIT_BOMB: 50,
};

// Speed scales up as levels increase. Smaller interval = faster drop.
export const LEVEL_CONFIG = {
  1: { baseSpeed: 400, fastSpeed: 30 },
  2: { baseSpeed: 250, fastSpeed: 15 },
  3: { baseSpeed: 200, fastSpeed: 10 },
  4: { baseSpeed: 150, fastSpeed: 5 },
  5: { baseSpeed: 130, fastSpeed: 5 },
  6: { baseSpeed: 110, fastSpeed: 5 },
  7: { baseSpeed: 90, fastSpeed: 5 },
  8: { baseSpeed: 75, fastSpeed: 5 },
};

// ==========================================
// BLOCK DEFINITIONS
// ==========================================
export const TETROMINOES = [
  { shape: [[1, 1, 1, 1]], color: "bg-cyan-500" }, // I
  { shape: [[1, 1], [1, 1]], color: "bg-yellow-400" }, // O
  { shape: [[0, 1, 0], [1, 1, 1]], color: "bg-purple-500" }, // T
  { shape: [[1, 0, 0], [1, 1, 1]], color: "bg-orange-500" }, // L
  { shape: [[0, 0, 1], [1, 1, 1]], color: "bg-blue-500" }, // J
  { shape: [[0, 1, 1], [1, 1, 0]], color: "bg-green-500" }, // S
  { shape: [[1, 1, 0], [0, 1, 1]], color: "bg-red-500" }, // Z
];

// Special 1x1 fruit blocks detonate after landing.
export const FRUITS = [
  { shape: [[1]], color: "bg-red-500", isFruit: true, emoji: "🍎" },
  { shape: [[1]], color: "bg-orange-500", isFruit: true, emoji: "🍊" },
  { shape: [[1]], color: "bg-yellow-400", isFruit: true, emoji: "🍌" },
];
