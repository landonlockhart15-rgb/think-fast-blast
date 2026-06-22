import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(__dirname, "../App.jsx"), "utf8");
const compactSource = appSource.replace(/\s+/g, " ");
const vibrateCallbackMatch = compactSource.match(
  /const vibrate = useCallback\(\(pattern\) => \{ (?<body>.*?) \}, \[hapticsEnabled, reduceMotion\]\);/
);

test("vibrate callback respects hapticsEnabled and reduceMotion settings", () => {
  assert.ok(vibrateCallbackMatch, "vibrate callback should be present with haptics and reduceMotion dependencies");

  // Verify that vibration is blocked when either haptics are disabled OR reduceMotion is requested.
  assert.match(
    compactSource,
    /const vibrate = useCallback\(\(pattern\) => \{ if \(!hapticsEnabled \|\| reduceMotion\) return;/,
    "vibrate callback must return early if either hapticsEnabled is false or reduceMotion is true"
  );
  // Verify both dependencies are specified in the callback dependency array.
  assert.match(
    compactSource,
    /\}, \[hapticsEnabled, reduceMotion\]\);/,
    "vibrate dependency array must include both hapticsEnabled and reduceMotion to prevent stale closure bugs"
  );
});

test("all hardware vibration is centralized behind the reduced-motion guard", () => {
  const navigatorVibrateCalls = compactSource.match(/navigator\.vibrate\(/g) ?? [];
  assert.equal(navigatorVibrateCalls.length, 1, "hardware vibration should only be called from the guarded callback");
  assert.match(
    vibrateCallbackMatch.groups.body,
    /if \(!hapticsEnabled \|\| reduceMotion\) return;.*navigator\.vibrate\(pattern\);/,
    "the single hardware vibration call must remain behind both the haptics and reduce-motion gates"
  );
});

test("haptic vibration feedback patterns are safe and follow guidelines", () => {
  // 1. Correct Answer Escalation Haptics
  assert.match(
    compactSource,
    /vibrate\(nextStreak >= 5 \? \[18, 40, 18\] : 16\);/,
    "correct answer vibration should escalate on higher streaks (5+), using mild patterns"
  );

  // 2. Incorrect Answer Danger Haptics
  assert.match(
    compactSource,
    /vibrate\(\[60, 30, 90\]\);/,
    "incorrect answer vibration should use distinct three-pulse pattern"
  );

  // 3. Board Clear / Special Combos Haptics
  assert.match(
    compactSource,
    /vibrate\(hasTnt \|\| hasDrill \|\| hasLightning \? \[30, 20, 70\] : comboHapticPattern\);/,
    "combos with special blocks should trigger distinct heavy vibration"
  );

  // 4. Milestone combo feedback patterns
  assert.match(
    compactSource,
    /const comboHapticPattern = comboFeedbackLevel >= 5 \? \[22, 28, 42\] : comboFeedbackLevel >= 3 \? \[18, 24, 28\] : 22;/,
    "combo feedback haptic patterns must match the specified level escalation values"
  );

  // 5. Mild feedback for routine interactions (tetris move/rotate vs land)
  assert.match(
    compactSource,
    /vibrate\(15\);/,
    "routine tetris piece drops/locks should trigger lightweight 15ms vibration"
  );
  assert.match(
    compactSource,
    /vibrate\(20\);/,
    "routine piece moves/rotations should trigger mild 20ms haptic tap"
  );

  // 6. Achievement Unlocked Haptics
  assert.match(
    compactSource,
    /vibrate\(28\);/,
    "achievement unlock notification should trigger a clean, noticeable vibration"
  );

  // 7. Lava Surge mutator activation
  assert.match(
    compactSource,
    /vibrate\(\[80, 80\]\);/,
    "high-alert mutators (like volcanic surge) should trigger a strong haptic warning"
  );
});
