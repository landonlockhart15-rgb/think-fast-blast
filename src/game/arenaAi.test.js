import assert from "node:assert/strict";
import test from "node:test";

import { getArenaAiTurn } from "./arenaAi.js";

test("arena AI always gives the player a readable answer window", () => {
  assert.equal(getArenaAiTurn("easy", 0, 0, () => 0).delay, 8500);
  assert.equal(getArenaAiTurn("medium", 0, 0, () => 0).delay, 6500);
  assert.equal(getArenaAiTurn("hard", 0, 0, () => 0).delay, 5200);
});

test("arena AI adapts without becoming instant or unfair", () => {
  const chasing = getArenaAiTurn("medium", 200, 50, () => 0);
  const leading = getArenaAiTurn("medium", 50, 200, () => 0);

  assert.equal(chasing.delay, 5000);
  assert.equal(chasing.accuracy, 0.78);
  assert.equal(leading.delay, 7700);
  assert.ok(Math.abs(leading.accuracy - 0.6) < Number.EPSILON);
});
