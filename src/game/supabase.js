import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL || "https://xqacqfgnmtowihvroehf.supabase.co";
const supabaseKey =
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_RWBtPJNbwIkN5HogC54Rcw_vo_J6Tph";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export async function fetchEndlessLeaderboard() {
  try {
    const { data, error } = await supabase
      .from("endless_leaderboard")
      .select("id, player_name, score, level, created_at")
      .order("score", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("Supabase leaderboard fetch failed:", err);
    return null;
  }
}

export async function saveEndlessScoreToSupabase(name, score, level) {
  try {
    const { error } = await supabase
      .from("endless_leaderboard")
      .insert([{ player_name: name, score, level, created_at: new Date().toISOString() }]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn("Supabase leaderboard save failed:", err);
    return false;
  }
}
