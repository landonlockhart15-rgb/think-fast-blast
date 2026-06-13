import assert from "node:assert/strict";
import test from "node:test";

import {
  getStreakPowerType,
  isSpecialStreak,
  SPECIAL_BLOCK_RATES,
} from "./specialBalance.js";

test("streak powers are limited to spaced milestones", () => {
  assert.equal(getStreakPowerType(3), null);
  assert.equal(getStreakPowerType(4), "tnt");
  assert.equal(getStreakPowerType(8), "drill");
  assert.equal(getStreakPowerType(12), "lightning");
  assert.equal(getStreakPowerType(16), "tnt");
  assert.equal(getStreakPowerType(20), "drill");
  assert.equal(getStreakPowerType(21), null);
  assert.equal(isSpecialStreak(19), false);
});

test("random special block rates stay rare", () => {
  assert.ok(SPECIAL_BLOCK_RATES.fruit <= 0.06);
  assert.ok(SPECIAL_BLOCK_RATES.arenaFruit <= 0.05);
  assert.ok(SPECIAL_BLOCK_RATES.catalystBomb <= 0.03);
  assert.ok(SPECIAL_BLOCK_RATES.catalystWildcard <= 0.03);
  assert.ok(SPECIAL_BLOCK_RATES.slime <= 0.12);
});
