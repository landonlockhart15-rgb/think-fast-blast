import { useEffect, useState } from "react";
import { fetchEndlessLeaderboard } from "../game/supabase";

export default function EndlessLeaderboardView({ stats, activeProfile, onBack }) {
  const [globalScores, setGlobalScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("global"); // "global" | "local"

  useEffect(() => {
    let active = true;
    const loadGlobal = async () => {
      setLoading(true);
      setError(false);
      const data = await fetchEndlessLeaderboard();
      if (!active) return;
      if (data) {
        setGlobalScores(data);
      } else {
        setError(true);
      }
      setLoading(false);
    };

    loadGlobal();
    return () => {
      active = false;
    };
  }, []);

  const localScores = stats.endlessHighScores || [];

  return (
    <div className="menu-panel w-full max-w-5xl z-10 p-6 bg-slate-900/95 border border-slate-700/60 rounded-3xl shadow-2xl relative overflow-hidden">
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
        <div className="text-left">
          <div className="menu-kicker text-cyan-400 font-bold uppercase tracking-widest text-xs">Arcade Cabinet Hall of Fame</div>
          <h2 className="text-3xl font-black text-white leading-tight">Endless Overdrive Leaderboard</h2>
          <p className="text-sm text-slate-400">Scale speed, blast blocks, and set historic records.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="bg-slate-800 hover:bg-slate-700 text-white font-black py-2 px-6 rounded-xl text-sm border border-slate-700 transition shadow-md"
        >
          Back
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("global")}
          className={`px-6 py-2.5 rounded-xl font-bold transition text-sm ${
            activeTab === "global"
              ? "bg-cyan-500 text-slate-950 shadow-lg"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          🌐 Global Top 10
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("local")}
          className={`px-6 py-2.5 rounded-xl font-bold transition text-sm ${
            activeTab === "local"
              ? "bg-cyan-500 text-slate-950 shadow-lg"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          🏆 Personal Best
        </button>
      </div>

      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 min-h-[300px]">
        {activeTab === "global" ? (
          loading ? (
            <div className="flex flex-col items-center justify-center min-h-[250px] text-slate-400 gap-2">
              <span className="text-4xl animate-spin">⚙</span>
              <span className="text-sm font-bold">Connecting to Supabase Leaderboard...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center min-h-[250px] text-slate-400 text-center p-4">
              <span className="text-3xl mb-2">📡</span>
              <span className="text-sm font-bold text-slate-300">Global Leaderboard Offline</span>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                We couldn't reach the online database. Please check your connection or switch to the Personal Best tab.
              </p>
            </div>
          ) : globalScores.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[250px] text-slate-500 font-bold">
              No global records set yet. Be the first!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-800">
                    <th className="py-2.5 px-4">Rank</th>
                    <th className="py-2.5 px-4">Player</th>
                    <th className="py-2.5 px-4 text-right">Stage Reached</th>
                    <th className="py-2.5 px-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {globalScores.map((row, idx) => {
                    const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                    const isSelf = row.player_name === activeProfile?.name;
                    return (
                      <tr
                        key={row.id || idx}
                        className={`border-b border-slate-900/50 transition hover:bg-slate-900/20 ${
                          isSelf ? "bg-cyan-500/10 font-bold" : ""
                        }`}
                      >
                        <td className="py-3 px-4 text-slate-400 font-black">{rankEmoji}</td>
                        <td className="py-3 px-4 flex items-center gap-2">
                          <span className="text-white font-bold">{row.player_name}</span>
                          {isSelf && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-black">YOU</span>}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-400">Stage {row.level || 1}</td>
                        <td className="py-3 px-4 text-right font-black text-white">{row.score} pts</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          localScores.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[250px] text-slate-500 font-bold text-center">
              <span className="text-3xl mb-2">🎮</span>
              <span>No endless records set on this profile.</span>
              <p className="text-xs text-slate-600 mt-1">Play Endless Overdrive mode to record your best runs!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-800">
                    <th className="py-2.5 px-4">Rank</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4 text-right">Stage Reached</th>
                    <th className="py-2.5 px-4 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {localScores.map((row, idx) => {
                    const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                    return (
                      <tr key={idx} className="border-b border-slate-900/50 transition hover:bg-slate-900/20">
                        <td className="py-3 px-4 text-slate-400 font-black">{rankEmoji}</td>
                        <td className="py-3 px-4 text-slate-400">{row.date}</td>
                        <td className="py-3 px-4 text-right font-bold text-amber-400">Stage {row.stage || 1}</td>
                        <td className="py-3 px-4 text-right font-black text-white">{row.score} pts</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
