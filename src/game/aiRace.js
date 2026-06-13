import { POINTS } from "../data/constants.js";
import { getObjectiveStatus, isRunComplete } from "./difficulty.js";
import {
  isSpecialStreak,
  SPECIAL_BLOCK_RATES,
} from "./specialBalance.js";

export const createAiRaceMetrics = () => ({
  score: 0,
  correct: 0,
  questions: 0,
  lines: 0,
  matches: 0,
  fruits: 0,
  specials: 0,
  maxStreak: 0,
  streak: 0,
});

export const advanceAiRace = (current, runConfig, correct, random = Math.random) => {
  const next = {
    ...current,
    questions: current.questions + 1,
    streak: correct ? current.streak + 1 : 0,
  };

  if (correct) {
    next.correct += 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    const boardRoll = random();
    const boardPoints = boardRoll > 0.86 ? 100 : boardRoll > 0.58 ? 50 : boardRoll > 0.28 ? 25 : 0;
    next.score += POINTS.CORRECT_ANSWER + boardPoints;

    if (random() < 0.2) next.lines += 1;
    if (random() < 0.24) next.matches += 1;
    if (random() < SPECIAL_BLOCK_RATES.fruit) next.fruits += 1;
    if (isSpecialStreak(next.streak) || random() < SPECIAL_BLOCK_RATES.aiRandomSpecial) {
      next.specials += 1;
    }
  }

  return {
    metrics: next,
    objectiveStatus: getObjectiveStatus(runConfig, next),
    complete: isRunComplete(runConfig, next),
  };
};
