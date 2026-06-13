import assert from "node:assert/strict";
import test from "node:test";

import { getRunConfig } from "./difficulty.js";
import { advanceAiRace, createAiRaceMetrics } from "./aiRace.js";

test("AI race answers do not lock out the player and advance independently", () => {
  const config = getRunConfig(2, "normal");
  const result = advanceAiRace(createAiRaceMetrics(), config, true, () => 0);

  assert.equal(result.metrics.correct, 1);
  assert.equal(result.metrics.questions, 1);
  assert.equal(result.metrics.score, 10);
  assert.equal(result.complete, false);
});

test("AI race completion requires both score and mission goals", () => {
  const config = getRunConfig(2, "normal");
  const current = {
    ...createAiRaceMetrics(),
    score: config.target,
  };
  const scoreOnly = advanceAiRace(current, config, false, () => 1);
  assert.equal(scoreOnly.complete, false);

  const completed = advanceAiRace(
    { ...current, matches: config.objective.amount },
    config,
    false,
    () => 1
  );
  assert.equal(completed.complete, true);
});
