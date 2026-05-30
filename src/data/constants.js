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
  STREAK_BONUS: 5,
  COLOR_MATCH: 30,
  LINE_CLEAR: 100,
  FRUIT_BOMB: 50,
};

// Speed scales up as levels increase. Smaller interval = faster drop.
export const LEVEL_CONFIG = {
  1: { baseSpeed: 1000, fastSpeed: 30 },
  2: { baseSpeed: 850, fastSpeed: 30 },
  3: { baseSpeed: 700, fastSpeed: 25 },
  4: { baseSpeed: 580, fastSpeed: 20 },
  5: { baseSpeed: 480, fastSpeed: 20 },
  6: { baseSpeed: 400, fastSpeed: 15 },
  7: { baseSpeed: 340, fastSpeed: 15 },
  8: { baseSpeed: 290, fastSpeed: 10 },
  9: { baseSpeed: 250, fastSpeed: 10 },
  10: { baseSpeed: 210, fastSpeed: 10 },
  11: { baseSpeed: 190, fastSpeed: 5 },
  12: { baseSpeed: 170, fastSpeed: 5 },
  13: { baseSpeed: 150, fastSpeed: 5 },
  14: { baseSpeed: 130, fastSpeed: 5 },
  15: { baseSpeed: 115, fastSpeed: 5 },
  16: { baseSpeed: 100, fastSpeed: 5 },
  17: { baseSpeed: 90, fastSpeed: 5 },
  18: { baseSpeed: 80, fastSpeed: 5 },
  19: { baseSpeed: 70, fastSpeed: 5 },
  20: { baseSpeed: 60, fastSpeed: 5 },
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
  { id: 11, name: "Adult Mode", theme: "Harder mixed trivia begins", ageHint: "Adult" },
  { id: 12, name: "Science Pressure", theme: "Biology, space, chemistry", ageHint: "Adult" },
  { id: 13, name: "History Heat", theme: "World history and civics", ageHint: "Adult" },
  { id: 14, name: "Logic Lab", theme: "Math, logic, patterns", ageHint: "Adult" },
  { id: 15, name: "Culture Clash", theme: "Books, art, music, film", ageHint: "Adult" },
  { id: 16, name: "Tech Tangle", theme: "Computers, systems, internet", ageHint: "Adult" },
  { id: 17, name: "World Circuit", theme: "Geography and global facts", ageHint: "Adult" },
  { id: 18, name: "Language Lock", theme: "Vocabulary and grammar traps", ageHint: "Adult" },
  { id: 19, name: "Expert Gauntlet", theme: "Cross-category expert mix", ageHint: "Adult" },
  { id: 20, name: "Overdrive Boss", theme: "Fastest final adult challenge", ageHint: "Final" },
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

export const TRIVIA_FACTS = [
  "The word 'trivia' comes from the Latin 'trivium', which means a place where three roads meet.",
  "A group of flamingos is called a 'flamboyance'.",
  "The first computer bug was an actual real moth found trapped in a relay by computer scientist Grace Hopper in 1947.",
  "The name 'Tetris' is a combination of the Greek prefix 'tetra-' (meaning four) and 'tennis' (the creator's favorite sport).",
  "Honey never spoils. You could eat 3,000-year-old Egyptian tomb honey and it would taste perfectly fine!",
  "The longest English word without any of the five standard vowels (A, E, I, O, U) is 'rhythms'.",
  "Bananas are botanically classified as berries, but strawberries are not!",
  "Sound travels about four times faster in water than it does in air.",
  "Wombat poop is cube-shaped, which stops it from rolling away and helps mark their territory.",
  "The first commercial video game was 'Computer Space' (1971), created by the future founders of Atari.",
  "An octopus has three hearts, nine brains, and blue blood!",
  "A day on Venus is longer than its year! It takes Venus longer to spin once than to orbit the Sun.",
  "The popular spelling board game Scrabble was originally called 'Criss-Cross Words' when invented in 1938.",
  "In the original Pac-Man game, each of the four ghosts has a unique personality and chase algorithm.",
  "William Shakespeare is credited with inventing or first recording over 1,700 English words, including 'lonely' and 'dwindle'.",
  "Light from the Sun takes about 8 minutes and 20 seconds to travel to Earth.",
  "The word 'alphabet' comes from the first two letters of the Greek alphabet: alpha and beta.",
  "A 'jiffy' is an actual unit of time: the time it takes light to travel one centimeter in a vacuum (about 33 picoseconds).",
  "The inventor of the Rubik’s Cube, Ernő Rubik, spent a whole month learning how to solve his own invention before sharing it.",
  "The first domain name ever registered was 'symbolics.com' on March 15, 1985."
];

// ==========================================
// UNLOCKABLE SHOP THEMES & BOOSTERS
// ==========================================
export const THEMES = {
  DEFAULT: "default",
  CYBERPUNK: "theme_cyberpunk",
  RETRO: "theme_retro",
  SYNTHWAVE: "theme_synthwave",
  NEBULA: "theme_nebula",
  GAMEBOY: "theme_gameboy"
};

