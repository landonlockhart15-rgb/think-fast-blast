import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(__dirname, "../App.jsx"), "utf8");
const compactSource = appSource.replace(/\s+/g, " ");

test("pressure mutators activate at the intended streak and near-top board thresholds", () => {
  assert.match(
    compactSource,
    /const isFrenzyActive = correctStreak >= 5;/,
    "frenzy should activate only at a 5+ correct-answer streak"
  );
  assert.match(
    compactSource,
    /const isDesperationActive = board\.slice\(0, 5\)\.some\(row => row\.some\(cell => cell !== null\)\);/,
    "desperation should activate when any occupied cell reaches the top five board rows"
  );
  assert.match(
    compactSource,
    /stateRef\.current = \{[^}]*isFrenzyActive,[^}]*isDesperationActive,/,
    "pressure state should be available to timer and resolution callbacks that read stateRef"
  );
});

test("frenzy applies double scoring to answers, quick bonuses, and board clears", () => {
  assert.match(
    compactSource,
    /const frenzyActive = nextStreak >= 5; const frenzyMultiplier = frenzyActive \? 2 : 1; setTotalScore\(\(score\) => score \+ POINTS\.CORRECT_ANSWER \* \(isDopamine \? 2 : 1\) \* frenzyMultiplier\);/,
    "the answer that reaches a 5-streak should receive the frenzy multiplier"
  );
  assert.match(
    compactSource,
    /setTotalScore\(\(score\) => score \+ 15 \* \(isDopamine \? 2 : 1\) \* frenzyMultiplier\);/,
    "quick-answer bonus points should use the same multiplier as the base answer"
  );
  assert.match(
    compactSource,
    /const frenzyActive = stateRef\.current\.correctStreak >= 5; const frenzyMultiplier = frenzyActive \? 2 : 1; setTotalScore\(\(prev\) => prev \+ pointsEarned \* \(isDopamine \? 2 : 1\) \* frenzyMultiplier\);/,
    "board clear points should be doubled while an already-active frenzy is in force"
  );
});

test("desperation slows gravity and upgrades wrong-answer stones from current top-row danger", () => {
  assert.match(
    compactSource,
    /if \(isFrenzyActive\) \{ speed = Math\.max\(5, Math\.round\(speed \/ 2\)\); \} if \(isDesperationActive\) \{ speed = Math\.round\(speed \* 1\.5\); \}/,
    "gravity should first apply frenzy acceleration and then desperation slowdown when both are active"
  );
  assert.match(
    compactSource,
    /isFrenzyActive, isDesperationActive\]\);/,
    "gravity interval should be recreated when either pressure state changes"
  );

  const topFiveBoardChecks = compactSource.match(
    /const desperationActive = (?:currentBoard|stateRef\.current\.board)\.slice\(0, 5\)\.some\(row => row\.some\(cell => cell !== null\)\);/g
  ) || [];
  assert.ok(
    topFiveBoardChecks.length >= 2,
    "both lava-rising and wrong-answer stone creation should derive desperation from the current board"
  );

  const upgradedStoneAssignments = compactSource.match(/heavyHits: desperationActive \? 3 : 2/g) || [];
  assert.ok(
    upgradedStoneAssignments.length >= 2,
    "all pressure-created heavy stones should become three-hit stones in desperation"
  );
});
