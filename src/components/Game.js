import React, { useState, useEffect } from "react";
import { getHighScore } from "../utils/storage.js";

export default function Game({ levelId, currentScore }) {
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    setHighScore(getHighScore(levelId));
  }, [levelId, currentScore]);

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
      currentScore >= highScore && highScore > 0
        ? React.createElement(
            "div",
            { className: "text-xs text-emerald-400 font-black animate-pulse mt-1", "data-testid": "new-record-msg" },
            "🎉 New Personal Best!"
          )
        : null
    )
  );
}
