import test from "node:test";
import assert from "node:assert/strict";

import { getObjectiveStatus, getRunConfig, isRunComplete } from "./difficulty.js";

test("difficulty presets change target, strikes, and speed", () => {
  const young = getRunConfig(1, "young");
  const expert = getRunConfig(1, "expert");

  assert.ok(young.target < expert.target);
  assert.ok(young.difficulty.strikes > expert.difficulty.strikes);
  assert.ok(young.difficulty.gravityMultiplier > expert.difficulty.gravityMultiplier);
});

test("secondary objectives are required in addition to score", () => {
  const config = getRunConfig(4, "normal");
  const scoreOnly = { score: config.target, lines: 0 };
  const complete = { score: config.target, lines: 1 };

  assert.equal(getObjectiveStatus(config, scoreOnly).complete, false);
  assert.equal(isRunComplete(config, scoreOnly), false);
  assert.equal(isRunComplete(config, complete), true);
});
