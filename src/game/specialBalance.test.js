import assert from "node:assert/strict";
import test from "node:test";

import {
  getStreakPowerType,
  isSpecialStreak,
  SPECIAL_BLOCK_RATES,
  getEvolvedStreakPowerType,
  isEvolvedStreak,
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

test("evolved streak powers are triggered on multiples of 5, skipping multiples of 4", () => {
  assert.equal(getEvolvedStreakPowerType(4), null);
  assert.equal(getEvolvedStreakPowerType(5), "row_clear");
  assert.equal(getEvolvedStreakPowerType(9), null);
  assert.equal(getEvolvedStreakPowerType(10), "area_clear");
  assert.equal(getEvolvedStreakPowerType(15), "row_clear");
  assert.equal(getEvolvedStreakPowerType(20), null); // Multiple of 4 gets standard milestone power
  assert.equal(getEvolvedStreakPowerType(25), "row_clear");
  assert.equal(isEvolvedStreak(5), true);
  assert.equal(isEvolvedStreak(6), false);
});
