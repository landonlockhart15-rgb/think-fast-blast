import { useCallback, useEffect, useRef, useState } from "react";

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
  createEmptyBoard,
  rotateShapeClockwise,
  shuffleArray,
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
import Confetti from "./game/Confetti";

const STATS_STORAGE_KEY = "think-fast-blast-stats";
const PLAYABLE_STATES = new Set(["quiz", "dropping", "transition", "resolving", "strike_recovery"]);
const FLASH_DURATION_MS = 260;

const SHOP_ITEMS = [
  { id: "theme_cyberpunk", name: "Cyberpunk Neon Theme", desc: "Adds glowing retro-future styling and cyber shadows to blocks", cost: 100, type: "theme" },
  { id: "theme_retro", name: "Retro Green Theme", desc: "Classic Matrix-style digital terminal grid with binary elements", cost: 120, type: "theme" },
  { id: "catalyst_bomb", name: "Catalyst Bomb Block", desc: "Enables rare 💣 block spawns that clear 3x3 grids when they land", cost: 150, type: "block" },
  { id: "catalyst_wildcard", name: "Wildcard Block", desc: "Enables rare ✨ block spawns that connect and clear any adjacent colors", cost: 200, type: "block" },
];

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
  return baseColor;
};

const readSavedStats = () => {
  try {
    const saved = localStorage.getItem(STATS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      highScores: parsed.highScores || {},
      totalGames: parsed.totalGames || 0,
      totalCorrect: parsed.totalCorrect || 0,
      totalQuestions: parsed.totalQuestions || 0,
      glitches: parsed.glitches || 0,
      unlockedItems: parsed.unlockedItems || [],
      activeTheme: parsed.activeTheme || "default",
      unlockedAchievements: parsed.unlockedAchievements || [],
      bestStreak: parsed.bestStreak || 0
    };
  } catch {
    return { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0, glitches: 0, unlockedItems: [], activeTheme: "default", unlockedAchievements: [], bestStreak: 0 };
  }
};

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const FINAL_LEVEL_ID = LEVELS.at(-1).id;

const readSavedProgress = () => {
  try {
    const saved = Number.parseInt(localStorage.getItem(PROGRESS_STORAGE_KEY), 10);
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
  tnt: { label: "Demolitionist", emoji: "💣", desc: "Forged a TNT block on a x3 streak" },
  drill: { label: "Driller", emoji: "🌀", desc: "Forged a Drill block on a x5 streak" },
  lightning: { label: "Storm Caller", emoji: "⚡", desc: "Forged a Lightning Rod on a x7 streak" },
  streak10: { label: "Untouchable", emoji: "🔥", desc: "Reached a x10 answer streak" },
  line: { label: "Line Cook", emoji: "🧱", desc: "Cleared a full line" },
  bigmatch: { label: "Color Theory", emoji: "🌈", desc: "Cleared a 5+ color match" },
};

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

// Live countdown of the ≤2.2s "PERFECT" quick-answer bonus window. Pure visual.
function QuickAnswerTimer({ startTime, active }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !startTime) return undefined;
    let raf;
    const tick = () => {
      setElapsed((Date.now() - startTime) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, startTime]);

  const WINDOW = 2.2;
  const inBonus = elapsed <= WINDOW;
  const pct = Math.max(0, Math.min(1, 1 - elapsed / WINDOW)) * 100;

  return (
    <div className="quick-timer" aria-hidden="true">
      <div className="quick-timer-label">
        <span className={inBonus ? "text-amber-300" : "text-slate-400"}>
          {inBonus ? "⚡ PERFECT BONUS" : "Answer now!"}
        </span>
        <span className={inBonus ? "text-amber-300" : "text-slate-500"}>
          {inBonus ? `+15 · ${Math.max(0, WINDOW - elapsed).toFixed(1)}s` : "+10"}
        </span>
      </div>
      <div className="quick-timer-track">
        <div
          className={`quick-timer-fill ${inBonus ? "quick-timer-bonus" : "quick-timer-late"}`}
          style={{ width: `${inBonus ? pct : 100}%` }}
        />
      </div>
    </div>
  );
}

function StoreItemPreview({ itemId }) {
  const canvasRef = useRef(null);

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
      ctx.fillStyle = "#0f172a"; // dark card background
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines
      ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
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

    const particles = Array.from({ length: 30 }, () => ({
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
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(15, 23, 42, 0.4)";
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        particles.forEach((other) => {
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 60) {
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.12 * (1 - dist / 60)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        });

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

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
function BoardParticlesCanvas({ explodingCells, correctStreak }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);

  useEffect(() => {
    if (!explodingCells || explodingCells.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / 10;
    const cellH = height / 16;

    explodingCells.forEach((cell) => {
      const cx = (cell.x + 0.5) * cellW;
      const cy = (cell.y + 0.5) * cellH;

      const count = 10;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          color: Math.random() < 0.5 ? "#22d3ee" : "#f59e0b",
          size: Math.random() * 3 + 1.5,
          alpha: 1.0,
          decay: Math.random() * 0.04 + 0.02,
        });
      }
    });
  }, [explodingCells]);

  const prevStreakRef = useRef(correctStreak);
  useEffect(() => {
    if (correctStreak > prevStreakRef.current && correctStreak >= 3) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = canvas.width;
      const height = canvas.height;
      const count = 25;
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: height,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 4 - 2,
          color: "#fbbf24",
          size: Math.random() * 4 + 2,
          alpha: 1.0,
          decay: Math.random() * 0.03 + 0.015,
        });
      }
    }
    prevStreakRef.current = correctStreak;
  }, [correctStreak]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId;
    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

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

function RunTelemetryPanel({ board, correctStreak, totalScore, misses, activePiece, isControllable }) {
  const occupiedCells = board.reduce(
    (count, row) => count + row.reduce((rowCount, cell) => rowCount + (cell ? 1 : 0), 0),
    0
  );
  const targetProgress = Math.min(100, Math.round((totalScore / WIN_SCORE_TARGET) * 100));
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
        : activePiece?.isSlime
          ? "Slime"
          : activePiece?.isCatalystBomb
            ? "Catalyst"
            : activePiece?.isWildcard
              ? "Wildcard"
              : isControllable
                ? "Clean Block"
                : "Stone";

  const meters = [
    { label: "Score Run", value: `${totalScore}/${WIN_SCORE_TARGET}`, progress: targetProgress, tone: "cyan" },
    { label: chargeLabel, value: `${correctStreak}x`, progress: chargeProgress, tone: "amber" },
    { label: "Board Heat", value: `${boardPressure}%`, progress: boardPressure, tone: boardPressure > 55 ? "red" : "emerald" },
    { label: "Strike Risk", value: `${misses}/${STRIKES_ALLOWED}`, progress: (misses / STRIKES_ALLOWED) * 100, tone: "red" },
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
    </div>
  );
}

function MenuLightfield() {
  return (
    <div className="menu-lightfield" aria-hidden="true">
      <div className="menu-perspective-grid" />
      <div className="menu-scanline" />
      <div className="menu-light-sweep menu-light-sweep-a" />
      <div className="menu-light-sweep menu-light-sweep-b" />
    </div>
  );
}

function MenuPreviewBoard() {
  const [simBoard, setSimBoard] = useState(() => createEmptyBoard());
  const [simPiece, setSimPiece] = useState(null);

  useEffect(() => {
    let active = true;
    let piece = null;
    let boardState = createEmptyBoard();

    const localRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const spawn = () => {
      const pieceBase = localRandom([...TETROMINOES, ...FRUITS]);
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
          boardState = createEmptyBoard();
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
            <div key={`${y}-${x}`} className={`menu-preview-cell ${cell ? cell.color : ""}`}>
              {cell?.emoji || ""}
            </div>
          ))
        )}
      </div>
      <div className="menu-preview-label">LIVE RUN SIM</div>
    </div>
  );
}

function MenuStatPill({ label, value, accent = "text-cyan-300" }) {
  return (
    <div className="menu-stat-pill">
      <span>{label}</span>
      <strong className={accent}>{value}</strong>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main App Component
// -------------------------------------------------------------------------
export default function App() {
  const [gameState, setGameState] = useState("start");
  const [menuTab, setMenuTab] = useState("levels");
  const [level, setLevel] = useState(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(readSavedProgress);
  const [board, setBoard] = useState(createEmptyBoard());
  const [activePiece, setActivePiece] = useState(null);

  const [shuffledQuestions, setShuffledQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionsAnsweredThisLevel, setQuestionsAnsweredThisLevel] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState("");

  const [totalScore, setTotalScore] = useState(0);
  const [isControllable, setIsControllable] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [explodingCells, setExplodingCells] = useState([]);

  // Immersion & volume settings states
  const [maxStreak, setMaxStreak] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [flashColor, setFlashColor] = useState(null);
  const [shareFeedback, setShareFeedback] = useState("");

  const [masterVol, setMasterVolState] = useState(() => getVolumeSettings().masterVolume);
  const [musicVol, setMusicVolState] = useState(() => getVolumeSettings().musicVolume);
  const [sfxVol, setSfxVolState] = useState(() => getVolumeSettings().sfxVolume);

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
🏆 Score: ${totalScore} / ${WIN_SCORE_TARGET}
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
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [shake, setShake] = useState(false);
  const [windForce, setWindForce] = useState(0);
  const [questionsSinceLastRise, setQuestionsSinceLastRise] = useState(0);
  const [recoveryTimer, setRecoveryTimer] = useState(4);
  const [questionStartTime, setQuestionStartTime] = useState(0);

  // Stats and Shop Integration States
  const [stats, setStats] = useState(readSavedStats);
  const [introCountdown, setIntroCountdown] = useState(3);
  const [scoreBump, setScoreBump] = useState(false);
  const prevScoreRef = useRef(0);
  const coinTickRef = useRef(0);
  const [achievementToasts, setAchievementToasts] = useState([]);
  const [electrify, setElectrify] = useState(false);
  const earnedRef = useRef(null);
  const electrifyTimerRef = useRef(0);
  const [randomFact, setRandomFact] = useState("");

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

  // Timers and keyboard events need the newest state without being rebuilt on
  // every render. This ref mirrors the live game state for those callbacks.
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

  useEffect(() => {
    stateRef.current = {
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
    };
  }, [board, activePiece, gameState, isControllable, isPaused, level, correctStreak, questionIndex, shuffledQuestions, misses, questionsSinceLastRise]);

  useEffect(() => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, String(maxUnlockedLevel));
  }, [maxUnlockedLevel]);

  // Handle programmatic audio enabled state
  useEffect(() => {
    setAudioEnabled(audioOn);
    try {
      localStorage.setItem("think-fast-blast-audio-enabled", String(audioOn));
    } catch (e) {
      console.error(e);
    }
  }, [audioOn]);

  // Trigger screen shake
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  // Tactile feedback on mobile. Silently no-ops where unsupported.
  const vibrate = useCallback((pattern) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // Vibration can be blocked by browser policy; ignore.
    }
  }, []);

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
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(next));
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

  // Helper to generate a Power-up block
  const makePowerUp = (piece, streak) => {
    if (streak === 3) {
      return {
        ...piece,
        isTNT: true,
        color: "bg-red-600 animate-glow-tnt shadow-[0_0_15px_rgba(239,68,68,0.8)]",
        emoji: "💣",
        shape: [[1]],
      };
    }
    if (streak === 5) {
      return {
        ...piece,
        isDrill: true,
        color: "bg-amber-500 animate-glow-drill shadow-[0_0_15px_rgba(245,158,11,0.8)]",
        emoji: "🌀",
        shape: [[1]],
      };
    }
    if (streak >= 7) {
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

  // Memoized game end handler to save stats, high scores, glitches and trigger audio
  const handleGameEnd = useCallback((isWin, finalScore) => {
    setIsPaused(false);

    // New personal-best answer streak (recurring celebration, persisted).
    const savedBest = readSavedStats().bestStreak || 0;
    if (maxStreak > savedBest && maxStreak >= 3) {
      pushToast({ kind: "record", emoji: "🏆", title: "New Record Streak!", desc: `Best answer streak: x${maxStreak}` });
      setStats((prev) => {
        const next = { ...prev, bestStreak: Math.max(prev.bestStreak || 0, maxStreak) };
        try {
          localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage may be unavailable.
        }
        return next;
      });
    }
    if (isWin && stateRef.current.misses === 0) {
      pushToast({ kind: "record", emoji: "🌟", title: "Flawless!", desc: "Cleared the level with zero strikes" });
    }

    const levelMultiplier = level === 99 ? 5 : level;
    if (isWin) {
      playSFX("level_win");
      triggerFlash("win");
      setGameState("level_win");
      if (level < FINAL_LEVEL_ID && level !== 99) setMaxUnlockedLevel((prev) => Math.max(prev, level + 1));
      
      const glitchesEarned = Math.floor(finalScore / 10) + (levelMultiplier * 10);
      setStats((prevStats) => {
        const updatedHighScores = { ...prevStats.highScores };
        const previousBest = updatedHighScores[level] || 0;
        updatedHighScores[level] = Math.max(previousBest, finalScore);
        
        const newStats = {
          ...prevStats,
          highScores: updatedHighScores,
          totalGames: prevStats.totalGames + 1,
          totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
          totalQuestions: prevStats.totalQuestions + (questionIndex + 1),
          glitches: (prevStats.glitches || 0) + glitchesEarned
        };
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
        return newStats;
      });
      setFeedback(`Victory! Earned ${glitchesEarned} Glitches.`);
    } else {
      playSFX("gameover");
      triggerFlash("danger");
      setGameState("gameover");
      
      const glitchesEarned = Math.max(1, Math.floor(finalScore / 20) + (levelMultiplier * 2));
      setStats((prevStats) => {
        const updatedHighScores = { ...prevStats.highScores };
        const previousBest = updatedHighScores[level] || 0;
        updatedHighScores[level] = Math.max(previousBest, finalScore);
 
        const newStats = {
          ...prevStats,
          highScores: updatedHighScores,
          totalGames: prevStats.totalGames + 1,
          totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
          totalQuestions: prevStats.totalQuestions + (questionIndex + 1),
          glitches: (prevStats.glitches || 0) + glitchesEarned
        };
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
        return newStats;
      });
      setFeedback(`Game Over! Earned ${glitchesEarned} Glitches.`);
    }
  }, [level, questionsAnsweredThisLevel, questionIndex, triggerFlash, maxStreak, pushToast]);

  // Floor rising hazard
  const triggerFloorRise = useCallback((currentBoard) => {
    const newRow = Array(BOARD_WIDTH).fill(null);
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

    if (currentBoard[0].some((cell) => cell !== null)) {
      handleGameEnd(false, totalScore);
      return;
    }

    const nextBoard = [...currentBoard.slice(1), newRow];
    setBoard(nextBoard);
    triggerShake();
    triggerFlash("danger");
    addFloatingText("FLOOR RISING! 🌋", 4, BOARD_HEIGHT - 2);
    setFeedback("Warning: Floor rising!");
  }, [totalScore, handleGameEnd, addFloatingText, triggerFlash]);

  // Timeout triggers
  const handleTimeOut = useCallback(() => {
    const { activePiece: piece, board: currentBoard, misses: currentMisses, questionIndex: qIdx, shuffledQuestions: questions } = stateRef.current;
    if (!piece) return;

    playSFX("incorrect");
    triggerFlash("danger");

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true,
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setCorrectStreak(0);

    const question = questions[qIdx];
    const correctAnswer = question ? question.options[question.answer] : "unknown";

    const nextMisses = currentMisses + 1;
    setMisses(nextMisses);
    setLastCorrectAnswer(correctAnswer);
    setFeedback(`Time's up! The answer was: ${correctAnswer}. Stone block locked!`);

    if (nextMisses >= STRIKES_ALLOWED) {
      const activeLevel = level;
      const levelQuestions = activeLevel === 99 ? customQuestions : (QUESTION_BANKS[activeLevel] || QUESTION_BANKS[1]);
      const q = randomItem(levelQuestions);
      setShuffledQuestions([q]);
      setQuestionIndex(0);
      setRecoveryTimer(4);
      setGameState("strike_recovery");
    } else {
      setGameState("transition");
      setTimeout(() => setGameState("resolving"), 1500);
    }
  }, [level, triggerFlash, customQuestions]);

  // -------------------------------------------------------------------------
  // Piece lifecycle
  // -------------------------------------------------------------------------
  const spawnQuizPiece = useCallback(() => {
    const activeLevel = stateRef.current.level;
    const isFirstBlock = stateRef.current.questionIndex === 0;

    let pieceBase;
    
    // Safety check: Fruit bombs or any power-up blocks should NEVER spawn first
    if (isFirstBlock) {
      pieceBase = randomItem(TETROMINOES);
    } else {
      const canSpawnBomb = stats.unlockedItems?.includes("catalyst_bomb") || false;
      const canSpawnWildcard = stats.unlockedItems?.includes("catalyst_wildcard") || false;
      const spawnRoll = Math.random();

      if (canSpawnBomb && spawnRoll < 0.08) {
        pieceBase = { 
          shape: [[1]], 
          color: "bg-rose-600 border border-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-glow-tnt", 
          isFruit: true, 
          emoji: "💣", 
          isCatalystBomb: true 
        };
      } else if (canSpawnWildcard && spawnRoll >= 0.08 && spawnRoll < 0.16) {
        pieceBase = { 
          shape: [[1]], 
          color: "bg-gradient-to-tr from-yellow-300 via-pink-500 to-indigo-500 border border-white", 
          isWildcard: true, 
          emoji: "✨" 
        };
      } else if (Math.random() < 0.15) {
        pieceBase = randomItem(FRUITS);
      } else {
        pieceBase = randomItem(TETROMINOES);
      }
    }

    const width = pieceBase.shape[0].length;
    const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);

    let color = pieceBase.color;
    let emoji = pieceBase.emoji || "";
    let isSlime = false;

    // Apply Sticky Slime blocks hazard to level 5 & 6 (never on first block!)
    if (!isFirstBlock && (activeLevel === 5 || activeLevel === 6) && Math.random() < 0.35) {
      isSlime = true;
      color = "bg-emerald-700 border-2 border-emerald-400";
      emoji = "🦠";
    }

    const newPiece = {
      ...pieceBase,
      color,
      emoji,
      isSlime,
      x,
      y: 0,
    };

    if (checkCollision(newPiece, stateRef.current.board)) {
      handleGameEnd(false, totalScore);
      return;
    }

    setActivePiece(newPiece);
    setQuestionStartTime(Date.now());
  }, [stats.unlockedItems, totalScore, handleGameEnd]);

  const lockPiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard } = stateRef.current;
    if (!piece) return;

    playSFX("lock");

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: piece.color,
            isFruit: piece.isFruit || false,
            emoji: piece.emoji || "",
            isStone: piece.isStone || false,
            isTNT: piece.isTNT || false,
            isDrill: piece.isDrill || false,
            isLightning: piece.isLightning || false,
            isSlime: piece.isSlime || false,
            isCatalystBomb: piece.isCatalystBomb || false,
            isWildcard: piece.isWildcard || false,
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setGameState("resolving");
  }, []);

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  const moveDown = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece) return;

    const movedPiece = { ...piece, y: piece.y + 1 };
    if (!checkCollision(movedPiece, currentBoard)) setActivePiece(movedPiece);
    else lockPiece();
  }, [lockPiece]);

  const moveHorizontal = useCallback((dir) => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "dropping") return;

    const movedPiece = { ...piece, x: piece.x + dir };
    if (!checkCollision(movedPiece, currentBoard)) {
      setActivePiece(movedPiece);
    } else if (piece.isSlime) {
      addFloatingText("STUCK! 🦠", piece.x, piece.y);
      lockPiece();
    }
  }, [lockPiece, addFloatingText]);

  const rotatePiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "dropping" || piece.isFruit) return;

    const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
    if (!checkCollision(rotatedPiece, currentBoard)) {
      playSFX("rotate");
      setActivePiece(rotatedPiece);
    }
  }, []);

  const hardDrop = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state, isPaused: paused } = stateRef.current;
    if (paused) return;
    if (!piece || !canControl || state !== "dropping") return;

    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) y += 1;
    const droppedPiece = { ...piece, y };
    playSFX("drop");
    setActivePiece(droppedPiece);

    const nextBoard = currentBoard.map((row) => [...row]);
    droppedPiece.shape.forEach((row, shapeY) => {
      row.forEach((value, shapeX) => {
        if (!value) return;
        const boardY = droppedPiece.y + shapeY;
        const boardX = droppedPiece.x + shapeX;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: droppedPiece.color,
            isFruit: droppedPiece.isFruit || false,
            emoji: droppedPiece.emoji || "",
            isStone: droppedPiece.isStone || false,
            isTNT: droppedPiece.isTNT || false,
            isDrill: droppedPiece.isDrill || false,
            isLightning: droppedPiece.isLightning || false,
            isSlime: droppedPiece.isSlime || false,
            isCatalystBomb: droppedPiece.isCatalystBomb || false,
            isWildcard: droppedPiece.isWildcard || false,
          };
        }
      });
    });
    setBoard(nextBoard);
    setActivePiece(null);
    setGameState("resolving");
  }, []);

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
    const speed = stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    const timer = setInterval(moveDown, speed);
    return () => clearInterval(timer);
  }, [gameState, isPaused, level, moveDown]);

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
    let didLineClear = false;
    let didColorMatch = false;

    const addCellToClear = (y, x) => {
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

    // 4. Fruit bombs clear themselves and neighbors
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isFruit && !board[y][x]?.isCatalystBomb) {
          [{ y, x }, { y: y + 1, x }, { y: y - 1, x }, { y, x: x + 1 }, { y, x: x - 1 }]
            .forEach((cell) => {
              const insideBoard =
                cell.y >= 0 && cell.y < BOARD_HEIGHT && cell.x >= 0 && cell.x < BOARD_WIDTH;
              if (insideBoard && board[cell.y][cell.x] !== null) addCellToClear(cell.y, cell.x);
            });
          pointsEarned += POINTS.FRUIT_BOMB;
        }
      }
    }

    // 5. Standard full-line clear
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board[y].every((cell) => cell !== null)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear(y, x);
      pointsEarned += POINTS.LINE_CLEAR;
      didLineClear = true;
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
        }
      }
    }

    if (cellsToClear.length > 0) {
      const anchor = cellsToClear[0];
      
      queueMicrotask(() => triggerShake());
      queueMicrotask(() => setExplodingCells(cellsToClear));
      queueMicrotask(() => triggerFlash(hasTnt || hasDrill || hasLightning ? "blast" : "score"));
      if (hasLightning) {
        queueMicrotask(() => triggerElectrify());
        queueMicrotask(() => playSFX("thunder"));
      }

      const timer = setTimeout(() => {
        const afterClearBoard = board.map((row) => [...row]);
        cellsToClear.forEach((cell) => {
          afterClearBoard[cell.y][cell.x] = null;
        });

        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          let writeY = BOARD_HEIGHT - 1;
          for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
            if (afterClearBoard[y][x] === null) continue;
            if (writeY !== y) {
              afterClearBoard[writeY][x] = afterClearBoard[y][x];
              afterClearBoard[y][x] = null;
            }
            writeY -= 1;
          }
        }

        setBoard(afterClearBoard);
        setExplodingCells([]);
        setTotalScore((prev) => prev + pointsEarned);
        vibrate(hasTnt || hasDrill || hasLightning ? [30, 20, 70] : 22);

        // Schedule and trigger floating texts asynchronously
        if (hasTnt) {
          playSFX("explosion");
          addFloatingText("TNT BLAST! 💣", anchor.x, anchor.y - 1);
        } else if (hasDrill) {
          playSFX("match", 1);
          addFloatingText("DRILL BLAST! 🌀", anchor.x, anchor.y - 1);
        } else if (hasLightning) {
          playSFX("match", 2);
          addFloatingText("ZAP! ⚡", anchor.x, anchor.y - 1);
        } else {
          playSFX("match", 0);
        }
        
        if (pointsEarned > 0) {
          addFloatingText(`+${pointsEarned}`, anchor.x, anchor.y);
        }

        if (didLineClear) unlockAchievement("line");
        if (didColorMatch) unlockAchievement("bigmatch");

        if ((level === 9 || level === 10) && stateRef.current.questionsSinceLastRise === 0) {
          triggerFloorRise(afterClearBoard);
        }
      }, 400);

      return () => clearTimeout(timer);
    }

    queueMicrotask(() => {
      const projectedScore = totalScore + pointsEarned;
      if (misses >= STRIKES_ALLOWED) {
        handleGameEnd(false, projectedScore);
      } else if (projectedScore >= WIN_SCORE_TARGET) {
        handleGameEnd(true, projectedScore);
      } else if (questionIndex >= shuffledQuestions.length - 1) {
        handleGameEnd(false, projectedScore);
      } else {
        setQuestionIndex((prev) => prev + 1);
        setGameState("quiz");
        spawnQuizPiece();
      }
    });

    return undefined;
  }, [gameState, board, questionIndex, totalScore, misses, shuffledQuestions.length, level, spawnQuizPiece, handleGameEnd, addFloatingText, triggerFloorRise, triggerFlash, vibrate, triggerElectrify, unlockAchievement]);

  // Evolving Background Music Controller
  useEffect(() => {
    if (isPaused) {
      stopArpeggiator();
      return undefined;
    }

    if (["dropping", "quiz", "transition", "resolving", "intro", "strike_recovery"].includes(gameState)) {
      const totalCells = BOARD_WIDTH * BOARD_HEIGHT;
      const occupiedCount = board.flat().filter((cell) => cell !== null).length;
      const occupancy = occupiedCount / totalCells;

      const baseBpm = 110 + level * 2;
      const bpm = Math.min(185, Math.floor(baseBpm + occupancy * 50));

      const isMajor = (gameState === "transition" && isControllable) || gameState === "intro";
      const scaleType = isMajor ? "major" : "minor";

      startArpeggiator(bpm, scaleType, occupancy);
    } else {
      stopArpeggiator();
    }

    return () => {
      if (["start", "level_win", "gameover"].includes(gameState)) {
        stopArpeggiator();
      }
    };
  }, [board, level, gameState, isControllable, audioOn, isPaused]);

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
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.key === "p" || event.key === "P" || event.key === "Escape") && PLAYABLE_STATES.has(stateRef.current.gameState)) {
        event.preventDefault();
        playSFX("button");
        setIsPaused((paused) => !paused);
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key) && stateRef.current.gameState === "dropping") {
        event.preventDefault();
      }

      if (stateRef.current.isPaused || stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;

      if (event.key === "ArrowLeft") moveHorizontal(-1);
      if (event.key === "ArrowRight") moveHorizontal(1);
      if (event.key === "ArrowDown") moveDown();
      if (event.key === "ArrowUp") rotatePiece();
      if (event.key === " ") hardDrop();
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hardDrop, moveDown, moveHorizontal, rotatePiece]);

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
    const quizSpeed = Math.max(900, config.baseSpeed * 3);

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
  }, [gameState, isPaused, activePiece, level, handleTimeOut]);

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
    if (gameState !== "intro") return undefined;

    if (introCountdown > 0) {
      const timer = setTimeout(() => {
        setIntroCountdown((prev) => prev - 1);
        playSFX("button");
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      playSFX("level_start");
      const timer = setTimeout(() => {
        setGameState("quiz");
        stateRef.current.level = level;
        stateRef.current.questionIndex = 0;
        spawnQuizPiece();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState, introCountdown, level, spawnQuizPiece]);

  // -------------------------------------------------------------------------
  // Quiz answers handler
  // -------------------------------------------------------------------------
  const handleAnswer = useCallback((selectedIndex) => {
    if (stateRef.current.isPaused) return;
    const question = shuffledQuestions[questionIndex];
    if (!question) return;
    const correct = selectedIndex === question.answer;
    const { activePiece: piece, misses: currentMisses } = stateRef.current;

    // Handle Strike Recovery Phase
    if (stateRef.current.gameState === "strike_recovery") {
      if (correct) {
        playSFX("correct");
        triggerFlash("success");
        setMisses(2);
        const nextBoard = board.map((row, y) => {
          if (y < 3) return Array(BOARD_WIDTH).fill(null);
          return [...row];
        });
        setBoard(nextBoard);
        triggerShake();
        addFloatingText("RECOVERY SUCCESS! 💥", 4, 4);
        setFeedback("Recovery Success! Strikes set to 2.");

        setShuffledQuestions(shuffleArray(level === 99 ? customQuestions : (QUESTION_BANKS[level] || QUESTION_BANKS[1])));
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

    if (correct) {
      const nextStreak = correctStreak + 1;
      playSFX("correct", nextStreak);
      triggerFlash("success");
      vibrate(nextStreak >= 5 ? [18, 40, 18] : 16);
      setCorrectStreak(nextStreak);
      setMaxStreak((currentMax) => Math.max(currentMax, nextStreak));
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);

      // Variable verbal reward: escalating praise, larger on milestone streaks.
      addFloatingText(praiseForStreak(nextStreak), piece?.x ?? 5, (piece?.y ?? 4) + 1);

      // Perfect Quick Answer Bonus check
      const elapsed = (Date.now() - questionStartTime) / 1000;
      let bonusText = "";
      if (elapsed <= 2.2) {
        setTotalScore((score) => score + 15);
        bonusText = " PERFECT! Quick Bonus +15 Pts!";
        addFloatingText("PERFECT! ⚡", piece?.x || 5, piece?.y || 4);
        unlockAchievement("perfect");
      }

      if (nextStreak >= 10) unlockAchievement("streak10");

      setIsControllable(true);

      // Check combo power-up conversion
      let newPiece = { ...piece };
      if (nextStreak === 3) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 3);
        addFloatingText("COMBO x3! TNT Block 💣", piece?.x || 5, piece?.y || 2);
        unlockAchievement("tnt");
      } else if (nextStreak === 5) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 5);
        addFloatingText("COMBO x5! Drill Block 🌀", piece?.x || 5, piece?.y || 2);
        unlockAchievement("drill");
      } else if (nextStreak >= 7) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 7);
        addFloatingText("COMBO x7! Lightning Rod ⚡", piece?.x || 5, piece?.y || 2);
        unlockAchievement("lightning");
      }

      setActivePiece(newPiece);
      setFeedback(`Correct!${bonusText} You have control.`);
      setGameState("dropping");
    } else {
      playSFX("incorrect");
      triggerFlash("danger");
      vibrate([60, 30, 90]);
      setCorrectStreak(0);
      const correctAnswer = question.options[question.answer];
      const nextMisses = currentMisses + 1;
      setMisses(nextMisses);
      setLastCorrectAnswer(correctAnswer);
      setFeedback(`Wrong! The answer was ${correctAnswer}. Stone block incoming!`);

      setIsControllable(false);
      const stonePiece = {
        ...piece,
        color: "bg-slate-500",
        emoji: "🧱",
        isStone: true,
      };

      let y = stonePiece.y;
      const currentBoard = board;
      while (!checkCollision({ ...stonePiece, y: y + 1 }, currentBoard)) {
        y += 1;
      }
      const lockedStonePiece = { ...stonePiece, y };

      const nextBoard = currentBoard.map((row) => [...row]);
      lockedStonePiece.shape.forEach((row, shapeY) => {
        row.forEach((value, shapeX) => {
          if (!value) return;
          const boardY = lockedStonePiece.y + shapeY;
          const boardX = lockedStonePiece.x + shapeX;
          if (boardY >= 0) {
            nextBoard[boardY][boardX] = {
              color: lockedStonePiece.color,
              isStone: true,
              emoji: lockedStonePiece.emoji,
            };
          }
        });
      });

      setBoard(nextBoard);
      setActivePiece(null);

      if (nextMisses >= STRIKES_ALLOWED) {
        const activeLevel = level;
        const levelQuestions = activeLevel === 99 ? customQuestions : (QUESTION_BANKS[activeLevel] || QUESTION_BANKS[1]);
        const q = randomItem(levelQuestions);
        setShuffledQuestions([q]);
        setQuestionIndex(0);
        setRecoveryTimer(4);
        setGameState("strike_recovery");
      } else {
        setGameState("transition");
        setTimeout(() => setGameState("resolving"), 1500);
      }
    }

    if (level === 9 || level === 10) {
      setQuestionsSinceLastRise((prev) => {
        const next = prev + 1;
        return next >= 3 ? 0 : next;
      });
    }
  }, [shuffledQuestions, questionIndex, level, board, correctStreak, questionStartTime, spawnQuizPiece, totalScore, handleGameEnd, addFloatingText, triggerFlash, customQuestions, vibrate, unlockAchievement]);

  // -------------------------------------------------------------------------
  // Level Initialization
  // -------------------------------------------------------------------------
  const startLevel = useCallback((nextLevel) => {
    playSFX("button");
    setLevel(nextLevel);
    if (nextLevel === 99) {
      setShuffledQuestions(shuffleArray(customQuestions));
    } else {
      setShuffledQuestions(shuffleArray(QUESTION_BANKS[nextLevel] || QUESTION_BANKS[1]));
    }
    setBoard(createEmptyBoard());
    setActivePiece(null);
    setQuestionIndex(0);
    setQuestionsAnsweredThisLevel(0);
    setMisses(0);
    setLastCorrectAnswer("");
    setTotalScore(0);
    setIsControllable(true);
    setFeedback("");
    setExplodingCells([]);
    setFlashColor(null);
    setShareFeedback("");

    setCorrectStreak(0);
    setMaxStreak(0);
    setIsPaused(false);
    setWindForce(0);
    setQuestionsSinceLastRise(0);

    const fact = TRIVIA_FACTS[Math.floor(Math.random() * TRIVIA_FACTS.length)];
    setRandomFact(fact);
    setIntroCountdown(3);

    setGameState("intro");
  }, [customQuestions]);

  // Compose display board by overlaying the active piece
  const animatedScore = useAnimatedNumber(totalScore);
  const winStars = misses === 0 ? 3 : misses === 1 ? 2 : 1;
  const nearWin = totalScore >= WIN_SCORE_TARGET - 60 && totalScore < WIN_SCORE_TARGET && PLAYABLE_STATES.has(gameState);

  const displayBoard = board.map((row) => [...row]);

  // Ghost projection: show where the controllable piece will land so players can
  // plan placements at a glance. Drawn under the live piece, never on occupied cells.
  if (activePiece && gameState === "dropping" && isControllable) {
    let ghostY = activePiece.y;
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
            emoji: activePiece.emoji,
            isStone: activePiece.isStone,
            isTNT: activePiece.isTNT,
            isDrill: activePiece.isDrill,
            isLightning: activePiece.isLightning,
            isCatalystBomb: activePiece.isCatalystBomb,
            isWildcard: activePiece.isWildcard,
          };
        }
      });
    });
  }

  const currentQuestion = shuffledQuestions[questionIndex];
  const currentLevel = level === 99 ? { id: 99, name: "Custom Pack", theme: "Your custom trivia" } : (LEVELS.find((item) => item.id === level) || LEVELS[0]);
  const isMenu = gameState === "start";
  
  const panelClass = isMenu
    ? "w-full max-w-5xl h-full flex flex-col items-center justify-center text-center z-10"
    : "w-full md:w-[58%] max-h-[43dvh] md:max-h-none flex flex-col items-center md:items-start p-3 md:p-5 bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl min-h-0 justify-start md:justify-center text-center md:text-left relative overflow-y-auto md:overflow-hidden z-10";

  return (
    <div className="h-dvh animated-bg text-slate-100 font-sans flex flex-col items-center p-2 md:p-4 overflow-hidden touch-manipulation">
      <Confetti active={gameState === "level_win"} />
      <ScreenFlash tone={flashColor} />

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
      <div className="fixed top-2.5 right-2.5 z-40 flex items-center gap-2">
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

      <div className={`w-full h-full mx-auto flex min-h-0 ${isMenu ? "max-w-7xl items-center justify-center" : "max-w-6xl flex-col md:flex-row gap-2 md:gap-6 items-center md:items-stretch"}`}>
        
        {/* Playable Game Grid View */}
        {!isMenu && gameState !== "intro" && (
          <section className="w-full md:w-[42%] flex flex-col items-center justify-center min-h-0 z-10" aria-label="Game board">
            <div className="game-board-width flex justify-between mb-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-xs md:text-sm font-bold border border-slate-700/50 shadow-xl">
              <span className="text-slate-300">Lvl {level} | Score: <span className={`score-readout text-lg ${scoreBump ? "score-bump" : ""}`}>{animatedScore}</span><span className="text-slate-500">/{WIN_SCORE_TARGET}</span></span>
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
              <span className="text-red-400 flex items-center gap-0.5" aria-label={`Strikes ${misses} of ${STRIKES_ALLOWED}`}>
                {Array.from({ length: STRIKES_ALLOWED }).map((_, i) => (
                  <span key={i} className={i < misses ? "strike-heart strike-heart-lost" : "strike-heart"}>
                    {i < misses ? "🖤" : "❤️"}
                  </span>
                ))}
              </span>
            </div>

            {nearWin && (
              <div className="match-point-banner game-board-width">
                🎯 MATCH POINT — {WIN_SCORE_TARGET - totalScore} to win!
              </div>
            )}

            <div
              className={`game-board bg-slate-900 border-4 border-slate-700 p-1 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden touch-none ${shake ? "animate-shake" : ""} ${correctStreak >= 7 ? "combo-heat-3" : correctStreak >= 5 ? "combo-heat-2" : correctStreak >= 3 ? "combo-heat-1" : ""} ${electrify ? "electrify-active" : ""}`}
              onTouchStart={handleBoardTouchStart}
              onTouchEnd={handleBoardTouchEnd}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                  
                  // Apply active styles including Matrix code values for Retro theme
                  let cellColorClass = cell ? getThemeCellColor(cell.color, stats.activeTheme) : "bg-slate-800";
                  let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none ${cellColorClass}`;

                  if (cell?.isGhost) {
                    // Landing preview: faint, dashed outline of the live piece's resting spot.
                    cellClass += " ghost-block";
                  } else {
                    if (cell?.isStone) cellClass += " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                    if (cell?.isTNT) cellClass += " animate-glow-tnt";
                    if (cell?.isDrill) cellClass += " animate-glow-drill";
                    if (cell?.isLightning) cellClass += " animate-glow-lightning";

                    if (isExploding) {
                      cellClass += " transition-all duration-[400ms] ease-out scale-150 opacity-0 rotate-180 z-10 blur-sm";
                    } else if (cell) {
                      cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";
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

              <BoardParticlesCanvas explodingCells={explodingCells} correctStreak={correctStreak} />

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
              <div className="game-controls grid grid-cols-3 gap-1.5 mt-2 lg:hidden">
                <div />
                <button type="button" onClick={rotatePiece} className="mobile-control-button">↑</button>
                <div />
                <button type="button" onClick={() => moveHorizontal(-1)} className="mobile-control-button">←</button>
                <button type="button" onClick={hardDrop} className="mobile-control-button">↓</button>
                <button type="button" onClick={() => moveHorizontal(1)} className="mobile-control-button">→</button>
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

            {/* Curated Fact card */}
            <div className="w-full max-w-md bg-slate-950/60 border border-slate-700/50 p-5 rounded-2xl shadow-inner text-center z-10 backdrop-blur-md mb-8">
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
                    Fast answers. Falling pieces. Chain reactions.
                  </p>

                  <div className="menu-hero-actions">
                    <button
                      type="button"
                      onClick={() => startLevel(maxUnlockedLevel)}
                      className="menu-primary-button"
                    >
                      Start Level {maxUnlockedLevel}
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("shop"); }} className="menu-ghost-button">
                      Glitch Codex
                    </button>
                    <button
                      type="button"
                      onClick={() => { playSFX("button"); setMenuTab("builder"); }}
                      className="menu-ghost-button border-cyan-400/40 text-cyan-300 hover:text-white"
                    >
                      🎯 Question Builder
                    </button>
                    <button type="button" onClick={() => { playSFX("button"); setMenuTab("instructions"); }} className="menu-ghost-button">
                      How To Play
                    </button>
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
                      const pulsePercentage = Math.min(100, Math.round((bestScoreVal / 500) * 100));
                      return (
                        <div className="menu-preview-copy">
                          <div className="menu-kicker">Lvl {pulseLevelObj.id} Best Run</div>
                          <div className="menu-preview-score">{bestScoreVal} / 500</div>
                          <div className="menu-preview-meter">
                            <span style={{ width: `${pulsePercentage}%` }} />
                          </div>
                          <div className="menu-preview-chips">
                            {bestScoreVal >= 500 ? (
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
                            const reset = { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0, glitches: 0, unlockedItems: [], activeTheme: "default" };
                            setStats(reset);
                            localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(reset));
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
          ) : menuTab === "shop" ? (
            // Redesigned Glitch Codex Store
            <div className="menu-panel w-full max-w-4xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-5 z-10">
              <div className="flex items-center justify-between border-b border-slate-700/50 pb-3 mb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-rose-400">
                    🔮 The Glitch Codex Shop
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Unlock theme cosmetics and catalyst block perks
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
                    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(updated));
                  };

                  const handleEquip = () => {
                    playSFX("theme");
                    const updated = {
                      ...stats,
                      activeTheme: item.id
                    };
                    setStats(updated);
                    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(updated));
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
                      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(updated));
                    }}
                    className="text-xs text-slate-400 hover:text-white underline font-bold"
                  >
                    Reset to Default Theme
                  </button>
                ) : <div />}
                <button type="button" onClick={() => { playSFX("button"); setMenuTab("levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-6 rounded-xl text-xs border border-slate-600 shadow-md">
                  Back to Levels Menu
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
                Answer trivia cards rapidly, place your falling pieces strategically, and score <strong className="text-cyan-400">{WIN_SCORE_TARGET} points</strong> to advance.
              </p>
              
              <div className="grid md:grid-cols-2 gap-4 text-left text-xs md:text-sm mb-6">
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 shadow-inner">
                  <h2 className="text-cyan-300 font-black uppercase tracking-wider text-xs mb-2.5">Basic Rules</h2>
                  <ul className="space-y-2 font-medium text-slate-300">
                    <li className="flex items-start gap-1.5">⏱ The block falls slowly while the question card is active. Answer quickly!</li>
                    <li className="flex items-start gap-1.5">✓ Correct: You gain controller gravity and placing powers. Speed bonuses exist.</li>
                    <li className="flex items-start gap-1.5">⚡ Combo streaks: 3, 5, or 7 correct answers convert falling blocks into TNT, Drills, or Lightning.</li>
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
        {!isMenu && gameState !== "intro" && (
          <main className={panelClass}>
            <div className="static md:absolute md:top-4 md:right-4 mb-2 md:mb-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] md:text-xs font-black px-3 md:px-4 py-1.5 rounded-full shadow-lg border border-white/20">
              LEVEL {level}: {currentLevel.name}
            </div>

            {gameState === "quiz" && currentQuestion && (
              <div className="w-full flex flex-col min-h-0">
                <h2 className="text-xs md:text-sm font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Question {questionIndex + 1}
                </h2>
                <QuickAnswerTimer startTime={questionStartTime} active={gameState === "quiz"} />
                <h3 className="text-lg sm:text-xl md:text-3xl font-bold mb-3 md:mb-5 text-white leading-tight drop-shadow-md">
                  {currentQuestion.q}
                </h3>
                <div className="grid grid-cols-2 gap-2 md:gap-4 w-full">
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
              <div className="w-full flex flex-col items-center md:items-start text-slate-300">
                <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-6 text-white drop-shadow-md">
                  {isControllable
                    ? `Place your block! ${activePiece?.isTNT ? "💣 TNT active" : activePiece?.isDrill ? "🌀 Drill active" : activePiece?.isLightning ? "⚡ Lightning active" : activePiece?.isSlime ? "🦠 Sticky Slime active" : activePiece?.isCatalystBomb ? "💣 Catalyst Bomb active" : activePiece?.isWildcard ? "✨ Wildcard Star active" : ""}`
                    : "STONE INCOMING!"}
                </h3>
                {isControllable ? (
                  <>
                    <p className="lg:hidden text-cyan-200 text-xs font-bold mb-1">
                      Tap board to rotate. Swipe/drag to move. Swipe down to drop.
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
                />
              </div>
            )}

            {gameState === "level_win" && (
              <div className="w-full flex flex-col items-center md:items-start">
                <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 drop-shadow-md">
                  Level Complete!
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
                  You reached <span className="score-readout">{animatedScore}</span> points on {currentLevel.name}!
                </p>
                
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-700/50 mb-5 text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-inner">
                  <span className="text-purple-400">👾 Glitches Earned:</span>
                  <span className="text-white font-black">+{Math.floor(totalScore / 10) + (level * 10)}</span>
                  <span className="text-yellow-300 ml-auto">Max Streak: {maxStreak}</span>
                </div>

                {level < FINAL_LEVEL_ID ? (
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
                ) : (
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
                )}
                {shareFeedback && (
                  <p className="mt-3 text-xs font-black text-cyan-300">{shareFeedback}</p>
                )}
              </div>
            )}

            {gameState === "gameover" && (
              <div className="w-full flex flex-col items-center md:items-start">
                <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 drop-shadow-md">
                  Game Over!
                </h2>
                <div className="bg-slate-900/60 p-3 md:p-6 rounded-2xl border border-slate-700/50 mb-4 md:mb-6 w-full text-center md:text-left shadow-inner">
                  <p className="text-base md:text-xl text-slate-300 mb-1 font-bold">
                    {misses >= STRIKES_ALLOWED 
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
                      +{Math.max(1, Math.floor(totalScore / 20) + (level * 2))}
                    </span>
                    <span className="text-yellow-300 ml-2">Max Streak: {maxStreak}</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <button type="button" onClick={() => startLevel(level)} className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.4)] transform transition hover:scale-105 border border-white/20">
                    RESTART LEVEL {level}
                  </button>
                  <button type="button" onClick={() => { playSFX("button"); setGameState("start"); setMenuTab("levels"); }} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
                    Main Menu
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
