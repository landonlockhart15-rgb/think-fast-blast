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
      activeTheme: parsed.activeTheme || "default"
    };
  } catch {
    return { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0, glitches: 0, unlockedItems: [], activeTheme: "default" };
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

  // Hoisted callbacks to ensure they are declared before useEffect bindings
  // Memoized game end handler to save stats, high scores, glitches and trigger audio
  const handleGameEnd = useCallback((isWin, finalScore) => {
    setIsPaused(false);
    if (isWin) {
      playSFX("level_win");
      triggerFlash("win");
      setGameState("level_win");
      if (level < FINAL_LEVEL_ID) setMaxUnlockedLevel((prev) => Math.max(prev, level + 1));
      
      const glitchesEarned = Math.floor(finalScore / 10) + (level * 10);
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
      
      const glitchesEarned = Math.max(1, Math.floor(finalScore / 20) + (level * 2));
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
  }, [level, questionsAnsweredThisLevel, questionIndex, triggerFlash]);

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
      const levelQuestions = QUESTION_BANKS[activeLevel] || QUESTION_BANKS[1];
      const q = randomItem(levelQuestions);
      setShuffledQuestions([q]);
      setQuestionIndex(0);
      setRecoveryTimer(4);
      setGameState("strike_recovery");
    } else {
      setGameState("transition");
      setTimeout(() => setGameState("resolving"), 1500);
    }
  }, [level, triggerFlash]);

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
        }
      }
    }

    if (cellsToClear.length > 0) {
      const anchor = cellsToClear[0];
      
      queueMicrotask(() => triggerShake());
      queueMicrotask(() => setExplodingCells(cellsToClear));
      queueMicrotask(() => triggerFlash(hasTnt || hasDrill || hasLightning ? "blast" : "score"));

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
  }, [gameState, board, questionIndex, totalScore, misses, shuffledQuestions.length, level, spawnQuizPiece, handleGameEnd, addFloatingText, triggerFloorRise, triggerFlash]);

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

        setShuffledQuestions(shuffleArray(QUESTION_BANKS[level] || QUESTION_BANKS[1]));
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
      playSFX("correct");
      triggerFlash("success");
      const nextStreak = correctStreak + 1;
      setCorrectStreak(nextStreak);
      setMaxStreak((currentMax) => Math.max(currentMax, nextStreak));
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);

      // Perfect Quick Answer Bonus check
      const elapsed = (Date.now() - questionStartTime) / 1000;
      let bonusText = "";
      if (elapsed <= 2.2) {
        setTotalScore((score) => score + 15);
        bonusText = " PERFECT! Quick Bonus +15 Pts!";
        addFloatingText("PERFECT! ⚡", piece?.x || 5, piece?.y || 4);
      }

      setIsControllable(true);

      // Check combo power-up conversion
      let newPiece = { ...piece };
      if (nextStreak === 3) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 3);
        addFloatingText("COMBO x3! TNT Block 💣", piece?.x || 5, piece?.y || 2);
      } else if (nextStreak === 5) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 5);
        addFloatingText("COMBO x5! Drill Block 🌀", piece?.x || 5, piece?.y || 2);
      } else if (nextStreak >= 7) {
        playSFX("streak");
        newPiece = makePowerUp(piece, 7);
        addFloatingText("COMBO x7! Lightning Rod ⚡", piece?.x || 5, piece?.y || 2);
      }

      setActivePiece(newPiece);
      setFeedback(`Correct!${bonusText} You have control.`);
      setGameState("dropping");
    } else {
      playSFX("incorrect");
      triggerFlash("danger");
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
        const levelQuestions = QUESTION_BANKS[activeLevel] || QUESTION_BANKS[1];
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
  }, [shuffledQuestions, questionIndex, level, board, correctStreak, questionStartTime, spawnQuizPiece, totalScore, handleGameEnd, addFloatingText, triggerFlash]);

  // -------------------------------------------------------------------------
  // Level Initialization
  // -------------------------------------------------------------------------
  const startLevel = useCallback((nextLevel) => {
    playSFX("button");
    setLevel(nextLevel);
    setShuffledQuestions(shuffleArray(QUESTION_BANKS[nextLevel] || QUESTION_BANKS[1]));
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
  }, []);

  // Compose display board by overlaying the active piece
  const displayBoard = board.map((row) => [...row]);
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
  const currentLevel = LEVELS.find((item) => item.id === level) || LEVELS[0];
  const isMenu = gameState === "start";
  
  const panelClass = isMenu
    ? "w-full max-w-5xl h-full flex flex-col items-center justify-center text-center z-10"
    : "w-full md:w-[58%] max-h-[43dvh] md:max-h-none flex flex-col items-center md:items-start p-3 md:p-5 bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl min-h-0 justify-center text-center md:text-left relative overflow-hidden z-10";

  return (
    <div className="h-dvh animated-bg text-slate-100 font-sans flex flex-col items-center p-2 md:p-4 overflow-hidden touch-manipulation">
      <Confetti active={gameState === "level_win"} />
      <ScreenFlash tone={flashColor} />
      
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

      <div className={`w-full h-full mx-auto flex min-h-0 ${isMenu ? "max-w-5xl items-center justify-center" : "max-w-6xl flex-col md:flex-row gap-2 md:gap-6 items-center md:items-stretch"}`}>
        
        {/* Playable Game Grid View */}
        {!isMenu && gameState !== "intro" && (
          <section className="w-full md:w-[42%] flex flex-col items-center justify-center min-h-0 z-10" aria-label="Game board">
            <div className="game-board-width flex justify-between mb-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-xs md:text-sm font-bold border border-slate-700/50 shadow-xl">
              <span className="text-slate-300">Lvl {level} | Score: <span className="text-cyan-400 text-lg">{totalScore}/{WIN_SCORE_TARGET}</span></span>
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
              <span className="text-red-400">Strikes: {misses}/{STRIKES_ALLOWED}</span>
            </div>

            <div
              className={`game-board bg-slate-900 border-4 border-slate-700 p-1 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden touch-none ${shake ? "animate-shake" : ""}`}
              onTouchStart={handleBoardTouchStart}
              onTouchEnd={handleBoardTouchEnd}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                  
                  // Apply active styles including Matrix code values for Retro theme
                  let cellColorClass = cell ? getThemeCellColor(cell.color, stats.activeTheme) : "bg-slate-800";
                  let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none ${cellColorClass}`;
                  
                  if (cell?.isStone) cellClass += " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                  if (cell?.isTNT) cellClass += " animate-glow-tnt";
                  if (cell?.isDrill) cellClass += " animate-glow-drill";
                  if (cell?.isLightning) cellClass += " animate-glow-lightning";
                  
                  if (isExploding) {
                    cellClass += " transition-all duration-[400ms] ease-out scale-150 opacity-0 rotate-180 z-10 blur-sm";
                  } else if (cell) {
                    cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";
                  }

                  // Retro matrix digit renderer
                  const displayText = (stats.activeTheme === "theme_retro" && cell && !cell.emoji && !cell.isStone)
                    ? (((y + x) % 2 === 0) ? "0" : "1")
                    : cell?.emoji || "";

                  return (
                    <div key={`${y}-${x}`} className={cellClass}>
                      {displayText}
                    </div>
                  );
                })
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
            <div className="menu-panel w-full max-w-5xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-6 z-10 flex flex-col overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 text-left border-b border-slate-700/50 pb-4">
                <div>
                  <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                    Think Fast Blast
                  </h1>
                  <p className="text-sm md:text-base text-cyan-200 font-semibold mt-0.5">
                    Speed Trivia & Block Blaster Puzzle
                  </p>
                </div>
                
                {/* Stats Dashboard */}
                <div className="flex flex-wrap gap-3 text-xs text-slate-300 bg-slate-950/50 px-4 py-2.5 rounded-xl border border-slate-700/40 shadow-inner">
                  <div>Games: <strong className="text-white">{stats.totalGames}</strong></div>
                  <div>Accuracy: <strong className="text-green-400">{stats.totalQuestions > 0 ? `${Math.round((stats.totalCorrect / stats.totalQuestions) * 100)}%` : "0%"}</strong></div>
                  <div>Correct: <strong className="text-cyan-400">{stats.totalCorrect}</strong></div>
                  <div>Glitches: <strong className="text-purple-400">{stats.glitches} 👾</strong></div>
                </div>
              </div>

              {/* Toolbar Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Navigation:</span>
                  <button type="button" onClick={() => { playSFX("button"); setMenuTab("shop"); }} className="menu-small-button bg-purple-600 hover:bg-purple-500 border-purple-400 shadow-md">
                    🔮 The Glitch Codex Shop
                  </button>
                  <button type="button" onClick={() => { playSFX("button"); setMenuTab("instructions"); }} className="menu-small-button">
                    📋 How to Play
                  </button>
                </div>
                
                <div className="flex items-center gap-2 text-xs">
                  <button type="button" onClick={() => { playSFX("button"); setMaxUnlockedLevel(FINAL_LEVEL_ID); }} className="menu-small-button bg-cyan-500 text-slate-950 border-cyan-300">Unlock All</button>
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
                    className="menu-small-button text-red-400 border-red-500/30 hover:bg-red-500/10"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Levels Selection Grid */}
              <div className="max-h-[50vh] overflow-y-auto pr-1">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-2 text-left">
                  Select A Challenge Level
                </h2>
                <div className="level-grid">
                  {LEVELS.map((item) => {
                    const isUnlocked = item.id <= maxUnlockedLevel;
                    const bestScore = stats.highScores[item.id] || 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!isUnlocked}
                        onClick={() => startLevel(item.id)}
                        className={`level-card flex flex-col justify-between ${
                          isUnlocked
                            ? "bg-gradient-to-br from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 hover:border-cyan-400/50 hover:shadow-[0_0_12px_rgba(34,211,238,0.15)] text-white border-slate-700"
                            : "bg-slate-900/60 text-slate-500 cursor-not-allowed border-slate-800/80"
                        }`}
                      >
                        <div>
                          <span className="block text-[10px] md:text-xs uppercase tracking-widest opacity-80 font-bold">
                            {isUnlocked ? `Level ${item.id} · ${item.ageHint}` : `Level ${item.id} · Locked`}
                          </span>
                          <span className={`block text-sm md:text-base mt-0.5 font-black ${isUnlocked ? "text-cyan-300" : "text-slate-600"}`}>
                            {item.name}
                          </span>
                          <span className="block text-xs mt-0.5 font-semibold opacity-70">
                            {item.theme}
                          </span>
                        </div>
                        {isUnlocked && bestScore > 0 && (
                          <div className="mt-1.5 text-[9px] font-black text-yellow-400 bg-slate-950/60 px-2 py-0.5 rounded border border-yellow-500/20 self-start flex items-center gap-1 shadow-inner">
                            🏆 Best: {bestScore}
                          </div>
                        )}
                        {!isUnlocked && (
                          <span className="mt-1.5 text-xs">🔒 Locked</span>
                        )}
                      </button>
                    );
                  })}
                </div>
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
                <h3 className="text-lg sm:text-xl md:text-3xl font-bold mb-3 md:mb-5 text-white leading-tight drop-shadow-md">
                  {currentQuestion.q}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 w-full">
                  {currentQuestion.options.map((option, index) => (
                    <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button bg-slate-700/80 hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500 hover:scale-[1.02] transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-slate-600/50">
                      {option}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 w-full">
                  {currentQuestion.options.map((option, index) => (
                    <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button bg-slate-700/80 hover:bg-gradient-to-r hover:from-red-600 hover:to-orange-500 hover:scale-[1.02] transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-red-500/50">
                      {option}
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
                <p className="text-base md:text-xl text-slate-300 mb-4 font-medium">
                  You reached {WIN_SCORE_TARGET} points on {currentLevel.name}!
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
