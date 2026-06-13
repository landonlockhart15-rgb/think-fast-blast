export const SPECIAL_BLOCK_RATES = Object.freeze({
  fruit: 0.06,
  arenaFruit: 0.05,
  catalystBomb: 0.03,
  catalystWildcard: 0.03,
  slime: 0.12,
  aiRandomSpecial: 0.03,
});

const SPECIAL_STREAK_INTERVAL = 4;
const SPECIAL_STREAK_LIMIT = 20;

export const getStreakPowerType = (streak) => {
  if (
    streak < SPECIAL_STREAK_INTERVAL ||
    streak > SPECIAL_STREAK_LIMIT ||
    streak % SPECIAL_STREAK_INTERVAL !== 0
  ) {
    return null;
  }

  const milestone = streak / SPECIAL_STREAK_INTERVAL;
  if (milestone % 3 === 1) return "tnt";
  if (milestone % 3 === 2) return "drill";
  return "lightning";
};

export const isSpecialStreak = (streak) => getStreakPowerType(streak) !== null;
