import { useCallback, useEffect, useRef, useState } from "react";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  POINTS,
  WIN_SCORE_TARGET,
} from "../data/constants";
import {
  checkCollision,
  rotateShapeClockwise,
} from "./board";
import {
  addGarbageRows,
  createArenaPiece,
  createOnlineArenaState,
  createRoomCode,
  lockArenaPiece,
  normalizeRoomCode,
  resolveArenaBoard,
} from "./onlineArena";
import { supabase } from "./supabase";

const CLIENT_ID_KEY = "think-fast-blast-online-client-id";
const SNAPSHOT_KEY_PREFIX = "think-fast-blast-online-snapshot:";

const getClientId = () => {
  const saved = sessionStorage.getItem(CLIENT_ID_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(CLIENT_ID_KEY, id);
  return id;
};

const readSnapshot = (roomCode, playerId) => {
  try {
    const value = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${roomCode}:${playerId}`);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

function BoardGrid({ board, piece, canControl }) {
  const display = board.map((row) => [...row]);

  if (piece && canControl) {
    let ghostY = piece.y;
    while (!checkCollision({ ...piece, y: ghostY + 1 }, board)) ghostY += 1;
    if (ghostY > piece.y) {
      piece.shape.forEach((row, shapeY) => {
        row.forEach((value, shapeX) => {
          if (!value) return;
          const y = ghostY + shapeY;
          const x = piece.x + shapeX;
          if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH && !display[y][x]) {
            display[y][x] = { color: piece.color, isGhost: true };
          }
        });
      });
    }
  }

  if (piece) {
    piece.shape.forEach((row, shapeY) => {
      row.forEach((value, shapeX) => {
        if (!value) return;
        const y = piece.y + shapeY;
        const x = piece.x + shapeX;
        if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
          display[y][x] = piece;
        }
      });
    });
  }

  return (
    <div className="online-arena-board grid grid-rows-16 grid-cols-10 gap-px">
      {display.flatMap((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${y}-${x}`}
            className={`online-arena-cell ${
              cell?.isLava ? "" : (cell?.color || "bg-slate-800")
            } ${cell?.isGhost ? "ghost-block opacity-40" : ""} ${
              cell?.isLava ? "border border-orange-500 bg-orange-600 animate-pulse animate-glow-lava" : ""
            } ${cell?.isStone && !cell?.isLava ? "border border-slate-400 bg-slate-600" : ""}`}
          >
            {cell?.emoji || ""}
          </div>
        ))
      )}
    </div>
  );
}

export default function OnlineArena({
  activeProfile,
  arenaLevel,
  questions,
  onExit,
  playSFX,
}) {
  const [clientId] = useState(getClientId);
  const [playerName, setPlayerName] = useState(() => activeProfile?.name || "Player");
  const displayName = playerName.trim() || "Player";
  const [screen, setScreen] = useState("lobby");
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [connection, setConnection] = useState("offline");
  const [error, setError] = useState("");
  const [players, setPlayers] = useState([]);
  const [match, setMatch] = useState(null);
  const [arena, setArena] = useState(createOnlineArenaState);
  const [activePiece, setActivePiece] = useState(null);
  const [answerState, setAnswerState] = useState(null);
  const [statusText, setStatusText] = useState("");
  const channelRef = useRef(null);
  const stateRef = useRef({});
  const roundWinnerRef = useRef(null);

  useEffect(() => {
    stateRef.current = { match, arena, activePiece, players, isHost, roomCode };
  }, [match, arena, activePiece, players, isHost, roomCode]);

  const send = useCallback((event, payload) => {
    const channel = channelRef.current;
    if (!channel) return Promise.resolve("no-channel");
    return channel.send({ type: "broadcast", event, payload });
  }, []);

  const sendSnapshot = useCallback((nextArena = stateRef.current.arena) => {
    if (!stateRef.current.match) return;
    send("player_state", {
      playerId: clientId,
      name: displayName,
      board: nextArena.board,
      score: nextArena.score,
      streak: nextArena.streak,
      toppedOut: nextArena.toppedOut,
      round: nextArena.round,
      sentAt: Date.now(),
    });
  }, [clientId, displayName, send]);

  const applyRound = useCallback((round, seed) => {
    roundWinnerRef.current = null;
    setActivePiece(createArenaPiece(seed, round));
    setAnswerState(null);
    setStatusText("Answer first to steer this block.");
    setArena((current) => ({ ...current, round }));
  }, []);

  const startMatchFromPayload = useCallback((payload) => {
    const snapshot = readSnapshot(payload.roomCode, clientId);
    const nextArena =
      snapshot?.matchId === payload.matchId
        ? { ...createOnlineArenaState(), ...snapshot.arena }
        : createOnlineArenaState();

    setArena(nextArena);
    setMatch(payload);
    setScreen("match");
    applyRound(payload.round || 0, payload.seed);
  }, [applyRound, clientId]);

  const connectRoom = useCallback((code, host) => {
    const normalized = normalizeRoomCode(code);
    if (normalized.length !== 6) {
      setError("Enter a 6-character room code.");
      return;
    }

    setError("");
    setConnection("connecting");
    setRoomCode(normalized);
    setIsHost(host);
    setPlayers([]);

    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase.channel(`tfb-arena:${normalized}`, {
      config: {
        broadcast: { self: true, ack: true },
        presence: { key: clientId },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const present = Object.values(channel.presenceState())
          .flat()
          .map((entry) => ({
            id: entry.playerId,
            name: entry.name,
            host: Boolean(entry.host),
            joinedAt: entry.joinedAt,
          }))
          .filter((player) => player.id);
        const unique = [...new Map(present.map((player) => [player.id, player])).values()]
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .slice(0, 4);
        const electedHostId = unique[0]?.id;
        setIsHost(electedHostId === clientId);
        setPlayers(unique.map((player) => ({
          ...player,
          host: player.id === electedHostId,
        })));
      })
      .on("broadcast", { event: "room_full" }, ({ payload }) => {
        if (payload.playerId !== clientId) return;
        setError("That room already has 4 players.");
        setConnection("offline");
        supabase.removeChannel(channel);
      })
      .on("broadcast", { event: "request_match" }, () => {
        if (!stateRef.current.isHost || !stateRef.current.match) return;
        send("match_start", stateRef.current.match);
      })
      .on("broadcast", { event: "match_start" }, ({ payload }) => {
        startMatchFromPayload(payload);
      })
      .on("broadcast", { event: "answer_attempt" }, ({ payload }) => {
        const current = stateRef.current;
        if (!current.isHost || !current.match || payload.round !== current.match.round) return;
        if (!current.players.some((player) => player.id === payload.playerId)) return;
        const matchQuestions = current.match.questions || [];
        const question = matchQuestions[payload.round % matchQuestions.length];
        if (!question || payload.answer !== question.answer) {
          send("answer_result", {
            playerId: payload.playerId,
            round: payload.round,
            result: "wrong",
          });
          return;
        }
        if (roundWinnerRef.current) return;
        roundWinnerRef.current = payload.playerId;
        const updated = { ...current.match, winnerId: payload.playerId };
        setMatch(updated);
        send("answer_result", {
          playerId: payload.playerId,
          round: payload.round,
          result: "correct",
        });
        send("round_locked", { round: payload.round, winnerId: payload.playerId });
      })
      .on("broadcast", { event: "answer_result" }, ({ payload }) => {
        if (payload.playerId !== clientId) return;
        setAnswerState(payload.result);
        if (payload.result === "correct") {
          playSFX("correct");
          setArena((current) => ({
            ...current,
            score: current.score + POINTS.CORRECT_ANSWER,
            streak: current.streak + 1,
          }));
          setStatusText("Correct. Steer and drop your block.");
        } else {
          playSFX("incorrect");
          setStatusText("Wrong answer. This block is locked.");
        }
      })
      .on("broadcast", { event: "round_locked" }, ({ payload }) => {
        setMatch((current) => current ? { ...current, winnerId: payload.winnerId } : current);
        setAnswerState((current) =>
          current === "correct" || current === "wrong" ? current : "locked"
        );
        if (payload.winnerId !== clientId) {
          setStatusText("Another player answered first. Stone block incoming.");
        }
        if (stateRef.current.isHost) {
          window.setTimeout(() => {
            const current = stateRef.current.match;
            if (!current || current.ended || current.round !== payload.round) return;
            const nextRound = payload.round + 1;
            setMatch((value) => ({ ...value, round: nextRound, winnerId: null }));
            send("next_round", { round: nextRound, seed: current.seed });
            applyRound(nextRound, current.seed);
          }, 7000);
        }
      })
      .on("broadcast", { event: "player_state" }, ({ payload }) => {
        setPlayers((current) =>
          current.map((player) =>
            player.id === payload.playerId ? { ...player, ...payload } : player
          )
        );
        if (stateRef.current.isHost && payload.score >= WIN_SCORE_TARGET) {
          send("match_end", { winnerId: payload.playerId, winnerName: payload.name });
        }
      })
      .on("broadcast", { event: "garbage_attack" }, ({ payload }) => {
        if (payload.fromId === clientId) return;
        setArena((current) => {
          const attacked = addGarbageRows(
            current.board,
            payload.count,
            `${payload.fromId}:${payload.round}:${clientId}`
          );
          const next = { ...current, board: attacked.board, toppedOut: attacked.toppedOut };
          if (attacked.toppedOut) {
            send("player_state", {
              playerId: clientId,
              name: displayName,
              ...next,
              sentAt: Date.now(),
            });
          }
          return next;
        });
        setStatusText(`${payload.fromName} sent ${payload.count} garbage row!`);
      })
      .on("broadcast", { event: "next_round" }, ({ payload }) => {
        setMatch((current) => current ? { ...current, round: payload.round, winnerId: null } : current);
        applyRound(payload.round, payload.seed);
      })
      .on("broadcast", { event: "match_end" }, ({ payload }) => {
        setMatch((current) => current ? { ...current, ended: true, ...payload } : current);
        setActivePiece(null);
        setStatusText(payload.winnerId === clientId ? "You won the arena!" : `${payload.winnerName} wins!`);
      })
      .subscribe(async (status, subscribeError) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          const presentCount = Object.values(channel.presenceState()).flat().length;
          if (!host && presentCount >= 4) {
            send("room_full", { playerId: clientId });
            return;
          }
          await channel.track({
            playerId: clientId,
            name: displayName.slice(0, 18),
            host,
            joinedAt: Date.now(),
          });
          setConnection("online");
          setScreen("room");
          if (!host) send("request_match", { playerId: clientId });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Online arena subscribe failed", subscribeError);
          setConnection("offline");
          setError("Could not connect to the arena. Check your internet and try again.");
        }
      });
  }, [applyRound, clientId, displayName, playSFX, send, startMatchFromPayload]);

  useEffect(() => () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }, []);

  useEffect(() => {
    if (!match || !roomCode) return;
    try {
      localStorage.setItem(
        `${SNAPSHOT_KEY_PREFIX}${roomCode}:${clientId}`,
        JSON.stringify({ matchId: match.matchId, arena })
      );
    } catch {
      // Reconnect snapshots are best effort.
    }
  }, [arena, clientId, match, roomCode]);

  const startOnlineMatch = () => {
    if (!isHost || players.length < 2 || questions.length === 0) return;
    const payload = {
      roomCode,
      matchId: crypto.randomUUID(),
      seed: `${roomCode}:${Date.now()}`,
      level: arenaLevel,
      questions,
      round: 0,
      winnerId: null,
      startedAt: Date.now(),
    };
    startMatchFromPayload(payload);
    send("match_start", payload);
  };

  const submitAnswer = (answer) => {
    if (!match || match.ended || answerState !== null) return;
    setAnswerState("pending");
    send("answer_attempt", {
      playerId: clientId,
      round: match.round,
      answer,
      sentAt: Date.now(),
    });
  };

  const moveHorizontal = (direction) => {
    if (answerState !== "correct" || !activePiece) return;
    const moved = { ...activePiece, x: activePiece.x + direction };
    if (!checkCollision(moved, arena.board)) setActivePiece(moved);
  };

  const rotate = () => {
    if (answerState !== "correct" || !activePiece || activePiece.isFruit) return;
    const rotated = { ...activePiece, shape: rotateShapeClockwise(activePiece.shape) };
    if (!checkCollision(rotated, arena.board)) setActivePiece(rotated);
  };

  const drop = useCallback(() => {
    if (!match || !activePiece) return;
    let piece = activePiece;
    if (answerState !== "correct") piece = { ...piece, color: "bg-slate-500", emoji: "🧱", isStone: true };
    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, arena.board)) y += 1;
    const locked = lockArenaPiece(arena.board, { ...piece, y });
    const resolved = resolveArenaBoard(locked.board);
    const nextArena = {
      ...arena,
      board: resolved.board,
      score: arena.score + resolved.points,
      streak: answerState === "correct" ? arena.streak : 0,
      toppedOut: locked.toppedOut,
    };
    setArena(nextArena);
    setActivePiece(null);
    sendSnapshot(nextArena);
    if (resolved.attacks > 0) {
      send("garbage_attack", {
        fromId: clientId,
        fromName: displayName,
        count: resolved.attacks,
        round: match.round,
      });
    }
    if (nextArena.score >= WIN_SCORE_TARGET || nextArena.toppedOut) return;
    setStatusText("Waiting for the next round...");
  }, [activePiece, answerState, arena, clientId, displayName, match, send, sendSnapshot]);

  useEffect(() => {
    const shouldAutoDrop = ["correct", "wrong", "locked"].includes(answerState);
    if (screen !== "match" || !activePiece || !shouldAutoDrop) return undefined;
    const timer = window.setTimeout(drop, answerState === "correct" ? 5200 : 1800);
    return () => window.clearTimeout(timer);
  }, [activePiece, answerState, drop, screen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (screen !== "match") return;
      if (["1", "2", "3", "4"].includes(event.key)) submitAnswer(Number(event.key) - 1);
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") moveHorizontal(-1);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") moveHorizontal(1);
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") rotate();
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const matchQuestions = match?.questions || [];
  const question = matchQuestions.length > 0
    ? matchQuestions[match.round % matchQuestions.length]
    : null;
  const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  if (screen === "lobby") {
    return (
      <div className="online-arena-panel">
        <div className="online-arena-kicker">True Cross-Device Multiplayer</div>
        <h2>Online Blast Arena</h2>
        <p>Play a two-player online duel or a three-to-four-player free-for-all. Every device gets one full-size board.</p>
        <label className="online-name-field">
          <span>Your Arena Name</span>
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value.slice(0, 18))}
            maxLength={18}
            aria-label="Arena player name"
          />
        </label>
        <div className="online-rules-brief">
          <strong>First to {WIN_SCORE_TARGET} points wins.</strong>
          <span>Answer first to steer. Clear lines to send garbage rows to every opponent.</span>
        </div>
        <button
          type="button"
          className="online-primary-button"
          onClick={() => connectRoom(createRoomCode(), true)}
        >
          Create Room
        </button>
        <div className="online-room-join">
          <input
            value={roomInput}
            onChange={(event) => setRoomInput(normalizeRoomCode(event.target.value))}
            placeholder="ROOM CODE"
            maxLength={6}
            aria-label="Room code"
          />
          <button type="button" onClick={() => connectRoom(roomInput, false)}>Join Room</button>
        </div>
        {error && <div className="online-arena-error">{error}</div>}
        <button type="button" className="online-secondary-button" onClick={onExit}>Back</button>
      </div>
    );
  }

  if (screen === "room") {
    return (
      <div className="online-arena-panel">
        <div className="online-arena-kicker">{connection === "online" ? "Room Online" : "Connecting"}</div>
        <h2>Room {roomCode}</h2>
        <p>
          Share this code. {players.length <= 2
            ? "Two connected players start an online 1v1 duel."
            : `${players.length} connected players start a free-for-all.`}
        </p>
        <div className="online-player-list">
          {players.map((player) => (
            <div key={player.id}>
              <strong>{player.id === clientId ? `${player.name} (You)` : player.name}</strong>
              <span>{player.host ? "Host" : "Ready"}</span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, index) => (
            <div key={`open-${index}`} className="online-player-open">Open player slot</div>
          ))}
        </div>
        {isHost ? (
          <button
            type="button"
            className="online-primary-button"
            disabled={players.length < 2}
            onClick={startOnlineMatch}
          >
            {players.length === 2
              ? "Start Online 1v1"
              : `Start ${players.length}-Player Free-for-All`}
          </button>
        ) : (
          <div className="online-waiting">Waiting for the host to start...</div>
        )}
        <button type="button" className="online-secondary-button" onClick={onExit}>Leave Room</button>
      </div>
    );
  }

  return (
    <div className="online-match-shell">
      <header className="online-match-header">
        <div>
          <div className="online-arena-kicker">Room {roomCode}</div>
          <strong>{displayName}</strong>
        </div>
        <div className="online-match-score">{arena.score}<small>/{WIN_SCORE_TARGET}</small></div>
        <button type="button" onClick={onExit}>Leave</button>
      </header>

      <div className="online-opponent-strip">
        {sortedPlayers.map((player) => (
          <div key={player.id} className={player.id === clientId ? "online-opponent-self" : ""}>
            <strong>{player.id === clientId ? "You" : player.name}</strong>
            <span>{player.score || 0}</span>
            {player.toppedOut && <em>OUT</em>}
          </div>
        ))}
      </div>

      <div className="online-match-body">
        <BoardGrid board={arena.board} piece={activePiece} canControl={answerState === "correct"} />
        <section className="online-question-panel">
          {match?.ended ? (
            <div className="online-match-result">
              <div>{match.winnerId === clientId ? "🏆" : "⚡"}</div>
              <h2>{match.winnerId === clientId ? "You Win!" : `${match.winnerName} Wins!`}</h2>
              <button type="button" onClick={onExit}>Return to Arena</button>
            </div>
          ) : question ? (
            <>
              <div className="online-round-label">Round {match.round + 1}</div>
              <h3>{question.q}</h3>
              <div className="online-answer-grid">
                {question.options.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    disabled={answerState !== null}
                    onClick={() => submitAnswer(index)}
                  >
                    <span>{index + 1}</span>{option}
                  </button>
                ))}
              </div>
              <p className={`online-status online-status-${answerState || "ready"}`}>{statusText}</p>
              <div className="online-board-controls">
                <button type="button" onClick={() => moveHorizontal(-1)}>←</button>
                <button type="button" onClick={rotate}>Rotate</button>
                <button type="button" onClick={() => moveHorizontal(1)}>→</button>
                <button type="button" className="online-drop-button" onClick={drop} disabled={!activePiece}>DROP</button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
