import test from "node:test";
import assert from "node:assert/strict";
import { fetchEndlessLeaderboard, saveEndlessScoreToSupabase } from "../game/supabase.js";

test("Supabase endless leaderboard helper functions exist and resolve safely", async () => {
  assert.equal(typeof fetchEndlessLeaderboard, "function");
  assert.equal(typeof saveEndlessScoreToSupabase, "function");

  // Since actual Supabase is offline/mocked or config is empty in test environment,
  // we check that these functions handle errors gracefully and resolve.
  const records = await fetchEndlessLeaderboard();
  // Should either be null (on warning/connection error) or an array of scores.
  assert.ok(records === null || Array.isArray(records));

  const saveSuccess = await saveEndlessScoreToSupabase("Test Player", 2500, 5);
  // Should resolve to either true or false.
  assert.equal(typeof saveSuccess, "boolean");
});
