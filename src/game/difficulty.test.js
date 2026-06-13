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

test("secondary objectives are required in addition to the score target", () => {
  const config = getRunConfig(4, "normal");
  const scoreOnly = { score: config.target, lines: 0 };
  const complete = { score: config.target, lines: 1 };

  assert.equal(getObjectiveStatus(config, scoreOnly).complete, false);
  assert.equal(isRunComplete(config, scoreOnly), false);
  assert.equal(isRunComplete(config, complete), true);
});

test("every campaign level requires its displayed score and mission goals", () => {
  for (let level = 1; level <= 20; level += 1) {
    const config = getRunConfig(level, "normal");
    const completeMetrics = {
      score: config.target,
      lines: 99,
      matches: 99,
      fruits: 99,
      specials: 99,
      maxStreak: 99,
      questions: 99,
    };

    assert.equal(
      isRunComplete(config, { ...completeMetrics, score: config.target - 1 }),
      false,
      `level ${level} should continue below ${config.target}`
    );
    assert.equal(
      isRunComplete(config, completeMetrics),
      true,
      `level ${level} should finish when both requirements are met`
    );
  }
});
