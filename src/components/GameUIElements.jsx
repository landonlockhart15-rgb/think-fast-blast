import { useEffect, useState } from "react";

// Live countdown of the ≤2.2s "PERFECT" quick-answer bonus window. Pure visual.
export function QuickAnswerTimer({ startTime, active, windowSeconds = 2.2 }) {
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

  const WINDOW = windowSeconds;
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

export function MenuLightfield() {
  return (
    <div className="menu-lightfield" aria-hidden="true">
      <div className="menu-perspective-grid" />
      <div className="menu-scanline" />
      <div className="menu-light-sweep menu-light-sweep-a" />
      <div className="menu-light-sweep menu-light-sweep-b" />
    </div>
  );
}

export function MenuStatPill({ label, value, accent = "text-cyan-300" }) {
  return (
    <div className="menu-stat-pill">
      <span>{label}</span>
      <strong className={accent}>{value}</strong>
    </div>
  );
}

export function AchievementCard({ id, definition, unlocked, stats, maxUnlockedLevel }) {
  const progressById = {
    first_win: [stats.levelsWon || 0, 1],
    line: [stats.totalLines || 0, 1],
    bigmatch: [stats.totalMatches || 0, 1],
    tnt: [stats.bestStreak || 0, 3],
    drill: [stats.bestStreak || 0, 5],
    lightning: [stats.bestStreak || 0, 7],
    streak10: [stats.bestStreak || 0, 10],
    level5: [Math.max(0, maxUnlockedLevel - 1), 5],
    level10: [Math.max(0, maxUnlockedLevel - 1), 10],
    champion: [Math.max(0, maxUnlockedLevel - 1), 20],
    daily: [stats.lastDailyWin ? 1 : 0, 1],
    scholar: [stats.totalCorrect || 0, 100],
    veteran: [stats.totalGames || 0, 10],
    arena: [stats.arenaWins || 0, 1],
    glitch_hoard: [stats.glitches || 0, 1000],
  };
  const progress = progressById[id];
  const percentage = unlocked
    ? 100
    : progress
      ? Math.min(100, Math.round((progress[0] / progress[1]) * 100))
      : 0;

  return (
    <article className={unlocked ? "achievement-card achievement-card-unlocked" : "achievement-card achievement-card-locked"}>
      <div className="achievement-card-icon" aria-hidden="true">{unlocked ? definition.emoji : "?"}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3>{definition.label}</h3>
          <span className={unlocked ? "achievement-status achievement-status-earned" : "achievement-status"}>
            {unlocked ? "Earned" : "Locked"}
          </span>
        </div>
        <p>{definition.desc}</p>
        <div className="achievement-progress" aria-label={`${definition.label} progress`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
        <small>
          {unlocked
            ? "Complete"
            : progress
              ? `${Math.min(progress[0], progress[1])} / ${progress[1]}`
              : "Complete this challenge in one run"}
        </small>
      </div>
    </article>
  );
}

export function PiecePreview({ label, piece, muted = false }) {
  const shape = piece?.shape || [[0]];
  const columns = Math.max(1, shape[0]?.length || 1);

  return (
    <div className={muted ? "piece-preview piece-preview-muted" : "piece-preview"}>
      <span className="piece-preview-label">{label}</span>
      <div
        className="piece-preview-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {shape.flatMap((row, y) =>
          row.map((value, x) => (
            <span
              key={`${y}-${x}`}
              className={value ? `piece-preview-cell ${piece?.color || "bg-slate-600"}` : "piece-preview-cell piece-preview-cell-empty"}
            >
              {value ? piece?.emoji || "" : ""}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function ComboMeter({ correctStreak, shields }) {
  // Determine next milestone
  let nextMilestone = 3;
  let nextReward = "Earthquake Clear ≋";
  let colorClass = "from-emerald-500 to-teal-500";
  let bgGlow = "";

  if (correctStreak >= 10) {
    nextMilestone = 13;
    nextReward = "Firestorm 🔥 & Shield 🛡️";
    colorClass = "from-red-500 via-pink-500 to-indigo-500";
    bgGlow = "shadow-[0_0_20px_rgba(236,72,153,0.5)] border-pink-500/40";
  } else if (correctStreak >= 7) {
    nextMilestone = 10;
    nextReward = "Flash Flood 🌊 & Shield 🛡️";
    colorClass = "from-blue-500 via-indigo-500 to-purple-500";
    bgGlow = "shadow-[0_0_15px_rgba(99,102,241,0.4)] border-indigo-500/40";
  } else if (correctStreak >= 5) {
    nextMilestone = 7;
    nextReward = "Invincibility Shield 🛡️";
    colorClass = "from-purple-500 to-indigo-500";
    bgGlow = "shadow-[0_0_15px_rgba(139,92,246,0.4)] border-purple-500/40";
  } else if (correctStreak >= 3) {
    nextMilestone = 5;
    nextReward = "Tornado Clear 🌪️";
    colorClass = "from-amber-500 to-orange-500";
    bgGlow = "shadow-[0_0_12px_rgba(245,158,11,0.4)] border-amber-500/40";
  }

  let prevMilestone = 0;
  if (correctStreak >= 10) prevMilestone = 10;
  else if (correctStreak >= 7) prevMilestone = 7;
  else if (correctStreak >= 5) prevMilestone = 5;
  else if (correctStreak >= 3) prevMilestone = 3;

  const progressPct = correctStreak >= nextMilestone 
    ? 100 
    : Math.min(100, Math.max(0, ((correctStreak - prevMilestone) / (nextMilestone - prevMilestone)) * 100));

  return (
    <div className={`combo-meter-hud game-board-width mb-3 p-3 bg-slate-950/90 border border-slate-800/80 rounded-xl transition-all duration-300 ${correctStreak >= 3 ? `${bgGlow}` : ""}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 text-[9px] font-black rounded uppercase tracking-wider ${correctStreak >= 5 ? "bg-rose-500 text-white animate-pulse" : correctStreak >= 3 ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
            Combo
          </span>
          <span className={`text-base font-black transition-all duration-300 ${correctStreak >= 5 ? "text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-purple-400 to-indigo-400 font-extrabold" : correctStreak >= 3 ? "text-amber-400" : "text-slate-300"}`}>
            x{correctStreak}
          </span>
        </div>
        
        {/* Shield Indicator */}
        <div className="flex items-center gap-1.5" aria-label={`Invincibility Shields: ${shields}`}>
          {shields > 0 ? (
            <div className="flex items-center gap-1 bg-indigo-950/60 border border-indigo-500/40 px-2 py-0.5 rounded-full text-indigo-300 animate-pulse">
              <span className="text-[9px] font-black uppercase tracking-wider">Shield:</span>
              <div className="flex gap-0.5">
                {Array.from({ length: shields }).map((_, idx) => (
                  <span key={idx} className="text-xs filter drop-shadow-[0_0_3px_rgba(99,102,241,0.8)]">🛡️</span>
                ))}
              </div>
            </div>
          ) : (
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">No Shield</span>
          )}
        </div>
      </div>

      {/* Progress Bar to next reward */}
      <div className="relative">
        <div className="flex justify-between text-[9px] text-slate-400 mb-0.5 font-semibold uppercase tracking-wider">
          <span>Next: {nextReward}</span>
          <span className="text-slate-500">{correctStreak}/{nextMilestone}</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-300 ease-out`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

