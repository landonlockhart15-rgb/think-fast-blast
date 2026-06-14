import React, { useState, useEffect } from "react";
import { getHighScore } from "../utils/storage.js";
import { playSFX as defaultPlaySFX } from "../game/audio.js";

const prevCounts = {
  correct: 0,
  incorrect: 0,
  powerUp: null,
};

export default function Game({
  levelId,
  currentScore,
  previousBest,
  playSFX = defaultPlaySFX,
  correctCount = 0,
  incorrectCount = 0,
  powerUp = null,
}) {
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    if (previousBest !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighScore(Math.max(previousBest, currentScore));
    } else {
      setHighScore(getHighScore(levelId));
    }
  }, [levelId, currentScore, previousBest]);

  useEffect(() => {
    // Reset caches on level change
    prevCounts.correct = correctCount;
    prevCounts.incorrect = incorrectCount;
    prevCounts.powerUp = powerUp;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  useEffect(() => {
    if (correctCount > prevCounts.correct) {
      playSFX("correct");
    }
    prevCounts.correct = correctCount;
  }, [correctCount, playSFX]);

  useEffect(() => {
    if (incorrectCount > prevCounts.incorrect) {
      playSFX("incorrect");
    }
    prevCounts.incorrect = incorrectCount;
  }, [incorrectCount, playSFX]);

  useEffect(() => {
    if (powerUp && powerUp !== prevCounts.powerUp) {
      const knownPowerUps = ["streak", "mutator", "thunder", "explosion", "drill"];
      const sfxType = knownPowerUps.includes(powerUp) ? powerUp : "streak";
      playSFX(sfxType);
    }
    prevCounts.powerUp = powerUp;
  }, [powerUp, playSFX]);

  const isNewRecord = previousBest !== undefined
    ? currentScore > previousBest && previousBest > 0
    : false;

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
        : null,
      React.createElement(
        "div",
        { className: "flex gap-2 mt-4 justify-center" },
        React.createElement(
          "button",
          {
            className: "px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold transition",
            "data-testid": "btn-sfx-correct",
            onClick: () => playSFX("correct"),
          },
          "Correct SFX"
        ),
        React.createElement(
          "button",
          {
            className: "px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition",
            "data-testid": "btn-sfx-incorrect",
            onClick: () => playSFX("incorrect"),
          },
          "Incorrect SFX"
        ),
        React.createElement(
          "button",
          {
            className: "px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition",
            "data-testid": "btn-sfx-powerup",
            onClick: () => {
              const knownPowerUps = ["streak", "mutator", "thunder", "explosion", "drill"];
              const sfxType = knownPowerUps.includes(powerUp) ? powerUp : "streak";
              playSFX(sfxType);
            },
          },
          "Power-Up SFX"
        )
      )
    )
  );
}
