import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_PROFILE_KEY,
  MAX_PROFILES,
  createProfile,
  deleteProfile,
  getActiveProfileId,
  readProfiles,
  readScopedValue,
  setActiveProfileId,
  writeScopedValue,
} from "./profileStore.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("profiles isolate scoped save data", () => {
  const storage = new MemoryStorage();
  const first = readProfiles(storage)[0];
  const second = createProfile({ name: "Nova", avatar: "🚀" }, storage);

  setActiveProfileId(first.id, storage);
  writeScopedValue("stats", "first", storage);
  setActiveProfileId(second.id, storage);
  writeScopedValue("stats", "second", storage);

  assert.equal(readScopedValue("stats", storage), "second");
  setActiveProfileId(first.id, storage);
  assert.equal(readScopedValue("stats", storage), "first");
});

test("deleting the active profile selects a remaining profile", () => {
  const storage = new MemoryStorage();
  const first = readProfiles(storage)[0];
  const second = createProfile({ name: "Nova" }, storage);
  setActiveProfileId(second.id, storage);

  const remaining = deleteProfile(second.id, storage);

  assert.equal(remaining.length, 1);
  assert.equal(getActiveProfileId(storage), first.id);
  assert.equal(storage.getItem(ACTIVE_PROFILE_KEY), first.id);
});

test("profiles are capped at five save slots", () => {
  const storage = new MemoryStorage();
  readProfiles(storage);
  for (let index = 2; index <= MAX_PROFILES; index += 1) {
    assert.ok(createProfile({ name: `Player ${index}` }, storage));
  }

  assert.equal(readProfiles(storage).length, MAX_PROFILES);
  assert.equal(createProfile({ name: "Player 6" }, storage), null);
});

test("profile progress can be read and written without changing the active profile", () => {
  const storage = new MemoryStorage();
  const first = readProfiles(storage)[0];
  const second = createProfile({ name: "Nova", startingLevel: 7 }, storage);

  writeScopedValue("progress", "3", storage, first.id);
  writeScopedValue("progress", "7", storage, second.id);

  assert.equal(readScopedValue("progress", storage, first.id), "3");
  assert.equal(readScopedValue("progress", storage, second.id), "7");
});
