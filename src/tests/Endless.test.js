import test from "node:test";
import assert from "node:assert/strict";
import { fetchEndlessLeaderboard, saveEndlessScoreToSupabase, supabase } from "../game/supabase.js";

test("Supabase endless leaderboard helper functions exist and resolve safely", async () => {
  assert.equal(typeof fetchEndlessLeaderboard, "function");
  assert.equal(typeof saveEndlessScoreToSupabase, "function");

  // Mock supabase.from to prevent hitting the real network / live database
  const originalFrom = supabase.from;
  supabase.from = (tableName) => {
    assert.equal(tableName, "endless_leaderboard");
    return {
      select: (columns) => {
        assert.equal(columns, "id, player_name, score, level, created_at");
        return {
          order: (column, options) => {
            assert.equal(column, "score");
            assert.deepEqual(options, { ascending: false });
            return {
              limit: (count) => {
                assert.equal(count, 10);
                return Promise.resolve({
                  data: [
                    { id: 1, player_name: "Mock Player", score: 2500, level: 5, created_at: "2026-06-16T00:00:00Z" }
                  ],
                  error: null
                });
              }
            };
          }
        };
      },
      insert: (rows) => {
        assert.equal(rows.length, 1);
        assert.equal(rows[0].player_name, "Test Player");
        assert.equal(rows[0].score, 2500);
        assert.equal(rows[0].level, 5);
        return Promise.resolve({ data: null, error: null });
      }
    };
  };

  try {
    const records = await fetchEndlessLeaderboard();
    // Verify that our mocked data is successfully returned
    assert.ok(Array.isArray(records));
    assert.equal(records.length, 1);
    assert.equal(records[0].player_name, "Mock Player");
    assert.equal(records[0].score, 2500);

    const saveSuccess = await saveEndlessScoreToSupabase("Test Player", 2500, 5);
    // Verify that the helper returns true on successful insertion
    assert.equal(saveSuccess, true);
  } finally {
    // Restore original from method
    supabase.from = originalFrom;
  }
});
