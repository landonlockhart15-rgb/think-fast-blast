export const PROFILE_LIST_KEY = "think-fast-blast-profiles";
export const ACTIVE_PROFILE_KEY = "think-fast-blast-active-profile";
export const DEFAULT_PROFILE_ID = "player-1";

const getStorage = (storage) => {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

const safeGetItem = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeSetItem = (storage, key, value) => {
  try {
    storage?.setItem(key, String(value));
  } catch {
    // Profiles still work in memory when persistent storage is unavailable.
  }
};

export const createDefaultProfile = () => ({
  id: DEFAULT_PROFILE_ID,
  name: "Player 1",
  avatar: "⚡",
  difficulty: "normal",
  onboardingComplete: false,
  createdAt: new Date().toISOString(),
});

export const readProfiles = (storage) => {
  const target = getStorage(storage);
  try {
    const parsed = JSON.parse(safeGetItem(target, PROFILE_LIST_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // Fall through to the default profile.
  }
  const profiles = [createDefaultProfile()];
  safeSetItem(target, PROFILE_LIST_KEY, JSON.stringify(profiles));
  return profiles;
};

export const writeProfiles = (profiles, storage) => {
  const target = getStorage(storage);
  safeSetItem(target, PROFILE_LIST_KEY, JSON.stringify(profiles));
  return profiles;
};

export const getActiveProfileId = (storage) => {
  const target = getStorage(storage);
  const profiles = readProfiles(target);
  const saved = safeGetItem(target, ACTIVE_PROFILE_KEY);
  if (profiles.some((profile) => profile.id === saved)) return saved;
  safeSetItem(target, ACTIVE_PROFILE_KEY, profiles[0].id);
  return profiles[0].id;
};

export const setActiveProfileId = (profileId, storage) => {
  const target = getStorage(storage);
  safeSetItem(target, ACTIVE_PROFILE_KEY, profileId);
};

export const getScopedStorageKey = (baseKey, profileId, storage) =>
  `${baseKey}:${profileId || getActiveProfileId(storage)}`;

export const readScopedValue = (baseKey, storage) => {
  const target = getStorage(storage);
  const scopedKey = getScopedStorageKey(baseKey, null, target);
  const scoped = safeGetItem(target, scopedKey);
  if (scoped !== null && scoped !== undefined) return scoped;

  const legacy = safeGetItem(target, baseKey);
  if (legacy !== null && legacy !== undefined) {
    safeSetItem(target, scopedKey, legacy);
    return legacy;
  }
  return null;
};

export const writeScopedValue = (baseKey, value, storage) => {
  const target = getStorage(storage);
  safeSetItem(target, getScopedStorageKey(baseKey, null, target), value);
};

export const createProfile = ({ name, avatar = "⚡", difficulty = "normal" }, storage) => {
  const target = getStorage(storage);
  const profiles = readProfiles(target);
  const profile = {
    id: `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || `Player ${profiles.length + 1}`).trim().slice(0, 18),
    avatar,
    difficulty,
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  };
  writeProfiles([...profiles, profile], target);
  return profile;
};

export const updateProfile = (profileId, updates, storage) => {
  const target = getStorage(storage);
  const profiles = readProfiles(target).map((profile) =>
    profile.id === profileId ? { ...profile, ...updates, id: profile.id } : profile
  );
  writeProfiles(profiles, target);
  return profiles.find((profile) => profile.id === profileId);
};

export const deleteProfile = (profileId, storage) => {
  const target = getStorage(storage);
  const profiles = readProfiles(target);
  if (profiles.length <= 1) return profiles;
  const wasActive = safeGetItem(target, ACTIVE_PROFILE_KEY) === profileId;
  const remaining = profiles.filter((profile) => profile.id !== profileId);
  writeProfiles(remaining, target);
  if (wasActive) setActiveProfileId(remaining[0].id, target);
  return remaining;
};
