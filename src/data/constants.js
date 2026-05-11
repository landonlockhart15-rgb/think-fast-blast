// ==========================================
// GAME CONFIGURATION & SCORING
// ==========================================
// These values are intentionally isolated so difficulty, scoring, and board
// size can be tuned without touching the game engine.
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 16;
export const WIN_SCORE_TARGET = 500;
export const STRIKES_ALLOWED = 3;
export const PROGRESS_STORAGE_KEY = "think-fast-blast-progress";

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
  9: { baseSpeed: 70, fastSpeed: 5 },
  10: { baseSpeed: 65, fastSpeed: 5 },
};

export const LEVELS = [
  { id: 1, name: "Starter Spark", theme: "Easy facts", ageHint: "Warm-up" },
  { id: 2, name: "Brain Boost", theme: "School smarts", ageHint: "Growing" },
  { id: 3, name: "Disney Dash", theme: "Disney & Pixar", ageHint: "Fun" },
  { id: 4, name: "Knowledge Climb", theme: "Science, history, math", ageHint: "Medium" },
  { id: 5, name: "Meme Mayhem", theme: "Slang, games, internet jokes", ageHint: "Funny" },
  { id: 6, name: "Trivia Trek", theme: "Harder general trivia", ageHint: "Challenge" },
  { id: 7, name: "Expert Mix", theme: "Older-kid trivia", ageHint: "Tough" },
  { id: 8, name: "Pop Culture Chaos", theme: "Games, shows, movies", ageHint: "Party" },
  { id: 9, name: "Word Wizard", theme: "Vocabulary & language", ageHint: "Smart" },
  { id: 10, name: "Final Blast", theme: "Mixed challenge", ageHint: "Boss" },
];

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
