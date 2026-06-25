import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(__dirname, "../App.jsx"), "utf8");
const compactSource = appSource.replace(/\s+/g, " ");

test("combo meter state and UI integration", () => {
  assert.match(
    compactSource,
    /const \[invincibilityShields, setInvincibilityShields\] = useState\(0\);/,
    "App should define invincibilityShields state initialized to 0"
  );
  assert.match(
    compactSource,
    /stateRef\.current = \{.*?invincibilityShields,.*?\};/,
    "stateRef should include invincibilityShields"
  );
  assert.match(
    compactSource,
    /<ComboMeter correctStreak=\{correctStreak\} shields=\{invincibilityShields\} \/>/,
    "App should render the ComboMeter component in the single-player view"
  );
});

test("escalating combo rewards trigger correctly on correct answers", () => {
  assert.match(
    compactSource,
    /if \(nextStreak === 3\) \{ const powerResult = applyBoardPower\(board, "power_earthquake"\);/,
    "Combo 3 should trigger Earthquake board clear"
  );
  assert.match(
    compactSource,
    /\} else if \(nextStreak === 5\) \{ const powerResult = applyBoardPower\(board, "power_tornado"\);/,
    "Combo 5 should trigger Tornado board clear"
  );
  assert.match(
    compactSource,
    /\} else if \(nextStreak === 7\) \{ setInvincibilityShields\(\(prev\) => Math\.min\(3, prev \+ 1\)\);/,
    "Combo 7 should reward an invincibility shield"
  );
  assert.match(
    compactSource,
    /\} else if \(nextStreak === 10\) \{ setInvincibilityShields\(\(prev\) => Math\.min\(3, prev \+ 1\)\); const powerResult = applyBoardPower\(board, "power_flood"\);/,
    "Combo 10 should reward both a shield and Flash Flood board clear"
  );
});

test("invincibility shield prevents stone drops on incorrect answers and timeouts", () => {
  assert.match(
    compactSource,
    /if \(invincibilityShields > 0\) \{ setInvincibilityShields\(\(prev\) => Math\.max\(0, prev - 1\)\); playSFX\("incorrect"\); triggerFlash\("info"\);.*?setFeedback\([^)]*Shield protected you![^)]*\);/,
    "wrong answer with shields active should consume a shield and prevent the stone block drop"
  );
  assert.match(
    compactSource,
    /if \(invincibilityShields > 0\) \{ setInvincibilityShields\(\(prev\) => Math\.max\(0, prev - 1\)\); playSFX\("incorrect"\); triggerFlash\("info"\);.*?Time's up!.*?Shield protected you!/,
    "timeout with shields active should consume a shield and prevent the stone block drop"
  );
});
