import React from "react";

// Level-end high-score card. Reads ONLY from props: the canonical per-level best
// lives in App's `stats.highScores` (persisted under the stats storage key) and
// is passed in as `previousBest`. This component intentionally keeps no store of
// its own — an earlier autonomous change added a second parallel high-score store
// that could disagree with the real one; that store has been removed.
export default function Game({
  levelId,
  currentScore,
  previousBest = 0,
}) {
  const highScore = Math.max(previousBest, currentScore);
  const isNewRecord = currentScore > previousBest && previousBest > 0;

  return React.createElement(
    "div",
    {
      className: "bg-slate-900/80 p-4 rounded-xl border border-slate-700/50 mb-4 w-full max-w-md shadow-xl",
      "data-testid": "game-high-score-display",
    },
    React.createElement(
      "div",
      { className: "flex flex-col gap-1 text-slate-100" },
      React.createElement(
        "div",
        { className: "text-xs uppercase tracking-widest text-slate-400 font-bold" },
        "High Score Info"
      ),
      React.createElement(
        "div",
        { className: "flex justify-between items-center mt-2" },
        React.createElement("span", { className: "text-sm text-slate-300" }, `Level ${levelId} Record:`),
        React.createElement(
          "span",
          { className: "text-lg text-amber-400 font-black", "data-testid": "high-score-val" },
          `${highScore} pts`
        )
      ),
      isNewRecord
        ? React.createElement(
            "div",
            { className: "text-xs text-emerald-400 font-black animate-pulse mt-1", "data-testid": "new-record-msg" },
            "🎉 New Personal Best!"
          )
        : null
    )
  );
}
