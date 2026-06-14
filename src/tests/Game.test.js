import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { getHighScore, saveHighScore, clearHighScores } from "../utils/storage.js";
import Game from "../components/Game.js";

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

  removeItem(key) {
    this.values.delete(key);
  }
}

test("high score tracking saves new scores and returns them", () => {
  const storage = new MemoryStorage();
  
  // Initially, score should be 0
  assert.equal(getHighScore(1, storage), 0);

  // Saving a score of 100 should succeed
  const updated = saveHighScore(1, 100, storage);
  assert.equal(updated, true);
  assert.equal(getHighScore(1, storage), 100);
});

test("high score tracking does not overwrite with lower scores", () => {
  const storage = new MemoryStorage();

  saveHighScore(1, 150, storage);
  assert.equal(getHighScore(1, storage), 150);

  // Saving a lower score of 100 should return false and keep 150
  const updated = saveHighScore(1, 100, storage);
  assert.equal(updated, false);
  assert.equal(getHighScore(1, storage), 150);

  // Saving a higher score of 200 should succeed and update
  const updatedHigher = saveHighScore(1, 200, storage);
  assert.equal(updatedHigher, true);
  assert.equal(getHighScore(1, storage), 200);
});

test("high score tracking isolates scores by level ID", () => {
  const storage = new MemoryStorage();

  saveHighScore(1, 100, storage);
  saveHighScore(2, 250, storage);

  assert.equal(getHighScore(1, storage), 100);
  assert.equal(getHighScore(2, storage), 250);
});

test("clearHighScores clears all high scores", () => {
  const storage = new MemoryStorage();

  saveHighScore(1, 100, storage);
  assert.equal(getHighScore(1, storage), 100);

  clearHighScores(storage);
  assert.equal(getHighScore(1, storage), 0);
});

test("Game component is a functional React component", () => {
  assert.equal(typeof Game, "function");
});
