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
