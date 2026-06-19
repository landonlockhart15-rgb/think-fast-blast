import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(__dirname, "../App.jsx"), "utf8");

function getBoardParticlesCanvasSource() {
  const start = appSource.indexOf("function BoardParticlesCanvas");
  assert.notEqual(start, -1, "BoardParticlesCanvas should exist in App.jsx");

  const end = appSource.indexOf("\nfunction ScreenFlash", start);
  assert.notEqual(end, -1, "BoardParticlesCanvas should end before ScreenFlash");

  return appSource.slice(start, end);
}

test("BoardParticlesCanvas syncs animation props before the RAF loop can paint", () => {
  const source = getBoardParticlesCanvasSource();
  const activeSyncMatch = /useLayoutEffect\(\(\) => \{\s*activePieceRef\.current = activePiece;\s*}\s*, \[activePiece\]\);/.exec(source);
  const streakSyncMatch = /useLayoutEffect\(\(\) => \{\s*correctStreakRef\.current = correctStreak;\s*}\s*, \[correctStreak\]\);/.exec(source);
  const animationEffect = source.indexOf("const updateAndDraw = () => {");

  assert.ok(activeSyncMatch, "activePieceRef must be updated in a layout effect");
  assert.ok(streakSyncMatch, "correctStreakRef must be updated in a layout effect");
  assert.ok(animationEffect >= 0, "RAF update loop should exist");
  assert.ok(activeSyncMatch.index < animationEffect, "activePieceRef must be refreshed before the RAF effect is defined");
  assert.ok(streakSyncMatch.index < animationEffect, "correctStreakRef must be refreshed before the RAF effect is defined");
});

test("BoardParticlesCanvas RAF loop reads latest refs instead of stale props", () => {
  const source = getBoardParticlesCanvasSource();
  const updateStart = source.indexOf("const updateAndDraw = () => {");
  const updateEnd = source.indexOf("\n      drawParticles", updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart, "should locate RAF update body");

  const updateBody = source.slice(updateStart, updateEnd);
  assert.match(updateBody, /const currentStreak = correctStreakRef\.current;/);
  assert.match(updateBody, /const currentActivePiece = activePieceRef\.current;/);
  assert.doesNotMatch(updateBody, /if \(correctStreak >= 5 && activePiece\)/);
  assert.doesNotMatch(updateBody, /activePiece\.shape\.forEach/);
});

test("BoardParticlesCanvas keeps the RAF effect long-lived and cancels the latest frame", () => {
  const source = getBoardParticlesCanvasSource();
  const animationStart = source.indexOf("const updateAndDraw = () => {");
  const effectEnd = source.indexOf("\n  }, []);", animationStart);
  assert.ok(effectEnd > animationStart, "RAF effect should have an empty dependency array");

  const effectBody = source.slice(animationStart, effectEnd);
  assert.match(effectBody, /animationId = requestAnimationFrame\(updateAndDraw\);/);
  assert.match(effectBody, /cancelAnimationFrame\(animationId\);/);
});
