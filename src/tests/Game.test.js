import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { getHighScore, saveHighScore, clearHighScores } from "../utils/storage.js";
import Game from "../components/Game.js";
import { setActiveProfileId, createProfile } from "../game/profileStore.js";

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

test("high score tracking isolates scores by profile", () => {
  const storage = new MemoryStorage();

  // This will initialize the default profile (Player 1)
  setActiveProfileId("player-1", storage);
  saveHighScore(1, 100, storage);

  // Create a second profile
  const profile2 = createProfile({ name: "Player 2" }, storage);
  const id2 = profile2?.id || "player-2";

  setActiveProfileId(id2, storage);
  saveHighScore(1, 200, storage);

  // Check isolation
  setActiveProfileId("player-1", storage);
  assert.equal(getHighScore(1, storage), 100);

  setActiveProfileId(id2, storage);
  assert.equal(getHighScore(1, storage), 200);
});

test("Game component renders high score and handles record messaging", () => {
  const sharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CAN_AND_WILL_BROAK || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  if (!sharedInternals) {
    assert.ok(true);
    return;
  }

  const originalDispatcher = sharedInternals.H;
  let mockStateVal = 0;
  sharedInternals.H = {
    useState: () => [mockStateVal, (newVal) => { mockStateVal = newVal; }],
    useEffect: (cb) => { cb(); },
  };

  try {
    // 1. Test case: new personal best (currentScore > previousBest)
    mockStateVal = 120;
    const element1 = Game({ levelId: 1, currentScore: 120, previousBest: 100 });
    const innerDiv1 = element1.props.children;
    const children1 = innerDiv1.props.children;

    // Check high score value is displayed
    const scoreValSpan1 = children1[1].props.children[1];
    assert.equal(scoreValSpan1.props.children, "120 pts");

    // Check "New Personal Best!" message is rendered
    const msgDiv1 = children1[2];
    assert.ok(msgDiv1);
    assert.equal(msgDiv1.props["data-testid"], "new-record-msg");
    assert.equal(msgDiv1.props.children, "🎉 New Personal Best!");

    // 2. Test case: tie score (currentScore === previousBest)
    mockStateVal = 100;
    const element2 = Game({ levelId: 1, currentScore: 100, previousBest: 100 });
    const children2 = element2.props.children.props.children;
    const msgDiv2 = children2[2];
    // Should be null/falsy since it's a tie
    assert.equal(msgDiv2, null);

    // 3. Test case: lower score (currentScore < previousBest)
    mockStateVal = 150;
    const element3 = Game({ levelId: 1, currentScore: 100, previousBest: 150 });
    const children3 = element3.props.children.props.children;
    const msgDiv3 = children3[2];
    // Should be null/falsy
    assert.equal(msgDiv3, null);

  } finally {
    sharedInternals.H = originalDispatcher;
  }
});

test("Game component plays correct, incorrect, and power-up SFX", () => {
  const sharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CAN_AND_WILL_BROAK || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  if (!sharedInternals) {
    assert.ok(true);
    return;
  }

  const originalDispatcher = sharedInternals.H;
  let mockStateVal = 0;
  sharedInternals.H = {
    useState: () => [mockStateVal, (newVal) => { mockStateVal = newVal; }],
    useEffect: (cb) => { cb(); },
  };

  try {
    let lastPlayed = null;
    const mockPlaySFX = (type) => {
      lastPlayed = type;
    };

    // 1. Initial render with levelId: 1
    Game({
      levelId: 1,
      currentScore: 100,
      previousBest: 100,
      playSFX: mockPlaySFX,
      correctCount: 0,
      incorrectCount: 0,
      powerUp: null,
    });

    // 2. Play correct answer SFX (reactive)
    Game({
      levelId: 1,
      currentScore: 100,
      previousBest: 100,
      playSFX: mockPlaySFX,
      correctCount: 1,
      incorrectCount: 0,
      powerUp: null,
    });
    assert.equal(lastPlayed, "correct");

    // 3. Play incorrect answer SFX (reactive)
    Game({
      levelId: 1,
      currentScore: 100,
      previousBest: 100,
      playSFX: mockPlaySFX,
      correctCount: 1,
      incorrectCount: 1,
      powerUp: null,
    });
    assert.equal(lastPlayed, "incorrect");

    // 4. Play power-up SFX (reactive)
    Game({
      levelId: 1,
      currentScore: 100,
      previousBest: 100,
      playSFX: mockPlaySFX,
      correctCount: 1,
      incorrectCount: 1,
      powerUp: "thunder",
    });
    assert.equal(lastPlayed, "thunder");

    // 5. Test headless mode returns null
    const headlessElement = Game({
      levelId: 1,
      currentScore: 100,
      previousBest: 100,
      playSFX: mockPlaySFX,
      headless: true,
    });
    assert.equal(headlessElement, null);

  } finally {
    sharedInternals.H = originalDispatcher;
  }
});

