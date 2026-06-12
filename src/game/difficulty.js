export const DIFFICULTY_PRESETS = {
  young: {
    id: "young",
    label: "Young Explorer",
    description: "More thinking time, four strikes, and gentler gravity.",
    gravityMultiplier: 1.08,
    quizMultiplier: 0.82,
    scoreTargetMultiplier: 0.9,
    strikes: 4,
    quickWindowSeconds: 3.2,
  },
  normal: {
    id: "normal",
    label: "Arcade",
    description: "The intended mix of quick trivia and board pressure.",
    gravityMultiplier: 0.78,
    quizMultiplier: 0.56,
    scoreTargetMultiplier: 1,
    strikes: 3,
    quickWindowSeconds: 2.2,
  },
  expert: {
    id: "expert",
    label: "Overdrive",
    description: "Fast gravity, short decisions, two strikes, and higher targets.",
    gravityMultiplier: 0.56,
    quizMultiplier: 0.38,
    scoreTargetMultiplier: 1.15,
    strikes: 2,
    quickWindowSeconds: 1.7,
  },
};

const LEVEL_RULES = {
  1: { target: 450, objective: { type: "score", amount: 450, label: "Reach the score target" } },
  2: { target: 500, objective: { type: "matches", amount: 1, label: "Trigger 1 color match" } },
  3: { target: 500, objective: { type: "fruits", amount: 1, label: "Detonate 1 fruit" } },
  4: { target: 550, objective: { type: "lines", amount: 1, label: "Clear 1 full line" } },
  5: { target: 550, objective: { type: "streak", amount: 5, label: "Reach a x5 answer streak" } },
  6: { target: 600, objective: { type: "matches", amount: 2, label: "Trigger 2 color matches" } },
  7: { target: 600, objective: { type: "questions", amount: 16, label: "Survive 16 questions" } },
  8: { target: 650, objective: { type: "specials", amount: 2, label: "Activate 2 special blocks" } },
  9: { target: 650, objective: { type: "lines", amount: 2, label: "Clear 2 full lines" } },
  10: { target: 700, objective: { type: "streak", amount: 7, label: "Reach a x7 answer streak" } },
  11: { target: 700, objective: { type: "matches", amount: 3, label: "Trigger 3 color matches" } },
  12: { target: 725, objective: { type: "questions", amount: 20, label: "Survive 20 questions" } },
  13: { target: 750, objective: { type: "lines", amount: 2, label: "Clear 2 full lines" } },
  14: { target: 775, objective: { type: "streak", amount: 8, label: "Reach a x8 answer streak" } },
  15: { target: 800, objective: { type: "fruits", amount: 3, label: "Detonate 3 fruits" } },
  16: { target: 825, objective: { type: "specials", amount: 4, label: "Activate 4 special blocks" } },
  17: { target: 850, objective: { type: "matches", amount: 4, label: "Trigger 4 color matches" } },
  18: { target: 875, objective: { type: "questions", amount: 24, label: "Survive 24 questions" } },
  19: { target: 900, objective: { type: "lines", amount: 3, label: "Clear 3 full lines" } },
  20: { target: 1000, objective: { type: "specials", amount: 5, label: "Activate 5 special blocks" } },
  98: { target: 700, objective: { type: "questions", amount: 20, label: "Complete 20 daily questions" } },
  99: { target: 500, objective: { type: "score", amount: 500, label: "Reach the score target" } },
};

const getMetricValue = (objective, metrics) => {
  switch (objective.type) {
    case "lines":
      return metrics.lines || 0;
    case "matches":
      return metrics.matches || 0;
    case "fruits":
      return metrics.fruits || 0;
    case "specials":
      return metrics.specials || 0;
    case "streak":
      return metrics.maxStreak || 0;
    case "questions":
      return metrics.questions || 0;
    case "score":
    default:
      return metrics.score || 0;
  }
};

export const getRunConfig = (level, difficultyId = "normal") => {
  const difficulty = DIFFICULTY_PRESETS[difficultyId] || DIFFICULTY_PRESETS.normal;
  const rule = LEVEL_RULES[level] || LEVEL_RULES[1];
  const target = Math.round((rule.target * difficulty.scoreTargetMultiplier) / 25) * 25;

  return {
    ...rule,
    target,
    objective: rule.objective.type === "score"
      ? { ...rule.objective, amount: target }
      : rule.objective,
    difficulty,
  };
};

export const getObjectiveStatus = (runConfig, metrics) => {
  const current = getMetricValue(runConfig.objective, metrics);
  return {
    current,
    required: runConfig.objective.amount,
    complete: current >= runConfig.objective.amount,
    progress: Math.min(100, Math.round((current / runConfig.objective.amount) * 100)),
  };
};

export const isRunComplete = (runConfig, metrics) =>
  (metrics.score || 0) >= runConfig.target &&
  getObjectiveStatus(runConfig, metrics).complete;
