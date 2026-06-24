import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FRUITS,
  LEVEL_CONFIG,
  LEVELS,
  POINTS,
  PROGRESS_STORAGE_KEY,
  STRIKES_ALLOWED,
  TETROMINOES,
  WIN_SCORE_TARGET,
  TRIVIA_FACTS,
} from "./data/constants";
import { QUESTION_BANKS } from "./data/questions";
import {
  checkCollision,
  clearBoardCells,
  createEmptyBoard,
  findFruitEffectCells,
  rotateShapeClockwise,
  shuffleArray,
  findRowClearCells,
  findArea2x2ClearCells,
} from "./game/board";
import {
  playSFX,
  startArpeggiator,
  stopArpeggiator,
  setAudioEnabled,
  setMasterVolume,
  setMusicVolume,
  setSFXVolume,
  getVolumeSettings,
} from "./game/audio";
import {
  DIFFICULTY_PRESETS,
  getObjectiveStatus,
  getRunConfig,
  isRunComplete,
} from "./game/difficulty";
import {
  buildDailyQuestionDeck,
  buildQuestionDeck,
  getDailyChallengeKey,
} from "./game/questionDeck";
import { getArenaAiTurn } from "./game/arenaAi";
import { advanceAiRace, createAiRaceMetrics } from "./game/aiRace";
import { applyBoardPower, BOARD_POWERS } from "./game/boardPowers";
import { getStreakPowerType, getEvolvedStreakPowerType, isEvolvedStreak, SPECIAL_BLOCK_RATES } from "./game/specialBalance";
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  MAX_PROFILES,
  readProfiles,
  readScopedValue,
  setActiveProfileId as persistActiveProfileId,
  updateProfile,
  writeScopedValue,
} from "./game/profileStore";
import Confetti from "./game/Confetti";
import OnlineArena from "./game/OnlineArenaView";
import { isMobileDevice, drawSparks, drawParticles } from "./utils/render";
import Game from "./components/Game";
import { saveEndlessScoreToSupabase } from "./game/supabase";
import EndlessLeaderboardView from "./components/EndlessLeaderboardView";
import {
  QuickAnswerTimer,
  MenuLightfield,
  MenuStatPill,
  AchievementCard,
  PiecePreview,
} from "./components/GameUIElements";

const STATS_STORAGE_KEY = "think-fast-blast-stats";
const RECENT_QUESTIONS_STORAGE_KEY = "think-fast-blast-recent-questions";
const PLAYABLE_STATES = new Set(["quiz", "dropping", "transition", "resolving", "strike_recovery", "arena_quiz", "arena_dropping", "arena_resolving"]);
const LEVEL_INTRO_SECONDS = 5;
const FLASH_DURATION_MS = 260;
const AI_THINKING_LINES = [
  "Reading the question. Revolutionary technology.",
  "Consulting my extremely modest genius.",
  "Thinking... unlike a loading spinner with confidence.",
  "Running the numbers. Also judging the punctuation.",
];
const AI_PLAYER_WINS_LINES = [
  "Okay, that was fast. Suspiciously respectable.",
  "Nice answer. I definitely let you have that one.",
  "Point to you. My dramatic comeback remains scheduled.",
  "Well played. Please stop making me update my excuses.",
];
const AI_BOT_WINS_LINES = [
  "Beep boop. I knew that one before it was cool.",
  "Too slow, carbon-based challenger.",
  "That point is mine. I will display it tastefully.",
  "Quick circuits, quicker answer. No hard feelings.",
];
const AI_MISS_LINES = [
  "I meant to test your confidence. You passed.",
  "My calculator says that was character development.",
  "A tactical error. Very tactical. Extremely error.",
  "Nobody screenshot that.",
];

const SHOP_ITEMS = [
  ...Object.entries(BOARD_POWERS).map(([id, power]) => ({
    id,
    name: power.name,
    desc: `${power.description} Usable once per level after purchase.`,
    cost: power.cost,
    type: "power",
    emoji: power.emoji,
  })),
  { id: "theme_cyberpunk", name: "Cyberpunk Neon Theme", desc: "Adds glowing retro-future styling and cyber shadows to blocks", cost: 100, type: "theme" },
  { id: "theme_retro", name: "Retro Green Theme", desc: "Classic Matrix-style digital terminal grid with binary elements", cost: 120, type: "theme" },
  { id: "theme_synthwave", name: "Synthwave Sunset Theme", desc: "Vibrant neon pink, purple, and orange blocks with horizontal grid glow", cost: 150, type: "theme" },
  { id: "theme_nebula", name: "Nebula Cosmic Theme", desc: "Deep space nebula blocks with cosmic star dust and glowing borders", cost: 180, type: "theme" },
  { id: "theme_gameboy", name: "Gameboy Classic Theme", desc: "Retro 4-shade green monochrome handheld console pixel style", cost: 200, type: "theme" },
  { id: "catalyst_bomb", name: "Catalyst Bomb Block", desc: "Enables rare 💣 block spawns that clear 3x3 grids when they land", cost: 150, type: "block" },
  { id: "catalyst_wildcard", name: "Wildcard Block", desc: "Enables rare ✨ block spawns that connect and clear any adjacent colors", cost: 200, type: "block" },
];

function EarthquakeIcon({ className = "" }) {
  return (
    <svg
      className={`earthquake-icon ${className}`}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Cracked ground shaking"
    >
      <path className="earthquake-icon-wave" d="M4 13h7l3-4 4 8 4-6 4 4h7l3-4 4 7h4" />
      <path className="earthquake-icon-ground" d="M5 31h11l4-5 5 12 5-9 4 2h9" />
      <path className="earthquake-icon-crack" d="M24 19l-3 8 5 3-3 9" />
    </svg>
  );
}

function PowerIcon({ powerId, power, className = "" }) {
  if (powerId === "power_earthquake" || power?.effect === "earthquake") {
    return <EarthquakeIcon className={className} />;
  }
  return <span className={className}>{power?.emoji}</span>;
}

const getThemeCellColor = (baseColor, themeName) => {
  if (themeName === "theme_retro") {
    return "retro-green-block";
  }
  if (themeName === "theme_cyberpunk") {
    const cyberpunkMap = {
      "bg-cyan-500": "cyberpunk-cyan",
      "bg-yellow-400": "cyberpunk-yellow",
      "bg-purple-500": "cyberpunk-purple",
      "bg-orange-500": "cyberpunk-orange",
      "bg-blue-500": "cyberpunk-blue",
      "bg-green-500": "cyberpunk-green",
      "bg-red-500": "cyberpunk-red",
    };
    return cyberpunkMap[baseColor] || baseColor;
  }
  if (themeName === "theme_synthwave") {
    const synthwaveMap = {
      "bg-cyan-500": "synthwave-cyan",
      "bg-yellow-400": "synthwave-yellow",
      "bg-purple-500": "synthwave-purple",
      "bg-orange-500": "synthwave-orange",
      "bg-blue-500": "synthwave-blue",
      "bg-green-500": "synthwave-green",
      "bg-red-500": "synthwave-red",
    };
    return synthwaveMap[baseColor] || baseColor;
  }
  if (themeName === "theme_nebula") {
    const nebulaMap = {
      "bg-cyan-500": "nebula-cyan",
      "bg-yellow-400": "nebula-yellow",
      "bg-purple-500": "nebula-purple",
      "bg-orange-500": "nebula-orange",
      "bg-blue-500": "nebula-blue",
      "bg-green-500": "nebula-green",
      "bg-red-500": "nebula-red",
    };
    return nebulaMap[baseColor] || baseColor;
  }
  if (themeName === "theme_gameboy") {
    const gameboyMap = {
      "bg-cyan-500": "gameboy-dark",
      "bg-blue-500": "gameboy-dark",
      "bg-purple-500": "gameboy-medium",
      "bg-red-500": "gameboy-medium",
      "bg-orange-500": "gameboy-light",
      "bg-yellow-400": "gameboy-light",
      "bg-green-500": "gameboy-light",
    };
    return gameboyMap[baseColor] || baseColor;
  }
  return baseColor;
};

const getBoardThemeClass = (themeName) => {
  if (themeName === "theme_retro") {
    return "bg-black border-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.3)]";
  }
  if (themeName === "theme_cyberpunk") {
    return "bg-slate-950 border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]";
  }
  if (themeName === "theme_synthwave") {
    return "bg-[#0c051c] border-[#f43f5e] shadow-[0_0_15px_rgba(244,63,94,0.4)]";
  }
  if (themeName === "theme_nebula") {
    return "bg-[#04020f] border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.4)]";
  }
  if (themeName === "theme_gameboy") {
    return "bg-[#9bbc0f] border-[#0f380f] shadow-inner";
  }
  return "bg-slate-900 border-slate-700";
};

const getEmptyCellColor = (themeName) => {
  if (themeName === "theme_retro") {
    return "bg-emerald-950/20 border border-emerald-950/10";
  }
  if (themeName === "theme_cyberpunk") {
    return "bg-pink-950/10 border border-pink-950/5";
  }
  if (themeName === "theme_synthwave") {
    return "bg-purple-950/20 border border-purple-950/10";
  }
  if (themeName === "theme_nebula") {
    return "bg-indigo-950/15 border border-indigo-950/10";
  }
  if (themeName === "theme_gameboy") {
    return "bg-[#8bac0f]/30 border border-[#8bac0f]/20";
  }
  return "bg-slate-800";
};

const readSavedStats = () => {
  try {
    const saved = readScopedValue(STATS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      highScores: parsed.highScores || {},
      endlessHighScores: parsed.endlessHighScores || [],
      totalGames: parsed.totalGames || 0,
      totalCorrect: parsed.totalCorrect || 0,
      totalQuestions: parsed.totalQuestions || 0,
      glitches: parsed.glitches || 0,
      unlockedItems: parsed.unlockedItems || [],
      activeTheme: parsed.activeTheme || "default",
      unlockedAchievements: parsed.unlockedAchievements || [],
      bestStreak: parsed.bestStreak || 0,
      dailyStreak: parsed.dailyStreak || 0,
      lastDailyWin: parsed.lastDailyWin || "",
      dailyBest: parsed.dailyBest || 0,
      levelsWon: parsed.levelsWon || 0,
      arenaWins: parsed.arenaWins || 0,
      totalLines: parsed.totalLines || 0,
      totalMatches: parsed.totalMatches || 0,
      totalFruits: parsed.totalFruits || 0,
      totalSpecials: parsed.totalSpecials || 0,
    };
  } catch {
    return { highScores: {}, endlessHighScores: [], totalGames: 0, totalCorrect: 0, totalQuestions: 0, glitches: 0, unlockedItems: [], activeTheme: "default", unlockedAchievements: [], bestStreak: 0, dailyStreak: 0, lastDailyWin: "", dailyBest: 0, levelsWon: 0, arenaWins: 0, totalLines: 0, totalMatches: 0, totalFruits: 0, totalSpecials: 0 };
  }
};

const saveStats = (stats) => {
  try {
    writeScopedValue(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
};

const readRecentQuestionIds = () => {
  try {
    const parsed = JSON.parse(readScopedValue(RECENT_QUESTIONS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const rememberQuestionId = (questionId) => {
  if (!questionId) return;
  const recent = readRecentQuestionIds().filter((id) => id !== questionId);
  recent.push(questionId);
  writeScopedValue(RECENT_QUESTIONS_STORAGE_KEY, JSON.stringify(recent.slice(-120)));
};

const readBooleanPreference = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === "true";
  } catch {
    return fallback;
  }
};

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const FINAL_LEVEL_ID = LEVELS.at(-1).id;

const MUTATOR_DETAILS = {
  double_drop: {
    name: "Double Drop",
    desc: "Two blocks spawn simultaneously on opposite sides!",
    emoji: "♊",
    color: "from-amber-600 to-orange-500 text-amber-100 border-amber-500/30 bg-amber-950/20",
    glow: "shadow-amber-500/20"
  },
  inverse_gravity: {
    name: "Inverse Gravity",
    desc: "Blocks rise from the bottom instead of falling!",
    emoji: "⬆",
    color: "from-indigo-600 to-purple-500 text-indigo-100 border-indigo-500/30 bg-indigo-950/20",
    glow: "shadow-indigo-500/20"
  },
  dopamine_rush: {
    name: "Dopamine Rush",
    desc: "2x multiplier on all scores, but blocks drop twice as fast!",
    emoji: "🧠",
    color: "from-pink-600 to-rose-500 text-pink-100 border-pink-500/30 bg-pink-950/20",
    glow: "shadow-pink-500/20"
  },
  chaos_deck: {
    name: "Chaos Deck",
    desc: "Every question is pulled from a completely random level category!",
    emoji: "🌀",
    color: "from-cyan-600 to-blue-500 text-cyan-100 border-cyan-500/30 bg-cyan-950/20",
    glow: "shadow-cyan-500/20"
  },
  volcanic_surge: {
    name: "Volcanic Surge",
    desc: "A rising, glowing lava floor creeps up every 3 questions answered!",
    emoji: "🌋",
    color: "from-red-600 to-orange-600 text-red-100 border-red-500/30 bg-red-950/20",
    glow: "shadow-red-500/20"
  }
};

const readSavedProgress = () => {
  try {
    const saved = Number.parseInt(readScopedValue(PROGRESS_STORAGE_KEY), 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 1), FINAL_LEVEL_ID) : 1;
  } catch {
    return 1;
  }
};

const saveProgress = (level) => {
  try {
    writeScopedValue(PROGRESS_STORAGE_KEY, String(level));
  } catch {
    // Storage can be unavailable in private browsing or embedded contexts.
  }
};

const readProfileProgress = (profileId) => {
  try {
    const saved = Number.parseInt(readScopedValue(PROGRESS_STORAGE_KEY, undefined, profileId), 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 1), FINAL_LEVEL_ID) : 1;
  } catch {
    return 1;
  }
};

// -------------------------------------------------------------------------
// Interactive Previews for the Shop Cards
// -------------------------------------------------------------------------
// One-time achievements. Persisted in stats.unlockedAchievements; surfaced as toasts.
const ACHIEVEMENTS = {
  perfect: { label: "Quick Thinker", emoji: "⚡", desc: "Answered in under 2.2 seconds" },
  tnt: { label: "Demolitionist", emoji: "💣", desc: "Forged a TNT block on a x4 streak" },
  drill: { label: "Driller", emoji: "🌀", desc: "Forged a Drill block on a x8 streak" },
  lightning: { label: "Storm Caller", emoji: "⚡", desc: "Forged a Lightning Rod on a x12 streak" },
  streak10: { label: "Untouchable", emoji: "🔥", desc: "Reached a x10 answer streak" },
  line: { label: "Line Cook", emoji: "🧱", desc: "Cleared a full line" },
  bigmatch: { label: "Color Theory", emoji: "🌈", desc: "Cleared a 5+ color match" },
  first_win: { label: "Blast Off", emoji: "🚀", desc: "Won your first level" },
  flawless: { label: "Flawless Focus", emoji: "🌟", desc: "Won a level without taking a strike" },
  board_buster: { label: "Board Buster", emoji: "💥", desc: "Triggered four clears in one run" },
  fruit_salad: { label: "Fruit Salad", emoji: "🍎", desc: "Detonated three fruit blocks in one run" },
  power_trip: { label: "Power Trip", emoji: "🔋", desc: "Triggered three special blocks in one run" },
  level5: { label: "Getting Serious", emoji: "🎯", desc: "Cleared campaign level 5" },
  level10: { label: "Halfway Hero", emoji: "🏅", desc: "Cleared campaign level 10" },
  champion: { label: "Think Fast Champion", emoji: "🏆", desc: "Cleared campaign level 20" },
  daily: { label: "Daily Spark", emoji: "☀", desc: "Won a Daily Blast" },
  scholar: { label: "Century Mind", emoji: "🧠", desc: "Answered 100 questions correctly" },
  veteran: { label: "Arcade Regular", emoji: "🎮", desc: "Completed 10 game runs" },
  arena: { label: "Arena Victor", emoji: "🔮", desc: "Won a Blast Arena duel" },
  glitch_hoard: { label: "Glitch Hoard", emoji: "👾", desc: "Collected 1,000 Glitches" },
};

const PROFILE_AVATARS = ["⚡", "🚀", "🧠", "🎮", "🌈", "🔥", "👾", "⭐"];

const ONBOARDING_STEPS = [
  {
    kind: "profile",
    eyebrow: "Create Your Gamer Profile",
    title: "Who is playing?",
    body: "Choose a name, avatar, difficulty, and the campaign level where this player wants to begin.",
    icon: "🎮",
  },
  {
    eyebrow: "Think Fast",
    title: "Answer before the block lands",
    body: "Correct answers give you control. Fast answers build score, streak energy, and stronger special blocks.",
    icon: "🧠",
  },
  {
    eyebrow: "Place Smart",
    title: "Build lines and color groups",
    body: "Move, rotate, and drop pieces. Full rows and groups of five matching colors trigger chain reactions.",
    icon: "🧱",
  },
  {
    eyebrow: "Blast Big",
    title: "Streaks forge powerful pieces",
    body: "A special block arrives every four correct answers in a streak, with the strongest powers taking longer to earn. To win, complete both the score target and the level mission shown on screen.",
    icon: "⚡",
  },
];

// Escalating praise that scales with the current streak — variable verbal reward.
const praiseForStreak = (streak) => {
  if (streak >= 12) return "LEGENDARY! 👑";
  if (streak >= 10) return "GENIUS! 🧠";
  if (streak >= 8) return "UNSTOPPABLE! 🚀";
  if (streak >= 6) return "ON FIRE! 🔥";
  if (streak >= 4) return "BRILLIANT! 🌟";
  if (streak >= 2) return "GREAT! ✨";
  return "NICE! 👍";
};

// Tweens a displayed integer toward a target value with an ease-out curve, so the
// score visibly "ticks up" on every gain — the core dopamine micro-reward.
function useAnimatedNumber(target, durationMs = 550) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      fromRef.current = target;
      rafRef.current = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafRef.current);
    }

    startRef.current = 0;
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return display;
}

// QuickAnswerTimer has been extracted to src/components/GameUIElements.jsx

function StoreItemPreview({ itemId }) {
  const canvasRef = useRef(null);
  const power = BOARD_POWERS[itemId];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId;
    let time = 0;
    const width = (canvas.width = 120);
    const height = (canvas.height = 120);

    // Animation variables
    let bombTimer = 0;
    let bombY = -15;
    let explosionRadius = 0;
    let particles = [];

    let wildcardTimer = 0;
    let wildcardY = -15;
    let starBurstParticles = [];

    // Theme variables
    const themeBlocks = [
      { x: 1, y: 3, rawColor: "#06b6d4" },
      { x: 2, y: 3, rawColor: "#06b6d4" },
      { x: 1, y: 2, rawColor: "#a855f7" },
      { x: 0, y: 3, rawColor: "#eab308" },
    ];
    let themeFallY = -15;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      let cardBg = "#0f172a";
      let gridStroke = "rgba(51, 65, 85, 0.4)";
      if (itemId === "theme_gameboy") {
        cardBg = "#9bbc0f";
        gridStroke = "rgba(15, 56, 15, 0.15)";
      } else if (itemId === "theme_synthwave") {
        cardBg = "#0c051c";
        gridStroke = "rgba(244, 63, 94, 0.15)";
      } else if (itemId === "theme_nebula") {
        cardBg = "#04020f";
        gridStroke = "rgba(99, 102, 241, 0.15)";
      } else if (itemId === "theme_retro") {
        cardBg = "#022c22";
        gridStroke = "rgba(16, 185, 129, 0.15)";
      }

      ctx.fillStyle = cardBg;
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      const cellSize = 22;
      const gridCols = 5;
      const gridRows = 5;
      const startX = (width - gridCols * cellSize) / 2;
      const startY = (height - gridRows * cellSize) / 2;

      for (let r = 0; r <= gridRows; r++) {
        ctx.beginPath();
        ctx.moveTo(startX, startY + r * cellSize);
        ctx.lineTo(startX + gridCols * cellSize, startY + r * cellSize);
        ctx.stroke();
      }
      for (let c = 0; c <= gridCols; c++) {
        ctx.beginPath();
        ctx.moveTo(startX + c * cellSize, startY);
        ctx.lineTo(startX + c * cellSize, startY + gridRows * cellSize);
        ctx.stroke();
      }

      time += 1;

      if (itemId === "theme_cyberpunk") {
        themeBlocks.forEach((b) => {
          const bx = startX + b.x * cellSize + 1.5;
          const by = startY + b.y * cellSize + 1.5;
          const size = cellSize - 3;
          ctx.fillStyle = b.rawColor;
          ctx.shadowBlur = 8;
          ctx.shadowColor = b.rawColor;
          ctx.fillRect(bx, by, size, size);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, size, size);
          ctx.shadowBlur = 0; // reset
        });

        themeFallY += 0.55;
        if (themeFallY > 1) {
          themeFallY = -3;
        }

        const fallCol = 2;
        const blockColor = "#f97316";
        const shape = [[1, 0], [1, 1]];
        shape.forEach((row, dy) => {
          row.forEach((val, dx) => {
            if (val) {
              const gridY = themeFallY + dy;
              if (gridY >= 0 && gridY < gridRows) {
                const bx = startX + (fallCol + dx) * cellSize + 1.5;
                const by = startY + gridY * cellSize + 1.5;
                const size = cellSize - 3;
                ctx.fillStyle = blockColor;
                ctx.shadowBlur = 8;
                ctx.shadowColor = blockColor;
                ctx.fillRect(bx, by, size, size);
                ctx.strokeStyle = "#fff";
                ctx.strokeRect(bx, by, size, size);
                ctx.shadowBlur = 0;
              }
            }
          });
        });
      }
      else if (itemId === "theme_retro") {
        themeBlocks.forEach((b) => {
          const bx = startX + b.x * cellSize + 1.5;
          const by = startY + b.y * cellSize + 1.5;
          const size = cellSize - 3;
          ctx.fillStyle = "#022c22";
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 1.5;
          ctx.fillRect(bx, by, size, size);
          ctx.strokeRect(bx, by, size, size);

          ctx.fillStyle = "#34d399";
          ctx.font = "bold 9px monospace";
          ctx.fillText(((b.x + b.y) % 2 === 0) ? "0" : "1", bx + 7, by + size - 4);
        });

        ctx.fillStyle = "rgba(16, 185, 129, 0.4)";
        ctx.font = "9px monospace";
        for (let i = 0; i < gridCols; i++) {
          const charY = ((time * 1.5 + i * 20) % (gridRows * cellSize)) + startY;
          ctx.fillText(Math.random() < 0.5 ? "0" : "1", startX + i * cellSize + 8, charY);
        }
      }
      else if (itemId === "theme_synthwave") {
        // Draw Synthwave background sun at the bottom of the grid
        const sunX = width / 2;
        const sunY = startY + gridRows * cellSize;
        const sunRad = 26;
        const sunGrad = ctx.createLinearGradient(0, sunY - sunRad, 0, sunY);
        sunGrad.addColorStop(0, "#ff007f"); // hot pink
        sunGrad.addColorStop(1, "#f97316"); // orange
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRad, Math.PI, 2 * Math.PI);
        ctx.fill();

        // Draw horizontal cut lines across the sun
        ctx.strokeStyle = cardBg;
        ctx.lineWidth = 1.5;
        for (let sy = sunY - sunRad + 4; sy < sunY; sy += 5) {
          ctx.beginPath();
          ctx.moveTo(sunX - sunRad, sy);
          ctx.lineTo(sunX + sunRad, sy);
          ctx.stroke();
        }

        themeBlocks.forEach((b) => {
          const bx = startX + b.x * cellSize + 1.5;
          const by = startY + b.y * cellSize + 1.5;
          const size = cellSize - 3;
          
          const colors = ["#ff007f", "#d946ef", "#a855f7", "#ec4899"];
          const blockColor = colors[(b.x + b.y) % colors.length];

          const blockGrad = ctx.createLinearGradient(bx, by, bx, by + size);
          blockGrad.addColorStop(0, blockColor);
          blockGrad.addColorStop(1, "#1e0b36");

          ctx.fillStyle = blockGrad;
          ctx.shadowBlur = 8;
          ctx.shadowColor = blockColor;
          ctx.fillRect(bx, by, size, size);

          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, size, size);
          ctx.shadowBlur = 0;
        });

        // Falling piece animation
        themeFallY += 0.5;
        if (themeFallY > 1) {
          themeFallY = -3;
        }

        const fallCol = 2;
        const blockColor = "#f43f5e";
        const shape = [[1, 1], [0, 1]];
        shape.forEach((row, dy) => {
          row.forEach((val, dx) => {
            if (val) {
              const gridY = themeFallY + dy;
              if (gridY >= 0 && gridY < gridRows) {
                const bx = startX + (fallCol + dx) * cellSize + 1.5;
                const by = startY + gridY * cellSize + 1.5;
                const size = cellSize - 3;

                const blockGrad = ctx.createLinearGradient(bx, by, bx, by + size);
                blockGrad.addColorStop(0, blockColor);
                blockGrad.addColorStop(1, "#1e0b36");

                ctx.fillStyle = blockGrad;
                ctx.shadowBlur = 8;
                ctx.shadowColor = blockColor;
                ctx.fillRect(bx, by, size, size);
                
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, size, size);
                ctx.shadowBlur = 0;
              }
            }
          });
        });
      }
      else if (itemId === "theme_nebula") {
        // Draw cosmic star field
        ctx.fillStyle = "#ffffff";
        for (let s = 0; s < 10; s++) {
          const starX = startX + ((s * 13 + time * 0.2) % (gridCols * cellSize));
          const starY = startY + ((s * 19) % (gridRows * cellSize));
          const starAlpha = 0.2 + 0.8 * Math.abs(Math.sin((time * 0.04 + s * 2)));
          ctx.globalAlpha = starAlpha;
          ctx.fillRect(starX, starY, 1.5, 1.5);
        }
        ctx.globalAlpha = 1.0;

        // Draw soft nebula cloud
        const cloudGrad = ctx.createRadialGradient(width/2, height/2, 2, width/2, height/2, 40);
        cloudGrad.addColorStop(0, "rgba(168, 85, 247, 0.35)");
        cloudGrad.addColorStop(0.5, "rgba(59, 130, 246, 0.2)");
        cloudGrad.addColorStop(1, "rgba(4, 2, 15, 0)");
        ctx.fillStyle = cloudGrad;
        ctx.beginPath();
        ctx.arc(width/2, height/2, 40, 0, Math.PI * 2);
        ctx.fill();

        themeBlocks.forEach((b) => {
          const bx = startX + b.x * cellSize + 1.5;
          const by = startY + b.y * cellSize + 1.5;
          const size = cellSize - 3;
          
          const nebColors = ["#818cf8", "#c084fc", "#60a5fa", "#34d399"];
          const glowColor = nebColors[(b.x + b.y) % nebColors.length];

          ctx.fillStyle = "rgba(10, 10, 35, 0.9)";
          ctx.fillRect(bx, by, size, size);

          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = glowColor;
          ctx.strokeRect(bx, by, size, size);

          // Star center
          ctx.fillStyle = "#fff";
          ctx.shadowBlur = 2;
          ctx.shadowColor = "#fff";
          ctx.beginPath();
          ctx.arc(bx + size/2, by + size/2, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Falling piece animation
        themeFallY += 0.4;
        if (themeFallY > 1) {
          themeFallY = -3;
        }

        const fallCol = 2;
        const glowColor = "#a78bfa";
        const shape = [[1, 1], [1, 1]];
        shape.forEach((row, dy) => {
          row.forEach((val, dx) => {
            if (val) {
              const gridY = themeFallY + dy;
              if (gridY >= 0 && gridY < gridRows) {
                const bx = startX + (fallCol + dx) * cellSize + 1.5;
                const by = startY + gridY * cellSize + 1.5;
                const size = cellSize - 3;

                ctx.fillStyle = "rgba(10, 10, 35, 0.9)";
                ctx.fillRect(bx, by, size, size);

                ctx.strokeStyle = glowColor;
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 8;
                ctx.shadowColor = glowColor;
                ctx.strokeRect(bx, by, size, size);

                // Star center
                ctx.fillStyle = "#fff";
                ctx.shadowBlur = 2;
                ctx.shadowColor = "#fff";
                ctx.beginPath();
                ctx.arc(bx + size/2, by + size/2, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
              }
            }
          });
        });
      }
      else if (itemId === "theme_gameboy") {
        themeBlocks.forEach((b) => {
          const bx = startX + b.x * cellSize + 1;
          const by = startY + b.y * cellSize + 1;
          const size = cellSize - 2;

          ctx.fillStyle = "#306230";
          ctx.fillRect(bx, by, size, size);

          ctx.strokeStyle = "#8bac0f";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 1.5, by + 1.5, size - 3, size - 3);

          ctx.strokeStyle = "#0f380f";
          ctx.strokeRect(bx, by, size, size);
        });

        // Falling piece animation
        themeFallY += 0.45;
        if (themeFallY > 1) {
          themeFallY = -3;
        }

        const fallCol = 2;
        const shape = [[1, 1, 1], [0, 1, 0]];
        shape.forEach((row, dy) => {
          row.forEach((val, dx) => {
            if (val) {
              const gridY = themeFallY + dy;
              if (gridY >= 0 && gridY < gridRows) {
                const bx = startX + (fallCol + dx) * cellSize + 1;
                const by = startY + gridY * cellSize + 1;
                const size = cellSize - 2;

                ctx.fillStyle = "#0f380f";
                ctx.fillRect(bx, by, size, size);

                ctx.strokeStyle = "#306230";
                ctx.lineWidth = 1;
                ctx.strokeRect(bx + 1.5, by + 1.5, size - 3, size - 3);

                ctx.strokeStyle = "#0f380f";
                ctx.strokeRect(bx, by, size, size);
              }
            }
          });
        });
      }
      else if (itemId === "catalyst_bomb") {
        bombTimer += 1;

        const targetBlocks = [
          { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
          { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }
        ];

        if (bombTimer < 80) {
          bombY += 0.95;
          if (bombY > startY + 3 * cellSize) {
            bombY = startY + 3 * cellSize;
          }

          targetBlocks.forEach((b) => {
            const bx = startX + b.x * cellSize + 1.5;
            const by = startY + b.y * cellSize + 1.5;
            const size = cellSize - 3;
            ctx.fillStyle = "#475569";
            ctx.fillRect(bx, by, size, size);
          });

          const bbx = startX + 2 * cellSize + 1.5;
          ctx.fillStyle = bombTimer % 10 < 5 ? "#ef4444" : "#b91c1c";
          const bsize = cellSize - 3;
          ctx.fillRect(bbx, bombY + 1.5, bsize, bsize);
          ctx.strokeStyle = "#fca5a5";
          ctx.strokeRect(bbx, bombY + 1.5, bsize, bsize);
          ctx.fillStyle = "#fff";
          ctx.font = "12px sans-serif";
          ctx.fillText("💣", bbx + 3, bombY + 15);
        }
        else if (bombTimer >= 80 && bombTimer < 110) {
          explosionRadius += 2.2;

          ctx.beginPath();
          ctx.arc(startX + 2.5 * cellSize, startY + 3.5 * cellSize, explosionRadius, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(
            startX + 2.5 * cellSize, startY + 3.5 * cellSize, 2,
            startX + 2.5 * cellSize, startY + 3.5 * cellSize, Math.max(1, explosionRadius)
          );
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.3, "rgba(253,224,71,0.9)");
          grad.addColorStop(0.7, "rgba(239,68,68,0.7)");
          grad.addColorStop(1, "rgba(239,68,68,0)");
          ctx.fillStyle = grad;
          ctx.fill();

          if (bombTimer === 80) {
            particles = Array.from({ length: 25 }, () => ({
              x: startX + 2.5 * cellSize,
              y: startY + 3.5 * cellSize,
              vx: (Math.random() - 0.5) * 5,
              vy: (Math.random() - 0.5) * 5,
              size: Math.random() * 4 + 1.5,
              color: Math.random() < 0.6 ? "#f97316" : "#ef4444",
              alpha: 1
            }));
          }

          particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.035;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          });
        }
        else {
          bombTimer = 0;
          bombY = startY - cellSize;
          explosionRadius = 0;
          particles = [];
        }
      }
      else if (itemId === "catalyst_wildcard") {
        wildcardTimer += 1;

        const wildblocks = [
          { x: 1, y: 4, color: "#3b82f6" },
          { x: 3, y: 4, color: "#22c55e" },
          { x: 2, y: 4, color: "#eab308" }
        ];

        if (wildcardTimer < 75) {
          wildcardY += 0.95;
          if (wildcardY > startY + 4 * cellSize) {
            wildcardY = startY + 4 * cellSize;
          }

          const b1 = wildblocks[0];
          ctx.fillStyle = b1.color;
          ctx.fillRect(startX + b1.x * cellSize + 1.5, startY + b1.y * cellSize + 1.5, cellSize - 3, cellSize - 3);

          const b2 = wildblocks[1];
          ctx.fillStyle = b2.color;
          ctx.fillRect(startX + b2.x * cellSize + 1.5, startY + b2.y * cellSize + 1.5, cellSize - 3, cellSize - 3);

          const wX = startX + 2 * cellSize + 1.5;
          const wY = wildcardY + 1.5;
          const size = cellSize - 3;

          const hue = (time * 6) % 360;
          ctx.fillStyle = `hsl(${hue}, 85%, 60%)`;
          ctx.fillRect(wX, wY, size, size);
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(wX, wY, size, size);
          ctx.fillStyle = "#fff";
          ctx.font = "12px sans-serif";
          ctx.fillText("✨", wX + 3, wildcardY + 15);
        }
        else if (wildcardTimer >= 75 && wildcardTimer < 115) {
          const matchColor = wildcardTimer % 15 < 7 ? "#fef08a" : "#fbbf24";

          wildblocks.forEach((b) => {
            const bx = startX + b.x * cellSize + 1.5;
            const by = startY + b.y * cellSize + 1.5;
            const size = cellSize - 3;
            ctx.fillStyle = matchColor;
            ctx.fillRect(bx, by, size, size);
            ctx.strokeStyle = "#fff";
            ctx.strokeRect(bx, by, size, size);
          });

          if (wildcardTimer === 75) {
            starBurstParticles = Array.from({ length: 18 }, () => ({
              x: startX + 2.5 * cellSize,
              y: startY + 4.5 * cellSize,
              vx: (Math.random() - 0.5) * 4.2,
              vy: (Math.random() - 0.5) * 4.2 - 1.2,
              size: Math.random() * 3 + 1,
              color: `hsl(${Math.random() * 360}, 90%, 65%)`,
              alpha: 1
            }));
          }

          starBurstParticles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.03;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          });
        }
        else {
          wildcardTimer = 0;
          wildcardY = startY - cellSize;
          starBurstParticles = [];
        }
      }

      frameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(frameId);
  }, [itemId]);

  if (power) {
    return (
      <div className={`store-power-preview store-power-preview-${power.effect}`} aria-hidden="true">
        <PowerIcon powerId={itemId} power={power} />
      </div>
    );
  }

  return (
    <div className="w-[120px] h-[120px] shrink-0 border border-slate-700/60 rounded-xl overflow-hidden shadow-inner bg-slate-900 flex items-center justify-center relative">
      <canvas ref={canvasRef} className="w-[120px] h-[120px]" />
    </div>
  );
}

// -------------------------------------------------------------------------
// Connecting Sparks Background Canvas for loading screens
// -------------------------------------------------------------------------
function BrainSparksCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const isMobile = isMobileDevice();
    const particleCount = isMobile ? 15 : 30;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      size: Math.random() * 2 + 1,
      color: Math.random() < 0.5 ? "#22d3ee" : "#a855f7",
    }));

    const resizeHandler = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", resizeHandler);

    const draw = () => {
      drawSparks(ctx, particles, width, height, isMobile);
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeHandler);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl" />;
}

// A Canvas component for drawing block explosions and sparks
function BoardParticlesCanvas({ explodingCells, correctStreak, effectType = "match", activePiece, lastPlacedPiece }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const activePieceRef = useRef(activePiece);
  const correctStreakRef = useRef(correctStreak);

  useLayoutEffect(() => {
    activePieceRef.current = activePiece;
  }, [activePiece]);

  useLayoutEffect(() => {
    correctStreakRef.current = correctStreak;
  }, [correctStreak]);

  useEffect(() => {
    if (!explodingCells || explodingCells.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / 10;
    const cellH = height / 16;
    const styles = {
      tnt: { colors: ["#ffffff", "#fde047", "#f97316", "#ef4444"], count: 24, speed: 6.5, gravity: 0.09, kind: "debris" },
      drill: { colors: ["#fef3c7", "#f59e0b", "#78350f"], count: 18, speed: 4.4, gravity: 0.18, kind: "shard" },
      lightning: { colors: ["#ffffff", "#67e8f9", "#38bdf8", "#fef08a"], count: 20, speed: 7.2, gravity: -0.02, kind: "spark" },
      apple: { colors: ["#fecaca", "#ef4444", "#22c55e", "#ffffff"], count: 16, speed: 4.2, gravity: 0.06, kind: "orb" },
      orange: { colors: ["#ffedd5", "#fb923c", "#f97316", "#fde047"], count: 20, speed: 5.3, gravity: 0.08, kind: "shard" },
      banana: { colors: ["#fef9c3", "#fde047", "#facc15", "#ffffff"], count: 18, speed: 6, gravity: 0.04, kind: "spark" },
      line: { colors: ["#ffffff", "#22d3ee", "#a855f7"], count: 14, speed: 4.2, gravity: 0.04, kind: "spark" },
      match: { colors: ["#22d3ee", "#f59e0b", "#a855f7"], count: 12, speed: 3.8, gravity: 0.07, kind: "orb" },
      tornado: { colors: ["#e0f2fe", "#7dd3fc", "#94a3b8"], count: 18, speed: 7.5, gravity: -0.12, kind: "debris" },
      earthquake: { colors: ["#fde68a", "#a16207", "#78350f"], count: 22, speed: 5.2, gravity: 0.22, kind: "shard" },
      fire: { colors: ["#fef3c7", "#facc15", "#f97316", "#dc2626"], count: 22, speed: 5.8, gravity: -0.08, kind: "orb" },
      flood: { colors: ["#e0f2fe", "#38bdf8", "#2563eb", "#ffffff"], count: 20, speed: 6.4, gravity: 0.12, kind: "orb" },
    };
    const style = styles[effectType] || styles.match;
    const isMobile = isMobileDevice();
    const countMultiplier = isMobile ? 0.5 : 1.0;
    const count = Math.max(1, Math.round(style.count * countMultiplier));

    explodingCells.forEach((cell) => {
      const cx = (cell.x + 0.5) * cellW;
      const cy = (cell.y + 0.5) * cellH;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * style.speed + 1;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          color: style.colors[Math.floor(Math.random() * style.colors.length)],
          size: Math.random() * (effectType === "tnt" ? 5 : 3.5) + 1.5,
          alpha: 1.0,
          decay: Math.random() * 0.032 + 0.014,
          gravity: style.gravity,
          kind: style.kind,
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.35,
        });
      }
    });
  }, [explodingCells, effectType]);

  const prevPlacedTimestampRef = useRef(0);
  useEffect(() => {
    if (!lastPlacedPiece || lastPlacedPiece.timestamp === prevPlacedTimestampRef.current) return;
    prevPlacedTimestampRef.current = lastPlacedPiece.timestamp;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / 10;
    const cellH = height / 16;

    const hexMap = {
      "bg-cyan-500": "#06b6d4",
      "bg-yellow-400": "#facc15",
      "bg-purple-500": "#a855f7",
      "bg-orange-500": "#f97316",
      "bg-blue-500": "#3b82f6",
      "bg-green-500": "#22c55e",
      "bg-red-500": "#ef4444",
      "bg-zinc-800": "#27272a",
      "bg-slate-500": "#64748b",
    };
    const colorHex = hexMap[lastPlacedPiece.color] || "#a855f7";
    const isMobile = isMobileDevice();
    const count = isMobile ? 3 : 6;

    lastPlacedPiece.shape.forEach((row, ry) => {
      row.forEach((val, rx) => {
        if (val) {
          const bx = lastPlacedPiece.x + rx;
          const by = lastPlacedPiece.y + ry;
          if (bx >= 0 && bx < 10 && by >= 0 && by < 16) {
            const cx = (bx + 0.5) * cellW;
            const cy = (by + 1.0) * cellH;

            for (let i = 0; i < count; i++) {
              const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
              const speed = Math.random() * 2.5 + 1.5;
              particlesRef.current.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: colorHex,
                size: Math.random() * 3 + 1.5,
                alpha: 1.0,
                decay: Math.random() * 0.04 + 0.02,
                gravity: 0.15,
                kind: "debris",
                rotation: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.2,
              });
            }
          }
        }
      });
    });
  }, [lastPlacedPiece]);

  const prevStreakRef = useRef(correctStreak);
  useEffect(() => {
    if (correctStreak > prevStreakRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const width = canvas.width;
        const height = canvas.height;
        const cellW = width / 10;
        const cellH = height / 16;
        
        let cx = width / 2;
        let cy = height / 4;
        const p = activePieceRef.current;
        if (p) {
          let minX = 10, maxX = 0, minY = 16, maxY = 0;
          p.shape.forEach((row, ry) => {
            row.forEach((val, rx) => {
              if (val) {
                const bx = p.x + rx;
                const by = p.y + ry;
                if (bx < minX) minX = bx;
                if (bx > maxX) maxX = bx;
                if (by < minY) minY = by;
                if (by > maxY) maxY = by;
              }
            });
          });
          if (minX <= maxX && minY <= maxY) {
            cx = ((minX + maxX + 1) / 2) * cellW;
            cy = ((minY + maxY + 1) / 2) * cellH;
          }
        }

        const colors = ["#fbbf24", "#38bdf8", "#c084fc", "#34d399", "#f43f5e", "#ffffff"];
        const isMobile = isMobileDevice();
        const burstCount = isMobile ? 12 : 25;
        for (let i = 0; i < burstCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 5 + 2.5;
          particlesRef.current.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.7,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 4 + 2,
            alpha: 1.0,
            decay: Math.random() * 0.025 + 0.01,
            gravity: 0.06,
            kind: "sparkle",
            rotation: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.25,
          });
        }
      }

      if (correctStreak >= 3) {
        const canvas = canvasRef.current;
        if (canvas) {
          const width = canvas.width;
          const height = canvas.height;
          const isMobile = isMobileDevice();
          const count = isMobile ? 12 : 25;
          for (let i = 0; i < count; i++) {
            particlesRef.current.push({
              x: Math.random() * width,
              y: height,
              vx: (Math.random() - 0.5) * 3,
              vy: -Math.random() * 4 - 2,
              color: "#fbbf24",
              size: Math.random() * 4 + 2,
              alpha: 1.0,
              decay: Math.random() * 0.02 + 0.01,
              gravity: 0.03,
              kind: "sparkle",
              rotation: Math.random() * Math.PI,
              spin: (Math.random() - 0.5) * 0.15,
            });
          }
        }
      }
    }
    prevStreakRef.current = correctStreak;
  }, [correctStreak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isMobile = isMobileDevice();
    let animationId;
    let frameCount = 0;
    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentStreak = correctStreakRef.current;
      const currentActivePiece = activePieceRef.current;

      if (currentStreak >= 5 && currentActivePiece) {
        frameCount += 1;
        if (frameCount % 4 === 0) {
          const width = canvas.width;
          const height = canvas.height;
          const cellW = width / 10;
          const cellH = height / 16;
          currentActivePiece.shape.forEach((row, ry) => {
            row.forEach((val, rx) => {
              if (val) {
                const bx = currentActivePiece.x + rx;
                const by = currentActivePiece.y + ry;
                if (bx >= 0 && bx < 10 && by >= 0 && by < 16) {
                  const cx = (bx + Math.random()) * cellW;
                  const cy = (by + Math.random()) * cellH;
                  particlesRef.current.push({
                    x: cx,
                    y: cy,
                    vx: (Math.random() - 0.5) * 2.5,
                    vy: (Math.random() - 0.5) * 2.5 - 0.5,
                    color: ["#22d3ee", "#e879f9", "#facc15", "#ffffff"][Math.floor(Math.random() * 4)],
                    size: Math.random() * 2.5 + 1,
                    alpha: 1.0,
                    decay: Math.random() * 0.04 + 0.02,
                    gravity: 0.02,
                    kind: "spark",
                    rotation: Math.random() * Math.PI,
                    spin: (Math.random() - 0.5) * 0.1,
                  });
                }
              }
            });
          });
        }
      }

      drawParticles(ctx, particlesRef.current, isMobile);
      animationId = requestAnimationFrame(updateAndDraw);
    };

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth || 300;
      canvas.height = canvas.offsetHeight || 480;
    };
    resize();
    window.addEventListener("resize", resize);

    updateAndDraw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
    />
  );
}

function ScreenFlash({ tone }) {
  if (!tone) return null;
  return <div className={`screen-flash screen-flash-${tone}`} aria-hidden="true" />;
}

function RunTelemetryPanel({
  board,
  correctStreak,
  totalScore,
  misses,
  activePiece,
  isControllable,
  targetScore,
  strikesAllowed,
  objective,
  objectiveStatus,
  heatLevel = 0,
  coolingRemaining = 0,
}) {
  const occupiedCells = board.reduce(
    (count, row) => count + row.reduce((rowCount, cell) => rowCount + (cell ? 1 : 0), 0),
    0
  );
  const targetProgress = Math.min(100, Math.round((totalScore / targetScore) * 100));
  const boardPressure = Math.min(100, Math.round((occupiedCells / (BOARD_WIDTH * BOARD_HEIGHT)) * 100));
  const chargeTarget = correctStreak < 3 ? 3 : correctStreak < 5 ? 5 : correctStreak < 7 ? 7 : 10;
  const chargeLabel = correctStreak < 3
    ? "TNT Charge"
    : correctStreak < 5
      ? "Drill Charge"
      : correctStreak < 7
        ? "Lightning Charge"
        : "Overdrive Loop";
  const chargeProgress = Math.min(100, Math.round((correctStreak / chargeTarget) * 100));
  const pieceLabel = activePiece?.isTNT
    ? "TNT"
    : activePiece?.isDrill
      ? "Drill"
      : activePiece?.isLightning
        ? "Lightning"
        : activePiece?.isRowClear
          ? "Row Clear"
          : activePiece?.isArea2x2Clear
            ? "2x2 Area Clear"
            : activePiece?.isSlime
              ? "Slime"
              : activePiece?.isCatalystBomb
                ? "Catalyst"
                : activePiece?.isWildcard
                  ? "Wildcard"
              : isControllable
                ? "Clean Block"
                : activePiece?.heavyHits === 3
                  ? "Obsidian Block"
                  : "Stone";

  const heatMeter = coolingRemaining > 0
    ? { label: "System Cooling", value: `${coolingRemaining} Blocks`, progress: Math.min(100, Math.round((coolingRemaining / 3) * 100)), tone: "blue" }
    : { label: "Fever Heat", value: `Lvl ${heatLevel}/5`, progress: Math.min(100, Math.round((heatLevel / 5) * 100)), tone: heatLevel === 5 ? "red" : heatLevel >= 3 ? "amber" : "cyan" };

  const meters = [
    { label: "Score Required", value: `${totalScore}/${targetScore}`, progress: targetProgress, tone: "cyan" },
    {
      label: "Mission Required",
      value: `${objectiveStatus.current}/${objectiveStatus.required}`,
      progress: objectiveStatus.progress,
      tone: objectiveStatus.complete ? "emerald" : "purple",
    },
    { label: chargeLabel, value: `${correctStreak}x`, progress: chargeProgress, tone: "amber" },
    { label: "Board Heat", value: `${boardPressure}%`, progress: boardPressure, tone: boardPressure > 55 ? "red" : "emerald" },
    { label: "Strike Risk", value: `${misses}/${strikesAllowed}`, progress: (misses / strikesAllowed) * 100, tone: "red" },
    heatMeter,
  ];

  return (
    <div className="hidden md:grid w-full max-w-xl grid-cols-2 gap-3 mt-6" aria-label="Run telemetry">
      <div className="col-span-2 rounded-xl border border-cyan-400/20 bg-slate-950/45 p-3 shadow-inner">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
            Active Piece
          </span>
          <span className={`text-sm font-black ${isControllable ? "text-emerald-300" : "text-red-300"}`}>
            {pieceLabel}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full ${isControllable ? "bg-emerald-400" : "bg-red-500"} telemetry-pulse`}
            style={{ width: isControllable ? "72%" : "100%" }}
          />
        </div>
      </div>

      {meters.map((meter) => (
        <div key={meter.label} className="rounded-xl border border-white/10 bg-slate-950/35 p-3 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {meter.label}
            </span>
            <span className="text-xs font-black text-white">
              {meter.value}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full telemetry-meter telemetry-meter-${meter.tone}`}
              style={{ width: `${meter.progress}%` }}
            />
          </div>
        </div>
      ))}
      <p className="col-span-2 text-center text-[10px] font-black uppercase tracking-widest text-purple-300">
        Win requires both goals · Mission: {objective.label}
      </p>
    </div>
  );
}

// MenuLightfield has been extracted to src/components/GameUIElements.jsx

const createPreviewBoard = () => {
  const board = createEmptyBoard();
  const colors = ["bg-cyan-500", "bg-purple-500", "bg-green-500", "bg-red-500"];
  const pattern = [
    [1, 1, 0, 2, 2, 2, 0, 3, 3, 1],
    [1, 0, 0, 2, 0, 2, 3, 3, 0, 1],
    [0, 0, 1, 1, 0, 2, 3, 0, 0, 0],
  ];
  pattern.forEach((row, offset) => {
    row.forEach((colorIndex, x) => {
      if (colorIndex) board[BOARD_HEIGHT - pattern.length + offset][x] = { color: colors[colorIndex - 1] };
    });
  });
  return board;
};

function MenuPreviewBoard() {
  const [simBoard, setSimBoard] = useState(createPreviewBoard);
  const [simPiece, setSimPiece] = useState(null);

  useEffect(() => {
    let active = true;
    let piece = null;
    let boardState = createPreviewBoard();

    const localRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const spawn = () => {
      const pieceBase =
        Math.random() < SPECIAL_BLOCK_RATES.arenaFruit
          ? localRandom(FRUITS)
          : localRandom(TETROMINOES);
      const width = pieceBase.shape[0].length;
      const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);
      return {
        ...pieceBase,
        x,
        y: 0
      };
    };

    const interval = setInterval(() => {
      if (!active) return;

      if (!piece) {
        piece = spawn();
        if (checkCollision(piece, boardState)) {
          boardState = createPreviewBoard();
          piece = spawn();
        }
        setSimBoard(boardState.map(row => [...row]));
        setSimPiece(piece);
        return;
      }

      // Simulate player movements
      if (Math.random() < 0.25) {
        const move = Math.random() < 0.5 ? -1 : 1;
        const movedPiece = { ...piece, x: piece.x + move };
        if (!checkCollision(movedPiece, boardState)) {
          piece = movedPiece;
        }
      }
      if (Math.random() < 0.12 && !piece.isFruit) {
        const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
        if (!checkCollision(rotatedPiece, boardState)) {
          piece = rotatedPiece;
        }
      }

      // Move down
      const movedDown = { ...piece, y: piece.y + 1 };
      if (!checkCollision(movedDown, boardState)) {
        piece = movedDown;
        setSimPiece(piece);
      } else {
        // Lock piece
        const nextBoard = boardState.map(row => [...row]);
        piece.shape.forEach((row, dy) => {
          row.forEach((val, dx) => {
            if (val) {
              const py = piece.y + dy;
              const px = piece.x + dx;
              if (py >= 0 && py < BOARD_HEIGHT && px >= 0 && px < BOARD_WIDTH) {
                nextBoard[py][px] = {
                  color: piece.color,
                  emoji: piece.emoji || "",
                  isStone: piece.isStone || false,
                  isFruit: piece.isFruit || false
                };
              }
            }
          });
        });

        const toClear = [];

        // Fruit bombs clear themselves and neighbors
        for (let y = 0; y < BOARD_HEIGHT; y++) {
          for (let x = 0; x < BOARD_WIDTH; x++) {
            if (nextBoard[y][x]?.isFruit) {
              const targets = [
                { y, x },
                { y: y + 1, x },
                { y: y - 1, x },
                { y, x: x + 1 },
                { y, x: x - 1 }
              ];
              targets.forEach(t => {
                if (t.y >= 0 && t.y < BOARD_HEIGHT && t.x >= 0 && t.x < BOARD_WIDTH) {
                  if (nextBoard[t.y][t.x] !== null) {
                    if (!toClear.some(c => c.y === t.y && c.x === t.x)) {
                      toClear.push(t);
                    }
                  }
                }
              });
            }
          }
        }

        // Row Clear checks
        for (let y = 0; y < BOARD_HEIGHT; y++) {
          if (nextBoard[y].every(cell => cell !== null)) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
              if (!toClear.some(c => c.y === y && c.x === x)) {
                toClear.push({ y, x });
              }
            }
          }
        }

        // Color Clears Match 5 checks
        const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
        for (let y = 0; y < BOARD_HEIGHT; y++) {
          for (let x = 0; x < BOARD_WIDTH; x++) {
            const start = nextBoard[y][x];
            const isGoingToClear = (cy, cx) => toClear.some(c => c.y === cy && c.x === cx);
            if (start && !start.isFruit && !start.isStone && !visited[y][x] && !isGoingToClear(y, x)) {
              const comp = [];
              const queue = [{ y, x }];
              visited[y][x] = true;
              while (queue.length > 0) {
                const curr = queue.shift();
                comp.push(curr);
                const dirs = [{ y: 1, x: 0 }, { y: -1, x: 0 }, { y: 0, x: 1 }, { y: 0, x: -1 }];
                for (const d of dirs) {
                  const ny = curr.y + d.y;
                  const nx = curr.x + d.x;
                  if (ny >= 0 && ny < BOARD_HEIGHT && nx >= 0 && nx < BOARD_WIDTH) {
                    const neighbor = nextBoard[ny][nx];
                    if (neighbor && neighbor.color === start.color && !neighbor.isFruit && !neighbor.isStone && !visited[ny][nx] && !isGoingToClear(ny, nx)) {
                      visited[ny][nx] = true;
                      queue.push({ y: ny, x: nx });
                    }
                  }
                }
              }
              if (comp.length >= 5) {
                comp.forEach(t => {
                  if (!toClear.some(c => c.y === t.y && c.x === t.x)) {
                    toClear.push(t);
                  }
                });
              }
            }
          }
        }

        if (toClear.length > 0) {
          toClear.forEach(c => { nextBoard[c.y][c.x] = null; });
          // Gravity pull down
          for (let x = 0; x < BOARD_WIDTH; x++) {
            let writeY = BOARD_HEIGHT - 1;
            for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
              if (nextBoard[y][x] !== null) {
                if (writeY !== y) {
                  nextBoard[writeY][x] = nextBoard[y][x];
                  nextBoard[y][x] = null;
                }
                writeY--;
              }
            }
          }
        }

        boardState = nextBoard;
        piece = null;
        setSimBoard(boardState);
        setSimPiece(null);
      }
    }, 450);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Display overlay
  const displayBoard = simBoard.map(row => [...row]);
  if (simPiece) {
    simPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const boardY = simPiece.y + y;
          const boardX = simPiece.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
            displayBoard[boardY][boardX] = {
              color: simPiece.color,
              emoji: simPiece.emoji || ""
            };
          }
        }
      });
    });
  }

  return (
    <div className="menu-preview-board" aria-hidden="true">
      <div className="menu-preview-grid">
        {displayBoard.map((row, y) =>
          row.map((cell, x) => (
            <div key={`${y}-${x}`} className={`menu-preview-cell ${cell ? `menu-preview-cell-filled ${cell.color}` : ""}`}>
              {cell?.emoji || ""}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// MenuStatPill, AchievementCard, and PiecePreview have been extracted to src/components/GameUIElements.jsx

// -------------------------------------------------------------------------
// Main App Component
// -------------------------------------------------------------------------
export default function App() {
  const [gameState, setGameState] = useState("start");
  const [previousBest, setPreviousBest] = useState(0);
  const [menuTab, setMenuTab] = useState("levels");
  const [profiles, setProfiles] = useState(readProfiles);
  const [activeProfileId, setActiveProfileId] = useState(getActiveProfileId);
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) || profiles[0],
    [profiles, activeProfileId]
  );
  const [difficultyMode, setDifficultyMode] = useState(
    () => activeProfile?.difficulty || "normal"
  );
  const [showOnboarding, setShowOnboarding] = useState(
    () => !activeProfile?.profileSetupComplete || !activeProfile?.onboardingComplete
  );
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingNameDraft, setOnboardingNameDraft] = useState(
    () => activeProfile?.name === "Player 1" ? "" : activeProfile?.name || ""
  );
  const [onboardingAvatarDraft, setOnboardingAvatarDraft] = useState(
    () => activeProfile?.avatar || "⚡"
  );
  const [onboardingDifficultyDraft, setOnboardingDifficultyDraft] = useState(
    () => activeProfile?.difficulty || "normal"
  );
  const [onboardingStartLevel, setOnboardingStartLevel] = useState(
    () => activeProfile?.startingLevel || readSavedProgress()
  );
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileAvatarDraft, setProfileAvatarDraft] = useState("🚀");
  const [runMode, setRunMode] = useState("campaign");
  const [level, setLevel] = useState(1);
  const [endlessLevel, setEndlessLevel] = useState(1);
  const [speedWavePieces, setSpeedWavePieces] = useState(0);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(readSavedProgress);
  const [board, setBoard] = useState(createEmptyBoard());
  const [activePiece, setActivePiece] = useState(null);
  const [nextPiece, setNextPiece] = useState(null);
  const [heldPiece, setHeldPiece] = useState(null);
  const [holdUsed, setHoldUsed] = useState(false);

  const [shuffledQuestions, setShuffledQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionsAnsweredThisLevel, setQuestionsAnsweredThisLevel] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState("");

  const [totalScore, setTotalScore] = useState(0);
  const [isControllable, setIsControllable] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [explodingCells, setExplodingCells] = useState([]);
  const [blastEffect, setBlastEffect] = useState("match");
  const [usedPowers, setUsedPowers] = useState([]);

  // Immersion & volume settings states
  const [maxStreak, setMaxStreak] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [flashColor, setFlashColor] = useState(null);
  const [shareFeedback, setShareFeedback] = useState("");

  const [activeMutator, setActiveMutator] = useState(null);
  const [wheelIndex, setWheelIndex] = useState(0);
  const [wheelState, setWheelState] = useState("idle"); // "idle" | "spinning" | "selected"

  const [masterVol, setMasterVolState] = useState(() => getVolumeSettings().masterVolume);
  const [musicVol, setMusicVolState] = useState(() => getVolumeSettings().musicVolume);
  const [sfxVol, setSfxVolState] = useState(() => getVolumeSettings().sfxVolume);
  const [reduceMotion, setReduceMotion] = useState(() =>
    readBooleanPreference(
      "think-fast-blast-reduce-motion",
      typeof window !== "undefined" &&
        Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    )
  );
  const [screenShakeEnabled, setScreenShakeEnabled] = useState(() =>
    readBooleanPreference("think-fast-blast-screen-shake", true)
  );
  const [hapticsEnabled, setHapticsEnabled] = useState(() =>
    readBooleanPreference("think-fast-blast-haptics", true)
  );
  const [highContrast, setHighContrast] = useState(() =>
    readBooleanPreference("think-fast-blast-high-contrast", false)
  );

  // Arena VS Mode States
  const [arenaMode, setArenaMode] = useState("vs_ai"); // "vs_ai" or "vs_player"
  const [aiDifficulty, setAiDifficulty] = useState("medium"); // "easy", "medium", "hard"
  const [arenaResult, setArenaResult] = useState(null); // "p1_win", "p2_win", "ai_win"
  const [arenaLevel, setArenaLevel] = useState(1); // selected theme level 1-20

  const [board2, setBoard2] = useState(createEmptyBoard());
  const [activePiece2, setActivePiece2] = useState(null);
  const [totalScore2, setTotalScore2] = useState(0);
  const [correctStreak2, setCorrectStreak2] = useState(0);
  const [misses2, setMisses2] = useState(0);
  const [isControllable2, setIsControllable2] = useState(false);

  const [p1Answered, setP1Answered] = useState(null); // null, "correct", "wrong"
  const [p2Answered, setP2Answered] = useState(null); // null, "correct", "wrong"
  const [explodingCells2, setExplodingCells2] = useState([]);
  const [floatingTexts2, setFloatingTexts2] = useState([]);
  const [shake2, setShake2] = useState(false);
  const [boardRecoil2, setBoardRecoil2] = useState(false);
  const [boardThump2, setBoardThump2] = useState(false);
  const [lastPlacedPiece2, setLastPlacedPiece2] = useState(null);
  const [aiQuip, setAiQuip] = useState(AI_THINKING_LINES[0]);
  const [aiThinkingStage, setAiThinkingStage] = useState("reading");
  const [aiRaceMetrics, setAiRaceMetrics] = useState(createAiRaceMetrics);
  const aiRaceTimerRef = useRef(0);
  const aiRaceAnsweredQuestionRef = useRef(-1);
  const handleArenaAnswerRef = useRef(null);

  // Custom Question Builder States
  const [customQuestions, setCustomQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem("think-fast-blast-custom-questions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("think-fast-blast-custom-questions", JSON.stringify(customQuestions));
    } catch (e) {
      console.error("Failed to save custom questions", e);
    }
  }, [customQuestions]);

  const [builderSubTab, setBuilderSubTab] = useState("manual");
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualOptions, setManualOptions] = useState(["", "", "", ""]);
  const [manualAnswer, setManualAnswer] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedQuestions, setGeneratedQuestions] = useState([]);

  const [editingIndex, setEditingIndex] = useState(null);
  const [editQText, setEditQText] = useState("");
  const [editQOptions, setEditQOptions] = useState(["", "", "", ""]);
  const [editQAnswer, setEditQAnswer] = useState(0);

  const startEdit = (idx) => {
    const q = customQuestions[idx];
    setEditingIndex(idx);
    setEditQText(q.q);
    setEditQOptions([...q.options]);
    setEditQAnswer(q.answer);
  };

  const generateQuestionsFromText = (text, fileName) => {
    const generated = [];
    const cleanText = text.replace(/\r\n/g, "\n").trim();
    if (!cleanText) return generateFallbackQuestions(fileName);

    const sentences = cleanText
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 180);

    const factRegex = /([^.!?]*)\b(is|was|are|were)\b([^.!?]*)/i;

    for (const sentence of sentences) {
      const match = sentence.match(factRegex);
      if (match && match[1].trim().length > 5 && match[3].trim().length > 3) {
        const subject = match[1].trim();
        const verb = match[2].trim();
        const object = match[3].trim();

        const qText = `Complete the sentence: "${subject} ${verb}..."`;
        const correctAnswer = object;

        const otherWords = cleanText
          .split(/\s+/)
          .map(w => w.replace(/[^a-zA-Z]/g, ""))
          .filter(w => w.length > 4 && w.toLowerCase() !== correctAnswer.toLowerCase());

        const decoys = [...new Set(otherWords)].slice(0, 3);
        while (decoys.length < 3) {
          decoys.push(randomItem(["Incorrect Option", "None of the above", "Wrong Answer", "Decoy Choice"]));
        }

        const options = [correctAnswer, ...decoys];
        const shuffledOptions = shuffleArray(options);
        const correctIdx = shuffledOptions.indexOf(correctAnswer);

        generated.push({
          q: qText,
          options: shuffledOptions,
          answer: correctIdx
        });

        if (generated.length >= 5) break;
      }
    }

    if (generated.length < 3) {
      const fallbacks = generateFallbackQuestions(fileName);
      generated.push(...fallbacks.slice(0, 5 - generated.length));
    }

    return generated;
  };

  const generateFallbackQuestions = (fileName) => {
    const name = (fileName || "").toLowerCase();
    if (name.includes("space") || name.includes("solar") || name.includes("planet") || name.includes("galaxy") || name.includes("orbit")) {
      return [
        { q: "Which planet is largest in the Solar System?", options: ["Earth", "Saturn", "Jupiter", "Neptune"], answer: 2 },
        { q: "What is the closest planet to the Sun?", options: ["Venus", "Mercury", "Mars", "Earth"], answer: 1 },
        { q: "Which galaxy is home to our solar system?", options: ["Andromeda", "Sombrero", "Milky Way", "Triangulum"], answer: 2 },
        { q: "How long does it take sunlight to reach Earth?", options: ["8 minutes", "1 hour", "3 seconds", "24 hours"], answer: 0 },
        { q: "Which planet is known as the Red Planet?", options: ["Mars", "Venus", "Jupiter", "Mercury"], answer: 0 }
      ];
    }
    if (name.includes("math") || name.includes("calc") || name.includes("number") || name.includes("geometry") || name.includes("algebra")) {
      return [
        { q: "What is the square root of 144?", options: ["10", "12", "14", "16"], answer: 1 },
        { q: "How many degrees are in a right angle?", options: ["45", "90", "180", "360"], answer: 1 },
        { q: "What is 15 multiplied by 4?", options: ["50", "55", "60", "65"], answer: 2 },
        { q: "What shape has eight sides?", options: ["Hexagon", "Octagon", "Pentagon", "Decagon"], answer: 1 },
        { q: "What is the next prime number after 7?", options: ["9", "11", "13", "15"], answer: 1 }
      ];
    }
    if (name.includes("science") || name.includes("bio") || name.includes("chem") || name.includes("cell") || name.includes("physics") || name.includes("water")) {
      return [
        { q: "What is the chemical formula for water?", options: ["CO2", "H2O", "NaCl", "O2"], answer: 1 },
        { q: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Cytoplasm"], answer: 2 },
        { q: "What gas do plants absorb during photosynthesis?", options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Helium"], answer: 1 },
        { q: "What is the freezing point of water in Celsius?", options: ["0", "32", "100", "-10"], answer: 0 },
        { q: "Which element is number 1 on the Periodic Table?", options: ["Helium", "Oxygen", "Hydrogen", "Carbon"], answer: 2 }
      ];
    }
    if (name.includes("history") || name.includes("war") || name.includes("president") || name.includes("civil")) {
      return [
        { q: "Who was the first US President?", options: ["Thomas Jefferson", "George Washington", "Abraham Lincoln", "John Adams"], answer: 1 },
        { q: "In which year did World War II end?", options: ["1918", "1939", "1945", "1950"], answer: 2 },
        { q: "Which ancient empire built the Colosseum in Rome?", options: ["Greeks", "Romans", "Egyptians", "Persians"], answer: 1 },
        { q: "Who wrote the Declaration of Independence?", options: ["George Washington", "Thomas Jefferson", "Benjamin Franklin", "John Hancock"], answer: 1 },
        { q: "What ship sank in 1912 after hitting an iceberg?", options: ["Lusitania", "Titanic", "Britannic", "Olympic"], answer: 1 }
      ];
    }
    return [
      { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: 2 },
      { q: "Which is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Great White Shark", "Giraffe"], answer: 1 },
      { q: "What do caterpillars turn into?", options: ["Beetles", "Butterflies", "Moths", "Dragonflies"], answer: 1 },
      { q: "How many legs does a standard spider have?", options: ["6", "8", "10", "12"], answer: 1 },
      { q: "What is the capital of France?", options: ["Berlin", "London", "Rome", "Paris"], answer: 3 }
    ];
  };

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit.");
      return;
    }
    setFileUploading(true);
    setGenerationProgress(0);

    const interval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result || "";
      setTimeout(() => {
        const questions = generateQuestionsFromText(text, file.name);
        setGeneratedQuestions(questions);
        setFileUploading(false);
        playSFX("correct");
      }, 2550);
    };
    reader.onerror = () => {
      alert("Error reading file.");
      setFileUploading(false);
      clearInterval(interval);
    };

    if (file.name.endsWith(".txt")) {
      reader.readAsText(file);
    } else {
      setTimeout(() => {
        const questions = generateQuestionsFromText("", file.name);
        setGeneratedQuestions(questions);
        setFileUploading(false);
        playSFX("correct");
        clearInterval(interval);
      }, 2550);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    handleFile(file);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleExport = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customQuestions, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "thinkfast-blast-custom-pack.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      playSFX("correct");
    } catch (e) {
      console.error(e);
      alert("Failed to export pack.");
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed) && parsed.every(q => typeof q.q === "string" && Array.isArray(q.options) && q.options.length === 4 && typeof q.answer === "number")) {
          setCustomQuestions(parsed);
          playSFX("correct");
          alert(`Successfully imported ${parsed.length} questions!`);
        } else {
          alert("Invalid file format. Please import a valid exported JSON file.");
        }
      } catch {
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const handleMasterVolChange = (val) => {
    const next = Math.min(1, Math.max(0, Number(val)));
    setMasterVolState(next);
    setMasterVolume(next);
  };
  const handleMusicVolChange = (val) => {
    const next = Math.min(1, Math.max(0, Number(val)));
    setMusicVolState(next);
    setMusicVolume(next);
  };
  const handleSfxVolChange = (val) => {

    const next = Math.min(1, Math.max(0, Number(val)));
    setSfxVolState(next);
    setSFXVolume(next);
  };

  const handleShare = () => {
    playSFX("button");
    const currentLvl = LEVELS.find((item) => item.id === level) || LEVELS[0];
    const statusText = gameState === "level_win" ? "🏆 Level Cleared!" : "💀 Game Over";
    const starsEmoji = maxStreak >= 7 ? "🔥⚡🏆" : maxStreak >= 5 ? "🌀🔥" : maxStreak >= 3 ? "💣" : "⭐";
    const shareText = `🎮 ThinkFastBlast React Game 🎮
${statusText}
🔥 Level ${level}: ${currentLvl.name}
🏆 Score: ${totalScore} / ${runTarget}
💡 Trivia Correct: ${questionsAnsweredThisLevel}
🔥 Max Streak: ${maxStreak} ${starsEmoji}
👾 Glitches Earned: ${gameState === "level_win" ? Math.floor(totalScore / 10) + (level * 10) : Math.max(1, Math.floor(totalScore / 20) + (level * 2))}
Can you beat my score? Play ThinkFastBlast!`;

    const copyText = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(shareText)
      : Promise.reject(new Error("Clipboard API unavailable"));

    copyText
      .then(() => {
        setShareFeedback("Copied to Clipboard! 📋");
        setTimeout(() => setShareFeedback(""), 3000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        setShareFeedback("Copy failed ❌");
        setTimeout(() => setShareFeedback(""), 3000);
      });
  };

  // Redesign States
  const [correctStreak, setCorrectStreak] = useState(0);
  const [heatLevel, setHeatLevel] = useState(0);
  const [coolingRemaining, setCoolingRemaining] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [shake, setShake] = useState(false);
  const [boardRecoil, setBoardRecoil] = useState(false);
  const [boardThump, setBoardThump] = useState(false);
  const [lastPlacedPiece, setLastPlacedPiece] = useState(null);
  const [windForce, setWindForce] = useState(0);
  const [questionsSinceLastRise, setQuestionsSinceLastRise] = useState(0);
  const [recoveryTimer, setRecoveryTimer] = useState(4);
  const [questionStartTime, setQuestionStartTime] = useState(0);

  // Stats and Shop Integration States
  const [stats, setStats] = useState(readSavedStats);
  const [introCountdown, setIntroCountdown] = useState(LEVEL_INTRO_SECONDS);
  const [scoreBump, setScoreBump] = useState(false);
  const prevScoreRef = useRef(0);
  const coinTickRef = useRef(0);
  const [achievementToasts, setAchievementToasts] = useState([]);
  const [electrify, setElectrify] = useState(false);
  const earnedRef = useRef(null);
  const electrifyTimerRef = useRef(0);
  const [randomFact, setRandomFact] = useState("");
  const [runMetrics, setRunMetrics] = useState({
    lines: 0,
    matches: 0,
    fruits: 0,
    specials: 0,
    questions: 0,
  });

  // Audio Toggle State
  const [audioOn, setAudioOn] = useState(() => {
    try {
      const saved = localStorage.getItem("think-fast-blast-audio-enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const canPause = PLAYABLE_STATES.has(gameState);
  const runConfig = useMemo(() => {
    if (runMode === "endless") {
      const virtualLevel = Math.min(20, Math.floor((endlessLevel - 1) / 2) + 1);
      const baseConfig = getRunConfig(virtualLevel, difficultyMode);
      return {
        ...baseConfig,
        target: endlessLevel * 500,
        objective: {
          type: "score",
          amount: endlessLevel * 500,
          label: `Reach ${endlessLevel * 500} pts to clear Stage ${endlessLevel}`,
        },
      };
    }
    return getRunConfig(level, difficultyMode);
  }, [level, difficultyMode, runMode, endlessLevel]);
  const runTarget = runConfig.target;
  const strikeLimit = runConfig.difficulty.strikes;
  const objectiveStatus = getObjectiveStatus(runConfig, {
    ...runMetrics,
    score: totalScore,
    maxStreak,
  });
  const dailyChallengeKey = getDailyChallengeKey();

  const stateRef = useRef({
    board,
    activePiece,
    gameState,
    isControllable,
    isPaused,
    level,
    correctStreak,
    questionIndex,
    shuffledQuestions,
    misses,
    questionsSinceLastRise,
    runMetrics,
    runMode,
    endlessLevel,
    speedWavePieces,
    // Arena
    board2,
    activePiece2,
    totalScore2,
    correctStreak2,
    misses2,
    isControllable2,
    p1Answered,
    p2Answered,
    arenaMode,
    aiDifficulty,
  });
  const touchStartRef = useRef(null);
  const flashTimerRef = useRef(null);

  const triggerFlash = useCallback((tone) => {
    setFlashColor(tone);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashColor(null), FLASH_DURATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

  // Score-gain feedback: pulse the HUD number and lay a soft "register" tick over
  // the existing chime whenever points come in.
  useEffect(() => {
    if (totalScore > prevScoreRef.current) {
      setScoreBump(true);
      const now = Date.now();
      if (now - coinTickRef.current > 140) {
        coinTickRef.current = now;
        playSFX("coin", correctStreak);
      }
      const timer = window.setTimeout(() => setScoreBump(false), 420);
      prevScoreRef.current = totalScore;
      return () => window.clearTimeout(timer);
    }
    prevScoreRef.current = totalScore;
    return undefined;
  }, [totalScore, correctStreak]);

  const isFrenzyActive = correctStreak >= 5;
  const isDesperationActive = board.slice(0, 5).some(row => row.some(cell => cell !== null));

  useEffect(() => {
    stateRef.current = {
      board,
      activePiece,
      gameState,
      isControllable,
      isPaused,
      level,
      correctStreak,
      heatLevel,
      coolingRemaining,
      questionIndex,
      shuffledQuestions,
      misses,
      questionsSinceLastRise,
      runMetrics,
      activeMutator,
      runMode,
      endlessLevel,
      speedWavePieces,
      isFrenzyActive,
      isDesperationActive,
      // Arena
      board2,
      activePiece2,
      totalScore2,
      correctStreak2,
      misses2,
      isControllable2,
      p1Answered,
      p2Answered,
      arenaMode,
      aiDifficulty,
    };
  }, [board, activePiece, gameState, isControllable, isPaused, level, correctStreak, heatLevel, coolingRemaining, questionIndex, shuffledQuestions, misses, questionsSinceLastRise, runMetrics, activeMutator, runMode, endlessLevel, speedWavePieces, isFrenzyActive, isDesperationActive, board2, activePiece2, totalScore2, correctStreak2, misses2, isControllable2, p1Answered, p2Answered, arenaMode, aiDifficulty]);



  useEffect(() => {
    saveProgress(maxUnlockedLevel);
  }, [maxUnlockedLevel]);

  useEffect(() => {
    if (gameState !== "intro" && gameState !== "arena_intro") {
      return undefined;
    }

    const isSP = runMode === "campaign" || runMode === "custom";
    if (!isSP || !activeMutator) {
      return undefined;
    }

    const mutatorKeys = ["double_drop", "inverse_gravity", "dopamine_rush", "chaos_deck", "volcanic_surge"];
    const interval = setInterval(() => {
      setWheelIndex((prev) => (prev + 1) % mutatorKeys.length);
      playSFX("button");
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      const finalIndex = mutatorKeys.indexOf(activeMutator);
      if (finalIndex !== -1) {
        setWheelIndex(finalIndex);
      }
      setWheelState("selected");
      playSFX("unlock");
    }, 2200);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [gameState, activeMutator, runMode]);

  const prepareOnboardingDrafts = useCallback((profile, savedLevel = 1) => {
    setOnboardingNameDraft(profile?.name?.startsWith("Player ") ? "" : profile?.name || "");
    setOnboardingAvatarDraft(profile?.avatar || "⚡");
    setOnboardingDifficultyDraft(profile?.difficulty || "normal");
    setOnboardingStartLevel(profile?.startingLevel || savedLevel || 1);
  }, []);

  const handleProfileSwitch = useCallback((profileId) => {
    const nextProfile = profiles.find((profile) => profile.id === profileId);
    if (!nextProfile || nextProfile.id === activeProfileId) return;

    persistActiveProfileId(profileId);
    setActiveProfileId(profileId);
    setDifficultyMode(nextProfile.difficulty || "normal");
    setShowOnboarding(!nextProfile.profileSetupComplete || !nextProfile.onboardingComplete);
    setOnboardingStep(0);
    prepareOnboardingDrafts(nextProfile, readSavedProgress());
    setStats(readSavedStats());
    setMaxUnlockedLevel(readSavedProgress());
    earnedRef.current = null;
    setGameState("start");
    setMenuTab("levels");
    playSFX("theme");
  }, [profiles, activeProfileId, prepareOnboardingDrafts]);

  const handleDifficultyChange = useCallback((difficultyId) => {
    if (!DIFFICULTY_PRESETS[difficultyId]) return;
    setDifficultyMode(difficultyId);
    const updated = updateProfile(activeProfileId, { difficulty: difficultyId });
    setProfiles((current) =>
      current.map((profile) => profile.id === updated.id ? updated : profile)
    );
    playSFX("button");
  }, [activeProfileId]);

  const completeOnboarding = useCallback(() => {
    const updated = updateProfile(activeProfileId, { onboardingComplete: true });
    setProfiles((current) =>
      current.map((profile) => profile.id === updated.id ? updated : profile)
    );
    setShowOnboarding(false);
    setOnboardingStep(0);
    playSFX("unlock");
  }, [activeProfileId]);

  const saveOnboardingProfile = useCallback(() => {
    const name = onboardingNameDraft.trim() || activeProfile?.name || "Player";
    const nextStartingLevel = Math.min(Math.max(onboardingStartLevel, 1), FINAL_LEVEL_ID);
    const updated = updateProfile(activeProfileId, {
      name,
      avatar: onboardingAvatarDraft,
      difficulty: onboardingDifficultyDraft,
      startingLevel: nextStartingLevel,
      profileSetupComplete: true,
    });
    const unlockedLevel = Math.max(readSavedProgress(), nextStartingLevel);
    setProfiles((current) =>
      current.map((profile) => profile.id === updated.id ? updated : profile)
    );
    setDifficultyMode(onboardingDifficultyDraft);
    setMaxUnlockedLevel(unlockedLevel);
    saveProgress(unlockedLevel);
    playSFX("unlock");
  }, [
    activeProfile?.name,
    activeProfileId,
    onboardingAvatarDraft,
    onboardingDifficultyDraft,
    onboardingNameDraft,
    onboardingStartLevel,
  ]);

  const handleCreateProfile = useCallback(() => {
    if (profiles.length >= MAX_PROFILES) return;
    const created = createProfile({
      name: profileNameDraft,
      avatar: profileAvatarDraft,
      difficulty: "normal",
    });
    if (!created) return;
    const nextProfiles = readProfiles();
    setProfiles(nextProfiles);
    setProfileNameDraft("");
    persistActiveProfileId(created.id);
    setActiveProfileId(created.id);
    setDifficultyMode(created.difficulty);
    setShowOnboarding(true);
    setOnboardingStep(0);
    prepareOnboardingDrafts(created, 1);
    setStats(readSavedStats());
    setMaxUnlockedLevel(readSavedProgress());
    earnedRef.current = null;
    playSFX("unlock");
  }, [profileNameDraft, profileAvatarDraft, profiles.length, prepareOnboardingDrafts]);

  const handleDeleteProfile = useCallback((profileId) => {
    if (profiles.length <= 1) return;
    const remaining = deleteProfile(profileId);
    setProfiles(remaining);
    if (profileId === activeProfileId) {
      const nextId = getActiveProfileId();
      setActiveProfileId(nextId);
      const nextProfile = remaining.find((profile) => profile.id === nextId) || remaining[0];
      setDifficultyMode(nextProfile.difficulty || "normal");
      setShowOnboarding(!nextProfile.profileSetupComplete || !nextProfile.onboardingComplete);
      setOnboardingStep(0);
      prepareOnboardingDrafts(nextProfile, readSavedProgress());
      setStats(readSavedStats());
      setMaxUnlockedLevel(readSavedProgress());
      earnedRef.current = null;
    }
    playSFX("button");
  }, [profiles.length, activeProfileId, prepareOnboardingDrafts]);

  // Handle programmatic audio enabled state
  useEffect(() => {
    setAudioEnabled(audioOn);
    try {
      localStorage.setItem("think-fast-blast-audio-enabled", String(audioOn));
    } catch (e) {
      console.error(e);
    }
  }, [audioOn]);

  useEffect(() => {
    try {
      localStorage.setItem("think-fast-blast-reduce-motion", String(reduceMotion));
      localStorage.setItem("think-fast-blast-screen-shake", String(screenShakeEnabled));
      localStorage.setItem("think-fast-blast-haptics", String(hapticsEnabled));
      localStorage.setItem("think-fast-blast-high-contrast", String(highContrast));
    } catch {
      // Preference persistence is optional in restricted browsing contexts.
    }
  }, [reduceMotion, screenShakeEnabled, hapticsEnabled, highContrast]);

  // Trigger screen shake
  const triggerShake = useCallback(() => {
    if (reduceMotion || !screenShakeEnabled) return;
    setShake(true);
    setTimeout(() => setShake(false), 300);
  }, [reduceMotion, screenShakeEnabled]);

  // Trigger board vertical recoil/impact shake when blocks land
  const triggerBoardRecoil = useCallback(() => {
    if (reduceMotion || !screenShakeEnabled) return;
    setBoardRecoil(true);
    setTimeout(() => setBoardRecoil(false), 200);
  }, [reduceMotion, screenShakeEnabled]);

  const triggerBoardThump = useCallback(() => {
    if (reduceMotion) return;
    setBoardThump(true);
    setTimeout(() => setBoardThump(false), 350);
  }, [reduceMotion]);

  // Tactile feedback on mobile. Silently no-ops where unsupported.
  const vibrate = useCallback((pattern) => {
    if (!hapticsEnabled || reduceMotion) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // Vibration can be blocked by browser policy; ignore.
    }
  }, [hapticsEnabled, reduceMotion]);

  // Transient pop-up notifications (achievements, records). Auto-dismiss.
  const pushToast = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2, 9);
    setAchievementToasts((prev) => [...prev.slice(-2), { id, ...toast }]);
    window.setTimeout(() => {
      setAchievementToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  // Unlock a one-time achievement: toast + sound the first time only, then persist.
  const unlockAchievement = useCallback((id) => {
    const def = ACHIEVEMENTS[id];
    if (!def) return;
    if (earnedRef.current === null) {
      earnedRef.current = new Set(readSavedStats().unlockedAchievements || []);
    }
    if (earnedRef.current.has(id)) return;
    earnedRef.current.add(id);
    pushToast({ kind: "achievement", emoji: def.emoji, title: def.label, desc: def.desc });
    playSFX("unlock");
    vibrate(28);
    setStats((prev) => {
      if (prev.unlockedAchievements?.includes(id)) return prev;
      const next = { ...prev, unlockedAchievements: [...(prev.unlockedAchievements || []), id] };
      try {
        saveStats(next);
      } catch {
        // Storage may be unavailable; the toast still fired.
      }
      return next;
    });
  }, [pushToast, vibrate]);

  // Fire the board-wide electrify animation (Lightning blast). Self-clearing.
  const triggerElectrify = useCallback(() => {
    setElectrify(true);
    window.clearTimeout(electrifyTimerRef.current);
    electrifyTimerRef.current = window.setTimeout(() => setElectrify(false), 850);
  }, []);

  useEffect(() => () => window.clearTimeout(electrifyTimerRef.current), []);

  // Add floating point/combo popup feedback
  const addFloatingText = useCallback((text, x = 4, y = 8) => {
    const id = Math.random().toString(36).substring(2, 9);
    setFloatingTexts((prev) => [...prev, { id, text, x, y }]);
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== id));
    }, 900);
  }, []);

  const activateBoardPower = useCallback((powerId) => {
    const power = BOARD_POWERS[powerId];
    const current = stateRef.current;
    if (!power || usedPowers.includes(powerId) || !stats.unlockedItems.includes(powerId)) return;
    if (current.gameState !== "quiz" || current.isPaused) return;

    const result = applyBoardPower(current.board, powerId);
    if (!result.cleared) {
      pushToast({ kind: "info", emoji: "✓", title: "Board Clear", desc: "Save that power for when blocks are stacked." });
      return;
    }

    setUsedPowers((used) => [...used, powerId]);
    setBlastEffect(power.effect);
    setExplodingCells(result.cells);
    triggerShake();
    triggerFlash(powerId === "power_fire" ? "danger" : "blast");
    vibrate([30, 35, 60]);
    addFloatingText(`${power.emoji} ${power.name.toUpperCase()} · ${result.cleared} BLOCKS`, 4, 8);
    playSFX(powerId === "power_earthquake" ? "harddrop" : "explosion");

    window.setTimeout(() => {
      setBoard(result.board);
      setExplodingCells([]);
      const isDopamine = stateRef.current.activeMutator === "dopamine_rush";
      setTotalScore((score) => score + result.cleared * 2 * (isDopamine ? 2 : 1));
    }, reduceMotion ? 120 : 520);
  }, [addFloatingText, pushToast, reduceMotion, stats.unlockedItems, triggerFlash, triggerShake, usedPowers, vibrate]);

  // Dynamic Pressure Mutators - state change notifications
  const prevFrenzyRef = useRef(false);
  const prevDesperationRef = useRef(false);

  useEffect(() => {
    // Only trigger notifications if the game is active
    if (gameState !== "dropping" && gameState !== "resolving" && gameState !== "quiz") {
      prevFrenzyRef.current = isFrenzyActive;
      prevDesperationRef.current = isDesperationActive;
      return;
    }

    if (isFrenzyActive && !prevFrenzyRef.current) {
      playSFX("thunder");
      triggerFlash("blast");
      vibrate([40, 40, 80]);
      addFloatingText("🔥 FRENZY ACTIVE! ⚡", 5, 3);
      pushToast({
        kind: "info",
        emoji: "⚡",
        title: "Frenzy Mode!",
        desc: "Streak 5+! Fall speed doubled and points are x2!"
      });
    }
    prevFrenzyRef.current = isFrenzyActive;

    if (isDesperationActive && !prevDesperationRef.current) {
      playSFX("incorrect");
      triggerFlash("danger");
      triggerShake();
      vibrate([80, 80]);
      addFloatingText("🚨 DESPERATION ACTIVE! 🪨", 5, 3);
      pushToast({
        kind: "info",
        emoji: "🚨",
        title: "Desperation Mode!",
        desc: "Blocks near the top! Gravity slowed but wrong answers spawn heavier stone!"
      });
    }
    prevDesperationRef.current = isDesperationActive;
  }, [isFrenzyActive, isDesperationActive, gameState, pushToast, playSFX, triggerFlash, vibrate, addFloatingText, triggerShake]);

  // Helper to generate a Power-up block
  const makePowerUp = (piece, streak) => {
    const powerType = getStreakPowerType(streak);
    if (powerType === "tnt") {
      return {
        ...piece,
        isTNT: true,
        color: "bg-red-600 animate-glow-tnt shadow-[0_0_15px_rgba(239,68,68,0.8)]",
        emoji: "💣",
        shape: [[1]],
      };
    }
    if (powerType === "drill") {
      return {
        ...piece,
        isDrill: true,
        color: "bg-amber-500 animate-glow-drill shadow-[0_0_15px_rgba(245,158,11,0.8)]",
        emoji: "🌀",
        shape: [[1]],
      };
    }
    if (powerType === "lightning") {
      return {
        ...piece,
        isLightning: true,
        color: "bg-yellow-400 animate-glow-lightning shadow-[0_0_15px_rgba(250,204,21,0.8)]",
        emoji: "⚡",
        shape: [[1]],
      };
    }
    return piece;
  };

  // Helper to generate an evolved Power Block (Row/Area Clear)
  const makePowerBlock = (piece, type, streak) => {
    if (type === "row_clear") {
      return {
        ...piece,
        isRowClear: true,
        color: "bg-cyan-500 animate-glow-row shadow-[0_0_15px_rgba(6,182,212,0.8)]",
        emoji: "↔️",
        shape: [[1]],
      };
    }
    if (type === "area_clear") {
      return {
        ...piece,
        isArea2x2Clear: true,
        color: "bg-fuchsia-500 animate-glow-area shadow-[0_0_15px_rgba(217,70,239,0.8)]",
        emoji: "🔲",
        shape: [[1]],
      };
    }
    return piece;
  };


  // Memoized game end handler to save stats, high scores, glitches and trigger audio
  const handleGameEnd = useCallback((isWin, finalScore) => {
    window.clearTimeout(aiRaceTimerRef.current);
    setIsPaused(false);
    const savedSnapshot = readSavedStats();
    const completedRunMetrics = stateRef.current.runMetrics || runMetrics;

    if (runMode === "endless") {
      const entry = {
        score: finalScore,
        stage: endlessLevel,
        date: new Date().toLocaleDateString(),
      };
      const localScores = [...(savedSnapshot.endlessHighScores || [])];
      localScores.push(entry);
      localScores.sort((a, b) => b.score - a.score);
      const updatedScores = localScores.slice(0, 10);
      
      const isNewPersonalBest = updatedScores[0]?.score === finalScore;
      if (isNewPersonalBest) {
        pushToast({ kind: "record", emoji: "🏆", title: "New Endless Best!", desc: `${finalScore} pts (Stage ${endlessLevel})` });
      }
      
      setStats((prev) => {
        const next = { ...prev, endlessHighScores: updatedScores };
        saveStats(next);
        return next;
      });

      const playerName = activeProfile?.name || "Player 1";
      saveEndlessScoreToSupabase(playerName, finalScore, endlessLevel);
    }

    const prevBest = runMode === "endless"
      ? (savedSnapshot.endlessHighScores?.[0]?.score || 0)
      : (savedSnapshot.highScores[level] || 0);
    setPreviousBest(prevBest);

    // New personal-best answer streak (recurring celebration, persisted).
    const savedBest = savedSnapshot.bestStreak || 0;
    if (maxStreak > savedBest && maxStreak >= 3) {
      pushToast({ kind: "record", emoji: "🏆", title: "New Record Streak!", desc: `Best answer streak: x${maxStreak}` });
      setStats((prev) => {
        const next = { ...prev, bestStreak: Math.max(prev.bestStreak || 0, maxStreak) };
        try {
          saveStats(next);
        } catch {
          // Storage may be unavailable.
        }
        return next;
      });
    }
    if (isWin && stateRef.current.misses === 0) {
      pushToast({ kind: "record", emoji: "🌟", title: "Flawless!", desc: "Cleared the level with zero strikes" });
      unlockAchievement("flawless");
    }

    const levelMultiplier = runMode === "campaign" ? level : runMode === "endless" ? Math.min(20, endlessLevel) : 5;
    const unlockProgressMilestones = (glitchesEarned) => {
      if ((savedSnapshot.totalCorrect || 0) + questionsAnsweredThisLevel >= 100) {
        unlockAchievement("scholar");
      }
      if ((savedSnapshot.totalGames || 0) + 1 >= 10) {
        unlockAchievement("veteran");
      }
      if ((savedSnapshot.glitches || 0) + glitchesEarned >= 1000) {
        unlockAchievement("glitch_hoard");
      }
    };

    if (isWin) {
      if (runMode === "ai_race") {
        setArenaResult("p1_win");
        setAiQuip("Good game. I demand a rematch and possibly newer hardware.");
        unlockAchievement("arena");
      }
      playSFX("level_win");
      triggerFlash("win");
      setGameState("level_win");
      unlockAchievement("first_win");
      if (runMode === "daily") unlockAchievement("daily");
      if (runMode === "campaign" && level >= 5) unlockAchievement("level5");
      if (runMode === "campaign" && level >= 10) unlockAchievement("level10");
      if (runMode === "campaign" && level >= FINAL_LEVEL_ID) unlockAchievement("champion");
      if (runMode === "campaign" && level < FINAL_LEVEL_ID) {
        setMaxUnlockedLevel((prev) => Math.max(prev, level + 1));
      }

      const glitchesEarned = Math.floor(finalScore / 10) + (levelMultiplier * 10);
      unlockProgressMilestones(glitchesEarned);
      setStats((prevStats) => {
        const updatedHighScores = { ...prevStats.highScores };
        if (runMode !== "endless") {
          const previousBest = updatedHighScores[level] || 0;
          updatedHighScores[level] = Math.max(previousBest, finalScore);
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = getDailyChallengeKey(yesterday);
        const completedDailyToday = runMode === "daily" && prevStats.lastDailyWin === dailyChallengeKey;
        const nextDailyStreak = runMode !== "daily"
          ? prevStats.dailyStreak || 0
          : completedDailyToday
            ? prevStats.dailyStreak || 1
            : prevStats.lastDailyWin === yesterdayKey
              ? (prevStats.dailyStreak || 0) + 1
              : 1;
        const newStats = {
          ...prevStats,
          highScores: updatedHighScores,
          totalGames: prevStats.totalGames + 1,
          totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
          totalQuestions: prevStats.totalQuestions + (questionIndex + 1),
          glitches: (prevStats.glitches || 0) + glitchesEarned,
          dailyStreak: nextDailyStreak,
          lastDailyWin: runMode === "daily" ? dailyChallengeKey : prevStats.lastDailyWin,
          dailyBest: runMode === "daily"
            ? Math.max(prevStats.dailyBest || 0, finalScore)
            : prevStats.dailyBest || 0,
          levelsWon: (prevStats.levelsWon || 0) + 1,
          arenaWins: (prevStats.arenaWins || 0) + Number(runMode === "ai_race"),
          totalLines: (prevStats.totalLines || 0) + completedRunMetrics.lines,
          totalMatches: (prevStats.totalMatches || 0) + completedRunMetrics.matches,
          totalFruits: (prevStats.totalFruits || 0) + completedRunMetrics.fruits,
          totalSpecials: (prevStats.totalSpecials || 0) + completedRunMetrics.specials,
        };
        saveStats(newStats);
        return newStats;
      });
      setFeedback(`Victory! Earned ${glitchesEarned} Glitches.`);
    } else {
      if (runMode === "ai_race") {
        setArenaResult("ai_win");
        setAiQuip("Good race. I will be humble about this for almost six seconds.");
      }
      playSFX("gameover");
      triggerFlash("danger");
      setGameState("gameover");

      const glitchesEarned = Math.max(1, Math.floor(finalScore / 20) + (levelMultiplier * 2));
      unlockProgressMilestones(glitchesEarned);
      setStats((prevStats) => {
        const updatedHighScores = { ...prevStats.highScores };
        if (runMode !== "endless") {
          const previousBest = updatedHighScores[level] || 0;
          updatedHighScores[level] = Math.max(previousBest, finalScore);
        }

        const newStats = {
          ...prevStats,
          highScores: updatedHighScores,
          totalGames: prevStats.totalGames + 1,
          totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
          totalQuestions: prevStats.totalQuestions + (questionIndex + 1),
          glitches: (prevStats.glitches || 0) + glitchesEarned,
          totalLines: (prevStats.totalLines || 0) + completedRunMetrics.lines,
          totalMatches: (prevStats.totalMatches || 0) + completedRunMetrics.matches,
          totalFruits: (prevStats.totalFruits || 0) + completedRunMetrics.fruits,
          totalSpecials: (prevStats.totalSpecials || 0) + completedRunMetrics.specials,
        };
        saveStats(newStats);
        return newStats;
      });
      setFeedback(`Game Over! Earned ${glitchesEarned} Glitches.`);
    }
  }, [level, questionsAnsweredThisLevel, questionIndex, triggerFlash, maxStreak, pushToast, runMode, dailyChallengeKey, runMetrics, unlockAchievement, activeProfile?.name, endlessLevel]);

  // -------------------------------------------------------------------------
  // Arena VS Mode Side-by-Side Callbacks & Loops
  // -------------------------------------------------------------------------
  const triggerShake2 = useCallback(() => {
    if (reduceMotion || !screenShakeEnabled) return;
    setShake2(true);
    setTimeout(() => setShake2(false), 300);
  }, [reduceMotion, screenShakeEnabled]);

  const triggerBoardRecoil2 = useCallback(() => {
    if (reduceMotion || !screenShakeEnabled) return;
    setBoardRecoil2(true);
    setTimeout(() => setBoardRecoil2(false), 200);
  }, [reduceMotion, screenShakeEnabled]);

  const triggerBoardThump2 = useCallback(() => {
    if (reduceMotion) return;
    setBoardThump2(true);
    setTimeout(() => setBoardThump2(false), 350);
  }, [reduceMotion]);

  const lockPiece2 = useCallback(() => {
    const { activePiece2: piece, board2: currentBoard } = stateRef.current;
    if (!piece) return;

    if (piece.isStone) {
      playSFX("thud");
      triggerShake2();
      triggerBoardRecoil2();
      triggerBoardThump2();
      vibrate([45, 35, 45]);
    } else {
      playSFX("lock");
      triggerShake2();
      triggerBoardRecoil2();
      vibrate(15);
    }
    setLastPlacedPiece2({
      x: piece.x,
      y: piece.y,
      shape: piece.shape,
      color: piece.color,
      timestamp: Date.now()
    });

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          nextBoard[boardY][boardX] = {
            color: piece.color,
            isFruit: piece.isFruit || false,
            fruitType: piece.fruitType || "",
            emoji: piece.emoji || "",
            isStone: piece.isStone || false,
            isTNT: piece.isTNT || false,
            isDrill: piece.isDrill || false,
            isLightning: piece.isLightning || false,
            isRowClear: piece.isRowClear || false,
            isArea2x2Clear: piece.isArea2x2Clear || false,
            isSlime: piece.isSlime || false,
            isCatalystBomb: piece.isCatalystBomb || false,
            isWildcard: piece.isWildcard || false,
            landedAt: Date.now(),
          };
        }
      });
    });

    setBoard2(nextBoard);
    setActivePiece2(null);
    setGameState("arena_resolving");
  }, [triggerShake2, triggerBoardRecoil2, triggerBoardThump2, vibrate, setLastPlacedPiece2]);

  const moveDown2 = useCallback(() => {
    const { activePiece2: piece, board2: currentBoard, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece) return;

    const movedPiece = { ...piece, y: piece.y + 1 };
    if (!checkCollision(movedPiece, currentBoard)) setActivePiece2(movedPiece);
    else lockPiece2();
  }, [lockPiece2]);

  const moveHorizontal2 = useCallback((dir) => {
    const { activePiece2: piece, board2: currentBoard, isControllable2: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "arena_dropping") return;

    const movedPiece = { ...piece, x: piece.x + dir };
    if (!checkCollision(movedPiece, currentBoard)) {
      setActivePiece2(movedPiece);
    }
  }, []);

  const rotatePiece2 = useCallback(() => {
    const { activePiece2: piece, board2: currentBoard, isControllable2: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "arena_dropping" || piece.isFruit) return;

    const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
    if (!checkCollision(rotatedPiece, currentBoard)) {
      playSFX("rotate");
      setActivePiece2(rotatedPiece);
    }
  }, []);

  const hardDrop2 = useCallback(() => {
    const { activePiece2: piece, board2: currentBoard, isControllable2: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "arena_dropping") return;

    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) y += 1;
    const droppedPiece = { ...piece, y };
    playSFX("drop");
    triggerShake2();
    triggerBoardRecoil2();
    vibrate(20);
    setActivePiece2(droppedPiece);
    setLastPlacedPiece2({
      x: droppedPiece.x,
      y: droppedPiece.y,
      shape: droppedPiece.shape,
      color: droppedPiece.color,
      timestamp: Date.now()
    });

    const nextBoard = currentBoard.map((row) => [...row]);
    droppedPiece.shape.forEach((row, shapeY) => {
      row.forEach((value, shapeX) => {
        if (!value) return;
        const boardY = droppedPiece.y + shapeY;
        const boardX = droppedPiece.x + shapeX;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          nextBoard[boardY][boardX] = {
            color: droppedPiece.color,
            isFruit: droppedPiece.isFruit || false,
            fruitType: droppedPiece.fruitType || "",
            emoji: droppedPiece.emoji || "",
            isStone: droppedPiece.isStone || false,
            isTNT: droppedPiece.isTNT || false,
            isDrill: droppedPiece.isDrill || false,
            isLightning: droppedPiece.isLightning || false,
            isRowClear: droppedPiece.isRowClear || false,
            isArea2x2Clear: droppedPiece.isArea2x2Clear || false,
            isSlime: droppedPiece.isSlime || false,
            isCatalystBomb: droppedPiece.isCatalystBomb || false,
            isWildcard: droppedPiece.isWildcard || false,
            landedAt: Date.now(),
          };
        }
      });
    });
    setBoard2(nextBoard);
    setActivePiece2(null);
    setGameState("arena_resolving");
  }, [triggerShake2, triggerBoardRecoil2, vibrate, setLastPlacedPiece2]);

  const addFloatingText2 = useCallback((text, x = 4, y = 8) => {
    const id = Math.random().toString(36).substring(2, 9);
    setFloatingTexts2((prev) => [...prev, { id, text, x, y }]);
    setTimeout(() => {
      setFloatingTexts2((prev) => prev.filter((t) => t.id !== id));
    }, 900);
  }, []);

  const handleArenaGameEnd = useCallback((winner) => {
    setIsPaused(false);
    stopArpeggiator();

    if (winner === 1) {
      playSFX("level_win");
      setArenaResult("p1_win");
      unlockAchievement("arena");
      setStats((prev) => {
        const next = {
          ...prev,
          glitches: (prev.glitches || 0) + 50,
          arenaWins: (prev.arenaWins || 0) + 1,
        };
        saveStats(next);
        return next;
      });
    } else {
      playSFX("gameover");
      setArenaResult(stateRef.current.arenaMode === "vs_ai" ? "ai_win" : "p2_win");
      setStats((prev) => {
        const next = { ...prev, glitches: (prev.glitches || 0) + 10 };
        saveStats(next);
        return next;
      });
    }
    setGameState("arena_win");
  }, [unlockAchievement]);

  const pushGarbageRows = useCallback((targetPlayer, count) => {
    if (count <= 0) return;
    const targetBoard = targetPlayer === 1 ? stateRef.current.board : stateRef.current.board2;
    const setTargetBoard = targetPlayer === 1 ? setBoard : setBoard2;
    const triggerFlashTarget = targetPlayer === 1 ? () => triggerFlash("danger") : () => {};
    const addFloatingTextTarget = targetPlayer === 1 ? addFloatingText : addFloatingText2;

    // Check top out
    let toppedOut = false;
    for (let r = 0; r < count; r++) {
      if (targetBoard[r].some(cell => cell !== null)) {
        toppedOut = true;
        break;
      }
    }

    if (toppedOut) {
      handleArenaGameEnd(targetPlayer === 1 ? 2 : 1);
      return;
    }

    // Create garbage rows
    const garbageRows = [];
    for (let i = 0; i < count; i++) {
      const row = Array(BOARD_WIDTH).fill(null);
      const gap = Math.floor(Math.random() * BOARD_WIDTH);
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (x !== gap) {
          row[x] = {
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true,
          };
        }
      }
      garbageRows.push(row);
    }

    const nextBoard = [...targetBoard.slice(count), ...garbageRows];
    setTargetBoard(nextBoard);

    if (targetPlayer === 1) {
      triggerShake();
      triggerFlashTarget();
      addFloatingTextTarget(`GARBAGE INJECTED! 🌋 +${count}`, 4, BOARD_HEIGHT - 2);
    } else {
      triggerShake2();
      addFloatingTextTarget(`GARBAGE INJECTED! 🌋 +${count}`, 4, BOARD_HEIGHT - 2);
    }
  }, [triggerFlash, addFloatingText, addFloatingText2, handleArenaGameEnd, triggerShake, triggerShake2]);

  const handleArenaTimeOut = useCallback(() => {
    const { activePiece: piece1, activePiece2: piece2, board, board2 } = stateRef.current;

    playSFX("incorrect");

    // For P1
    if (piece1 && p1Answered === null) {
      setP1Answered("wrong");
      setIsControllable(false);
      const nextBoard = board.map(row => [...row]);
      piece1.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (!value) return;
          const boardY = piece1.y + y;
          const boardX = piece1.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT) {
            nextBoard[boardY][boardX] = {
              color: "bg-slate-500",
              isStone: true,
              emoji: "🧱"
            };
          }
        });
      });
      setBoard(nextBoard);
      setActivePiece(null);
      addFloatingText("TIMEOUT! 🧱", piece1.x, piece1.y);
    }

    // For P2
    if (piece2 && p2Answered === null) {
      setP2Answered("wrong");
      setIsControllable2(false);
      const nextBoard = board2.map(row => [...row]);
      piece2.shape.forEach((row, y) => {
        row.forEach((value, x) => {
          if (!value) return;
          const boardY = piece2.y + y;
          const boardX = piece2.x + x;
          if (boardY >= 0 && boardY < BOARD_HEIGHT) {
            nextBoard[boardY][boardX] = {
              color: "bg-slate-500",
              isStone: true,
              emoji: "🧱"
            };
          }
        });
      });
      setBoard2(nextBoard);
      setActivePiece2(null);
      addFloatingText2("TIMEOUT! 🧱", piece2.x, piece2.y);
    }

    setGameState("arena_resolving");
  }, [p1Answered, p2Answered, addFloatingText, addFloatingText2]);

  const spawnArenaPieces = useCallback(() => {
    const isFirstBlock = stateRef.current.questionIndex === 0;

    let pieceBase;
    if (isFirstBlock) {
      pieceBase = randomItem(TETROMINOES);
    } else {
      const spawnRoll = Math.random();
      if (spawnRoll < SPECIAL_BLOCK_RATES.arenaFruit) {
        pieceBase = randomItem(FRUITS);
      } else {
        pieceBase = randomItem(TETROMINOES);
      }
    }

    const width = pieceBase.shape[0].length;
    const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);

    const newPiece1 = {
      ...pieceBase,
      color: pieceBase.color,
      emoji: pieceBase.emoji || "",
      isSlime: false,
      x,
      y: 0,
    };

    const newPiece2 = {
      ...pieceBase,
      color: pieceBase.color,
      emoji: pieceBase.emoji || "",
      isSlime: false,
      x,
      y: 0,
    };

    if (checkCollision(newPiece1, stateRef.current.board)) {
      handleArenaGameEnd(2);
      return;
    }
    if (checkCollision(newPiece2, stateRef.current.board2)) {
      handleArenaGameEnd(1);
      return;
    }

    setActivePiece(newPiece1);
    setActivePiece2(newPiece2);
    setP1Answered(null);
    setP2Answered(null);
    setIsControllable(false);
    setIsControllable2(false);
    if (stateRef.current.arenaMode === "vs_ai") {
      setAiThinkingStage("reading");
      setAiQuip(randomItem(AI_THINKING_LINES));
    }

    setQuestionStartTime(Date.now());
  }, [handleArenaGameEnd]);

  const handleArenaAnswer = useCallback((playerIndex, selectedIndex) => {
    if (stateRef.current.isPaused || stateRef.current.gameState !== "arena_quiz") return;

    const question = shuffledQuestions[stateRef.current.questionIndex];
    if (!question) return;
    const correct = selectedIndex === question.answer;

    if (playerIndex === 1) {
      if (p1Answered !== null) return;
      if (correct) {
        setP1Answered("correct");
        playSFX("correct", correctStreak + 1);
        triggerFlash("success");
        vibrate(correctStreak + 1 >= 5 ? [18, 40, 18] : 16);
        setCorrectStreak(prev => prev + 1);
        setTotalScore(prev => prev + POINTS.CORRECT_ANSWER);
        setIsControllable(true);
        addFloatingText("CORRECT! ⚡", activePiece?.x || 5, activePiece?.y || 2);

        if (p2Answered === null) {
          if (stateRef.current.arenaMode === "vs_ai") {
            setAiThinkingStage("outplayed");
            setAiQuip(randomItem(AI_PLAYER_WINS_LINES));
          }
          setP2Answered("wrong");
          setIsControllable2(false);
          if (activePiece2) {
            setActivePiece2(prev => ({
              ...prev,
              color: "bg-slate-500",
              emoji: "🧱",
              isStone: true
            }));
          }
          addFloatingText2("LOCKED OUT! 🧱", activePiece2?.x || 5, activePiece2?.y || 2);
        }

        setGameState("arena_dropping");
      } else {
        setP1Answered("wrong");
        playSFX("incorrect", 1);
        triggerFlash("danger");
        vibrate([60, 30, 90]);
        triggerShake();
        triggerBoardRecoil();
        setCorrectStreak(0);
        setIsControllable(false);
        if (activePiece) {
          setActivePiece(prev => ({
            ...prev,
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true
          }));
        }
        addFloatingText("WRONG! 🧱", activePiece?.x || 5, activePiece?.y || 2);

        if (p2Answered !== null) {
          setGameState("arena_dropping");
        }
      }
    } else {
      if (p2Answered !== null) return;
      if (correct) {
        if (stateRef.current.arenaMode === "vs_ai") {
          setAiThinkingStage("answered");
          setAiQuip(randomItem(AI_BOT_WINS_LINES));
        }
        setP2Answered("correct");
        playSFX("correct", correctStreak2 + 1);
        setCorrectStreak2(prev => prev + 1);
        setTotalScore2(prev => prev + POINTS.CORRECT_ANSWER);
        setIsControllable2(true);
        addFloatingText2("CORRECT! ⚡", activePiece2?.x || 5, activePiece2?.y || 2);

        if (p1Answered === null) {
          setP1Answered("wrong");
          setIsControllable(false);
          if (activePiece) {
            setActivePiece(prev => ({
              ...prev,
              color: "bg-slate-500",
              emoji: "🧱",
              isStone: true
            }));
          }
          addFloatingText("LOCKED OUT! 🧱", activePiece?.x || 5, activePiece?.y || 2);
        }

        setGameState("arena_dropping");
      } else {
        if (stateRef.current.arenaMode === "vs_ai") {
          setAiThinkingStage("missed");
          setAiQuip(randomItem(AI_MISS_LINES));
        }
        setP2Answered("wrong");
        playSFX("incorrect", 1);
        setCorrectStreak2(0);
        setIsControllable2(false);
        if (activePiece2) {
          setActivePiece2(prev => ({
            ...prev,
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true
          }));
        }
        addFloatingText2("WRONG! 🧱", activePiece2?.x || 5, activePiece2?.y || 2);
        triggerShake2();
        triggerBoardRecoil2();

        if (p1Answered !== null) {
          setGameState("arena_dropping");
        }
      }
    }
  }, [shuffledQuestions, p1Answered, p2Answered, correctStreak, correctStreak2, activePiece, activePiece2, addFloatingText, addFloatingText2, vibrate, triggerFlash, triggerShake, triggerBoardRecoil, triggerShake2, triggerBoardRecoil2]);
  useEffect(() => {
    handleArenaAnswerRef.current = handleArenaAnswer;
  }, [handleArenaAnswer]);

  const startArenaMatch = useCallback((mode, diff, selectedLvl) => {
    playSFX("race_start");
    setArenaMode(mode);
    setAiDifficulty(diff);
    setArenaLevel(selectedLvl);
    setArenaResult(null);

    const questions = buildQuestionDeck({
      level: selectedLvl,
      banks: { ...QUESTION_BANKS, 99: customQuestions },
      recentIds: readRecentQuestionIds(),
      size: 60,
      seed: `arena-${selectedLvl}-${Date.now()}`,
    });
    setShuffledQuestions(questions);
    setQuestionIndex(0);

    setBoard(createEmptyBoard());
    setBoard2(createEmptyBoard());
    setActivePiece(null);
    setActivePiece2(null);

    setTotalScore(0);
    setTotalScore2(0);
    setCorrectStreak(0);
    setCorrectStreak2(0);
    setHeatLevel(0);
    setCoolingRemaining(0);
    setMisses(0);
    setMisses2(0);

    setIsControllable(false);
    setIsControllable2(false);
    setP1Answered(null);
    setP2Answered(null);

    setFeedback("Get Ready...");
    setExplodingCells([]);
    setExplodingCells2([]);
    setFloatingTexts([]);
    setFloatingTexts2([]);

    setIntroCountdown(LEVEL_INTRO_SECONDS);
    setGameState("arena_intro");
  }, [customQuestions]);

  const startOnlineArena = useCallback(() => {
    playSFX("button");
    setArenaMode("online");
    setShuffledQuestions(buildQuestionDeck({
      level: arenaLevel,
      banks: { ...QUESTION_BANKS, 99: customQuestions },
      recentIds: readRecentQuestionIds(),
      size: 60,
      seed: `online-arena-${arenaLevel}-${Date.now()}`,
    }));
    setGameState("online_arena");
  }, [arenaLevel, customQuestions]);

  // Floor rising hazard
  const triggerFloorRise = useCallback((currentBoard) => {
    const isLava = stateRef.current.activeMutator === "volcanic_surge";
    const newRow = Array(BOARD_WIDTH).fill(null);

    if (isLava) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        newRow[x] = {
          color: "bg-orange-600",
          emoji: "🔥",
          isLava: true,
          isStone: true,
        };
      }
    } else {
      const gap1 = Math.floor(Math.random() * BOARD_WIDTH);
      let gap2 = Math.floor(Math.random() * BOARD_WIDTH);
      while (gap2 === gap1) gap2 = Math.floor(Math.random() * BOARD_WIDTH);

      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (x !== gap1 && x !== gap2) {
          newRow[x] = {
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true,
          };
        }
      }
    }

    if (currentBoard[0].some((cell) => cell !== null)) {
      handleGameEnd(false, totalScore);
      return;
    }

    const nextBoard = [...currentBoard.slice(1), newRow];
    setBoard(nextBoard);
    triggerShake();
    triggerFlash("danger");
    if (isLava) {
      addFloatingText("LAVA RISING! 🌋🔥", 4, BOARD_HEIGHT - 2);
      setFeedback("Warning: Lava floor rising!");
      playSFX("thunder");
    } else {
      addFloatingText("FLOOR RISING! 🌋", 4, BOARD_HEIGHT - 2);
      setFeedback("Warning: Floor rising!");
    }
  }, [totalScore, handleGameEnd, addFloatingText, triggerFlash, triggerShake]);

  // Timeout triggers
  const handleTimeOut = useCallback(() => {
    const { activePiece: piece, board: currentBoard, misses: currentMisses, questionIndex: qIdx, shuffledQuestions: questions } = stateRef.current;
    if (!piece) return;

    playSFX("incorrect");
    triggerFlash("danger");

    const desperationActive = currentBoard.slice(0, 5).some(row => row.some(cell => cell !== null));
    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          nextBoard[boardY][boardX] = {
            color: "bg-zinc-800",
            emoji: desperationActive ? "⛰️" : "🪨",
            isStone: true,
            isHeavyStone: true,
            heavyHits: desperationActive ? 3 : 2,
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setCorrectStreak(0);
    setHeatLevel(0);
    setCoolingRemaining(3);

    const question = questions[qIdx];
    const correctAnswer = question ? question.options[question.answer] : "unknown";
    rememberQuestionId(question?.id);
    setRunMetrics((metrics) => ({
      ...metrics,
      questions: metrics.questions + 1,
    }));

    const nextMisses = currentMisses + 1;
    setMisses(nextMisses);
    setLastCorrectAnswer(correctAnswer);
    setFeedback(`Time's up! The answer was: ${correctAnswer}. Stone block locked!`);

    if (nextMisses >= strikeLimit) {
      const activeLevel = level;
      const recoveryDeck = buildQuestionDeck({
        level: activeLevel,
        banks: { ...QUESTION_BANKS, 99: customQuestions },
        recentIds: readRecentQuestionIds(),
        size: 8,
        seed: `timeout-${activeLevel}-${Date.now()}`,
      });
      const q = randomItem(recoveryDeck);
      setShuffledQuestions([q]);
      setQuestionIndex(0);
      setRecoveryTimer(4);
      setGameState("strike_recovery");
    } else {
      setGameState("transition");
      setTimeout(() => setGameState("resolving"), 1500);
    }
  }, [level, triggerFlash, customQuestions, strikeLimit]);

  // -------------------------------------------------------------------------
  // Piece lifecycle
  // -------------------------------------------------------------------------
  const createPieceForLevel = useCallback((activeLevel, isFirstBlock = false) => {
    let pieceBase;

    // Safety check: Fruit bombs or any power-up blocks should NEVER spawn first
    if (isFirstBlock) {
      pieceBase = randomItem(TETROMINOES);
    } else {
      const canSpawnBomb = stats.unlockedItems?.includes("catalyst_bomb") || false;
      const canSpawnWildcard = stats.unlockedItems?.includes("catalyst_wildcard") || false;
      const spawnRoll = Math.random();

      const bombThreshold = canSpawnBomb ? SPECIAL_BLOCK_RATES.catalystBomb : 0;
      const wildcardThreshold =
        bombThreshold + (canSpawnWildcard ? SPECIAL_BLOCK_RATES.catalystWildcard : 0);

      if (canSpawnBomb && spawnRoll < bombThreshold) {
        pieceBase = {
          shape: [[1]],
          color: "bg-rose-600 border border-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-glow-tnt",
          isFruit: true,
          emoji: "💣",
          isCatalystBomb: true
        };
      } else if (canSpawnWildcard && spawnRoll >= bombThreshold && spawnRoll < wildcardThreshold) {
        pieceBase = {
          shape: [[1]],
          color: "bg-gradient-to-tr from-yellow-300 via-pink-500 to-indigo-500 border border-white",
          isWildcard: true,
          emoji: "✨"
        };
      } else if (Math.random() < SPECIAL_BLOCK_RATES.fruit) {
        pieceBase = randomItem(FRUITS);
      } else {
        pieceBase = randomItem(TETROMINOES);
      }
    }

    let color = pieceBase.color;
    let emoji = pieceBase.emoji || "";
    let isSlime = false;

    // Apply Sticky Slime blocks hazard to level 5 & 6 (never on first block!)
    const isEndless = stateRef.current.runMode === "endless";
    const isSlimeLevel = (activeLevel === 5 || activeLevel === 6) || (isEndless && stateRef.current.endlessLevel >= 3);
    const slimeRate = isEndless 
      ? Math.min(0.25, SPECIAL_BLOCK_RATES.slime * (1 + (stateRef.current.endlessLevel - 3) * 0.1))
      : SPECIAL_BLOCK_RATES.slime;
    if (
      !isFirstBlock &&
      isSlimeLevel &&
      Math.random() < slimeRate
    ) {
      isSlime = true;
      color = "bg-emerald-700 border-2 border-emerald-400";
      emoji = "🦠";
    }

    return {
      ...pieceBase,
      color,
      emoji,
      isSlime,
    };
  }, [stats.unlockedItems]);

  const spawnQuizPiece = useCallback(() => {
    if (speedWavePieces > 0) {
      setSpeedWavePieces((prev) => prev - 1);
    }
    if (stateRef.current.coolingRemaining > 0) {
      setCoolingRemaining((prev) => prev - 1);
    }
    const activeLevel = stateRef.current.level;
    const isFirstBlock = stateRef.current.questionIndex === 0;
    const pieceBase = nextPiece || createPieceForLevel(activeLevel, isFirstBlock);
    const queuedPiece = createPieceForLevel(activeLevel, false);
    const width = pieceBase.shape[0].length;
    const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);
    const isInverse = stateRef.current.activeMutator === "inverse_gravity";
    const height = pieceBase.shape.length;
    const y = isInverse ? BOARD_HEIGHT - height : 0;
    const newPiece = {
      ...pieceBase,
      x,
      y,
    };

    if (checkCollision(newPiece, stateRef.current.board, isInverse)) {
      handleGameEnd(false, totalScore);
      return;
    }

    setActivePiece(newPiece);
    setNextPiece(queuedPiece);
    setHoldUsed(false);
    setQuestionStartTime(Date.now());

    // Double Drop mutator: spawns a second block that immediately drops/locks
    if (stateRef.current.activeMutator === "double_drop" && !isFirstBlock) {
      const secondPieceBase = createPieceForLevel(activeLevel, false);
      const secondWidth = secondPieceBase.shape[0].length;
      let secondX = x < BOARD_WIDTH / 2 ? BOARD_WIDTH - secondWidth : 0;
      const secondHeight = secondPieceBase.shape.length;
      const secondY = isInverse ? BOARD_HEIGHT - secondHeight : 0;
      const secondPiece = {
        ...secondPieceBase,
        x: secondX,
        y: secondY,
      };

      if (!checkCollision(secondPiece, stateRef.current.board, isInverse)) {
        let dropY = secondPiece.y;
        if (isInverse) {
          while (!checkCollision({ ...secondPiece, y: dropY - 1 }, stateRef.current.board, true)) {
            dropY -= 1;
          }
        } else {
          while (!checkCollision({ ...secondPiece, y: dropY + 1 }, stateRef.current.board)) {
            dropY += 1;
          }
        }
        
        const nextBoard = stateRef.current.board.map((row) => [...row]);
        secondPieceBase.shape.forEach((row, shapeY) => {
          row.forEach((value, shapeX) => {
            if (!value) return;
            const boardY = dropY + shapeY;
            const boardX = secondX + shapeX;
            if (boardY >= 0 && boardY < BOARD_HEIGHT) {
              nextBoard[boardY][boardX] = {
                color: secondPieceBase.color,
                isFruit: secondPieceBase.isFruit || false,
                fruitType: secondPieceBase.fruitType || "",
                emoji: secondPieceBase.emoji || "",
                isStone: secondPieceBase.isStone || false,
                isTNT: secondPieceBase.isTNT || false,
                isDrill: secondPieceBase.isDrill || false,
                isLightning: secondPieceBase.isLightning || false,
                isRowClear: secondPieceBase.isRowClear || false,
                isArea2x2Clear: secondPieceBase.isArea2x2Clear || false,
                isSlime: secondPieceBase.isSlime || false,
                isCatalystBomb: secondPieceBase.isCatalystBomb || false,
                isWildcard: secondPieceBase.isWildcard || false,
              };
            }
          });
        });
        setBoard(nextBoard);
        addFloatingText("DOUBLE DROP! ♊", secondX, dropY);
      }
    }
  }, [nextPiece, createPieceForLevel, totalScore, handleGameEnd, addFloatingText, speedWavePieces]);

  const holdCurrentPiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard, gameState: state, isControllable: canControl } = stateRef.current;
    if (!piece || state !== "dropping" || !canControl || holdUsed || piece.isStone) return;

    const activeLevel = stateRef.current.level;
    const storedPiece = {
      ...piece,
      x: undefined,
      y: undefined,
      isGhost: false,
    };
    const replacement = heldPiece || nextPiece || createPieceForLevel(activeLevel, false);
    const replacementWidth = replacement.shape[0].length;
    const isInverse = stateRef.current.activeMutator === "inverse_gravity";
    const replacementHeight = replacement.shape.length;
    const spawnY = isInverse ? BOARD_HEIGHT - replacementHeight : 0;
    
    const replacementPiece = {
      ...replacement,
      x: Math.floor(BOARD_WIDTH / 2) - Math.floor(replacementWidth / 2),
      y: spawnY,
    };

    if (checkCollision(replacementPiece, currentBoard, isInverse)) return;
    setHeldPiece(storedPiece);
    if (!heldPiece) setNextPiece(createPieceForLevel(activeLevel, false));
    setActivePiece(replacementPiece);
    setHoldUsed(true);
    playSFX("hold");
    addFloatingText("HOLD SWAP!", replacementPiece.x, spawnY + (isInverse ? -1 : 2));
  }, [holdUsed, heldPiece, nextPiece, createPieceForLevel, addFloatingText]);

  const lockPiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard } = stateRef.current;
    if (!piece) return;

    if (piece.isStone) {
      playSFX("thud");
      triggerShake();
      triggerBoardRecoil();
      triggerBoardThump();
      vibrate([45, 35, 45]);
    } else {
      playSFX("lock");
      triggerShake();
      triggerBoardRecoil();
      vibrate(15);
    }
    setLastPlacedPiece({
      x: piece.x,
      y: piece.y,
      shape: piece.shape,
      color: piece.color,
      timestamp: Date.now()
    });

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          nextBoard[boardY][boardX] = {
            color: piece.color,
            isFruit: piece.isFruit || false,
            fruitType: piece.fruitType || "",
            emoji: piece.emoji || "",
            isStone: piece.isStone || false,
            isTNT: piece.isTNT || false,
            isDrill: piece.isDrill || false,
            isLightning: piece.isLightning || false,
            isRowClear: piece.isRowClear || false,
            isArea2x2Clear: piece.isArea2x2Clear || false,
            isSlime: piece.isSlime || false,
            isCatalystBomb: piece.isCatalystBomb || false,
            isWildcard: piece.isWildcard || false,
            landedAt: Date.now(),
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setGameState(stateRef.current.gameState === "arena_dropping" ? "arena_resolving" : "resolving");
  }, [triggerShake, triggerBoardRecoil, triggerBoardThump, vibrate, setLastPlacedPiece]);

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  const moveDown = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isPaused: paused, activeMutator } = stateRef.current;
    if (paused) return;
    if (!piece) return;

    const isInverse = activeMutator === "inverse_gravity";
    const nextY = isInverse ? piece.y - 1 : piece.y + 1;
    const movedPiece = { ...piece, y: nextY };
    if (!checkCollision(movedPiece, currentBoard, isInverse)) setActivePiece(movedPiece);
    else lockPiece();
  }, [lockPiece]);

  const moveHorizontal = useCallback((dir) => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused, activeMutator } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || !["dropping", "arena_dropping"].includes(state)) return;

    const isInverse = activeMutator === "inverse_gravity";
    const movedPiece = { ...piece, x: piece.x + dir };
    if (!checkCollision(movedPiece, currentBoard, isInverse)) {
      setActivePiece(movedPiece);
    } else if (piece.isSlime) {
      addFloatingText("STUCK! 🦠", piece.x, piece.y);
      lockPiece();
    }
  }, [lockPiece, addFloatingText]);

  const rotatePiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused, activeMutator } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || !["dropping", "arena_dropping"].includes(state) || piece.isFruit) return;

    const isInverse = activeMutator === "inverse_gravity";
    const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
    if (!checkCollision(rotatedPiece, currentBoard, isInverse)) {
      playSFX("rotate");
      setActivePiece(rotatedPiece);
    }
  }, []);

  const hardDrop = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused, activeMutator } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || !["dropping", "arena_dropping"].includes(state)) return;

    let y = piece.y;
    const isInverse = activeMutator === "inverse_gravity";
    if (isInverse) {
      while (!checkCollision({ ...piece, y: y - 1 }, currentBoard, true)) y -= 1;
    } else {
      while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) y += 1;
    }
    const droppedPiece = { ...piece, y };
    playSFX("drop");
    triggerShake();
    triggerBoardRecoil();
    vibrate(20);
    setActivePiece(droppedPiece);
    setLastPlacedPiece({
      x: droppedPiece.x,
      y: droppedPiece.y,
      shape: droppedPiece.shape,
      color: droppedPiece.color,
      timestamp: Date.now()
    });

    const nextBoard = currentBoard.map((row) => [...row]);
    droppedPiece.shape.forEach((row, shapeY) => {
      row.forEach((value, shapeX) => {
        if (!value) return;
        const boardY = droppedPiece.y + shapeY;
        const boardX = droppedPiece.x + shapeX;
        if (boardY >= 0 && boardY < BOARD_HEIGHT) {
          nextBoard[boardY][boardX] = {
            color: droppedPiece.color,
            isFruit: droppedPiece.isFruit || false,
            fruitType: droppedPiece.fruitType || "",
            emoji: droppedPiece.emoji || "",
            isStone: droppedPiece.isStone || false,
            isTNT: droppedPiece.isTNT || false,
            isDrill: droppedPiece.isDrill || false,
            isLightning: droppedPiece.isLightning || false,
            isRowClear: droppedPiece.isRowClear || false,
            isArea2x2Clear: droppedPiece.isArea2x2Clear || false,
            isSlime: droppedPiece.isSlime || false,
            isCatalystBomb: droppedPiece.isCatalystBomb || false,
            isWildcard: droppedPiece.isWildcard || false,
            landedAt: Date.now(),
          };
        }
      });
    });
    setBoard(nextBoard);
    setActivePiece(null);
    setGameState(state === "arena_dropping" ? "arena_resolving" : "resolving");
  }, [triggerShake, triggerBoardRecoil, vibrate, setLastPlacedPiece]);

  const handleBoardTouchStart = (event) => {
    if (stateRef.current.isPaused || stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;
    event.preventDefault();
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleBoardTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || stateRef.current.isPaused || stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;
    event.preventDefault();

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const quickTap = Date.now() - start.time < 260 && absX < 14 && absY < 14;

    if (quickTap) {
      rotatePiece();
      return;
    }

    if (absX > absY && absX > 18) {
      moveHorizontal(dx > 0 ? 1 : -1);
      return;
    }

    if (dy > 20) {
      moveDown();
    }
  };

  // dropping speed
  useEffect(() => {
    if (gameState !== "dropping" || isPaused) return undefined;
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const baseSpeed = runMode === "endless"
      ? Math.max(50, 1000 - (endlessLevel - 1) * 75)
      : stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    let speed = Math.max(5, Math.round(baseSpeed * runConfig.difficulty.gravityMultiplier));
    if (stateRef.current.activeMutator === "dopamine_rush") {
      speed = Math.max(5, Math.round(speed / 2));
    }
    if (isFrenzyActive) {
      speed = Math.max(5, Math.round(speed / 2));
    }
    if (isDesperationActive) {
      speed = Math.round(speed * 1.5);
    }
    if (runMode === "endless" && speedWavePieces > 0) {
      speed = Math.max(5, Math.round(speed / 2));
    }
    if (coolingRemaining > 0) {
      speed = Math.round(speed * 1.4);
    } else if (heatLevel > 0) {
      const heatMultiplier = 1.0 - Math.min(0.5, heatLevel * 0.1);
      speed = Math.max(5, Math.round(speed * heatMultiplier));
    }
    const timer = setInterval(moveDown, speed);
    return () => clearInterval(timer);
  }, [gameState, isPaused, level, runMode, endlessLevel, speedWavePieces, moveDown, runConfig.difficulty.gravityMultiplier, heatLevel, coolingRemaining, isFrenzyActive, isDesperationActive]);

  // -------------------------------------------------------------------------
  // Board resolver: blasts, lines, combos, gravity, win/loss
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "resolving") return undefined;

    let pointsEarned = 0;
    const cellsToClear = [];
    let hasTnt = false;
    let hasDrill = false;
    let hasLightning = false;
    let hasRowClear = false;
    let hasArea2x2Clear = false;
    let didLineClear = false;
    let didColorMatch = false;
    let fruitCount = 0;
    let lineClearCount = 0;
    let colorMatchCount = 0;
    const fruitEffects = new Set();

    const addCellToClear = (y, x) => {
      if (board[y][x]?.isLava) return;
      if (!cellsToClear.some((cell) => cell.y === y && cell.x === x)) {
        cellsToClear.push({ y, x });
      }
    };

    // 1. Process TNT detonators & Catalyst Bombs (3x3 grid blast)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isTNT || board[y][x]?.isCatalystBomb) {
          hasTnt = true;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const cy = y + dy;
              const cx = x + dx;
              if (cy >= 0 && cy < BOARD_HEIGHT && cx >= 0 && cx < BOARD_WIDTH) {
                if (board[cy][cx] !== null) addCellToClear(cy, cx);
              }
            }
          }
          pointsEarned += board[y][x]?.isCatalystBomb ? 100 : 80;
        }
      }
    }

    // 2. Process Drills (clear cell and 3 cells below)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isDrill) {
          hasDrill = true;
          for (let dy = 0; dy <= 3; dy += 1) {
            const cy = y + dy;
            if (cy >= 0 && cy < BOARD_HEIGHT) {
              if (board[cy][x] !== null) addCellToClear(cy, x);
            }
          }
          pointsEarned += 60;
        }
      }
    }

    // 2b. Process Row Clear (clear entire row y)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isRowClear) {
          hasRowClear = true;
          const rowCells = findRowClearCells(board, y);
          rowCells.forEach((c) => addCellToClear(c.y, c.x));
          pointsEarned += 50;
        }
      }
    }

    // 2c. Process 2x2 Area Clear (clear 2x2 area around y, x)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isArea2x2Clear) {
          hasArea2x2Clear = true;
          const areaCells = findArea2x2ClearCells(board, y, x);
          areaCells.forEach((c) => addCellToClear(c.y, c.x));
          pointsEarned += 40;
        }
      }
    }

    // 3. Process Lightning (zap all blocks of the most common color)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isLightning) {
          hasLightning = true;
          addCellToClear(y, x);

          const colorCounts = {};
          for (let by = 0; by < BOARD_HEIGHT; by += 1) {
            for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
              const cell = board[by][bx];
              if (cell && !cell.isStone && !cell.isFruit && cell.color) {
                colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
              }
            }
          }

          let targetColor = null;
          let maxCount = 0;
          Object.entries(colorCounts).forEach(([color, count]) => {
            if (count > maxCount) {
              maxCount = count;
              targetColor = color;
            }
          });

          if (targetColor) {
            for (let by = 0; by < BOARD_HEIGHT; by += 1) {
              for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
                if (board[by][bx]?.color === targetColor) {
                  addCellToClear(by, bx);
                }
              }
            }
            pointsEarned += maxCount * 15;
          }
        }
      }
    }

    // 4. Fruits reward deliberate placement with three distinct blast patterns.
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isFruit && !board[y][x]?.isCatalystBomb) {
          const fruit = board[y][x];
          fruitCount += 1;
          fruitEffects.add(fruit.fruitType || "apple");
          const fruitCells = findFruitEffectCells(
            board,
            y,
            x,
            fruit.fruitType || "apple",
            fruit.color
          );
          fruitCells.forEach((cell) => addCellToClear(cell.y, cell.x));
          pointsEarned += POINTS.FRUIT_BOMB + Math.max(0, fruitCells.length - 1) * 8;
        }
      }
    }

    // 5. Standard full-line clear
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board[y].every((cell) => cell !== null && !cell.isLava)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear(y, x);
      pointsEarned += POINTS.LINE_CLEAR;
      didLineClear = true;
      lineClearCount += 1;
    }

    // 6. Connected components of 5+ matching colors
    const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const startCell = board[y][x];
        if (!startCell || startCell.isFruit || startCell.isStone || startCell.isWildcard || visited[y][x]) continue;

        const color = startCell.color;
        const component = [];
        const stack = [{ y, x }];

        while (stack.length > 0) {
          const current = stack.pop();
          const cy = current.y;
          const cx = current.x;
          const cell = board[cy]?.[cx];
          if (
            cy < 0 ||
            cy >= BOARD_HEIGHT ||
            cx < 0 ||
            cx >= BOARD_WIDTH ||
            visited[cy][cx] ||
            cell === null ||
            cell.isFruit ||
            cell.isStone ||
            cell.isTNT ||
            cell.isDrill ||
            cell.isLightning ||
            cell.isRowClear ||
            cell.isArea2x2Clear ||
            cell.isCatalystBomb
          ) {
            continue;
          }

          const isMatch = cell.isWildcard || cell.color === color;
          if (!isMatch) continue;

          visited[cy][cx] = true;
          component.push({ y: cy, x: cx });
          stack.push({ y: cy + 1, x: cx }, { y: cy - 1, x: cx }, { y: cy, x: cx + 1 }, { y: cy, x: cx - 1 });
        }

        if (component.length >= 5) {
          pointsEarned += POINTS.COLOR_MATCH + (component.length - 5) * 5;
          component.forEach((cell) => addCellToClear(cell.y, cell.x));
          didColorMatch = true;
          colorMatchCount += 1;
        }
      }
    }

    if (cellsToClear.length > 0) {
      const anchor = cellsToClear[0];
      const nextBlastEffect = hasLightning
        ? "lightning"
        : hasTnt
          ? "tnt"
          : hasDrill
            ? "drill"
            : hasRowClear
              ? "orange"
              : hasArea2x2Clear
                ? "banana"
                : fruitEffects.has("orange")
                  ? "orange"
                  : fruitEffects.has("banana")
                    ? "banana"
                    : fruitEffects.has("apple")
                      ? "apple"
                      : didLineClear
                        ? "line"
                        : "match";

      queueMicrotask(() => triggerShake());
      queueMicrotask(() => triggerBoardThump());
      queueMicrotask(() => setBlastEffect(nextBlastEffect));
      queueMicrotask(() => setExplodingCells(cellsToClear));
      queueMicrotask(() => triggerFlash(hasTnt || hasDrill || hasLightning || hasRowClear || hasArea2x2Clear ? "blast" : "score"));
      if (hasLightning) {
        queueMicrotask(() => triggerElectrify());
        queueMicrotask(() => playSFX("thunder"));
      }

      const timer = setTimeout(() => {
        const afterClearBoard = clearBoardCells(board, cellsToClear);

        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          let writeY = BOARD_HEIGHT - 1;
          for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
            if (afterClearBoard[y][x] === null) continue;
            if (writeY !== y) {
              afterClearBoard[writeY][x] = {
                ...afterClearBoard[y][x],
                landedAt: Date.now()
              };
              afterClearBoard[y][x] = null;
            }
            writeY -= 1;
          }
        }

        setBoard(afterClearBoard);
        setExplodingCells([]);
        const isDopamine = stateRef.current.activeMutator === "dopamine_rush";
        const frenzyActive = stateRef.current.correctStreak >= 5;
        const frenzyMultiplier = frenzyActive ? 2 : 1;
        setTotalScore((prev) => prev + pointsEarned * (isDopamine ? 2 : 1) * frenzyMultiplier);
        const nextRunMetrics = {
          ...runMetrics,
          lines: runMetrics.lines + lineClearCount,
          matches: runMetrics.matches + colorMatchCount,
          fruits: runMetrics.fruits + fruitCount,
          specials: runMetrics.specials + Number(hasTnt) + Number(hasDrill) + Number(hasLightning),
        };
        stateRef.current.runMetrics = nextRunMetrics;
        setRunMetrics(nextRunMetrics);
        if (nextRunMetrics.lines + nextRunMetrics.matches >= 4) unlockAchievement("board_buster");
        if (nextRunMetrics.fruits >= 3) unlockAchievement("fruit_salad");
        if (nextRunMetrics.specials >= 3) unlockAchievement("power_trip");
        const comboFeedbackLevel = Math.min(stateRef.current.correctStreak || 0, 8);
        const comboHapticPattern = comboFeedbackLevel >= 5
          ? [22, 28, 42]
          : comboFeedbackLevel >= 3
            ? [18, 24, 28]
            : 22;
        vibrate(hasTnt || hasDrill || hasLightning ? [30, 20, 70] : comboHapticPattern);

        // Schedule and trigger floating texts asynchronously
        if (hasTnt) {
          playSFX("explosion");
          addFloatingText("TNT BLAST! 💣", anchor.x, anchor.y - 1);
        } else if (hasDrill) {
          playSFX("drill");
          addFloatingText("DRILL BLAST! 🌀", anchor.x, anchor.y - 1);
        } else if (hasLightning) {
          playSFX("match", 2);
          addFloatingText("ZAP! ⚡", anchor.x, anchor.y - 1);
        } else if (fruitEffects.has("orange")) {
          playSFX("fruit_orange");
          addFloatingText("CITRUS CROSS! 🍊", anchor.x, anchor.y - 1);
        } else if (fruitEffects.has("banana")) {
          playSFX("fruit_banana");
          addFloatingText("RICOCHET! 🍌", anchor.x, anchor.y - 1);
        } else if (fruitEffects.has("apple")) {
          playSFX("fruit_apple");
          addFloatingText("COLOR CORE! 🍎", anchor.x, anchor.y - 1);
        } else {
          playSFX("match", comboFeedbackLevel);
        }

        if (pointsEarned > 0) {
          const finalPoints = pointsEarned * (isDopamine ? 2 : 1) * (frenzyActive ? 2 : 1);
          addFloatingText(`+${finalPoints}`, anchor.x, anchor.y);
        }

        if (didLineClear) unlockAchievement("line");
        if (didColorMatch) unlockAchievement("bigmatch");

        const isLava = stateRef.current.activeMutator === "volcanic_surge";
        if (((level === 9 || level === 10) || isLava) && stateRef.current.questionsSinceLastRise === 0) {
          triggerFloorRise(afterClearBoard);
        }
      }, 400);

      return () => clearTimeout(timer);
    }

    queueMicrotask(() => {
      const projectedScore = totalScore + pointsEarned;
      if (misses >= strikeLimit) {
        handleGameEnd(false, projectedScore);
      } else if (runMode === "endless" && projectedScore >= endlessLevel * 500) {
        const nextEndlessLevel = endlessLevel + 1;
        setEndlessLevel(nextEndlessLevel);
        if ((nextEndlessLevel - 1) % 5 === 0) {
          const isSpeedWave = Math.random() < 0.5;
          if (isSpeedWave) {
            setSpeedWavePieces(8);
            playSFX("thunder");
            addFloatingText("⚠️ SPEED WAVE INCOMING! ⚡", 5, 3);
            pushToast({ kind: "info", emoji: "⚡", title: "Speed Wave!", desc: "Gravity speed doubled for the next 8 pieces!" });
          } else {
            setBoard((currentBoard) => {
              const nextBoard = currentBoard.map((row) => [...row]);
              let injectedCount = 0;
              const targetCount = 4 + Math.floor(Math.random() * 3);
              for (let i = 0; i < 20 && injectedCount < targetCount; i++) {
                const row = BOARD_HEIGHT - 1 - Math.floor(Math.random() * 3);
                const col = Math.floor(Math.random() * BOARD_WIDTH);
                if (nextBoard[row][col] === null) {
                  nextBoard[row][col] = {
                    color: "bg-slate-500",
                    isStone: true,
                    emoji: "🧱",
                  };
                  injectedCount++;
                }
              }
              return nextBoard;
            });
            playSFX("explosion");
            addFloatingText("⚠️ STONE INJECTION! 🧱", 5, 3);
            pushToast({ kind: "info", emoji: "🧱", title: "Stone Injection!", desc: "Obstacle blocks injected at the bottom of the board!" });
          }
        } else {
          playSFX("level_win");
          addFloatingText(`LEVEL ${nextEndlessLevel - 1} CLEAR! 🎉`, 5, 3);
          pushToast({ kind: "info", emoji: "🎉", title: "Stage Cleared!", desc: `Completed Stage ${nextEndlessLevel - 1}! Target increased.` });
        }
        if (questionIndex >= shuffledQuestions.length - 5) {
          const virtualLevel = Math.min(20, Math.floor((nextEndlessLevel - 1) / 2) + 1);
          const nextQuestions = buildQuestionDeck({
            level: virtualLevel,
            banks: QUESTION_BANKS,
            recentIds: readRecentQuestionIds(),
            size: 50,
            seed: `endless-${nextEndlessLevel}-${Date.now()}`,
          });
          setShuffledQuestions(nextQuestions);
          setQuestionIndex(0);
        } else {
          setQuestionIndex((prev) => prev + 1);
        }
        setGameState("quiz");
        spawnQuizPiece();
      } else if (isRunComplete(runConfig, {
        ...runMetrics,
        score: projectedScore,
        maxStreak,
      })) {
        handleGameEnd(true, projectedScore);
      } else if (questionIndex >= shuffledQuestions.length - 1) {
        if (runMode === "endless") {
          const virtualLevel = Math.min(20, Math.floor((endlessLevel - 1) / 2) + 1);
          const nextQuestions = buildQuestionDeck({
            level: virtualLevel,
            banks: QUESTION_BANKS,
            recentIds: readRecentQuestionIds(),
            size: 50,
            seed: `endless-${endlessLevel}-${Date.now()}`,
          });
          setShuffledQuestions(nextQuestions);
          setQuestionIndex(0);
          setGameState("quiz");
          spawnQuizPiece();
        } else {
          handleGameEnd(false, projectedScore);
        }
      } else {
        setQuestionIndex((prev) => prev + 1);
        setGameState("quiz");
        spawnQuizPiece();
      }
    });

    return undefined;
  }, [gameState, board, questionIndex, totalScore, misses, shuffledQuestions.length, level, runMode, endlessLevel, speedWavePieces, spawnQuizPiece, handleGameEnd, addFloatingText, triggerFloorRise, triggerFlash, vibrate, triggerElectrify, unlockAchievement, strikeLimit, runConfig, runMetrics, maxStreak, triggerShake, pushToast]);

  // -------------------------------------------------------------------------
  // Arena Board resolver: blasts, lines, combos, gravity, win/loss
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "arena_resolving") return undefined;

    let pointsEarned1 = 0;
    let pointsEarned2 = 0;
    const cellsToClear1 = [];
    const cellsToClear2 = [];
    let hasTnt1 = false;
    let hasTnt2 = false;
    let hasDrill1 = false;
    let hasDrill2 = false;
    let hasLightning1 = false;
    let hasLightning2 = false;
    let didLineClear1 = false;
    let didLineClear2 = false;

    const addCellToClear1 = (y, x) => {
      if (board[y][x]?.isLava) return;
      if (!cellsToClear1.some((cell) => cell.y === y && cell.x === x)) {
        cellsToClear1.push({ y, x });
      }
    };

    const addCellToClear2 = (y, x) => {
      if (board2[y][x]?.isLava) return;
      if (!cellsToClear2.some((cell) => cell.y === y && cell.x === x)) {
        cellsToClear2.push({ y, x });
      }
    };

    // --- BOARD 1 RESOLUTION ---
    // 1. Process TNT detonators & Catalyst Bombs
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isTNT || board[y][x]?.isCatalystBomb) {
          hasTnt1 = true;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const cy = y + dy;
              const cx = x + dx;
              if (cy >= 0 && cy < BOARD_HEIGHT && cx >= 0 && cx < BOARD_WIDTH) {
                if (board[cy][cx] !== null) addCellToClear1(cy, cx);
              }
            }
          }
          pointsEarned1 += board[y][x]?.isCatalystBomb ? 100 : 80;
        }
      }
    }

    // 2. Process Drills
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isDrill) {
          hasDrill1 = true;
          for (let dy = 0; dy <= 3; dy += 1) {
            const cy = y + dy;
            if (cy >= 0 && cy < BOARD_HEIGHT) {
              if (board[cy][x] !== null) addCellToClear1(cy, x);
            }
          }
          pointsEarned1 += 60;
        }
      }
    }

    // 3. Process Lightning
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isLightning) {
          hasLightning1 = true;
          addCellToClear1(y, x);
          const colorCounts = {};
          for (let by = 0; by < BOARD_HEIGHT; by += 1) {
            for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
              const cell = board[by][bx];
              if (cell && !cell.isStone && !cell.isFruit && cell.color) {
                colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
              }
            }
          }
          let targetColor = null;
          let maxCount = 0;
          Object.entries(colorCounts).forEach(([color, count]) => {
            if (count > maxCount) {
              maxCount = count;
              targetColor = color;
            }
          });
          if (targetColor) {
            for (let by = 0; by < BOARD_HEIGHT; by += 1) {
              for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
                if (board[by][bx]?.color === targetColor) {
                  addCellToClear1(by, bx);
                }
              }
            }
            pointsEarned1 += maxCount * 15;
          }
        }
      }
    }

    // 4. Fruit powers
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isFruit && !board[y][x]?.isCatalystBomb) {
          const fruit = board[y][x];
          const fruitCells = findFruitEffectCells(
            board,
            y,
            x,
            fruit.fruitType || "apple",
            fruit.color
          );
          fruitCells.forEach((cell) => addCellToClear1(cell.y, cell.x));
          pointsEarned1 += POINTS.FRUIT_BOMB + Math.max(0, fruitCells.length - 1) * 8;
        }
      }
    }

    // 5. Standard line clear
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board[y].every((cell) => cell !== null && !cell.isLava)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear1(y, x);
      pointsEarned1 += POINTS.LINE_CLEAR;
      didLineClear1 = true;
    }

    // 6. Connected components of 5+ matching colors
    const visited1 = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const startCell = board[y][x];
        if (!startCell || startCell.isFruit || startCell.isStone || startCell.isWildcard || visited1[y][x]) continue;

        const color = startCell.color;
        const component = [];
        const stack = [{ y, x }];

        while (stack.length > 0) {
          const current = stack.pop();
          const cy = current.y;
          const cx = current.x;
          const cell = board[cy]?.[cx];
          if (
            cy < 0 ||
            cy >= BOARD_HEIGHT ||
            cx < 0 ||
            cx >= BOARD_WIDTH ||
            visited1[cy][cx] ||
            cell === null ||
            cell.isFruit ||
            cell.isStone ||
            cell.isTNT ||
            cell.isDrill ||
            cell.isLightning ||
            cell.isCatalystBomb
          ) {
            continue;
          }

          const isMatch = cell.isWildcard || cell.color === color;
          if (!isMatch) continue;

          visited1[cy][cx] = true;
          component.push({ y: cy, x: cx });
          stack.push({ y: cy + 1, x: cx }, { y: cy - 1, x: cx }, { y: cy, x: cx + 1 }, { y: cy, x: cx - 1 });
        }

        if (component.length >= 5) {
          pointsEarned1 += POINTS.COLOR_MATCH + (component.length - 5) * 5;
          component.forEach((cell) => addCellToClear1(cell.y, cell.x));
        }
      }
    }


    // --- BOARD 2 RESOLUTION ---
    // 1. Process TNT detonators & Catalyst Bombs
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board2[y][x]?.isTNT || board2[y][x]?.isCatalystBomb) {
          hasTnt2 = true;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const cy = y + dy;
              const cx = x + dx;
              if (cy >= 0 && cy < BOARD_HEIGHT && cx >= 0 && cx < BOARD_WIDTH) {
                if (board2[cy][cx] !== null) addCellToClear2(cy, cx);
              }
            }
          }
          pointsEarned2 += board2[y][x]?.isCatalystBomb ? 100 : 80;
        }
      }
    }

    // 2. Process Drills
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board2[y][x]?.isDrill) {
          hasDrill2 = true;
          for (let dy = 0; dy <= 3; dy += 1) {
            const cy = y + dy;
            if (cy >= 0 && cy < BOARD_HEIGHT) {
              if (board2[cy][x] !== null) addCellToClear2(cy, x);
            }
          }
          pointsEarned2 += 60;
        }
      }
    }

    // 3. Process Lightning
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board2[y][x]?.isLightning) {
          hasLightning2 = true;
          addCellToClear2(y, x);
          const colorCounts = {};
          for (let by = 0; by < BOARD_HEIGHT; by += 1) {
            for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
              const cell = board2[by][bx];
              if (cell && !cell.isStone && !cell.isFruit && cell.color) {
                colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
              }
            }
          }
          let targetColor = null;
          let maxCount = 0;
          Object.entries(colorCounts).forEach(([color, count]) => {
            if (count > maxCount) {
              maxCount = count;
              targetColor = color;
            }
          });
          if (targetColor) {
            for (let by = 0; by < BOARD_HEIGHT; by += 1) {
              for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
                if (board2[by][bx]?.color === targetColor) {
                  addCellToClear2(by, bx);
                }
              }
            }
            pointsEarned2 += maxCount * 15;
          }
        }
      }
    }

    // 4. Fruit powers
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board2[y][x]?.isFruit && !board2[y][x]?.isCatalystBomb) {
          const fruit = board2[y][x];
          const fruitCells = findFruitEffectCells(
            board2,
            y,
            x,
            fruit.fruitType || "apple",
            fruit.color
          );
          fruitCells.forEach((cell) => addCellToClear2(cell.y, cell.x));
          pointsEarned2 += POINTS.FRUIT_BOMB + Math.max(0, fruitCells.length - 1) * 8;
        }
      }
    }

    // 5. Standard line clear
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board2[y].every((cell) => cell !== null && !cell.isLava)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear2(y, x);
      pointsEarned2 += POINTS.LINE_CLEAR;
      didLineClear2 = true;
    }

    // 6. Connected components of 5+ matching colors
    const visited2 = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const startCell = board2[y][x];
        if (!startCell || startCell.isFruit || startCell.isStone || startCell.isWildcard || visited2[y][x]) continue;

        const color = startCell.color;
        const component = [];
        const stack = [{ y, x }];

        while (stack.length > 0) {
          const current = stack.pop();
          const cy = current.y;
          const cx = current.x;
          const cell = board2[cy]?.[cx];
          if (
            cy < 0 ||
            cy >= BOARD_HEIGHT ||
            cx < 0 ||
            cx >= BOARD_WIDTH ||
            visited2[cy][cx] ||
            cell === null ||
            cell.isFruit ||
            cell.isStone ||
            cell.isTNT ||
            cell.isDrill ||
            cell.isLightning ||
            cell.isCatalystBomb
          ) {
            continue;
          }

          const isMatch = cell.isWildcard || cell.color === color;
          if (!isMatch) continue;

          visited2[cy][cx] = true;
          component.push({ y: cy, x: cx });
          stack.push({ y: cy + 1, x: cx }, { y: cy - 1, x: cx }, { y: cy, x: cx + 1 }, { y: cy, x: cx - 1 });
        }

        if (component.length >= 5) {
          pointsEarned2 += POINTS.COLOR_MATCH + (component.length - 5) * 5;
          component.forEach((cell) => addCellToClear2(cell.y, cell.x));
        }
      }
    }

    const hasClears1 = cellsToClear1.length > 0;
    const hasClears2 = cellsToClear2.length > 0;

    if (hasClears1 || hasClears2) {
      if (hasClears1) {
        queueMicrotask(() => setExplodingCells(cellsToClear1));
        queueMicrotask(() => triggerShake());
        queueMicrotask(() => triggerBoardThump());
        queueMicrotask(() => triggerFlash(hasTnt1 || hasDrill1 || hasLightning1 ? "blast" : "score"));
        if (hasLightning1) {
          queueMicrotask(() => triggerElectrify());
          playSFX("thunder");
        }
      }
      if (hasClears2) {
        queueMicrotask(() => setExplodingCells2(cellsToClear2));
        queueMicrotask(() => triggerShake2());
        queueMicrotask(() => triggerBoardThump2());
      }

      const timer = setTimeout(() => {
        // Resolve Board 1 falling gravity
        if (hasClears1) {
          const afterClearBoard = clearBoardCells(board, cellsToClear1);

          for (let x = 0; x < BOARD_WIDTH; x += 1) {
            let writeY = BOARD_HEIGHT - 1;
            for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
              if (afterClearBoard[y][x] === null) continue;
              if (writeY !== y) {
                afterClearBoard[writeY][x] = {
                  ...afterClearBoard[y][x],
                  landedAt: Date.now()
                };
                afterClearBoard[y][x] = null;
              }
              writeY -= 1;
            }
          }
          setBoard(afterClearBoard);
          setExplodingCells([]);
          setTotalScore((prev) => prev + pointsEarned1);

          const anchor = cellsToClear1[0];
          if (hasTnt1) {
            playSFX("explosion");
            addFloatingText("TNT BLAST! 💣", anchor.x, anchor.y - 1);
          } else if (hasDrill1) {
            playSFX("match", 1);
            addFloatingText("DRILL BLAST! 🌀", anchor.x, anchor.y - 1);
          } else if (hasLightning1) {
            playSFX("match", 2);
            addFloatingText("ZAP! ⚡", anchor.x, anchor.y - 1);
          } else {
            playSFX("match", 0);
          }
          if (pointsEarned1 > 0) {
            addFloatingText(`+${pointsEarned1}`, anchor.x, anchor.y);
          }

          if (didLineClear1) {
            pushGarbageRows(2, 1);
          }
        }

        // Resolve Board 2 falling gravity
        if (hasClears2) {
          const afterClearBoard = clearBoardCells(board2, cellsToClear2);

          for (let x = 0; x < BOARD_WIDTH; x += 1) {
            let writeY = BOARD_HEIGHT - 1;
            for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
              if (afterClearBoard[y][x] === null) continue;
              if (writeY !== y) {
                afterClearBoard[writeY][x] = {
                  ...afterClearBoard[y][x],
                  landedAt: Date.now()
                };
                afterClearBoard[y][x] = null;
              }
              writeY -= 1;
            }
          }
          setBoard2(afterClearBoard);
          setExplodingCells2([]);
          setTotalScore2((prev) => prev + pointsEarned2);

          const anchor = cellsToClear2[0];
          if (hasTnt2) {
            playSFX("explosion");
            addFloatingText2("TNT BLAST! 💣", anchor.x, anchor.y - 1);
          } else if (hasDrill2) {
            playSFX("match", 1);
            addFloatingText2("DRILL BLAST! 🌀", anchor.x, anchor.y - 1);
          } else if (hasLightning2) {
            playSFX("match", 2);
            addFloatingText2("ZAP! ⚡", anchor.x, anchor.y - 1);
          } else {
            playSFX("match", 0);
          }
          if (pointsEarned2 > 0) {
            addFloatingText2(`+${pointsEarned2}`, anchor.x, anchor.y);
          }

          if (didLineClear2) {
            pushGarbageRows(1, 1);
          }
        }
      }, 400);

      return () => clearTimeout(timer);
    }

    queueMicrotask(() => {
      const score1 = totalScore;
      const score2 = totalScore2;

      if (score1 >= 500 || score2 >= 500) {
        if (score1 > score2) {
          handleArenaGameEnd(1);
        } else if (score2 > score1) {
          handleArenaGameEnd(2);
        } else {
          handleArenaGameEnd(1);
        }
      } else if (questionIndex >= shuffledQuestions.length - 1) {
        if (score1 >= score2) {
          handleArenaGameEnd(1);
        } else {
          handleArenaGameEnd(2);
        }
      } else {
        setQuestionIndex((prev) => prev + 1);
        setGameState("arena_quiz");
        spawnArenaPieces();
      }
    });

    return undefined;
  }, [
    gameState,
    board,
    board2,
    questionIndex,
    totalScore,
    totalScore2,
    shuffledQuestions.length,
    spawnArenaPieces,
    handleArenaGameEnd,
    addFloatingText,
    addFloatingText2,
    triggerFlash,
    triggerElectrify,
    pushGarbageRows,
    triggerShake,
    triggerShake2,
  ]);

  // Evolving Background Music Controller
  useEffect(() => {
    if (isPaused) {
      stopArpeggiator();
      return undefined;
    }

    if (["dropping", "quiz", "transition", "resolving", "intro", "strike_recovery", "arena_quiz", "arena_dropping", "arena_resolving", "arena_intro"].includes(gameState)) {
      const totalCells = BOARD_WIDTH * BOARD_HEIGHT;
      const occupiedCount = board.flat().filter((cell) => cell !== null).length;
      const occupancy = occupiedCount / totalCells;
      const strikePressure = Math.min(1, misses / Math.max(1, strikeLimit));
      const streakEnergy = Math.min(1, correctStreak / 10);
      const intensity = Math.min(1, Math.max(occupancy, strikePressure * 0.82, streakEnergy * 0.45));

      const baseBpm = 110 + level * 2;
      const bpm = Math.min(190, Math.floor(baseBpm + intensity * 55));

      const isMajor = (gameState === "transition" && isControllable) || gameState === "intro" || gameState === "arena_intro";
      const scaleType = isMajor ? "major" : "minor";

      const isFever = correctStreak >= 5 || (arenaMode && correctStreak2 >= 5);
      const activeStreak = arenaMode ? Math.max(correctStreak, correctStreak2) : correctStreak;

      startArpeggiator(bpm, scaleType, intensity, "game", isFever, activeStreak);
    } else {
      stopArpeggiator();
    }

    return () => {
      if (["start", "level_win", "gameover", "arena_win"].includes(gameState)) {
        stopArpeggiator();
      }
    };
  }, [board, level, gameState, isControllable, audioOn, isPaused, misses, strikeLimit, correctStreak, correctStreak2, arenaMode]);

  // Menu Music controller
  useEffect(() => {
    if (gameState === "start" && audioOn && !isPaused) {
      startArpeggiator(95, "major", 0.04, "menu");
    }
    return () => {
      if (gameState !== "start") {
        stopArpeggiator();
      }
    };
  }, [gameState, audioOn, isPaused]);

  // Keyboard events
  // Arena Gravity Tick
  useEffect(() => {
    if (gameState !== "arena_dropping" || isPaused) return undefined;

    const config = LEVEL_CONFIG[arenaLevel] || LEVEL_CONFIG[1];
    const speed1 = stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    const speed2 = stateRef.current.isControllable2 ? config.baseSpeed : config.fastSpeed;

    const timer1 = setInterval(() => {
      if (stateRef.current.gameState === "arena_dropping" && stateRef.current.activePiece) {
        moveDown();
      }
    }, speed1);

    const timer2 = setInterval(() => {
      if (stateRef.current.gameState === "arena_dropping" && stateRef.current.activePiece2) {
        moveDown2();
      }
    }, speed2);

    return () => {
      clearInterval(timer1);
      clearInterval(timer2);
    };
  }, [gameState, isPaused, arenaLevel, moveDown, moveDown2]);

  // Arena Quiz Slow Fall
  useEffect(() => {
    if (gameState !== "arena_quiz" || isPaused) return undefined;

    const config = LEVEL_CONFIG[arenaLevel] || LEVEL_CONFIG[1];
    const quizSpeed = Math.max(1400, config.baseSpeed * 3.5);

    const timer = setInterval(() => {
      const { activePiece: piece1, activePiece2: piece2, board, board2 } = stateRef.current;

      let collided1 = false;
      let collided2 = false;

      if (piece1) {
        const moved1 = { ...piece1, y: piece1.y + 1 };
        if (!checkCollision(moved1, board)) {
          setActivePiece(moved1);
        } else {
          collided1 = true;
        }
      }
      if (piece2) {
        const moved2 = { ...piece2, y: piece2.y + 1 };
        if (!checkCollision(moved2, board2)) {
          setActivePiece2(moved2);
        } else {
          collided2 = true;
        }
      }

      if (collided1 || collided2) {
        clearInterval(timer);
        handleArenaTimeOut();
      }
    }, quizSpeed);

    return () => clearInterval(timer);
  }, [gameState, isPaused, arenaLevel, handleArenaTimeOut]);

  // AI Bot Answers Loop
  useEffect(() => {
    if (gameState !== "arena_quiz" || arenaMode !== "vs_ai" || isPaused || p2Answered !== null) return undefined;

    const question = shuffledQuestions[questionIndex];
    if (!question) return undefined;

    const { delay, accuracy } = getArenaAiTurn(
      aiDifficulty,
      totalScore,
      totalScore2
    );
    const thinkingTimer = setTimeout(() => {
      if (stateRef.current.gameState !== "arena_quiz" || stateRef.current.p2Answered !== null) return;
      setAiThinkingStage("calculating");
      setAiQuip("I have narrowed it down to one of the answers. Huge progress.");
    }, Math.min(3600, delay * 0.48));
    const timer = setTimeout(() => {
      if (stateRef.current.isPaused || stateRef.current.gameState !== "arena_quiz") return;

      const isCorrect = Math.random() < accuracy;
      const answerIndex = isCorrect ? question.answer : (question.answer + 1) % 4;
      handleArenaAnswerRef.current?.(2, answerIndex);
    }, delay);

    return () => {
      clearTimeout(thinkingTimer);
      clearTimeout(timer);
    };
  }, [gameState, arenaMode, questionIndex, aiDifficulty, shuffledQuestions, isPaused, p2Answered, totalScore, totalScore2]);

  // Byte races the same level independently while the player keeps the normal
  // single-player question, board, controls, and objective flow.
  useEffect(() => {
    if (runMode !== "ai_race" || gameState !== "quiz" || isPaused) return;
    const question = shuffledQuestions[questionIndex];
    if (!question) return;
    if (aiRaceAnsweredQuestionRef.current === questionIndex) return;
    aiRaceAnsweredQuestionRef.current = questionIndex;

    window.clearTimeout(aiRaceTimerRef.current);
    setAiThinkingStage("reading");
    setAiQuip(randomItem(AI_THINKING_LINES));
    const { delay, accuracy } = getArenaAiTurn(
      aiDifficulty,
      totalScore,
      aiRaceMetrics.score
    );

    aiRaceTimerRef.current = window.setTimeout(() => {
      if (["level_win", "gameover", "start"].includes(stateRef.current.gameState)) return;
      const correct = Math.random() < accuracy;
      setAiRaceMetrics((current) => {
        const result = advanceAiRace(current, runConfig, correct);
        setAiThinkingStage(correct ? "answered" : "missed");
        setAiQuip(randomItem(correct ? AI_BOT_WINS_LINES : AI_MISS_LINES));
        if (result.complete) {
          setArenaResult("ai_win");
          window.setTimeout(() => handleGameEnd(false, stateRef.current.totalScore || 0), 250);
        }
        return result.metrics;
      });
    }, delay);
  }, [runMode, gameState, isPaused, questionIndex, shuffledQuestions, aiDifficulty, totalScore, aiRaceMetrics.score, runConfig, handleGameEnd]);

  useEffect(() => () => window.clearTimeout(aiRaceTimerRef.current), []);

  // AI Bot Steering Placement Loop
  useEffect(() => {
    if (gameState !== "arena_dropping" || arenaMode !== "vs_ai" || isPaused || !isControllable2 || !activePiece2) return undefined;

    const pieceWidth = activePiece2.shape[0].length;
    const targetX = Math.floor(Math.random() * (BOARD_WIDTH - pieceWidth + 1));

    let timer;
    const aiMoveStep = () => {
      const { activePiece2: piece, board2: currentBoard } = stateRef.current;
      if (!piece) return;

      if (piece.x < targetX) {
        const moved = { ...piece, x: piece.x + 1 };
        if (!checkCollision(moved, currentBoard)) {
          setActivePiece2(moved);
        }
      } else if (piece.x > targetX) {
        const moved = { ...piece, x: piece.x - 1 };
        if (!checkCollision(moved, currentBoard)) {
          setActivePiece2(moved);
        }
      } else {
        clearInterval(timer);
        setTimeout(() => {
          if (stateRef.current.gameState === "arena_dropping" && stateRef.current.isControllable2) {
            hardDrop2();
          }
        }, 250);
        return;
      }
    };

    timer = setInterval(aiMoveStep, 250);
    return () => clearInterval(timer);
  }, [gameState, arenaMode, isPaused, isControllable2, activePiece2, hardDrop2]);

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (event) => {
      const currentGameState = stateRef.current.gameState;
      const isGamePaused = stateRef.current.isPaused;

      if ((event.key === "p" || event.key === "P" || event.key === "Escape") && PLAYABLE_STATES.has(currentGameState)) {
        event.preventDefault();
        playSFX("button");
        setIsPaused((paused) => !paused);
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "W", "A", "S", "D", "c", "C", "Shift"].includes(event.key) &&
          ["dropping", "arena_dropping"].includes(currentGameState)) {
        event.preventDefault();
      }

      if (isGamePaused) return;

      if (currentGameState === "arena_quiz") {
        if (["1", "2", "3", "4"].includes(event.key)) {
          event.preventDefault();
          const optionIndex = parseInt(event.key) - 1;
          handleArenaAnswer(1, optionIndex);
        }
        if (stateRef.current.arenaMode === "vs_player") {
          if (["7", "8", "9", "0"].includes(event.key)) {
            event.preventDefault();
            const optionIndex = event.key === "0" ? 3 : parseInt(event.key) - 7;
            handleArenaAnswer(2, optionIndex);
          } else if (["u", "i", "o", "p", "U", "I", "O", "P"].includes(event.key)) {
            event.preventDefault();
            const keyMap = { u: 0, i: 1, o: 2, p: 3, U: 0, I: 1, O: 2, P: 3 };
            handleArenaAnswer(2, keyMap[event.key]);
          }
        }
        return;
      }

      if (currentGameState === "arena_dropping") {
        if (stateRef.current.isControllable) {
          if (event.key === "a" || event.key === "A") moveHorizontal(-1);
          if (event.key === "d" || event.key === "D") moveHorizontal(1);
          if (event.key === "s" || event.key === "S") moveDown();
          if (event.key === "w" || event.key === "W") rotatePiece();
          if (event.key === " ") hardDrop();
        }

        if (stateRef.current.arenaMode === "vs_player" && stateRef.current.isControllable2) {
          if (event.key === "ArrowLeft") moveHorizontal2(-1);
          if (event.key === "ArrowRight") moveHorizontal2(1);
          if (event.key === "ArrowDown") moveDown2();
          if (event.key === "ArrowUp") rotatePiece2();
          if (event.key === "Enter") hardDrop2();
        }
        return;
      }

      if (currentGameState === "dropping" && stateRef.current.isControllable) {
        if (event.key === "ArrowLeft") moveHorizontal(-1);
        if (event.key === "ArrowRight") moveHorizontal(1);
        if (event.key === "ArrowDown") moveDown();
        if (event.key === "ArrowUp") rotatePiece();
        if (event.key === " ") hardDrop();
        if (event.key === "c" || event.key === "C" || event.key === "Shift") holdCurrentPiece();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hardDrop, moveDown, moveHorizontal, rotatePiece, holdCurrentPiece, moveHorizontal2, moveDown2, rotatePiece2, hardDrop2, handleArenaAnswer]);

  // -------------------------------------------------------------------------
  // Level Wind Turbulence (Level 7 & 8)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if ((level !== 7 && level !== 8) || isPaused || !["quiz", "dropping"].includes(gameState)) return undefined;

    const timer = setInterval(() => {
      const choices = [-1, 0, 1];
      const nextWind = randomItem(choices);
      setWindForce(nextWind);
      if (nextWind !== 0) {
        addFloatingText(nextWind > 0 ? "WIND RIGHT! 💨" : "WIND LEFT! 💨", 4, 2);
      } else {
        addFloatingText("WIND CALM", 4, 2);
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [level, gameState, isPaused, addFloatingText]);

  useEffect(() => {
    if (gameState !== "dropping" || isPaused || windForce === 0 || !activePiece) return undefined;

    const timer = setInterval(() => {
      const { activePiece: piece, board: currentBoard } = stateRef.current;
      if (!piece) return;

      const movedPiece = { ...piece, x: piece.x + windForce };
      if (!checkCollision(movedPiece, currentBoard)) {
        setActivePiece(movedPiece);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [gameState, isPaused, windForce, activePiece]);

  // -------------------------------------------------------------------------
  // Slow fall during quiz phase (Thinking time limits)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "quiz" || isPaused || !activePiece) return undefined;

    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const quizSpeed = Math.max(
      620,
      Math.round(config.baseSpeed * 3 * runConfig.difficulty.quizMultiplier)
    );

    const timer = setInterval(() => {
      const { activePiece: piece, board: currentBoard } = stateRef.current;
      if (!piece) return;

      const movedPiece = { ...piece, y: piece.y + 1 };
      if (!checkCollision(movedPiece, currentBoard)) {
        setActivePiece(movedPiece);
      } else {
        clearInterval(timer);
        handleTimeOut();
      }
    }, quizSpeed);

    return () => clearInterval(timer);
  }, [gameState, isPaused, activePiece, level, handleTimeOut, runConfig.difficulty.quizMultiplier]);

  // -------------------------------------------------------------------------
  // Strike Recovery Mode countdown timer
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "strike_recovery" || isPaused) return undefined;

    const timer = setInterval(() => {
      setRecoveryTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleGameEnd(false, totalScore);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isPaused, handleGameEnd, totalScore]);

  // -------------------------------------------------------------------------
  // Level Intro / Loading Screen Countdown Hook
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "intro" && gameState !== "arena_intro") return undefined;

    if (introCountdown > 0) {
      const timer = setTimeout(() => {
        setIntroCountdown((prev) => prev - 1);
        playSFX("button");
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      playSFX("level_start");
      const timer = setTimeout(() => {
        if (gameState === "arena_intro") {
          setGameState("arena_quiz");
          stateRef.current.questionIndex = 0;
          spawnArenaPieces();
        } else {
          setGameState("quiz");
          stateRef.current.level = level;
          stateRef.current.questionIndex = 0;
          spawnQuizPiece();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState, introCountdown, level, spawnQuizPiece, spawnArenaPieces]);

  // -------------------------------------------------------------------------
  // Quiz answers handler
  // -------------------------------------------------------------------------
  const handleAnswer = useCallback((selectedIndex) => {
    if (stateRef.current.isPaused) return;
    const question = shuffledQuestions[questionIndex];
    if (!question) return;
    const correct = selectedIndex === question.answer;
    const { activePiece: piece, misses: currentMisses } = stateRef.current;
    rememberQuestionId(question.id);

    // Handle Strike Recovery Phase
    if (stateRef.current.gameState === "strike_recovery") {
      if (correct) {
        playSFX("correct");
        triggerFlash("success");
        setMisses(Math.max(0, strikeLimit - 1));
        const nextBoard = board.map((row, y) => {
          if (y < 3) return Array(BOARD_WIDTH).fill(null);
          return [...row];
        });
        setBoard(nextBoard);
        triggerShake();
        addFloatingText("RECOVERY SUCCESS! 💥", 4, 4);
        setFeedback("Recovery Success! One strike remains.");

        setShuffledQuestions(buildQuestionDeck({
          level,
          banks: { ...QUESTION_BANKS, 99: customQuestions },
          recentIds: readRecentQuestionIds(),
          size: 60,
          seed: `recovery-${level}-${Date.now()}`,
        }));
        setQuestionIndex(0);
        setGameState("transition");
        setTimeout(() => {
          setGameState("quiz");
          spawnQuizPiece();
        }, 1500);
      } else {
        handleGameEnd(false, totalScore);
      }
      return;
    }

    if (!piece) return;
    setRunMetrics((metrics) => ({
      ...metrics,
      questions: metrics.questions + 1,
    }));

    if (correct) {
      const nextStreak = correctStreak + 1;
      playSFX("correct", nextStreak);
      triggerFlash("success");
      vibrate(nextStreak >= 5 ? [18, 40, 18] : 16);
      setCorrectStreak(nextStreak);
      setCoolingRemaining(0);
      setHeatLevel((prev) => {
        const next = Math.min(5, prev + 1);
        if (next === 5 && prev < 5) {
          addFloatingText("MAX HEAT! 🔥⚡", piece?.x || 5, piece?.y || 4);
        } else if (next > prev) {
          addFloatingText(`HEAT UP! 🔥 x${next}`, piece?.x || 5, piece?.y || 4);
        }
        return next;
      });
      setMaxStreak((currentMax) => Math.max(currentMax, nextStreak));
      const isDopamine = stateRef.current.activeMutator === "dopamine_rush";
      const frenzyActive = nextStreak >= 5;
      const frenzyMultiplier = frenzyActive ? 2 : 1;
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER * (isDopamine ? 2 : 1) * frenzyMultiplier);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);

      // Variable verbal reward: escalating praise, larger on milestone streaks.
      addFloatingText(praiseForStreak(nextStreak), piece?.x ?? 5, (piece?.y ?? 4) + 1);

      // Perfect Quick Answer Bonus check
      const elapsed = (Date.now() - questionStartTime) / 1000;
      let bonusText = "";
      if (elapsed <= runConfig.difficulty.quickWindowSeconds) {
        setTotalScore((score) => score + 15 * (isDopamine ? 2 : 1) * frenzyMultiplier);
        bonusText = frenzyActive ? " PERFECT! Quick Bonus +30 Pts!" : " PERFECT! Quick Bonus +15 Pts!";
        addFloatingText("PERFECT! ⚡", piece?.x || 5, piece?.y || 4);
        unlockAchievement("perfect");
      }

      if (nextStreak >= 10) unlockAchievement("streak10");

      setIsControllable(true);

      // Check combo power-up conversion
      let newPiece = { ...piece };
      const streakPower = getStreakPowerType(nextStreak);
      if (streakPower === "tnt") {
        playSFX("explosion");
        newPiece = makePowerUp(piece, nextStreak);
        addFloatingText(`COMBO x${nextStreak}! TNT Block 💣`, piece?.x || 5, piece?.y || 2);
        unlockAchievement("tnt");
      } else if (streakPower === "drill") {
        playSFX("drill");
        newPiece = makePowerUp(piece, nextStreak);
        addFloatingText(`COMBO x${nextStreak}! Drill Block 🌀`, piece?.x || 5, piece?.y || 2);
        unlockAchievement("drill");
      } else if (streakPower === "lightning") {
        playSFX("thunder");
        newPiece = makePowerUp(piece, nextStreak);
        addFloatingText(`COMBO x${nextStreak}! Lightning Rod ⚡`, piece?.x || 5, piece?.y || 2);
        unlockAchievement("lightning");
      } else {
        const evolvedPower = getEvolvedStreakPowerType(nextStreak);
        if (evolvedPower === "row_clear") {
          playSFX("streak");
          newPiece = makePowerBlock(piece, evolvedPower, nextStreak);
          addFloatingText(`COMBO x${nextStreak}! Row Clear ↔️`, piece?.x || 5, piece?.y || 2);
        } else if (evolvedPower === "area_clear") {
          playSFX("streak");
          newPiece = makePowerBlock(piece, evolvedPower, nextStreak);
          addFloatingText(`COMBO x${nextStreak}! 2x2 Area Clear 🔲`, piece?.x || 5, piece?.y || 2);
        }
      }


      setActivePiece(newPiece);
      setFeedback(`Correct!${bonusText} You have control.`);
      setGameState("dropping");
    } else {
      const nextMisses = currentMisses + 1;
      playSFX("incorrect", nextMisses);
      playSFX("thud");
      triggerFlash("danger");
      vibrate([60, 30, 90]);
      // Heavy stone slams straight onto the board here (instant lock, bypassing
      // lockPiece), so add the impact feedback that landing would normally give.
      triggerShake();
      triggerBoardRecoil();
      triggerBoardThump();
      setCorrectStreak(0);
      setHeatLevel(0);
      setCoolingRemaining(3);
      const correctAnswer = question.options[question.answer];
      setMisses(nextMisses);
      setLastCorrectAnswer(correctAnswer);
      setFeedback(`Wrong! The answer was ${correctAnswer}. Heavy Stone block incoming!`);

      setIsControllable(false);
      const desperationActive = stateRef.current.board.slice(0, 5).some(row => row.some(cell => cell !== null));
      const stonePiece = {
        ...piece,
        color: "bg-zinc-800",
        emoji: desperationActive ? "⛰️" : "🪨",
        isStone: true,
        isHeavyStone: true,
        heavyHits: desperationActive ? 3 : 2,
      };

      const isInverse = stateRef.current.activeMutator === "inverse_gravity";
      let y = stonePiece.y;
      const currentBoard = board;
      if (isInverse) {
        while (!checkCollision({ ...stonePiece, y: y - 1 }, currentBoard, true)) {
          y -= 1;
        }
      } else {
        while (!checkCollision({ ...stonePiece, y: y + 1 }, currentBoard)) {
          y += 1;
        }
      }
      const lockedStonePiece = { ...stonePiece, y };
      setLastPlacedPiece({
        x: lockedStonePiece.x,
        y: lockedStonePiece.y,
        shape: lockedStonePiece.shape,
        color: lockedStonePiece.color,
        timestamp: Date.now()
      });

      const nextBoard = currentBoard.map((row) => [...row]);
      lockedStonePiece.shape.forEach((row, shapeY) => {
        row.forEach((value, shapeX) => {
          if (!value) return;
          const boardY = lockedStonePiece.y + shapeY;
          const boardX = lockedStonePiece.x + shapeX;
          if (boardY >= 0 && boardY < BOARD_HEIGHT) {
            nextBoard[boardY][boardX] = {
              color: lockedStonePiece.color,
              isStone: true,
              emoji: lockedStonePiece.emoji,
              isHeavyStone: lockedStonePiece.isHeavyStone,
              heavyHits: lockedStonePiece.heavyHits,
            };
          }
        });
      });

      setBoard(nextBoard);
      setActivePiece(null);

      if (nextMisses >= strikeLimit) {
        const activeLevel = level;
        const recoveryDeck = buildQuestionDeck({
          level: activeLevel,
          banks: { ...QUESTION_BANKS, 99: customQuestions },
          recentIds: readRecentQuestionIds(),
          size: 8,
          seed: `strike-${activeLevel}-${Date.now()}`,
        });
        const q = randomItem(recoveryDeck);
        setShuffledQuestions([q]);
        setQuestionIndex(0);
        setRecoveryTimer(4);
        setGameState("strike_recovery");
      } else {
        setGameState("transition");
        setTimeout(() => setGameState("resolving"), 1500);
      }
    }

    if (level === 9 || level === 10 || stateRef.current.activeMutator === "volcanic_surge") {
      setQuestionsSinceLastRise((prev) => {
        const next = prev + 1;
        return next >= 3 ? 0 : next;
      });
    }
  }, [shuffledQuestions, questionIndex, level, board, correctStreak, questionStartTime, spawnQuizPiece, totalScore, handleGameEnd, addFloatingText, triggerFlash, customQuestions, vibrate, unlockAchievement, runConfig.difficulty.quickWindowSeconds, strikeLimit, triggerShake, triggerBoardRecoil, setLastPlacedPiece]);

  // -------------------------------------------------------------------------
  // Level Initialization
  // -------------------------------------------------------------------------
  const startLevel = useCallback((nextLevel, requestedMode) => {
    playSFX("button");
    setLevel(nextLevel);
    
    const isSinglePlayer = requestedMode !== "ai_race" && requestedMode !== "endless" && nextLevel !== 98;
    let rolledMutator = null;
    if (isSinglePlayer) {
      const mutatorOptions = ["double_drop", "inverse_gravity", "dopamine_rush", "chaos_deck", "volcanic_surge"];
      rolledMutator = mutatorOptions[Math.floor(Math.random() * mutatorOptions.length)];
    }
    setActiveMutator(rolledMutator);
    setWheelState(rolledMutator ? "spinning" : "idle");
    setWheelIndex(0);

    if (nextLevel === 98) {
      setRunMode("daily");
      setShuffledQuestions(buildDailyQuestionDeck({
        banks: QUESTION_BANKS,
        date: new Date(),
        size: 30,
      }));
    } else if (requestedMode === "endless") {
      setRunMode("endless");
      setEndlessLevel(1);
      setSpeedWavePieces(0);
      setShuffledQuestions(buildQuestionDeck({
        level: 1,
        banks: { ...QUESTION_BANKS, 99: customQuestions },
        recentIds: readRecentQuestionIds(),
        size: 60,
        seed: `endless-1-${Date.now()}-${Math.random()}`,
        isChaosDeck: false,
      }));
    } else {
      setRunMode(requestedMode === "ai_race" ? "ai_race" : nextLevel === 99 ? "custom" : "campaign");
      setShuffledQuestions(buildQuestionDeck({
        level: nextLevel,
        banks: { ...QUESTION_BANKS, 99: customQuestions },
        recentIds: readRecentQuestionIds(),
        size: nextLevel >= 11 ? 70 : 60,
        seed: `${nextLevel}-${Date.now()}-${Math.random()}`,
        isChaosDeck: rolledMutator === "chaos_deck",
      }));
    }
    setBoard(createEmptyBoard());
    setActivePiece(null);
    setNextPiece(null);
    setHeldPiece(null);
    setHoldUsed(false);
    setQuestionIndex(0);
    setQuestionsAnsweredThisLevel(0);
    setMisses(0);
    setLastCorrectAnswer("");
    setTotalScore(0);
    setIsControllable(true);
    setFeedback("");
    setExplodingCells([]);
    setBlastEffect("match");
    setUsedPowers([]);
    setFlashColor(null);
    setShareFeedback("");

    setCorrectStreak(0);
    setHeatLevel(0);
    setCoolingRemaining(0);
    setMaxStreak(0);
    setIsPaused(false);
    setWindForce(0);
    setQuestionsSinceLastRise(0);
    setRunMetrics({
      lines: 0,
      matches: 0,
      fruits: 0,
      specials: 0,
      questions: 0,
    });
    setAiRaceMetrics(createAiRaceMetrics());
    aiRaceAnsweredQuestionRef.current = -1;
    setAiThinkingStage("reading");
    setAiQuip(randomItem(AI_THINKING_LINES));
    if (requestedMode === "ai_race") setArenaResult(null);

    const fact = TRIVIA_FACTS[Math.floor(Math.random() * TRIVIA_FACTS.length)];
    setRandomFact(fact);
    setIntroCountdown(LEVEL_INTRO_SECONDS);

    setGameState("intro");
  }, [customQuestions]);

  // Compose display board by overlaying the active piece
  const animatedScore = useAnimatedNumber(totalScore);
  const winStars = misses === 0 ? 3 : misses === 1 ? 2 : 1;
  const isArena = ["arena_quiz", "arena_dropping", "arena_resolving"].includes(gameState);
  const isOnlineArena = gameState === "online_arena";
  const nearWin = totalScore >= runTarget - 60 && totalScore < runTarget && PLAYABLE_STATES.has(gameState);
  const scoreGoalComplete = totalScore >= runTarget;
  const waitingOnMission = scoreGoalComplete && !objectiveStatus.complete && PLAYABLE_STATES.has(gameState);
  const aiRaceObjectiveStatus = getObjectiveStatus(runConfig, aiRaceMetrics);
  const rewardLevelMultiplier = runMode === "campaign" ? level : 5;

  const displayBoard = board.map((row) => [...row]);

  // Ghost projection: show where the controllable piece will land so players can
  // plan placements at a glance. Drawn under the live piece, never on occupied cells.
  if (activePiece && gameState === "dropping" && isControllable) {
    let ghostY = activePiece.y;
    const isInverse = activeMutator === "inverse_gravity";
    if (isInverse) {
      while (!checkCollision({ ...activePiece, y: ghostY - 1 }, board, true)) ghostY -= 1;
      if (ghostY < activePiece.y) {
        activePiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
            if (!value) return;
            const boardY = ghostY + y;
            const boardX = activePiece.x + x;
            if (
              boardY >= 0 && boardY < BOARD_HEIGHT &&
              boardX >= 0 && boardX < BOARD_WIDTH &&
              displayBoard[boardY][boardX] === null
            ) {
              displayBoard[boardY][boardX] = {
                color: activePiece.color,
                emoji: "",
                isGhost: true,
              };
            }
          });
        });
      }
    } else {
      while (!checkCollision({ ...activePiece, y: ghostY + 1 }, board)) ghostY += 1;
      if (ghostY > activePiece.y) {
        activePiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
            if (!value) return;
            const boardY = ghostY + y;
            const boardX = activePiece.x + x;
            if (
              boardY >= 0 && boardY < BOARD_HEIGHT &&
              boardX >= 0 && boardX < BOARD_WIDTH &&
              displayBoard[boardY][boardX] === null
            ) {
              displayBoard[boardY][boardX] = {
                color: activePiece.color,
                emoji: "",
                isGhost: true,
              };
            }
          });
        });
      }
    }
  }

  if (activePiece) {
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = activePiece.y + y;
        const boardX = activePiece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          displayBoard[boardY][boardX] = {
            color: activePiece.color,
            isFruit: activePiece.isFruit,
            fruitType: activePiece.fruitType,
            emoji: activePiece.emoji,
            isStone: activePiece.isStone,
            isTNT: activePiece.isTNT,
            isDrill: activePiece.isDrill,
            isLightning: activePiece.isLightning,
            isRowClear: activePiece.isRowClear,
            isArea2x2Clear: activePiece.isArea2x2Clear,
            isCatalystBomb: activePiece.isCatalystBomb,
            isWildcard: activePiece.isWildcard,
          };
        }
      });
    });
  }

  const currentQuestion = shuffledQuestions[questionIndex];
  const currentLevel = level === 98
    ? { id: 98, name: "Daily Blast", theme: `Seeded challenge ${dailyChallengeKey}` }
    : level === 99
      ? { id: 99, name: "Custom Pack", theme: "Your custom trivia" }
      : (LEVELS.find((item) => item.id === level) || LEVELS[0]);
  const isMenu = gameState === "start";

  const panelClass = isMenu
    ? "w-full max-w-5xl h-full flex flex-col items-center justify-center text-center z-10"
    : "gameplay-panel w-full md:w-[58%] md:max-h-none flex flex-col items-center md:items-start p-3 md:p-5 bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl min-h-0 justify-start md:justify-center text-center md:text-left relative overflow-hidden z-10";

  return (
    <div className={`h-dvh animated-bg text-slate-100 font-sans flex flex-col items-center p-2 md:p-4 overflow-hidden touch-manipulation ${reduceMotion ? "reduced-motion" : ""} ${highContrast ? "high-contrast" : ""}`}>
      <Confetti active={gameState === "level_win"} />
      <ScreenFlash tone={flashColor} />
      {showOnboarding && gameState === "start" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/88 p-4 backdrop-blur-md">
          <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="onboarding-progress" aria-label={`Onboarding step ${onboardingStep + 1} of ${ONBOARDING_STEPS.length}`}>
              {ONBOARDING_STEPS.map((step, index) => (
                <span
                  key={step.title}
                  className={index <= onboardingStep ? "onboarding-dot onboarding-dot-active" : "onboarding-dot"}
                />
              ))}
            </div>
            {ONBOARDING_STEPS[onboardingStep].kind === "profile" ? (
              <div className="onboarding-profile-setup">
                <div className="onboarding-profile-heading">
                  <div className="onboarding-profile-preview" aria-hidden="true">
                    {onboardingAvatarDraft}
                  </div>
                  <div>
                    <p className="onboarding-eyebrow">{ONBOARDING_STEPS[onboardingStep].eyebrow}</p>
                    <h2 id="onboarding-title" className="onboarding-title">
                      {ONBOARDING_STEPS[onboardingStep].title}
                    </h2>
                    <p className="onboarding-copy">{ONBOARDING_STEPS[onboardingStep].body}</p>
                  </div>
                </div>

                <label className="onboarding-field">
                  <span>Gamer Name</span>
                  <input
                    value={onboardingNameDraft}
                    onChange={(event) => setOnboardingNameDraft(event.target.value.slice(0, 18))}
                    maxLength={18}
                    placeholder="Enter your name"
                    autoComplete="nickname"
                  />
                </label>

                <fieldset className="onboarding-choice-group">
                  <legend>Choose Your Avatar</legend>
                  <div className="onboarding-avatar-grid">
                    {PROFILE_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setOnboardingAvatarDraft(avatar)}
                        className={onboardingAvatarDraft === avatar ? "profile-avatar-choice profile-avatar-choice-active" : "profile-avatar-choice"}
                        aria-label={`Use ${avatar} avatar`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="onboarding-setup-grid">
                  <fieldset className="onboarding-choice-group">
                    <legend>Game Difficulty</legend>
                    <div className="onboarding-difficulty-grid">
                      {Object.entries(DIFFICULTY_PRESETS).map(([id, preset]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setOnboardingDifficultyDraft(id)}
                          className={onboardingDifficultyDraft === id ? "onboarding-choice-active" : ""}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="onboarding-field">
                    <span>Starting Campaign Level</span>
                    <select
                      value={onboardingStartLevel}
                      onChange={(event) => setOnboardingStartLevel(Number(event.target.value))}
                    >
                      {LEVELS.map((item) => (
                        <option key={item.id} value={item.id}>
                          Level {item.id}: {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="onboarding-icon" aria-hidden="true">
                  {ONBOARDING_STEPS[onboardingStep].icon}
                </div>
                <p className="onboarding-eyebrow">{ONBOARDING_STEPS[onboardingStep].eyebrow}</p>
                <h2 id="onboarding-title" className="onboarding-title">
                  {ONBOARDING_STEPS[onboardingStep].title}
                </h2>
                <p className="onboarding-copy">{ONBOARDING_STEPS[onboardingStep].body}</p>
              </>
            )}
            <div className="onboarding-actions">
              {onboardingStep === 0 ? (
                <div className="onboarding-required-note">Saved locally to this profile</div>
              ) : (
                <button type="button" onClick={completeOnboarding} className="menu-ghost-button">
                  Skip Tutorial
                </button>
              )}
              <button
                type="button"
                disabled={onboardingStep === 0 && !onboardingNameDraft.trim()}
                onClick={() => {
                  if (onboardingStep >= ONBOARDING_STEPS.length - 1) {
                    completeOnboarding();
                  } else {
                    if (onboardingStep === 0) saveOnboardingProfile();
                    playSFX("button");
                    setOnboardingStep((step) => step + 1);
                  }
                }}
                className="menu-primary-button"
              >
                {onboardingStep === 0
                  ? "Save Profile & Continue"
                  : onboardingStep >= ONBOARDING_STEPS.length - 1
                    ? "Start Playing"
                    : "Next"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Achievement / record toasts */}
      {achievementToasts.length > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-[min(92vw,22rem)] pointer-events-none">
          {achievementToasts.map((t) => (
            <div key={t.id} className="achievement-toast w-full flex items-center gap-3 rounded-2xl border border-cyan-300/40 bg-slate-900/95 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <span className="text-2xl leading-none drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">{t.emoji}</span>
              <span className="min-w-0">
                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  {t.kind === "record" ? "Record" : "Achievement Unlocked"}
                </span>
                <span className="block text-sm font-black text-white leading-tight">{t.title}</span>
                <span className="block text-[11px] font-semibold text-slate-400 leading-tight">{t.desc}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Global Session Controls */}
      <div className="session-controls fixed top-2.5 right-2.5 z-40 flex items-center gap-2">
        {canPause && (
          <button
            type="button"
            onClick={() => {
              playSFX("button");
              setIsPaused((paused) => !paused);
            }}
            className="p-2 bg-slate-800/90 border border-cyan-400/30 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all text-sm flex items-center justify-center text-cyan-300 hover:text-white"
            aria-label={isPaused ? "Resume game" : "Pause game"}
          >
            {isPaused ? "▶" : "Ⅱ"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            playSFX("button");
            setAudioOn(!audioOn);
          }}
          className="p-2 bg-slate-800/90 border border-slate-700/50 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all text-sm flex items-center justify-center text-cyan-400 hover:text-cyan-300"
          aria-label={audioOn ? "Mute audio" : "Unmute audio"}
        >
          {audioOn ? "🔊" : "🔇"}
        </button>
      </div>

      {canPause && isPaused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/30 bg-slate-900/95 p-5 shadow-[0_0_45px_rgba(34,211,238,0.2)]">
            <div className="text-center mb-5">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Run Paused</div>
              <h2 className="text-3xl font-black text-white mt-1">Catch Your Breath</h2>
              <p className="text-xs text-slate-400 mt-1 font-semibold">Press P or Escape to resume.</p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              {[
                ["Master", masterVol, handleMasterVolChange],
                ["Music", musicVol, handleMusicVolChange],
                ["SFX", sfxVol, handleSfxVolChange],
              ].map(([label, value, onChange]) => (
                <label key={label} className="grid grid-cols-[70px_1fr_42px] items-center gap-3 text-xs font-black uppercase tracking-wide text-slate-300">
                  <span>{label}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="accent-cyan-400"
                  />
                  <span className="text-right text-cyan-300">{Math.round(value * 100)}%</span>
                </label>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Reduce Motion", reduceMotion, setReduceMotion],
                ["Screen Shake", screenShakeEnabled, setScreenShakeEnabled],
                ["Haptics", hapticsEnabled, setHapticsEnabled],
                ["High Contrast", highContrast, setHighContrast],
              ].map(([label, enabled, setter]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setter(!enabled)}
                  className={enabled ? "settings-toggle settings-toggle-active" : "settings-toggle"}
                  aria-pressed={enabled}
                >
                  <span>{label}</span>
                  <strong>{enabled ? "On" : "Off"}</strong>
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  playSFX("button");
                  setIsPaused(false);
                }}
                className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.35)] hover:bg-cyan-300 active:scale-95 transition"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  playSFX("button");
                  setIsPaused(false);
                  setGameState("start");
                  setMenuTab("levels");
                }}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 active:scale-95 transition"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`w-full h-full mx-auto flex min-h-0 ${isMenu ? "max-w-7xl items-center justify-center" : `gameplay-layout gameplay-${gameState}${runMode === "ai_race" ? " ai-race-active" : ""} max-w-6xl flex-col md:flex-row gap-2 md:gap-6 items-center md:items-stretch`}`}>

        {isOnlineArena && (
          <OnlineArena
            activeProfile={activeProfile}
            arenaLevel={arenaLevel}
            questions={shuffledQuestions}
            playSFX={playSFX}
            onExit={() => {
              setGameState("start");
              setMenuTab("arena");
            }}
          />
        )}

        {/* Arena VS Gameplay view */}
        {isArena && (
          <div className={`arena-shell ${arenaMode === "vs_ai" ? "arena-shell-ai" : ""} w-full max-w-6xl flex flex-col items-center justify-start min-h-0 z-10 flex-1`}>
            <header className="arena-header w-full flex items-center justify-between bg-slate-900/90 backdrop-blur-md rounded-xl p-3 border border-slate-700/50 shadow-xl mb-3 shrink-0">
              <div className="text-left">
                <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Blast Arena VS</span>
                <h1 className="text-base font-black text-white leading-tight">
                  {arenaMode === "vs_ai" ? `🤖 Byte the AI · ${aiDifficulty[0].toUpperCase()}${aiDifficulty.slice(1)}` : "🎮 Local 1v1 Split-Screen"}
                </h1>
              </div>

              {gameState === "arena_quiz" && currentQuestion ? (
                <div className="arena-question-banner flex-1 max-w-lg mx-4 text-center px-4 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                  <span className="text-[10px] font-black text-cyan-300 uppercase tracking-widest block mb-0.5">Read, Think, Then Strike</span>
                  <span className="arena-question-text text-xs font-bold text-white block">{currentQuestion.q}</span>
                </div>
              ) : (
                <div className="flex-1 max-w-lg mx-4 text-center px-4 py-1.5 bg-slate-950/30 rounded-lg border border-transparent">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Drop Phase</span>
                  <span className="text-xs font-bold text-slate-400 block">Steer and land your blocks!</span>
                </div>
              )}

              <div className="text-right">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                  {arenaMode === "vs_ai" ? "AI Score" : "Win Target"}
                </span>
                <span className="block text-sm font-black text-white">
                  {arenaMode === "vs_ai" ? `${totalScore2}/${WIN_SCORE_TARGET}` : `${WIN_SCORE_TARGET} Pts`}
                </span>
                {arenaMode === "vs_ai" && (
                  <span className="arena-ai-status block text-[9px] font-bold text-fuchsia-300">
                    {gameState === "arena_quiz" && p2Answered === null && (
                      <><span className="ai-thinking-gear">⚙</span> {aiThinkingStage === "calculating" ? "Calculating..." : "Reading..."}</>
                    )}
                    {gameState === "arena_quiz" && p2Answered === "correct" && "Answered correctly"}
                    {gameState === "arena_quiz" && p2Answered === "wrong" && "Missed the question"}
                    {gameState === "arena_dropping" && "Placing block"}
                    {gameState === "arena_resolving" && "Resolving board"}
                  </span>
                )}
              </div>
              {arenaMode === "vs_ai" && (
                <div className={`ai-quip ai-quip-${aiThinkingStage}`} role="status" aria-live="polite">
                  <span>BYTE:</span> {aiQuip}
                </div>
              )}
            </header>

            <div className={`arena-board-grid flex-1 w-full min-h-0 grid gap-3 sm:gap-6 items-stretch mb-2 ${arenaMode === "vs_ai" ? "grid-cols-1 arena-board-grid-solo" : "grid-cols-2"}`}>
              <section className="flex flex-col items-center min-h-0 relative" aria-label="Player 1 Board">
                <div className="w-full flex justify-between items-center mb-1.5 px-3 py-1 bg-slate-900/80 rounded-lg text-xs font-bold border border-slate-800 shadow-lg">
                  <span className="text-cyan-300">P1: <span className="text-sm font-black">{totalScore}</span><span className="text-slate-500">/500</span></span>
                  {correctStreak >= 3 && <span className="text-yellow-400 font-black animate-pulse">🔥 x{correctStreak}</span>}
                  <span className="text-red-400 flex items-center gap-0.5">
                    {Array.from({ length: STRIKES_ALLOWED }).map((_, i) => (
                      <span key={i} className={i < misses ? "text-slate-600 text-[10px]" : "text-red-500 text-[10px]"}>{i < misses ? "🖤" : "❤️"}</span>
                    ))}
                  </span>
                </div>

                <div
                  className={`game-board arena-game-board ${arenaMode === "vs_ai" ? "arena-game-board-solo" : ""} ${getBoardThemeClass(stats.activeTheme)} p-0.5 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden flex-1 ${shake ? (isDesperationActive || correctStreak >= 5 || misses >= strikeLimit - 1 ? "animate-shake-amplified" : "animate-shake") : ""} ${boardRecoil ? "animate-board-recoil" : ""} ${boardThump ? "animate-board-thump" : ""} ${isDesperationActive ? "desperation-active animate-critical-shake" : correctStreak >= 5 ? "fever-active" : correctStreak >= 3 ? "shadow-[0_0_15px_rgba(234,179,8,0.2)]" : ""}`}
                >
                  {displayBoard.map((row, y) =>
                    row.map((cell, x) => {
                      const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                      let cellColorClass = cell
                        ? (cell.isLava ? "" : getThemeCellColor(cell.color, stats.activeTheme))
                        : getEmptyCellColor(stats.activeTheme);
                      let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-xs select-none ${cellColorClass}`;

                      if (cell?.isGhost) {
                        cellClass += " ghost-block opacity-45";
                      } else {
                        if (cell?.isLava) {
                          cellClass += " border border-orange-500 bg-orange-600 animate-pulse animate-glow-lava";
                        } else if (cell?.isStone) {
                          cellClass += " border border-slate-400 bg-slate-600";
                        }
                        if (isExploding) {
                           cellClass += " transition-all duration-[400ms] scale-150 opacity-0 z-10 blur-sm";
                        } else if (cell && cell.landedAt && Date.now() - cell.landedAt < 300) {
                           cellClass += " animate-block-settle";
                        }
                      }

                      return (
                        <div key={`${y}-${x}`} className={cellClass}>
                          {cell?.emoji || ""}
                        </div>
                      );
                    })
                  )}

                  <BoardParticlesCanvas
                    explodingCells={explodingCells}
                    correctStreak={correctStreak}
                    effectType="match"
                    activePiece={activePiece}
                    lastPlacedPiece={lastPlacedPiece}
                  />

                  {floatingTexts.map((t) => (
                    <div
                      key={t.id}
                      className="absolute z-30 font-black text-xs text-yellow-400 pointer-events-none animate-float-text select-none text-center drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.8)]"
                      style={{
                        top: `${(t.y / BOARD_HEIGHT) * 100}%`,
                        left: `${(t.x / BOARD_WIDTH) * 100}%`,
                      }}
                    >
                      {t.text}
                    </div>
                  ))}

                  {gameState === "arena_dropping" && !isControllable && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs p-2 text-center border-2 border-slate-500">
                      <h4 className="text-red-400 font-bold uppercase tracking-widest text-[9px] drop-shadow-md">Stone block locked!</h4>
                    </div>
                  )}
                  {gameState === "arena_dropping" && isControllable && (
                    <div className="absolute top-1 left-1 bg-green-500/20 border border-green-500/40 text-green-300 font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      Controllable
                    </div>
                  )}
                </div>
              </section>

              <section className={arenaMode === "vs_ai" ? "hidden" : "flex flex-col items-center min-h-0 relative"} aria-label="Player 2 Board">
                <div className="w-full flex justify-between items-center mb-1.5 px-3 py-1 bg-slate-900/80 rounded-lg text-xs font-bold border border-slate-800 shadow-lg">
                  <span className="text-fuchsia-300">P2: <span className="text-sm font-black">{totalScore2}</span><span className="text-slate-500">/500</span></span>
                  {correctStreak2 >= 3 && <span className="text-yellow-400 font-black animate-pulse">🔥 x{correctStreak2}</span>}
                  <span className="text-red-400 flex items-center gap-0.5">
                    {Array.from({ length: STRIKES_ALLOWED }).map((_, i) => (
                      <span key={i} className={i < misses2 ? "text-slate-600 text-[10px]" : "text-red-500 text-[10px]"}>{i < misses2 ? "🖤" : "❤️"}</span>
                    ))}
                  </span>
                </div>

                <div
                  className={`game-board arena-game-board ${getBoardThemeClass(stats.activeTheme)} p-0.5 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden flex-1 ${shake2 ? (correctStreak2 >= 5 || misses2 >= strikeLimit - 1 ? "animate-shake-amplified" : "animate-shake") : ""} ${boardRecoil2 ? "animate-board-recoil2" : ""} ${boardThump2 ? "animate-board-thump2" : ""} ${correctStreak2 >= 5 ? "fever-active" : correctStreak2 >= 3 ? "shadow-[0_0_15px_rgba(234,179,8,0.2)]" : ""}`}
                >
                  {(() => {
                    const displayBoard2 = board2.map(row => [...row]);

                    if (activePiece2 && gameState === "arena_dropping" && isControllable2) {
                      let ghostY = activePiece2.y;
                      while (!checkCollision({ ...activePiece2, y: ghostY + 1 }, board2)) ghostY += 1;
                      if (ghostY > activePiece2.y) {
                        activePiece2.shape.forEach((row, y) => {
                          row.forEach((value, x) => {
                            if (!value) return;
                            const boardY = ghostY + y;
                            const boardX = activePiece2.x + x;
                            if (
                              boardY >= 0 && boardY < BOARD_HEIGHT &&
                              boardX >= 0 && boardX < BOARD_WIDTH &&
                              displayBoard2[boardY][boardX] === null
                            ) {
                              displayBoard2[boardY][boardX] = {
                                color: activePiece2.color,
                                emoji: "",
                                isGhost: true,
                              };
                            }
                          });
                        });
                      }
                    }

                    if (activePiece2) {
                      activePiece2.shape.forEach((row, y) => {
                        row.forEach((value, x) => {
                          if (!value) return;
                          const boardY = activePiece2.y + y;
                          const boardX = activePiece2.x + x;
                          if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
                            displayBoard2[boardY][boardX] = {
                              color: activePiece2.color,
                              isFruit: activePiece2.isFruit,
                              fruitType: activePiece2.fruitType,
                              emoji: activePiece2.emoji,
                              isStone: activePiece2.isStone,
                              isTNT: activePiece2.isTNT,
                              isDrill: activePiece2.isDrill,
                              isLightning: activePiece2.isLightning,
                              isRowClear: activePiece2.isRowClear,
                              isArea2x2Clear: activePiece2.isArea2x2Clear,
                            };
                          }
                        });
                      });
                    }

                    return displayBoard2.map((row, y) =>
                      row.map((cell, x) => {
                        const isExploding = explodingCells2.some((item) => item.y === y && item.x === x);
                        let cellColorClass = cell
                          ? (cell.isLava ? "" : getThemeCellColor(cell.color, stats.activeTheme))
                          : getEmptyCellColor(stats.activeTheme);
                        let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-xs select-none ${cellColorClass}`;

                        if (cell?.isGhost) {
                          cellClass += " ghost-block opacity-45";
                        } else {
                          if (cell?.isLava) {
                            cellClass += " border border-orange-500 bg-orange-600 animate-pulse animate-glow-lava";
                          } else if (cell?.isStone) {
                            cellClass += " border border-slate-400 bg-slate-600";
                          }
                          if (isExploding) {
                            cellClass += " transition-all duration-[400ms] scale-150 opacity-0 z-10 blur-sm";
                          } else if (cell && cell.landedAt && Date.now() - cell.landedAt < 300) {
                            cellClass += " animate-block-settle";
                          }
                        }

                        return (
                          <div key={`${y}-${x}`} className={cellClass}>
                            {cell?.emoji || ""}
                          </div>
                        );
                      })
                    );
                  })()}

                  <BoardParticlesCanvas
                    explodingCells={explodingCells2}
                    correctStreak={correctStreak2}
                    effectType="match"
                    activePiece={activePiece2}
                    lastPlacedPiece={lastPlacedPiece2}
                  />

                  {floatingTexts2.map((t) => (
                    <div
                      key={t.id}
                      className="absolute z-30 font-black text-xs text-yellow-400 pointer-events-none animate-float-text select-none text-center drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.8)]"
                      style={{
                        top: `${(t.y / BOARD_HEIGHT) * 100}%`,
                        left: `${(t.x / BOARD_WIDTH) * 100}%`,
                      }}
                    >
                      {t.text}
                    </div>
                  ))}

                  {gameState === "arena_dropping" && !isControllable2 && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs p-2 text-center border-2 border-slate-500">
                      <h4 className="text-red-400 font-bold uppercase tracking-widest text-[9px] drop-shadow-md">
                        {arenaMode === "vs_ai" ? "AI Stone Block locked!" : "P2 Stone block locked!"}
                      </h4>
                    </div>
                  )}
                  {gameState === "arena_dropping" && isControllable2 && (
                    <div className="absolute top-1 left-1 bg-green-500/20 border border-green-500/40 text-green-300 font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      {arenaMode === "vs_ai" ? "AI Controller" : "Controllable"}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className={`arena-control-grid w-full grid gap-4 shrink-0 min-h-[140px] items-stretch ${arenaMode === "vs_ai" ? "grid-cols-1 arena-control-grid-solo" : "grid-cols-2"}`}>
              <div className="bg-slate-900/60 rounded-xl p-2 border border-slate-850 flex flex-col justify-center items-center text-center">
                {gameState === "arena_quiz" && currentQuestion ? (
                  p1Answered === null ? (
                    <div className="w-full">
                      <span className="text-[10px] font-black text-cyan-300 tracking-wider block mb-1">Your Answer</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {currentQuestion.options.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleArenaAnswer(1, idx)}
                            className="arena-answer-button bg-slate-700 hover:bg-cyan-600 text-white font-bold p-1 px-2 rounded-lg text-xs leading-tight border border-slate-600 text-left flex items-center gap-1.5"
                          >
                            <span className="bg-slate-900 text-cyan-300 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 font-black">{idx + 1}</span>
                            <span>{opt}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-2 h-full">
                      <span className={`text-sm font-black ${p1Answered === "correct" ? "text-green-400" : "text-red-400"} animate-pulse`}>
                        {p1Answered === "correct" ? "Approved! ⚡" : "Wrong Answer! 🧱"}
                      </span>
                      <span className="text-[9px] text-slate-400 mt-0.5 font-semibold">
                        {p1Answered === "correct" ? "Wait for placement" : "Locked out of question"}
                      </span>
                    </div>
                  )
                ) : (
                  isControllable ? (
                    <div className="w-full">
                      <span className="text-[9px] font-black text-emerald-400 tracking-wider block mb-1">Steer P1 (Keys W-A-S-D + Space)</span>
                      <div className="flex gap-2 justify-center lg:hidden">
                        <button type="button" onClick={() => moveHorizontal(-1)} className="mobile-control-button flex-1 h-9 text-xs">←</button>
                        <button type="button" onClick={rotatePiece} className="mobile-control-button flex-1 h-9 text-xs">Rotate</button>
                        <button type="button" onClick={moveDown} className="mobile-control-button flex-1 h-9 text-xs">↓</button>
                        <button type="button" onClick={() => moveHorizontal(1)} className="mobile-control-button flex-1 h-9 text-xs">→</button>
                        <button type="button" onClick={hardDrop} className="mobile-drop-button flex-1 h-9 text-[9px] px-1 font-black">DROP</button>
                      </div>
                      <div className="hidden lg:block text-[11px] text-slate-400 font-semibold space-x-1.5">
                        <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">A/D</kbd> Move</span>
                        <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">W</kbd> Rotate</span>
                        <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Space</kbd> Drop</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-xs text-slate-500 font-black uppercase">Stone dropping...</span>
                    </div>
                  )
                )}
              </div>

              <div className={arenaMode === "vs_ai" ? "hidden" : "bg-slate-900/60 rounded-xl p-2 border border-slate-850 flex flex-col justify-center items-center text-center"}>
                {arenaMode === "vs_ai" ? (
                  <div className="flex flex-col items-center justify-center py-2 h-full text-center">
                    <span className="text-2xl animate-bounce mb-0.5">🤖</span>
                    <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest leading-none">AI Agent Bot</span>
                    <span className="text-[9px] text-slate-400 font-semibold mt-1">
                      {gameState === "arena_quiz" && p2Answered === null && "Analyzing question clues..."}
                      {gameState === "arena_quiz" && p2Answered === "correct" && "Correct! Dropping block..."}
                      {gameState === "arena_quiz" && p2Answered === "wrong" && "Locked out! Stone block created."}
                      {gameState === "arena_dropping" && isControllable2 && "Aligning block columns..."}
                      {gameState === "arena_dropping" && !isControllable2 && "Stone falling down column..."}
                      {gameState === "arena_resolving" && "Evaluating grids..."}
                    </span>
                  </div>
                ) : (
                  gameState === "arena_quiz" && currentQuestion ? (
                    p2Answered === null ? (
                      <div className="w-full">
                        <span className="text-[10px] font-black text-fuchsia-300 tracking-wider block mb-1">Player 2 Options (Keys 7-0)</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {currentQuestion.options.map((opt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleArenaAnswer(2, idx)}
                              className="arena-answer-button bg-slate-700 hover:bg-fuchsia-600 text-white font-bold p-1 px-2 rounded-lg text-xs leading-tight border border-slate-600 text-left flex items-center gap-1.5"
                            >
                              <span className="bg-slate-900 text-fuchsia-300 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0 font-black">{idx + 7}</span>
                              <span>{opt}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2 h-full">
                        <span className={`text-sm font-black ${p2Answered === "correct" ? "text-green-400" : "text-red-400"} animate-pulse`}>
                          {p2Answered === "correct" ? "Approved! ⚡" : "Wrong Answer! 🧱"}
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5 font-semibold">
                          {p2Answered === "correct" ? "Wait for placement" : "Locked out of question"}
                        </span>
                      </div>
                    )
                  ) : (
                    isControllable2 ? (
                      <div className="w-full">
                        <span className="text-[9px] font-black text-emerald-400 tracking-wider block mb-1">Steer P2 (Arrows + Enter)</span>
                        <div className="flex gap-2 justify-center lg:hidden">
                          <button type="button" onClick={() => moveHorizontal2(-1)} className="mobile-control-button flex-1 h-9 text-xs">←</button>
                          <button type="button" onClick={rotatePiece2} className="mobile-control-button flex-1 h-9 text-xs">Rotate</button>
                          <button type="button" onClick={moveDown2} className="mobile-control-button flex-1 h-9 text-xs">↓</button>
                          <button type="button" onClick={() => moveHorizontal2(1)} className="mobile-control-button flex-1 h-9 text-xs">→</button>
                          <button type="button" onClick={hardDrop2} className="mobile-drop-button flex-1 h-9 text-[9px] px-1 font-black">DROP</button>
                        </div>
                        <div className="hidden lg:block text-[11px] text-slate-400 font-semibold space-x-1.5">
                          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Arrows</kbd> Move</span>
                          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Up</kbd> Rotate</span>
                          <span><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">Enter</kbd> Drop</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-xs text-slate-500 font-black uppercase">Stone dropping...</span>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* Arena Intro Countdown Screen */}
        {!isMenu && gameState === "arena_intro" && (
          <section className="w-full max-w-xl mx-auto flex flex-col items-center justify-center p-6 bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl relative overflow-hidden z-10 animate-float min-h-[400px]">
            <BrainSparksCanvas />

            <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.25em] mb-1 z-10 animate-pulse">
              GET READY FOR DUEL
            </span>
            <h2 className="text-3xl font-black text-white mb-2 z-10 text-center">
              {arenaMode === "vs_ai" ? "🤖 PLAYER VS AI BOT" : "🎮 PLAYER 1 VS PLAYER 2"}
            </h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 z-10">
              Theme: {arenaLevel === 99 ? "Custom Pack" : LEVELS.find(l => l.id === arenaLevel)?.name}
            </p>

            <div className="w-full max-w-md bg-slate-950/60 border border-slate-700/50 p-4 rounded-2xl shadow-inner text-center z-10 backdrop-blur-md mb-8">
              <h3 className="text-[9px] font-black uppercase text-cyan-300 tracking-wider mb-2">Versus Rules</h3>
              <p className="text-slate-300 text-xs leading-relaxed font-semibold">
                Answering correctly wins the round, granting block steering control! If you clear lines, you will send heavy stone rows to block your opponent's board. Reach 500 points first to win!
              </p>
            </div>

            <div className="z-10 flex flex-col items-center">
              <div className="text-slate-400 uppercase font-black tracking-widest text-[10px] mb-1 animate-pulse">
                Match starts in
              </div>
              <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-purple-400 via-rose-500 to-amber-500 animate-bounce">
                {introCountdown > 0 ? introCountdown : "DUEL!"}
              </div>
            </div>
          </section>
        )}

        {/* Arena Match Victory Screen */}
        {!isMenu && gameState === "arena_win" && (
          <section className="arena-result-screen w-full max-w-xl mx-auto flex flex-col items-center justify-center p-6 bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl relative overflow-hidden z-10 animate-float min-h-[420px] text-center">
            <BrainSparksCanvas />

            <h2 className="text-4xl md:text-5xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-rose-500 to-amber-500 drop-shadow-md">
              DUEL CONCLUDED
            </h2>

            <div className="w-32 h-32 rounded-full border-4 border-yellow-400 bg-yellow-400/10 flex items-center justify-center text-6xl mb-6 shadow-[0_0_25px_rgba(250,204,21,0.3)] animate-bounce z-10">
              {arenaResult === "p1_win" ? "🏆" : "🤖"}
            </div>

            <h3 className="text-2xl font-black text-white mb-2 z-10">
              {arenaResult === "p1_win" && "Player 1 Wins the Match!"}
              {arenaResult === "p2_win" && "Player 2 Wins the Match!"}
              {arenaResult === "ai_win" && "AI Agent Bot Wins the Match!"}
            </h3>

            <p className="text-slate-300 text-sm font-semibold mb-6 z-10">
              {arenaResult === "p1_win"
                ? "Congratulations Player 1! You answered faster and defended your grid with expert coordination."
                : "The AI outpaced your inputs or your grid topped out. Train more and try again!"}
            </p>

            <div className="bg-slate-950/60 border border-slate-700/50 p-4 rounded-2xl shadow-inner z-10 backdrop-blur-md mb-8 grid grid-cols-2 gap-4 w-full text-xs font-bold">
              <div className="text-left border-r border-slate-800 pr-2">
                <span className="block text-slate-400 mb-0.5">Player 1 Score</span>
                <span className="block text-lg font-black text-cyan-300">{totalScore} / {WIN_SCORE_TARGET}</span>
              </div>
              <div className="text-right pl-2">
                <span className="block text-slate-400 mb-0.5">Player 2 / AI Score</span>
                <span className="block text-lg font-black text-fuchsia-300">{totalScore2} / {WIN_SCORE_TARGET}</span>
              </div>
            </div>

            <div className="flex gap-4 z-10 w-full justify-center">
              <button
                type="button"
                onClick={() => startArenaMatch(arenaMode, aiDifficulty, arenaLevel)}
                className="flex-1 bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-500 hover:to-rose-400 text-white font-black py-3 px-6 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95 text-xs font-black uppercase tracking-wider"
              >
                Replay Duel
              </button>
              <button
                type="button"
                onClick={() => { playSFX("button"); setGameState("start"); setMenuTab("arena"); }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-black py-3 px-6 rounded-xl border border-slate-600 shadow-md transition-transform hover:scale-105 active:scale-95 text-xs font-black uppercase tracking-wider"
              >
                Arena Lobby
              </button>
            </div>
          </section>
        )}

        {/* Playable Game Grid View */}
        {!isMenu && gameState !== "intro" && !isArena && !isOnlineArena && gameState !== "arena_intro" && gameState !== "arena_win" && gameState !== "level_win" && gameState !== "gameover" && (
          <section className="gameplay-board-section w-full md:w-[42%] flex flex-col items-center justify-center min-h-0 z-10" aria-label="Game board">
            {runMode === "ai_race" && (
              <div className="ai-race-strip game-board-width">
                <div>
                  <span>YOU</span>
                  <strong>{totalScore}/{runTarget}</strong>
                  <small>{questionsAnsweredThisLevel} correct</small>
                </div>
                <div className={`ai-race-byte ai-race-byte-${aiThinkingStage}`}>
                  <span><b className={aiThinkingStage === "reading" ? "ai-thinking-gear" : ""}>⚙</b> BYTE</span>
                  <strong>{aiRaceMetrics.score}/{runTarget}</strong>
                  <small>{aiRaceMetrics.correct} correct · mission {aiRaceObjectiveStatus.current}/{aiRaceObjectiveStatus.required}</small>
                </div>
                <p><b>BYTE:</b> {aiQuip}</p>
              </div>
            )}
            <div className="score-hud game-board-width flex justify-between mb-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-xs md:text-sm font-bold border border-slate-700/50 shadow-xl">
              <span className="text-slate-300">{runMode === "endless" ? `Stage ${endlessLevel}` : `Lvl ${level}`} | Score: <span className={`score-readout text-lg ${scoreBump ? "score-bump" : ""}`}>{animatedScore}</span><span className="text-slate-500">/{runTarget}</span></span>
              {windForce !== 0 && (
                <span className="text-sky-300 font-bold animate-pulse text-xs flex items-center gap-1">
                  💨 Wind: {windForce > 0 ? "👉 Right" : "👈 Left"}
                </span>
              )}
              {correctStreak >= 3 && (
                <span className="text-yellow-400 font-black animate-pulse text-xs">
                  🔥 Streak: {correctStreak}
                </span>
              )}
              <span className="text-red-400 flex items-center gap-0.5" aria-label={`Strikes ${misses} of ${strikeLimit}`}>
                {Array.from({ length: strikeLimit }).map((_, i) => (
                  <span key={i} className={i < misses ? "strike-heart strike-heart-lost" : "strike-heart"}>
                    {i < misses ? "🖤" : "❤️"}
                  </span>
                ))}
              </span>
            </div>
            <div className="piece-preview-row game-board-width">
              <PiecePreview label="Hold" piece={heldPiece} muted={!heldPiece || holdUsed} />
              <div className="piece-preview-mission">
                <span>HOW TO WIN</span>
                <strong>Complete BOTH goals below</strong>
              </div>
              <PiecePreview label="Next" piece={nextPiece} />
            </div>

            {nearWin && (
              <div className="match-point-banner game-board-width">
                🎯 MATCH POINT — {runTarget - totalScore} to score goal!
              </div>
            )}
            {waitingOnMission && (
              <div className="match-point-banner game-board-width">
                SCORE COMPLETE — Mission remaining: {runConfig.objective.label} ({objectiveStatus.current}/{objectiveStatus.required})
              </div>
            )}
              {runMode === "endless" ? (
                <div className="win-goals game-board-width" aria-label="Endless status">
                  <div className={totalScore >= runTarget ? "win-goal win-goal-complete" : "win-goal"}>
                    <span>{totalScore >= runTarget ? "✓" : "1"} STAGE TARGET</span>
                    <strong>{totalScore}/{runTarget} points</strong>
                  </div>
                  <div className={speedWavePieces > 0 ? "win-goal bg-amber-500/20 border-amber-500/30 text-amber-300 animate-pulse" : "win-goal"}>
                    <span>{speedWavePieces > 0 ? "⚠️" : "⚡"} HAZARD METER</span>
                    <strong>
                      {speedWavePieces > 0 
                        ? `SPEED WAVE: ${speedWavePieces} left!` 
                        : `Next Hazard: in ${5 - ((endlessLevel - 1) % 5)} stages`}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="win-goals game-board-width" aria-label="Level win requirements">
                  <div className={scoreGoalComplete ? "win-goal win-goal-complete" : "win-goal"}>
                    <span>{scoreGoalComplete ? "✓" : "1"} SCORE GOAL</span>
                    <strong>{totalScore}/{runTarget} points</strong>
                  </div>
                  <div className={objectiveStatus.complete ? "win-goal win-goal-complete" : "win-goal"}>
                    <span>{objectiveStatus.complete ? "✓" : "2"} LEVEL MISSION</span>
                    <strong>{runConfig.objective.label} · {objectiveStatus.current}/{objectiveStatus.required}</strong>
                  </div>
                </div>
              )}

              {activeMutator && (
                <div className={`game-board-width mt-2 p-2.5 rounded-xl border bg-gradient-to-r ${MUTATOR_DETAILS[activeMutator].color} text-[11px] font-black tracking-wide uppercase text-center shadow`}>
                  MUTATOR ACTIVE: {MUTATOR_DETAILS[activeMutator].emoji} {MUTATOR_DETAILS[activeMutator].name}
                </div>
              )}

              {isFrenzyActive && (
                <div className="game-board-width mt-2 p-2.5 rounded-xl border border-rose-500 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 text-[11px] font-black tracking-wide uppercase text-center shadow-lg text-white animate-pulse shadow-pink-500/30">
                  ⚡ FRENZY ACTIVE: SPEED DOUBLED · 2x SCORE MULTIPLIER! ⚡
                </div>
              )}

              {isDesperationActive && (
                <div className="game-board-width mt-2 p-2.5 rounded-xl border border-red-500 bg-gradient-to-r from-red-800 via-orange-900 to-amber-950 text-[11px] font-black tracking-wide uppercase text-center shadow-lg text-amber-200 animate-pulse shadow-red-500/40">
                  ⚠️ DESPERATION ACTIVE: TIME SLOWED · OBSTACLES ARE HEAVIER 🪨
                </div>
              )}

              {coolingRemaining > 0 && (
                <div className="game-board-width mt-2 p-2.5 rounded-xl border border-blue-500 bg-gradient-to-r from-blue-900 to-indigo-950 text-[11px] font-black tracking-wide uppercase text-center shadow text-blue-300 animate-pulse">
                  ❄️ COOLING ACTIVE: Gravity slowed · Heavy stones spawning · {coolingRemaining} blocks remaining
                </div>
              )}
              {heatLevel > 0 && coolingRemaining === 0 && (
                <div className={`game-board-width mt-2 p-2.5 rounded-xl border ${heatLevel === 5 ? "border-red-500 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-600 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]" : "border-amber-500 bg-gradient-to-r from-amber-700 to-orange-800 text-amber-200"} text-[11px] font-black tracking-wide uppercase text-center shadow`}>
                  🔥 HEAT LEVEL {heatLevel}/5: Speed +{heatLevel * 10}% {heatLevel >= 3 && "· Visual Overdrive!"}
                </div>
              )}

              {Object.entries(BOARD_POWERS).some(([id]) => stats.unlockedItems.includes(id)) && (
                <div className="power-deck game-board-width" aria-label="Power Deck">
                  <span>POWER DECK</span>
                  {Object.entries(BOARD_POWERS).map(([id, power]) => {
                    if (!stats.unlockedItems.includes(id)) return null;
                    const used = usedPowers.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => activateBoardPower(id)}
                        disabled={used || gameState !== "quiz"}
                        className={`power-deck-button power-deck-${power.effect}`}
                        title={`${power.name}: ${power.description}`}
                        aria-label={`${power.name}${used ? " used" : ""}`}
                      >
                        <b><PowerIcon powerId={id} power={power} /></b>
                        <small>{used ? "USED" : power.name}</small>
                      </button>
                    );
                  })}
                </div>
              )}

            <div
              className={`game-board ${getBoardThemeClass(stats.activeTheme)} p-1 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden touch-none ${shake ? (isDesperationActive || heatLevel >= 3 || correctStreak >= 5 || misses >= strikeLimit - 1 ? "animate-shake-amplified" : "animate-shake") : ""} ${boardRecoil ? "animate-board-recoil" : ""} ${boardThump ? "animate-board-thump" : ""} ${isDesperationActive ? "desperation-active animate-critical-shake" : coolingRemaining > 0 ? "cooling-active" : (heatLevel === 5 || correctStreak >= 5) ? "fever-active" : heatLevel === 4 ? "combo-heat-3" : heatLevel === 3 ? "combo-heat-2" : (heatLevel >= 1 || correctStreak >= 3) ? "combo-heat-1" : ""} ${heatLevel === 3 || heatLevel === 4 ? "chromatic-aberration-1" : heatLevel === 5 ? "chromatic-aberration-2" : ""} ${electrify ? "electrify-active" : ""}`}
              onTouchStart={handleBoardTouchStart}
              onTouchEnd={handleBoardTouchEnd}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isExploding = explodingCells.some((item) => item.y === y && item.x === x);

                  // Apply active styles including Matrix code values for Retro theme
                  let cellColorClass = cell
                    ? (cell.isLava ? "" : getThemeCellColor(cell.color, stats.activeTheme))
                    : getEmptyCellColor(stats.activeTheme);
                  let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none ${cellColorClass}`;

                  if (cell?.isGhost) {
                    // Landing preview: faint, dashed outline of the live piece's resting spot.
                    cellClass += " ghost-block";
                  } else {
                    if (cell?.isLava) {
                      cellClass += " border-2 border-orange-600 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-500 via-orange-500 to-yellow-600 animate-glow-lava";
                    } else if (cell?.isStone) {
                      cellClass += cell.isHeavyStone
                        ? " border-2 border-zinc-500 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-700 to-zinc-950 shadow-[0_0_8px_rgba(24,24,27,0.8)]"
                        : " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                    }
                    if (cell?.isTNT) cellClass += " animate-glow-tnt";
                    if (cell?.isDrill) cellClass += " animate-glow-drill";
                    if (cell?.isLightning) cellClass += " animate-glow-lightning";
                    if (cell?.isRowClear) cellClass += " animate-glow-row";
                    if (cell?.isArea2x2Clear) cellClass += " animate-glow-area";

                    if (isExploding) {
                      cellClass += ` block-detonating block-detonating-${blastEffect}`;
                    } else if (cell) {
                      cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";
                      if (cell.landedAt && Date.now() - cell.landedAt < 300) {
                        cellClass += " animate-block-settle";
                      }
                    }
                  }

                  // Retro matrix digit renderer
                  const displayText = (stats.activeTheme === "theme_retro" && cell && !cell.emoji && !cell.isStone && !cell.isGhost)
                    ? (((y + x) % 2 === 0) ? "0" : "1")
                    : cell?.emoji || "";

                  return (
                    <div key={`${y}-${x}`} className={cellClass}>
                      {displayText}
                    </div>
                  );
                })
              )}

              {electrify && (
                <div className="board-electrify" aria-hidden="true">
                  <div className="board-electrify-arc" />
                  <span className="bolt" style={{ left: "12%", animationDelay: "0ms" }} />
                  <span className="bolt" style={{ left: "30%", animationDelay: "60ms" }} />
                  <span className="bolt" style={{ left: "50%", animationDelay: "20ms" }} />
                  <span className="bolt" style={{ left: "68%", animationDelay: "90ms" }} />
                  <span className="bolt" style={{ left: "86%", animationDelay: "40ms" }} />
                </div>
              )}

              <BoardParticlesCanvas
                explodingCells={explodingCells}
                correctStreak={correctStreak}
                effectType={blastEffect}
                activePiece={activePiece}
                lastPlacedPiece={lastPlacedPiece}
              />

              {/* Floating Combo / Points Feedback Popups */}
              {floatingTexts.map((t) => (
                <div
                  key={t.id}
                  className="absolute z-30 font-black text-sm md:text-base text-yellow-400 pointer-events-none animate-float-text select-none text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  style={{
                    top: `${(t.y / BOARD_HEIGHT) * 100}%`,
                    left: `${(t.x / BOARD_WIDTH) * 100}%`,
                  }}
                >
                  {t.text}
                </div>
              ))}

              {gameState === "dropping" && !isControllable && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center border-4 border-slate-500">
                  <h3 className="text-slate-300 font-bold mb-2 uppercase tracking-widest text-sm drop-shadow-lg">STONE BLOCK DROP!</h3>
                  <h4 className="text-red-400 font-bold mb-2 uppercase tracking-widest text-xs drop-shadow-lg">Correct Answer:</h4>
                  <span className="text-white text-3xl font-black animate-bounce drop-shadow-2xl">{lastCorrectAnswer}</span>
                </div>
              )}
            </div>

            {gameState === "dropping" && isControllable && (
              <div className="game-controls mt-2 lg:hidden flex flex-col gap-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  <button type="button" onClick={() => moveHorizontal(-1)} className="mobile-control-button" aria-label="Move left">←</button>
                  <button type="button" onClick={rotatePiece} className="mobile-control-button" aria-label="Rotate">↑</button>
                  <button type="button" onClick={moveDown} className="mobile-control-button" aria-label="Soft drop">↓</button>
                  <button type="button" onClick={() => moveHorizontal(1)} className="mobile-control-button" aria-label="Move right">→</button>
                </div>
                <div className="grid grid-cols-[0.7fr_1.3fr] gap-1.5">
                  <button
                    type="button"
                    onClick={holdCurrentPiece}
                    disabled={holdUsed}
                    className="mobile-hold-button"
                    aria-label="Hold or swap piece"
                  >
                    {holdUsed ? "HOLD USED" : "↔ HOLD"}
                  </button>
                  <button type="button" onClick={hardDrop} className="mobile-drop-button" aria-label="Hard drop to bottom">⬇ DROP ⬇</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Level Intro Preview Screen (LOADING SCREEN) */}
        {!isMenu && gameState === "intro" && (
          <section className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center p-6 bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl relative overflow-hidden z-10 animate-float min-h-[450px]">
            <BrainSparksCanvas />

            {/* Pulsing glow brain */}
            <svg viewBox="0 0 100 100" className="w-24 h-24 text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.85)] animate-pulse mb-6 z-10">
              <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                d="M35,45 C28,45 22,38 28,30 C32,25 40,25 45,33 C48,25 56,25 60,30 C66,38 60,45 53,45" />
              <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                d="M35,45 C35,62 48,68 50,75 C52,68 65,62 65,45" />
              <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                d="M50,28 L50,75 M32,45 H68" />
              <circle cx="38" cy="35" r="1.5" fill="#a855f7" className="animate-ping" />
              <circle cx="62" cy="35" r="1.5" fill="#a855f7" className="animate-ping" />
              <circle cx="50" cy="52" r="1.5" fill="#22d3ee" className="animate-ping" />
            </svg>

            <span className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-1 z-10">
              PREPARING LEVEL {level}
            </span>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-6 z-10 drop-shadow-md">
              {currentLevel.name}
            </h2>

            {/* MUTATOR WHEEL SCREEN */}
            {activeMutator && (
              <div className="w-full max-w-md mx-auto mb-6 p-4 rounded-2xl bg-slate-900/50 border border-slate-700/40 backdrop-blur-md text-center z-10 shadow-lg mutator-wheel-card">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider block mb-2">
                  Mutator Wheel
                </span>
                {wheelState === "spinning" ? (
                  <div className="flex flex-col items-center py-2 animate-pulse">
                    <div className="w-10 h-10 rounded-full border-4 border-dashed border-purple-500 animate-spin mb-2"></div>
                    <div className="text-sm font-bold text-slate-300">
                      Spinning: {MUTATOR_DETAILS[Object.keys(MUTATOR_DETAILS)[wheelIndex]]?.name}
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-xl border bg-gradient-to-r ${MUTATOR_DETAILS[activeMutator].color} transition-all duration-500 scale-100 animate-bounce shadow-lg ${MUTATOR_DETAILS[activeMutator].glow} mutator-wheel-glow-active`}>
                    <div className="text-3xl mb-1">{MUTATOR_DETAILS[activeMutator].emoji}</div>
                    <div className="text-lg font-black tracking-wide uppercase">
                      {MUTATOR_DETAILS[activeMutator].name} ACTIVATED!
                    </div>
                    <div className="text-xs font-semibold mt-1 opacity-90">
                      {MUTATOR_DETAILS[activeMutator].desc}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="intro-win-brief z-10">
              <div className="intro-win-title">HOW TO WIN: COMPLETE BOTH GOALS</div>
              <div className="intro-win-goals">
                <div className="intro-win-goal intro-win-goal-score">
                  <span>1</span>
                  <div>
                    <small>SCORE GOAL</small>
                    <strong>Reach {runTarget} points</strong>
                  </div>
                </div>
                <div className="intro-win-goal intro-win-goal-mission">
                  <span>2</span>
                  <div>
                    <small>LEVEL MISSION</small>
                    <strong>{runConfig.objective.label}</strong>
                  </div>
                </div>
              </div>
              <p>Scoring enough points alone does not win the level.</p>
              {runMode === "ai_race" && (
                <p className="intro-ai-race-note">
                  Race Byte on the same level. First to complete both goals wins.
                </p>
              )}
            </div>

            {/* Curated Fact card */}
            <div className="intro-fact-card w-full max-w-md bg-slate-950/60 border border-slate-700/50 p-5 rounded-2xl shadow-inner text-center z-10 backdrop-blur-md mb-8">
              <h3 className="text-[10px] font-black uppercase text-purple-400 tracking-wider mb-2">Did You Know?</h3>
              <p className="text-slate-200 text-sm md:text-base leading-relaxed font-semibold">
                "{randomFact}"
              </p>
            </div>

            {/* Dramatic countdown indicator */}
            <div className="z-10 flex flex-col items-center">
              <div className="text-slate-400 uppercase font-black tracking-widest text-xs mb-1 animate-pulse">
                Blastoff in
              </div>
              <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 animate-bounce">
                {introCountdown > 0 ? introCountdown : "BLAST!"}
              </div>
            </div>
          </section>
        )}

        {/* Home Screen and Dashboard */}
        {isMenu && (
          menuTab === "levels" ? (
            <div className="menu-panel menu-stage w-full max-w-7xl z-10 overflow-hidden">
              <MenuLightfield />

              <div className="menu-stage-content grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-4 lg:gap-5">
                <section className="menu-hero-panel">
                  <div className="menu-kicker">Quiz Arcade // Block Blast</div>
                  <h1 className="menu-title">
                    Think Fast Blast
                  </h1>
                  <p className="menu-subtitle">
                    Answer fast, steer the falling blocks, and complete both goals to win.
                  </p>

                  <div className="profile-strip">
                    <button
                      type="button"
                      onClick={() => {
                        playSFX("button");
                        setMenuTab("profiles");
                      }}
                      className="profile-chip"
                    >
                      <span className="profile-chip-avatar">{activeProfile?.avatar || "⚡"}</span>
                      <span>
                        <strong>{activeProfile?.name || "Player 1"}</strong>
                        <small>{stats.unlockedAchievements?.length || 0}/{Object.keys(ACHIEVEMENTS).length} achievements</small>
                      </span>
                    </button>
                    <div className="difficulty-switcher" aria-label="Difficulty">
                      {Object.values(DIFFICULTY_PRESETS).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleDifficultyChange(preset.id)}
                          className={difficultyMode === preset.id ? "difficulty-pill difficulty-pill-active" : "difficulty-pill"}
                          title={preset.description}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="menu-hero-actions">
                    <button
                      type="button"
                      onClick={() => startLevel(maxUnlockedLevel)}
                      className="home-action-card home-action-solo"
                    >
                      <span>⚡</span>
                      <strong>Play Solo</strong>
                      <small>Continue at Level {maxUnlockedLevel}</small>
                    </button>
                    <button
                      type="button"
                      onClick={() => startLevel(1, "endless")}
                      className="home-action-card home-action-endless"
                    >
                      <span>♾️</span>
                      <strong>Endless Overdrive</strong>
                      <small>Scale, survive & rank scores</small>
                    </button>
                    <button
                      type="button"
                      onClick={() => { playSFX("button"); setMenuTab("arena"); }}
                      className="home-action-card home-action-friends"
                    >
                      <span>🎮</span>
                      <strong>Play With Friends</strong>
                      <small>AI, local, and online matches</small>
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("shop"); }} className="home-action-card home-action-shop">
                      <span>🛒</span>
                      <strong>Power-Up Shop</strong>
                      <small>Spend Glitches on powers and themes</small>
                    </button>
                  </div>

                  <div className="home-secondary-actions">
                    <button type="button" onClick={() => startLevel(98)}>☀ Daily Challenge</button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("leaderboard"); }}>👑 Leaderboard</button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("achievements"); }}>🏆 Achievements</button>
                    <button
                      type="button"
                      onClick={() => { playSFX("button"); setMenuTab("builder"); }}
                    >
                      🎯 Question Builder
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("instructions"); }}>❔ How To Play</button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("settings"); }}>⚙ Settings</button>
                  </div>

                  <div className="menu-stats-row">
                    <MenuStatPill label="Games" value={stats.totalGames} accent="text-white" />
                    <MenuStatPill label="Accuracy" value={stats.totalQuestions > 0 ? `${Math.round((stats.totalCorrect / stats.totalQuestions) * 100)}%` : "0%"} accent="text-emerald-300" />
                    <MenuStatPill label="Correct" value={stats.totalCorrect} accent="text-cyan-300" />
                    <MenuStatPill label="Glitches" value={`${stats.glitches} 👾`} accent="text-fuchsia-300" />
                  </div>

                  <div className="menu-preview-wrap">
                    <MenuPreviewBoard />
                    {(() => {
                      const pulseLevelObj = LEVELS.find((l) => l.id === maxUnlockedLevel) || LEVELS[0];
                      const bestScoreVal = stats.highScores[maxUnlockedLevel] || 0;
                      const previewTarget = getRunConfig(maxUnlockedLevel, difficultyMode).target;
                      const pulsePercentage = Math.min(100, Math.round((bestScoreVal / previewTarget) * 100));
                      return (
                        <div className="menu-preview-copy">
                          <div className="menu-kicker">Lvl {pulseLevelObj.id} Best Run</div>
                          <div className="menu-preview-score">{bestScoreVal} / {previewTarget}</div>
                          <div className="menu-preview-meter">
                            <span style={{ width: `${pulsePercentage}%` }} />
                          </div>
                          <div className="menu-preview-chips">
                            {bestScoreVal >= previewTarget ? (
                              <>
                                <span className="border-green-500/20 bg-green-500/10 text-green-300">✓ Cleared</span>
                                <span className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">Master</span>
                              </>
                            ) : bestScoreVal >= 300 ? (
                              <>
                                <span className="border-yellow-500/20 bg-yellow-500/10 text-yellow-300">Expert</span>
                                <span className="border-blue-500/20 bg-blue-500/10 text-blue-300">Blast Ready</span>
                              </>
                            ) : bestScoreVal >= 100 ? (
                              <>
                                <span className="border-indigo-500/20 bg-indigo-500/10 text-indigo-300">Challenger</span>
                              </>
                            ) : (
                              <>
                                <span className="border-slate-700/40 bg-slate-800/40 text-slate-400">Ready</span>
                                <span className="border-slate-700/40 bg-slate-800/40 text-slate-400">No Runs</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </section>

                <section className="menu-level-panel">
                  <div className="menu-level-header">
                    <div>
                      <div className="menu-kicker">Challenge Map</div>
                      <h2>Select Your Level</h2>
                    </div>
                    <div className="menu-admin-actions">
                      <button type="button" onClick={() => { playSFX("button"); setMaxUnlockedLevel(FINAL_LEVEL_ID); }} className="menu-mini-button">Unlock All</button>
                      <button
                        type="button"
                        onClick={() => {
                          if(confirm("Reset all statistics and game progress?")) {
                            playSFX("button");
                            setMaxUnlockedLevel(1);
                            const reset = {
                              highScores: {},
                              totalGames: 0,
                              totalCorrect: 0,
                              totalQuestions: 0,
                              glitches: 0,
                              unlockedItems: [],
                              activeTheme: "default",
                              unlockedAchievements: [],
                              bestStreak: 0,
                              dailyStreak: 0,
                              lastDailyWin: "",
                              dailyBest: 0,
                              levelsWon: 0,
                              arenaWins: 0,
                              totalLines: 0,
                              totalMatches: 0,
                              totalFruits: 0,
                              totalSpecials: 0,
                            };
                            setStats(reset);
                            saveStats(reset);
                            writeScopedValue(RECENT_QUESTIONS_STORAGE_KEY, "[]");
                            earnedRef.current = null;
                          }
                        }}
                        className="menu-mini-button menu-mini-danger"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="menu-level-scroll">
                    <div className="level-grid level-grid-showcase">
                      {LEVELS.map((item) => {
                        const isUnlocked = item.id <= maxUnlockedLevel;
                        const bestScore = stats.highScores[item.id] || 0;
                        const cardRunConfig = getRunConfig(item.id, difficultyMode);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!isUnlocked}
                            onClick={() => startLevel(item.id)}
                            className={`level-card level-card-showcase ${
                              isUnlocked ? "level-card-unlocked" : "level-card-locked"
                            }`}
                          >
                            <span className="level-card-number">
                              {String(item.id).padStart(2, "0")}
                            </span>
                            <span className="level-card-meta">
                              {isUnlocked ? item.ageHint : "Locked"}
                            </span>
                            <span className="level-card-title">
                              {item.name}
                            </span>
                            <span className="level-card-theme">
                              {item.theme}
                            </span>
                            {isUnlocked && (
                              <span className="level-card-objective">
                                Win: {cardRunConfig.target} pts + {cardRunConfig.objective.label}
                              </span>
                            )}
                            {isUnlocked && bestScore > 0 && (
                              <span className="level-card-best">
                                Best {bestScore}
                              </span>
                            )}
                            {!isUnlocked && (
                              <span className="level-card-lock">Locked</span>
                            )}
                          </button>
                        );
                      })}
                      {/* Special Custom Level Card */}
                      {customQuestions.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => startLevel(99)}
                          className="level-card level-card-showcase level-card-unlocked border border-cyan-400 bg-cyan-950/20 shadow-[0_0_12px_rgba(34,211,238,0.25)] hover:border-cyan-300"
                        >
                          <span className="level-card-number text-cyan-400">🎯</span>
                          <span className="level-card-meta text-cyan-300">{customQuestions.length} Qs</span>
                          <span className="level-card-title text-white">Custom Pack</span>
                          <span className="level-card-theme text-cyan-200">Your personalized quiz</span>
                          <span className="level-card-best">Play Pack</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="level-card level-card-showcase level-card-locked opacity-50 cursor-not-allowed"
                        >
                          <span className="level-card-number text-slate-500">🎯</span>
                          <span className="level-card-meta text-slate-500">0 Qs</span>
                          <span className="level-card-title text-slate-400">Custom Pack</span>
                          <span className="level-card-theme text-slate-500">Empty Pack</span>
                          <span className="level-card-lock text-xs text-amber-500/80">Builder Empty</span>
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : menuTab === "arena" ? (
            <div className="menu-panel w-full max-w-4xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-6 z-10 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3 mb-4 shrink-0">
                <div className="text-left">
                  <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-rose-400">
                    🎮 Play With Friends
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    1vAI · Local 1v1 · Online 1v1 or 3-4 player free-for-all
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { playSFX("button"); setMenuTab("levels"); }}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-5 rounded-xl text-xs border border-slate-600 shadow-md transition-colors"
                >
                  Back to Menu
                </button>
              </div>

              <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 overflow-y-auto pr-1">
                <div className="flex-1 space-y-5 text-left bg-slate-900/40 p-4 rounded-2xl border border-slate-700/30">
                  <div>
                    <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2">1. Select Mode</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => { playSFX("button"); setArenaMode("vs_ai"); }}
                        className={`py-3 px-4 rounded-xl text-sm font-black uppercase transition-all flex flex-col items-center justify-center border ${
                          arenaMode === "vs_ai"
                            ? "bg-purple-600 border-purple-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)] scale-[1.02]"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="text-2xl mb-1">🤖</span>
                        VS AI Bot
                      </button>
                      <button
                        type="button"
                        onClick={() => { playSFX("button"); setArenaMode("vs_player"); }}
                        className={`py-3 px-4 rounded-xl text-sm font-black uppercase transition-all flex flex-col items-center justify-center border ${
                          arenaMode === "vs_player"
                            ? "bg-purple-600 border-purple-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)] scale-[1.02]"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="text-2xl mb-1">🎮</span>
                        Local 1v1
                      </button>
                      <button
                        type="button"
                        onClick={() => { playSFX("button"); setArenaMode("online"); }}
                        className={`py-3 px-2 rounded-xl text-sm font-black uppercase transition-all flex flex-col items-center justify-center border ${
                          arenaMode === "online"
                            ? "bg-cyan-600 border-cyan-300 text-white shadow-[0_0_12px_rgba(34,211,238,0.35)] scale-[1.02]"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="text-2xl mb-1">🌐</span>
                        Online Duel / FFA
                      </button>
                    </div>
                  </div>

                  {arenaMode === "vs_ai" && (
                    <div className="animate-float-text">
                      <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2">2. AI Difficulty</h3>
                      <div className="flex gap-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                        {["easy", "medium", "hard"].map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => { playSFX("button"); setAiDifficulty(diff); }}
                            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${
                              aiDifficulty === diff
                                ? "bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.25)]"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 font-semibold italic">
                        {aiDifficulty === "easy" && "🤖 Easy: Bot answers slowly and misses occasionally."}
                        {aiDifficulty === "medium" && "🤖 Medium: Bot answers steadily with solid accuracy."}
                        {aiDifficulty === "hard" && "⚡ Hard: Bot answers very fast and rarely makes mistakes!"}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2">
                      {arenaMode === "online" ? "2. Cross-Device Play" : arenaMode === "vs_player" ? "2. Local Split Controls" : "3. Local Controls"}
                    </h3>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] font-semibold text-slate-300 leading-relaxed space-y-1.5">
                      {arenaMode === "online" ? (
                        <div><strong className="text-cyan-300">Room Codes:</strong> Two devices play a 1v1 duel. Three or four devices play a free-for-all. Each player gets one full-size board.</div>
                      ) : arenaMode === "vs_ai" ? (
                        <div><strong className="text-cyan-300">Full-Screen AI Race:</strong> Play exactly like campaign mode. You and Byte answer independently; the first racer to reach the score target and complete the level mission wins.</div>
                      ) : (
                        <div><strong className="text-cyan-300">P1 (Left):</strong> Keys <kbd className="bg-slate-800 text-white px-1 rounded">1</kbd>-<kbd className="bg-slate-800 text-white px-1 rounded">4</kbd> to answer · <kbd className="bg-slate-800 text-white px-1 rounded">W/A/S/D</kbd> to steer · <kbd className="bg-slate-800 text-white px-1 rounded">Space</kbd> drop</div>
                      )}
                      {arenaMode === "vs_player" && (
                        <div><strong className="text-fuchsia-300">P2 (Right):</strong> Keys <kbd className="bg-slate-800 text-white px-1 rounded">7</kbd>-<kbd className="bg-slate-800 text-white px-1 rounded">0</kbd> (or <kbd className="bg-slate-800 text-white px-1 rounded">U/I/O/P</kbd>) to answer · <kbd className="bg-slate-800 text-white px-1 rounded">Arrows</kbd> to steer · <kbd className="bg-slate-800 text-white px-1 rounded">Enter</kbd> drop</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-slate-900/40 p-4 rounded-2xl border border-slate-700/30">
                  <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2 text-left">
                    {arenaMode === "online" ? "3. Select Trivia Pack" : arenaMode === "vs_player" ? "3. Select Trivia Pack" : "4. Select Trivia Pack"}
                  </h3>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => { playSFX("button"); setArenaLevel(lvl.id); }}
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                          arenaLevel === lvl.id
                            ? "bg-purple-950/40 border-purple-500/50 text-white shadow-inner"
                            : "bg-slate-950/40 border-slate-800/80 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black text-white">{lvl.id}. {lvl.name}</span>
                          <span className="block text-[10px] text-slate-400 font-semibold">{lvl.theme}</span>
                        </div>
                        <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-black text-purple-300">
                          {lvl.ageHint}
                        </span>
                      </button>
                    ))}
                    {customQuestions.length > 0 && (
                      <button
                        key={99}
                        type="button"
                        onClick={() => { playSFX("button"); setArenaLevel(99); }}
                        className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                          arenaLevel === 99
                            ? "bg-purple-950/40 border-purple-500/50 text-white shadow-inner"
                            : "bg-slate-950/40 border-slate-800/80 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <span className="block text-xs font-black text-cyan-300">🎯 Custom Pack</span>
                          <span className="block text-[10px] text-slate-400 font-semibold">{customQuestions.length} custom questions</span>
                        </div>
                        <span className="text-[10px] bg-cyan-950 border border-cyan-900 px-2 py-0.5 rounded font-black text-cyan-300">
                          Custom
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/50 shrink-0">
                <button
                  type="button"
                  onClick={() => arenaMode === "online"
                    ? startOnlineArena()
                    : arenaMode === "vs_ai"
                      ? startLevel(arenaLevel, "ai_race")
                      : startArenaMatch(arenaMode, aiDifficulty, arenaLevel)}
                  className="w-full bg-gradient-to-r from-purple-600 to-rose-500 hover:from-purple-500 hover:to-rose-400 text-white font-black py-3 px-6 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:scale-[1.01] transition-transform text-sm font-black uppercase tracking-widest text-center"
                >
                  {arenaMode === "online" ? "🌐 OPEN ONLINE LOBBY" : arenaMode === "vs_ai" ? "🤖 START FULL-SCREEN AI RACE" : "🔥 START ARENA DUEL"}
                </button>
              </div>
            </div>
          ) : menuTab === "profiles" ? (
            <div className="menu-panel w-full max-w-4xl bg-slate-800/85 backdrop-blur-xl border border-cyan-400/20 rounded-3xl shadow-2xl p-4 md:p-6 z-10 overflow-y-auto">
              <div className="flex items-center justify-between gap-4 border-b border-slate-700/60 pb-4 mb-5">
                <div className="text-left">
                  <div className="menu-kicker">Local Save Slots</div>
                  <h2 className="text-2xl md:text-3xl font-black text-white">Player Profiles</h2>
                  <p className="text-xs font-semibold text-slate-400 mt-1">
                    Each profile keeps separate progress, records, unlocks, difficulty, and question history.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSFX("button");
                    setMenuTab("levels");
                  }}
                  className="menu-ghost-button"
                >
                  Back
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {profiles.map((profile) => {
                  const isActive = profile.id === activeProfileId;
                  const savedLevel = isActive ? maxUnlockedLevel : readProfileProgress(profile.id);
                  return (
                    <article key={profile.id} className={isActive ? "profile-card profile-card-active" : "profile-card"}>
                      <div className="profile-card-avatar">{profile.avatar}</div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-lg font-black text-white">{profile.name}</h3>
                          {isActive && <span className="profile-active-badge">Active</span>}
                        </div>
                        <p className="text-xs font-bold text-slate-400">
                          {DIFFICULTY_PRESETS[profile.difficulty]?.label || "Medium"} · Level {savedLevel} unlocked
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleProfileSwitch(profile.id)}
                            className="menu-mini-button"
                          >
                            Play
                          </button>
                        )}
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProfile(profile.id)}
                            className="menu-mini-button menu-mini-danger"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 rounded-2xl border border-slate-700/60 bg-slate-950/45 p-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="profile-name" className="block text-left text-[10px] font-black uppercase tracking-widest text-cyan-300">
                    New Profile · {profiles.length}/{MAX_PROFILES} Slots Used
                  </label>
                  <input
                    id="profile-name"
                    value={profileNameDraft}
                    onChange={(event) => setProfileNameDraft(event.target.value)}
                    maxLength={18}
                    disabled={profiles.length >= MAX_PROFILES}
                    placeholder={`Player ${profiles.length + 1}`}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
                  />
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="Choose avatar">
                    {PROFILE_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setProfileAvatarDraft(avatar)}
                        className={profileAvatarDraft === avatar ? "profile-avatar-choice profile-avatar-choice-active" : "profile-avatar-choice"}
                        aria-label={`Use ${avatar} avatar`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCreateProfile}
                    disabled={profiles.length >= MAX_PROFILES}
                    className="menu-primary-button"
                  >
                    {profiles.length >= MAX_PROFILES ? "All 5 Profiles Used" : "Create Profile"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      prepareOnboardingDrafts(activeProfile, maxUnlockedLevel);
                      setOnboardingStep(1);
                      setShowOnboarding(true);
                    }}
                    className="menu-ghost-button"
                  >
                    Replay Tutorial
                  </button>
                </div>
              </div>
            </div>
          ) : menuTab === "settings" ? (
            <div className="menu-panel settings-panel w-full max-w-3xl z-10">
              <div className="settings-header">
                <div className="text-left">
                  <div className="menu-kicker">Player Preferences</div>
                  <h2>Settings</h2>
                  <p>Audio, motion, touch feedback, and visual clarity.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSFX("button");
                    setMenuTab("levels");
                  }}
                  className="menu-ghost-button"
                >
                  Back
                </button>
              </div>

              <section className="settings-section">
                <div>
                  <h3>Audio Mix</h3>
                  <p>Music intensifies with danger and streak pressure. Set each layer independently.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAudioOn((enabled) => !enabled)}
                  className={audioOn ? "settings-toggle settings-toggle-active" : "settings-toggle"}
                  aria-pressed={audioOn}
                >
                  <span>All Audio</span>
                  <strong>{audioOn ? "On" : "Muted"}</strong>
                </button>
                <div className="settings-volume-grid">
                  {[
                    ["Master", masterVol, handleMasterVolChange],
                    ["Music", musicVol, handleMusicVolChange],
                    ["SFX", sfxVol, handleSfxVolChange],
                  ].map(([label, value, onChange]) => (
                    <label key={label}>
                      <span>{label}</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                      />
                      <strong>{Math.round(value * 100)}%</strong>
                    </label>
                  ))}
                </div>
              </section>

              <section className="settings-section">
                <div>
                  <h3>Comfort & Accessibility</h3>
                  <p>These settings save on this device and apply to every local profile.</p>
                </div>
                <div className="settings-choice-grid">
                  {[
                    ["Reduce Motion", "Minimizes transitions and animated effects.", reduceMotion, setReduceMotion],
                    ["Screen Shake", "Adds impact to hard drops and explosions.", screenShakeEnabled, setScreenShakeEnabled],
                    ["Haptics", "Uses vibration on supported mobile devices.", hapticsEnabled, setHapticsEnabled],
                    ["High Contrast", "Strengthens separation between UI layers.", highContrast, setHighContrast],
                  ].map(([label, description, enabled, setter]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setter(!enabled)}
                      className={enabled ? "settings-choice settings-choice-active" : "settings-choice"}
                      aria-pressed={enabled}
                    >
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <b>{enabled ? "On" : "Off"}</b>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : menuTab === "leaderboard" ? (
            <EndlessLeaderboardView
              stats={stats}
              activeProfile={activeProfile}
              onBack={() => {
                playSFX("button");
                setMenuTab("levels");
              }}
            />
          ) : menuTab === "achievements" ? (
            <div className="menu-panel achievement-cabinet w-full max-w-5xl z-10">
              <div className="achievement-cabinet-header">
                <div className="text-left">
                  <div className="menu-kicker">Profile Progress</div>
                  <h2>Achievement Cabinet</h2>
                  <p>
                    {stats.unlockedAchievements?.length || 0} of {Object.keys(ACHIEVEMENTS).length} earned
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSFX("button");
                    setMenuTab("levels");
                  }}
                  className="menu-ghost-button"
                >
                  Home
                </button>
              </div>

              <div className="achievement-summary">
                <MenuStatPill label="Levels Won" value={stats.levelsWon || 0} accent="text-amber-300" />
                <MenuStatPill label="Best Streak" value={`x${stats.bestStreak || 0}`} accent="text-orange-300" />
                <MenuStatPill label="Board Clears" value={(stats.totalLines || 0) + (stats.totalMatches || 0)} accent="text-cyan-300" />
                <MenuStatPill label="Arena Wins" value={stats.arenaWins || 0} accent="text-fuchsia-300" />
              </div>

              <div className="achievement-grid">
                {Object.entries(ACHIEVEMENTS).map(([id, definition]) => (
                  <AchievementCard
                    key={id}
                    id={id}
                    definition={definition}
                    unlocked={stats.unlockedAchievements?.includes(id)}
                    stats={stats}
                    maxUnlockedLevel={maxUnlockedLevel}
                  />
                ))}
              </div>
            </div>
          ) : menuTab === "shop" ? (
            // Power-up and cosmetic store
            <div className="menu-panel w-full max-w-4xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-5 z-10">
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3 mb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-rose-400">
                    🛒 Power-Up Shop
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Permanent powers, special blocks, and board themes
                  </p>
                </div>

                {/* Glitches count badge */}
                <div className="bg-slate-950/60 px-4 py-2 rounded-full border border-purple-500/40 text-purple-300 font-black flex items-center gap-2 shadow-inner text-sm">
                  <span>👾 Glitches:</span>
                  <span className="text-white text-base font-black">{stats.glitches}</span>
                </div>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {SHOP_ITEMS.map((item) => {
                  const isUnlocked = stats.unlockedItems.includes(item.id);
                  const isActiveTheme = stats.activeTheme === item.id;
                  const canAfford = stats.glitches >= item.cost;

                  const handleUnlock = () => {
                    if (!canAfford) return;
                    playSFX("unlock");
                    const nextUnlocked = [...stats.unlockedItems, item.id];
                    const updated = {
                      ...stats,
                      glitches: stats.glitches - item.cost,
                      unlockedItems: nextUnlocked,
                      activeTheme: item.type === "theme" ? item.id : stats.activeTheme
                    };
                    setStats(updated);
                    saveStats(updated);
                  };

                  const handleEquip = () => {
                    playSFX("theme");
                    const updated = {
                      ...stats,
                      activeTheme: item.id
                    };
                    setStats(updated);
                    saveStats(updated);
                  };

                  return (
                    <div key={item.id} className="p-3 bg-slate-900/70 border border-slate-700/50 rounded-2xl flex items-center justify-between gap-4 shadow-xl hover:border-purple-500/30 transition-colors">
                      <div className="text-left flex-1 min-w-0">
                        <span className="inline-block bg-purple-900/40 text-[9px] font-black uppercase text-purple-300 tracking-wider px-2 py-0.5 rounded border border-purple-500/20">
                          {item.type}
                        </span>
                        <h3 className="text-sm md:text-base font-black text-white mt-1.5 truncate">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-normal font-semibold">
                          {item.desc}
                        </p>

                        <div className="mt-3">
                          {isUnlocked ? (
                            item.type === "theme" ? (
                              isActiveTheme ? (
                                <span className="inline-block bg-purple-500/20 text-purple-300 border border-purple-500/40 font-black text-[11px] px-3 py-1 rounded-lg">
                                  ✓ Active Theme
                                </span>
                              ) : (
                                <button type="button" onClick={handleEquip} className="bg-slate-700 hover:bg-slate-600 text-white font-black text-[11px] px-3 py-1 rounded-lg border border-slate-600 shadow-md">
                                  Equip Theme
                                </button>
                              )
                            ) : (
                              <span className="inline-block bg-green-500/20 text-green-300 border border-green-500/40 font-black text-[11px] px-3 py-1 rounded-lg">
                                ✓ Perk Unlocked
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={handleUnlock}
                              disabled={!canAfford}
                              className={`font-black text-[11px] px-3 py-1.5 rounded-lg border transition shadow-md ${
                                canAfford
                                  ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-purple-400"
                                  : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed shadow-none"
                              }`}
                            >
                              Buy for {item.cost} 👾
                            </button>
                          )}
                        </div>
                      </div>

                      <StoreItemPreview itemId={item.id} />
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center mt-5 border-t border-slate-700/50 pt-3">
                {stats.activeTheme !== "default" ? (
                  <button
                    type="button"
                    onClick={() => {
                      playSFX("button");
                      const updated = { ...stats, activeTheme: "default" };
                      setStats(updated);
                      saveStats(updated);
                    }}
                    className="text-xs text-slate-400 hover:text-white underline font-bold"
                  >
                    Reset to Default Theme
                  </button>
                ) : <div />}
                <button type="button" onClick={() => { playSFX("button"); setMenuTab("levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-6 rounded-xl text-xs border border-slate-600 shadow-md">
                    Home
                </button>
              </div>
            </div>
          ) : menuTab === "builder" ? (
            <div className="menu-panel w-full max-w-5xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-6 z-10 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3 mb-4 shrink-0">
                <div className="text-left">
                  <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-400">
                    🎯 Custom Question Builder
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Personalize ThinkFast Blast with your own topics, lessons, or homework trivia
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { playSFX("button"); setMenuTab("levels"); }}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-5 rounded-xl text-xs border border-slate-600 shadow-md transition-colors"
                >
                  Back to Levels
                </button>
              </div>

              {/* Columns Container */}
              <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6 overflow-y-auto md:overflow-visible">
                {/* Left Column: Creator / Uploader */}
                <div className="flex-1 min-h-0 flex flex-col bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4">
                  {/* Sub-tabs: Manual vs Document Upload */}
                  <div className="flex gap-2 mb-4 bg-slate-950/60 p-1 rounded-xl border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => { playSFX("button"); setBuilderSubTab("manual"); }}
                      className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${
                        builderSubTab === "manual"
                          ? "bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ✍ Create Manually
                    </button>
                    <button
                      type="button"
                      onClick={() => { playSFX("button"); setBuilderSubTab("upload"); }}
                      className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${
                        builderSubTab === "upload"
                          ? "bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      📂 Document AI Generator
                    </button>
                  </div>

                  {/* Sub-tab content */}
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    {builderSubTab === "manual" ? (
                      /* Manual Creation Form */
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!manualQuestion.trim() || manualOptions.some(o => !o.trim())) {
                            alert("Please fill in the question and all four options.");
                            return;
                          }
                          const newQ = {
                            q: manualQuestion.trim(),
                            options: manualOptions.map(o => o.trim()),
                            answer: manualAnswer
                          };
                          setCustomQuestions(prev => [...prev, newQ]);
                          setManualQuestion("");
                          setManualOptions(["", "", "", ""]);
                          setManualAnswer(0);
                          playSFX("correct");
                        }}
                        className="space-y-4 text-left"
                      >
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">Question Text</label>
                          <textarea
                            value={manualQuestion}
                            onChange={(e) => setManualQuestion(e.target.value)}
                            placeholder="e.g. Which planet is known as the Ringed Planet?"
                            className="w-full bg-slate-950/60 border border-slate-700/60 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors text-sm"
                            rows={3}
                            required
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {manualOptions.map((opt, idx) => (
                            <div key={idx}>
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">
                                Option {String.fromCharCode(65 + idx)} {idx === manualAnswer ? <span className="text-green-400 font-black">(Correct)</span> : ""}
                              </label>
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) => {
                                  const next = [...manualOptions];
                                  next[idx] = e.target.value;
                                  setManualOptions(next);
                                }}
                                placeholder={`Answer Option ${String.fromCharCode(65 + idx)}`}
                                className={`w-full bg-slate-950/60 border rounded-xl px-4 py-2 text-white focus:outline-none transition-colors text-sm ${
                                  idx === manualAnswer ? "border-green-500/50 focus:border-green-400" : "border-slate-700/60 focus:border-cyan-400"
                                }`}
                                required
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-slate-800">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select Correct Answer:</span>
                            <div className="flex gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
                              {[0, 1, 2, 3].map((idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setManualAnswer(idx)}
                                  className={`w-8 h-8 rounded font-black text-xs transition-colors ${
                                    manualAnswer === idx
                                      ? "bg-green-500 text-slate-950 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                                      : "text-slate-400 hover:text-white"
                                  }`}
                                >
                                  {String.fromCharCode(65 + idx)}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 px-6 rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95 text-xs font-black uppercase tracking-widest text-center"
                          >
                            ➕ Add Question
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Document Upload panel */
                      <div className="space-y-4 text-left">
                        {generatedQuestions.length === 0 && !fileUploading ? (
                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleFileDrop}
                            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[220px] ${
                              isDragging
                                ? "border-cyan-400 bg-cyan-950/20 text-cyan-300"
                                : "border-slate-700/80 bg-slate-950/40 text-slate-400 hover:border-slate-600"
                            }`}
                          >
                            <input
                              type="file"
                              accept=".txt,.pdf,.docx"
                              onChange={handleFileSelect}
                              className="hidden"
                              id="builder-file-upload"
                            />
                            <label htmlFor="builder-file-upload" className="cursor-pointer flex flex-col items-center">
                              <span className="text-4xl mb-3">📁</span>
                              <span className="text-sm font-bold text-white mb-1">Drag &amp; drop study guide or notes here</span>
                              <span className="text-xs text-slate-400 mb-3">Or click to browse your files</span>
                              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest border border-slate-800 px-3 py-1 rounded bg-slate-900/60">PDF, DOCX, TXT (Max 5MB)</span>
                            </label>
                          </div>
                        ) : fileUploading ? (
                          /* High-tech AI Processing screen */
                          <div className="border border-cyan-500/20 rounded-2xl p-6 bg-slate-950/40 text-center flex flex-col items-center justify-center min-h-[220px]">
                            <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
                              <div className="absolute inset-0 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
                              <span className="text-2xl animate-pulse">🧠</span>
                            </div>
                            <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest animate-pulse">AI Extracting Trivia...</h3>
                            <p className="text-xs text-slate-400 mt-1 font-semibold">Reading document &amp; generating multiple choice questions</p>
                            <div className="w-48 bg-slate-900 rounded-full h-1.5 mt-4 overflow-hidden border border-slate-800">
                              <div className="bg-cyan-500 h-full transition-all duration-200" style={{ width: `${generationProgress}%` }} />
                            </div>
                          </div>
                        ) : (
                          /* Review Generated Questions List */
                          <div className="space-y-4">
                            <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                              <div>
                                <h4 className="text-xs font-black text-white uppercase tracking-wider">Review Generated Questions</h4>
                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Edit and approve questions to add them to your active pack.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { playSFX("button"); setGeneratedQuestions([]); }}
                                className="text-[10px] text-red-400 hover:text-red-300 font-black uppercase tracking-wider"
                              >
                                Discard All
                              </button>
                            </div>

                            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                              {generatedQuestions.map((gQ, idx) => (
                                <div key={idx} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                                  <div>
                                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1 block">Question {idx + 1}</label>
                                    <input
                                      type="text"
                                      value={gQ.q}
                                      onChange={(e) => {
                                        const next = [...generatedQuestions];
                                        next[idx].q = e.target.value;
                                        setGeneratedQuestions(next);
                                      }}
                                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {gQ.options.map((opt, oIdx) => (
                                      <div key={oIdx}>
                                        <label className="text-[8px] font-bold text-slate-500 block mb-0.5">Option {String.fromCharCode(65 + oIdx)}</label>
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => {
                                            const next = [...generatedQuestions];
                                            next[idx].options[oIdx] = e.target.value;
                                            setGeneratedQuestions(next);
                                          }}
                                          className={`w-full bg-slate-900 border rounded-lg px-2 py-1 text-xs text-white focus:outline-none ${
                                            oIdx === gQ.answer ? "border-green-500/40" : "border-slate-800"
                                          }`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between pt-2 border-t border-slate-900/60">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold text-slate-500 uppercase">Correct Answer:</span>
                                      <select
                                        value={gQ.answer}
                                        onChange={(e) => {
                                          const next = [...generatedQuestions];
                                          next[idx].answer = parseInt(e.target.value);
                                          setGeneratedQuestions(next);
                                        }}
                                        className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-cyan-400"
                                      >
                                        <option value={0}>A</option>
                                        <option value={1}>B</option>
                                        <option value={2}>C</option>
                                        <option value={3}>D</option>
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!gQ.q.trim() || gQ.options.some(o => !o.trim())) {
                                            alert("Please fill all fields.");
                                            return;
                                          }
                                          setCustomQuestions(prev => [...prev, gQ]);
                                          setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx));
                                          playSFX("correct");
                                        }}
                                        className="bg-green-500 text-slate-950 font-black text-[10px] px-2.5 py-1 rounded hover:bg-green-400 transition-colors"
                                      >
                                        ✓ Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx));
                                          playSFX("button");
                                        }}
                                        className="text-red-400 hover:text-red-300 font-bold text-[10px] px-2 py-1"
                                      >
                                        Discard
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Active Pack List */}
                <div className="w-full md:w-[360px] shrink-0 flex flex-col bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4 min-h-0">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      My Question Pack ({customQuestions.length})
                    </h3>
                    {customQuestions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Remove all questions from this custom pack?")) {
                            setCustomQuestions([]);
                            playSFX("button");
                          }
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-wider"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {customQuestions.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-slate-800 border-dashed rounded-xl bg-slate-950/20">
                      <span className="text-3xl mb-2 opacity-50">🎯</span>
                      <h4 className="text-xs font-bold text-slate-400 uppercase">Pack is Empty</h4>
                      <p className="text-[10px] text-slate-500 mt-1 font-semibold leading-normal">
                        Create questions manually or upload a document to get started!
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                      {customQuestions.map((item, idx) => (
                        <div key={idx}>
                          {editingIndex === idx ? (
                            <div className="p-3 bg-slate-950/60 border border-cyan-500/40 rounded-xl text-left space-y-3">
                              <div className="text-[10px] font-black uppercase text-cyan-400">Edit Question</div>
                              <textarea
                                value={editQText}
                                onChange={(e) => setEditQText(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                                rows={2}
                              />
                              <div className="space-y-1.5">
                                {editQOptions.map((opt, oIdx) => (
                                  <input
                                    key={oIdx}
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const next = [...editQOptions];
                                      next[oIdx] = e.target.value;
                                      setEditQOptions(next);
                                    }}
                                    className={`w-full bg-slate-900 border rounded-lg px-2 py-1 text-xs text-white focus:outline-none ${
                                      oIdx === editQAnswer ? "border-green-500/40" : "border-slate-800"
                                    }`}
                                    placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                  />
                                ))}
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">Answer:</span>
                                  <select
                                    value={editQAnswer}
                                    onChange={(e) => setEditQAnswer(parseInt(e.target.value))}
                                    className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-cyan-400"
                                  >
                                    <option value={0}>A</option>
                                    <option value={1}>B</option>
                                    <option value={2}>C</option>
                                    <option value={3}>D</option>
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!editQText.trim() || editQOptions.some(o => !o.trim())) {
                                        alert("Please fill all fields.");
                                        return;
                                      }
                                      const nextQuestions = [...customQuestions];
                                      nextQuestions[idx] = { q: editQText, options: editQOptions, answer: editQAnswer };
                                      setCustomQuestions(nextQuestions);
                                      setEditingIndex(null);
                                      playSFX("correct");
                                    }}
                                    className="text-[10px] font-black uppercase text-green-400 hover:text-green-300"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingIndex(null)}
                                    className="text-[10px] font-black uppercase text-slate-400 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col text-left hover:border-slate-700/50 transition-colors">
                              <span className="text-xs font-bold text-white mb-2 leading-normal">
                                {idx + 1}. {item.q}
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {item.options.map((opt, oIdx) => (
                                  <div
                                    key={oIdx}
                                    className={`px-2 py-1 text-[10px] font-bold rounded border truncate ${
                                      oIdx === item.answer
                                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                                        : "bg-slate-900 text-slate-400 border-slate-800"
                                    }`}
                                  >
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end gap-3 mt-3 pt-2 border-t border-slate-900/60">
                                <button
                                  type="button"
                                  onClick={() => startEdit(idx)}
                                  className="text-[10px] font-black uppercase text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomQuestions(prev => prev.filter((_, i) => i !== idx));
                                    playSFX("button");
                                  }}
                                  className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer actions for Custom Pack */}
                  <div className="mt-4 pt-3 border-t border-slate-800 shrink-0 space-y-3 text-left">
                    {customQuestions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => startLevel(99)}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black py-3 px-4 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:scale-102 active:scale-98 transition text-xs font-black uppercase tracking-widest text-center"
                      >
                        🎯 Play Custom Pack
                      </button>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={customQuestions.length === 0}
                        className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider border transition text-center ${
                          customQuestions.length > 0
                            ? "bg-slate-950/60 hover:bg-slate-900 text-cyan-400 border-cyan-500/20"
                            : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed border-dashed"
                        }`}
                      >
                        📥 Export Pack
                      </button>
                      <label className="flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider border bg-slate-950/60 hover:bg-slate-900 text-purple-400 border-purple-500/20 text-center cursor-pointer">
                        📤 Import Pack
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImport}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Rules/Instructions Tab
            <div className="menu-panel w-full max-w-3xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-6 z-10">
              <h1 className="text-4xl md:text-5xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-sm">
                How To Play
              </h1>
              <p className="text-sm md:text-base text-slate-300 mb-6 font-semibold">
                Answer trivia cards rapidly and place your falling pieces strategically. Every level shows two win requirements: reach the score target and complete the level mission.
              </p>

              <div className="grid md:grid-cols-2 gap-4 text-left text-xs md:text-sm mb-6">
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 shadow-inner">
                  <h2 className="text-cyan-300 font-black uppercase tracking-wider text-xs mb-2.5">Basic Rules</h2>
                  <ul className="space-y-2 font-medium text-slate-300">
                    <li className="flex items-start gap-1.5">⏱ The block falls slowly while the question card is active. Answer quickly!</li>
                    <li className="flex items-start gap-1.5">✓ Correct: You gain controller gravity and placing powers. Speed bonuses exist.</li>
                    <li className="flex items-start gap-1.5">⚡ Every four correct answers in one streak earns a special block. TNT arrives at x4, Drill at x8, and Lightning at x12.</li>
                    <li className="flex items-start gap-1.5">✗ Incorrect: The block turns to heavy stone and locks automatically.</li>
                  </ul>
                </div>
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 shadow-inner">
                  <h2 className="text-purple-300 font-black uppercase tracking-wider text-xs mb-2.5">Clearing Blocks</h2>
                  <ul className="space-y-2 font-medium text-slate-300">
                    <li className="flex items-start gap-1.5">💥 Connected Match-5: Connecting 5 blocks of the same color clears them.</li>
                    <li className="flex items-start gap-1.5">🧱 Horizontal rows: Filling a full line wipes the line out (just like Tetris).</li>
                    <li className="flex items-start gap-1.5">🌋 Mutators: Wind pushing blocks, slime blocks getting stuck, and rising lava floor blocks.</li>
                    <li className="flex items-start gap-1.5">🚨 Strike recovery: Answer high-tension recovery cards to save yourself at 3 strikes.</li>
                  </ul>
                </div>
              </div>

              <button type="button" onClick={() => { playSFX("button"); setMenuTab("levels"); }} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 px-8 rounded-xl shadow-lg transition-transform hover:scale-105">
                Back to Menu
              </button>
            </div>
          )
        )}

        {/* Panel View for active gameplay states */}
        {!isMenu && gameState !== "intro" && !isArena && gameState !== "arena_intro" && gameState !== "arena_win" && (
          <main className={`${panelClass} gameplay-panel-${gameState}`}>
            <div className="level-pill static md:absolute md:top-4 md:right-4 mb-2 md:mb-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] md:text-xs font-black px-3 md:px-4 py-1.5 rounded-full shadow-lg border border-white/20">
              LEVEL {level}: {currentLevel.name}
            </div>

            {gameState === "quiz" && currentQuestion && (
              <div className="quiz-content w-full flex flex-col min-h-0">
                <h2 className="text-xs md:text-sm font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Question {questionIndex + 1}
                </h2>
                <QuickAnswerTimer
                  startTime={questionStartTime}
                  active={gameState === "quiz"}
                  windowSeconds={runConfig.difficulty.quickWindowSeconds}
                />
                <h3 className="quiz-question text-lg sm:text-xl md:text-3xl font-bold mb-3 md:mb-5 text-white leading-tight drop-shadow-md">
                  {currentQuestion.q}
                </h3>
                <div className="quiz-answer-grid grid grid-cols-2 gap-2 md:gap-4 w-full">
                  {currentQuestion.options.map((option, index) => (
                    <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button group flex items-center gap-2.5 bg-slate-700/80 hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500 hover:scale-[1.02] active:scale-95 transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-slate-600/50">
                      <span className="answer-badge">{String.fromCharCode(65 + index)}</span>
                      <span className="min-w-0">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState === "strike_recovery" && currentQuestion && (
              <div className="w-full flex flex-col min-h-0 text-center items-center">
                <h2 className="text-xs md:text-sm font-black text-red-500 uppercase tracking-widest mb-2 animate-pulse">
                  🚨 STRIKE RECOVERY MODE 🚨
                </h2>
                <div className="w-full bg-slate-900 rounded-full h-2.5 mb-4 overflow-hidden border border-red-500/30">
                  <div
                    className="bg-red-500 h-full transition-all duration-1000"
                    style={{ width: `${(recoveryTimer / 4) * 100}%` }}
                  />
                </div>
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-4 text-white leading-tight drop-shadow-md">
                  {currentQuestion.q}
                </h3>
                <div className="grid grid-cols-2 gap-2 md:gap-4 w-full">
                  {currentQuestion.options.map((option, index) => (
                    <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button group flex items-center gap-2.5 bg-slate-700/80 hover:bg-gradient-to-r hover:from-red-600 hover:to-orange-500 hover:scale-[1.02] active:scale-95 transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-red-500/50">
                      <span className="answer-badge answer-badge-danger">{String.fromCharCode(65 + index)}</span>
                      <span className="min-w-0">{option}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState === "transition" && (
              <div className="w-full flex flex-col items-center justify-center py-4 md:py-12">
                <h2 className={`text-2xl md:text-5xl font-black ${isControllable ? "text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" : "text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"} animate-pulse text-center leading-tight`}>
                  {feedback}
                </h2>
              </div>
            )}

            {gameState === "dropping" && (
              <div className="drop-guidance w-full flex flex-col items-center md:items-start text-slate-300">
                <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-6 text-white drop-shadow-md">
                  {isControllable
                    ? `Place your block! ${activePiece?.isTNT ? "💣 TNT active" : activePiece?.isDrill ? "🌀 Drill active" : activePiece?.isLightning ? "⚡ Lightning active" : activePiece?.isRowClear ? "↔️ Row Clear active" : activePiece?.isArea2x2Clear ? "🔲 2x2 Area Clear active" : activePiece?.isSlime ? "🦠 Sticky Slime active" : activePiece?.isCatalystBomb ? "💣 Catalyst Bomb active" : activePiece?.isWildcard ? "✨ Wildcard Star active" : ""}`
                    : "STONE INCOMING!"}
                </h3>
                {isControllable ? (
                  <>
                    <p className="lg:hidden text-cyan-200 text-xs font-bold mb-1">
                      Tap to rotate · swipe to move · ↓ nudges down · DROP slams it to the bottom.
                    </p>
                    <div className="hidden lg:flex flex-col gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                      <p className="flex items-center gap-3">
                        <kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">
                          Arrows
                        </kbd> Move &amp; Rotate
                      </p>
                      <p className="flex items-center gap-3">
                        <kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">
                          Space
                        </kbd> Hard Drop
                      </p>
                      <p className="flex items-center gap-3">
                        <kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">
                          C
                        </kbd> Hold / Swap
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="bg-slate-700/50 p-3 md:p-6 rounded-2xl border border-slate-500/50">
                    <p className="text-slate-300 font-black text-base md:text-lg">
                      You have no control over this stone piece!
                    </p>
                  </div>
                )}
                <RunTelemetryPanel
                  board={board}
                  correctStreak={correctStreak}
                  totalScore={totalScore}
                  misses={misses}
                  activePiece={activePiece}
                  isControllable={isControllable}
                  targetScore={runTarget}
                  strikesAllowed={strikeLimit}
                  objective={runConfig.objective}
                  objectiveStatus={objectiveStatus}
                  heatLevel={heatLevel}
                  coolingRemaining={coolingRemaining}
                />
              </div>
            )}

            {gameState === "level_win" && (
              <div className="w-full flex flex-col items-center md:items-start">
                <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 drop-shadow-md">
                  {runMode === "ai_race" ? "You Beat Byte!" : runMode === "daily" ? "Daily Blast Complete!" : runMode === "custom" ? "Custom Pack Complete!" : "Level Complete!"}
                </h2>

                <div className="flex items-center gap-2 mb-3" aria-label={`${winStars} of 3 stars`}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`win-star ${i < winStars ? "win-star-earned" : "win-star-empty"}`}
                      style={{ animationDelay: `${i * 220}ms` }}
                    >
                      {i < winStars ? "⭐" : "☆"}
                    </span>
                  ))}
                  <span className="ml-2 text-xs font-black uppercase tracking-widest text-slate-400">
                    {winStars === 3 ? "Flawless" : winStars === 2 ? "Great" : "Cleared"}
                  </span>
                </div>

                <p className="text-base md:text-xl text-slate-300 mb-4 font-medium">
                  {runMode === "ai_race"
                    ? <>You completed the score goal and mission first: <span className="score-readout">{animatedScore}</span> to Byte&apos;s {aiRaceMetrics.score}.</>
                    : <>You reached <span className="score-readout">{animatedScore}</span> points on {currentLevel.name}!</>}
                </p>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-700/50 mb-5 text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-inner">
                  <span className="text-purple-400">👾 Glitches Earned:</span>
                  <span className="text-white font-black">+{Math.floor(totalScore / 10) + (rewardLevelMultiplier * 10)}</span>
                  <span className="text-yellow-300 ml-auto">Max Streak: {maxStreak}</span>
                </div>

                <Game
                  levelId={level}
                  currentScore={totalScore}
                  previousBest={previousBest}
                />

                {runMode === "campaign" && level < FINAL_LEVEL_ID ? (
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                    <button type="button" onClick={() => startLevel(level + 1)} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transform transition hover:scale-105 border border-white/20">
                      START LEVEL {level + 1}
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setGameState("start"); setMenuTab("levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
                      Main Menu
                    </button>
                    <button type="button" onClick={handleShare} className="bg-slate-950 hover:bg-slate-900 text-cyan-300 font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-cyan-500/40">
                      Share Run
                    </button>
                  </div>
                ) : runMode === "campaign" ? (
                  <div className="text-center md:text-left bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 w-full">
                    <p className="text-3xl font-black text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                      You beat the entire game!
                    </p>
                    <button type="button" onClick={() => { playSFX("button"); setGameState("start"); setMenuTab("levels"); }} className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black py-3 px-8 rounded-full shadow-lg hover:scale-105 transition-transform">
                      Main Menu
                    </button>
                    <button type="button" onClick={handleShare} className="ml-3 bg-slate-950 hover:bg-slate-900 text-cyan-300 font-black py-3 px-8 rounded-full shadow-lg hover:scale-105 transition-transform border border-cyan-500/40">
                      Share
                    </button>
                  </div>
                ) : (
                  <div className="flex w-full flex-wrap gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/50 p-5">
                    {runMode === "daily" && (
                      <p className="w-full text-sm font-bold text-amber-200">
                        Daily streak: {stats.dailyStreak || 1} day{(stats.dailyStreak || 1) === 1 ? "" : "s"} · Best {Math.max(stats.dailyBest || 0, totalScore)}
                      </p>
                    )}
                    <button type="button" onClick={() => startLevel(level, runMode === "ai_race" ? "ai_race" : undefined)} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black py-3 px-6 rounded-full shadow-lg hover:scale-105 transition-transform">
                      {runMode === "ai_race" ? "Race Again" : "Play Again"}
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setGameState("start"); setMenuTab(runMode === "ai_race" ? "arena" : "levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 px-6 rounded-full shadow-lg hover:scale-105 transition-transform">
                      {runMode === "ai_race" ? "Arena Lobby" : "Main Menu"}
                    </button>
                    <button type="button" onClick={handleShare} className="bg-slate-950 hover:bg-slate-900 text-cyan-300 font-black py-3 px-6 rounded-full border border-cyan-500/40">
                      Share
                    </button>
                  </div>
                )}
                {shareFeedback && (
                  <p className="mt-3 text-xs font-black text-cyan-300">{shareFeedback}</p>
                )}
              </div>
            )}

            {gameState === "gameover" && (
              <div className="w-full flex flex-col items-center md:items-start">
                <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 drop-shadow-md">
                  {runMode === "ai_race" ? "Byte Wins the Race" : "Game Over!"}
                </h2>
                <div className="bg-slate-900/60 p-3 md:p-6 rounded-2xl border border-slate-700/50 mb-4 md:mb-6 w-full text-center md:text-left shadow-inner">
                  <p className="text-base md:text-xl text-slate-300 mb-1 font-bold">
                    {runMode === "ai_race" && arenaResult === "ai_win"
                      ? `Byte completed both goals first. You scored ${totalScore}; Byte scored ${aiRaceMetrics.score}.`
                      : misses >= strikeLimit
                      ? "You ran out of recovery options!"
                      : questionIndex >= shuffledQuestions.length - 1
                        ? "Ran out of trivia questions!"
                        : "The board filled up to the top!"}
                  </p>
                  <p className="text-2xl md:text-3xl text-cyan-400 font-black mt-2">
                    Final Points: {totalScore}
                  </p>

                  <div className="mt-3 text-xs font-black text-purple-400 flex items-center gap-1.5 justify-center md:justify-start">
                    <span>👾 Glitches Earned:</span>
                    <span className="text-white bg-slate-950/60 px-2 py-0.5 rounded border border-purple-500/20">
                      +{Math.max(1, Math.floor(totalScore / 20) + (rewardLevelMultiplier * 2))}
                    </span>
                    <span className="text-yellow-300 ml-2">Max Streak: {maxStreak}</span>
                  </div>
                </div>

                <Game
                  levelId={level}
                  currentScore={totalScore}
                  previousBest={previousBest}
                />

                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <button type="button" onClick={() => startLevel(level, runMode === "ai_race" ? "ai_race" : undefined)} className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.4)] transform transition hover:scale-105 border border-white/20">
                    {runMode === "ai_race" ? "RACE AGAIN" : runMode === "campaign" ? `RESTART LEVEL ${level}` : "TRY AGAIN"}
                  </button>
                  <button type="button" onClick={() => { playSFX("button"); setGameState("start"); setMenuTab(runMode === "ai_race" ? "arena" : "levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
                    {runMode === "ai_race" ? "Arena Lobby" : "Main Menu"}
                  </button>
                  <button type="button" onClick={handleShare} className="bg-slate-950 hover:bg-slate-900 text-cyan-300 font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-cyan-500/40">
                    Share Run
                  </button>
                </div>
                {shareFeedback && (
                  <p className="mt-3 text-xs font-black text-cyan-300">{shareFeedback}</p>
                )}
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
