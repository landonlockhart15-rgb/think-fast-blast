const HIGH_SCORES_KEY = "think-fast-blast-high-scores";

const getStorage = (customStorage) => {
  if (customStorage) return customStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const getHighScores = (storage) => {
  const target = getStorage(storage);
  if (!target) return {};
  try {
    const data = target.getItem(HIGH_SCORES_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const getHighScore = (levelId, storage) => {
  const scores = getHighScores(storage);
  return scores[levelId] || 0;
};

export const saveHighScore = (levelId, score, storage) => {
  const target = getStorage(storage);
  const scores = getHighScores(target);
  const currentBest = scores[levelId] || 0;
  if (score > currentBest) {
    scores[levelId] = score;
    if (target) {
      try {
        target.setItem(HIGH_SCORES_KEY, JSON.stringify(scores));
      } catch {
        // Fail-safe
      }
    }
    return true;
  }
  return false;
};

export const clearHighScores = (storage) => {
  const target = getStorage(storage);
  if (target) {
    try {
      target.removeItem(HIGH_SCORES_KEY);
    } catch {
      // Fail-safe
    }
  }
};
