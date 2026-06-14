import { getActiveProfileId } from "../game/profileStore.js";

const HIGH_SCORES_KEY = "think-fast-blast-high-scores";

const getStorage = (customStorage) => {
  if (customStorage) return customStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const getScopedKey = (storage, profileId) => {
  const target = getStorage(storage);
  try {
    const pId = profileId || getActiveProfileId(target);
    return `${HIGH_SCORES_KEY}:${pId}`;
  } catch {
    return `${HIGH_SCORES_KEY}:player-1`;
  }
};

export const getHighScores = (storage, profileId) => {
  const target = getStorage(storage);
  if (!target) return {};
  try {
    const key = getScopedKey(target, profileId);
    const data = target.getItem(key);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const getHighScore = (levelId, storage, profileId) => {
  const scores = getHighScores(storage, profileId);
  return scores[levelId] || 0;
};

export const saveHighScore = (levelId, score, storage, profileId) => {
  const target = getStorage(storage);
  const scores = getHighScores(target, profileId);
  const currentBest = scores[levelId] || 0;
  if (score > currentBest) {
    scores[levelId] = score;
    if (target) {
      try {
        const key = getScopedKey(target, profileId);
        target.setItem(key, JSON.stringify(scores));
      } catch {
        // Fail-safe
      }
    }
    return true;
  }
  return false;
};

export const clearHighScores = (storage, profileId) => {
  const target = getStorage(storage);
  if (target) {
    try {
      const key = getScopedKey(target, profileId);
      target.removeItem(key);
    } catch {
      // Fail-safe
    }
  }
};
