const AI_PRESETS = {
  easy: { delayRange: [8500, 12500], accuracy: 0.5 },
  medium: { delayRange: [6500, 9500], accuracy: 0.68 },
  hard: { delayRange: [5200, 7800], accuracy: 0.82 },
};

export const getArenaAiTurn = (difficulty, playerScore, aiScore, random = Math.random) => {
  const preset = AI_PRESETS[difficulty] || AI_PRESETS.medium;
  let delayRange = [...preset.delayRange];
  let accuracy = preset.accuracy;
  const playerLead = playerScore - aiScore;

  if (playerLead >= 120) {
    delayRange = delayRange.map((value) => Math.max(4200, value - 1500));
    accuracy = Math.min(0.9, accuracy + 0.1);
  } else if (playerLead <= -60) {
    delayRange = delayRange.map((value) => value + 1200);
    accuracy = Math.max(0.42, accuracy - 0.08);
  }

  return {
    delay: delayRange[0] + random() * (delayRange[1] - delayRange[0]),
    accuracy,
  };
};
