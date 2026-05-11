import { useCallback, useEffect, useRef, useState } from "react";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FRUITS,
  LEVEL_CONFIG,
  LEVELS,
  POINTS,
  PROGRESS_STORAGE_KEY,
  STRIKES_ALLOWED,
  TETROMINOES,
  WIN_SCORE_TARGET,
} from "./data/constants";
import { QUESTION_BANKS } from "./data/questions";
import {
  checkCollision,
  createEmptyBoard,
  rotateShapeClockwise,
  shuffleArray,
} from "./game/board";

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const FINAL_LEVEL_ID = LEVELS.at(-1).id;

const readSavedProgress = () => {
  try {
    const saved = Number.parseInt(localStorage.getItem(PROGRESS_STORAGE_KEY), 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 1), FINAL_LEVEL_ID) : 1;
  } catch {
    return 1;
  }
};

export default function App() {
  const [gameState, setGameState] = useState("start");
  const [level, setLevel] = useState(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(readSavedProgress);
  const [board, setBoard] = useState(createEmptyBoard());
  const [activePiece, setActivePiece] = useState(null);

  const [shuffledQuestions, setShuffledQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionsAnsweredThisLevel, setQuestionsAnsweredThisLevel] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lastCorrectAnswer, setLastCorrectAnswer] = useState("");

  const [totalScore, setTotalScore] = useState(0);
  const [isControllable, setIsControllable] = useState(true);
  const [pendingBlocks, setPendingBlocks] = useState(0);
  const [totalBlocksThisTurn, setTotalBlocksThisTurn] = useState(1);
  const [feedback, setFeedback] = useState("");
  const [explodingCells, setExplodingCells] = useState([]);

  // Timers and keyboard events need the newest state without being rebuilt on
  // every render. This ref mirrors the live game state for those callbacks.
  const stateRef = useRef({ board, activePiece, gameState, isControllable, pendingBlocks });

  useEffect(() => {
    stateRef.current = { board, activePiece, gameState, isControllable, pendingBlocks };
  }, [board, activePiece, gameState, isControllable, pendingBlocks]);

  useEffect(() => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, String(maxUnlockedLevel));
  }, [maxUnlockedLevel]);

  // -------------------------------------------------------------------------
  // Piece lifecycle
  // -------------------------------------------------------------------------
  const spawnPiece = useCallback((controllable) => {
    let pieceBase;

    if (controllable) {
      pieceBase = Math.random() < 0.1 ? randomItem(FRUITS) : randomItem(TETROMINOES);
    } else {
      pieceBase = { ...randomItem(TETROMINOES), color: "bg-slate-500", isStone: true };
    }

    const width = pieceBase.shape[0].length;
    const x = controllable
      ? Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2)
      : Math.floor(Math.random() * (BOARD_WIDTH - width + 1));
    const newPiece = { ...pieceBase, x, y: 0 };

    if (checkCollision(newPiece, stateRef.current.board)) {
      setGameState("gameover");
      return;
    }

    setPendingBlocks((prev) => prev - 1);
    setActivePiece(newPiece);
    setGameState("dropping");
  }, []);

  const lockPiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard } = stateRef.current;
    if (!piece) return;

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: piece.color,
            isFruit: piece.isFruit || false,
            emoji: piece.emoji || "",
            isStone: piece.isStone || false,
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setGameState("resolving");
  }, []);

  // -------------------------------------------------------------------------
  // Board resolver: fruit blasts, line clears, color matches, gravity, win/loss
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "resolving") return undefined;

    let pointsEarned = 0;
    const cellsToClear = [];

    const addCellToClear = (y, x) => {
      if (!cellsToClear.some((cell) => cell.y === y && cell.x === x)) {
        cellsToClear.push({ y, x });
      }
    };

    // Fruit bombs clear themselves and their four cardinal neighbors.
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (!board[y][x]?.isFruit) continue;
        [{ y, x }, { y: y + 1, x }, { y: y - 1, x }, { y, x: x + 1 }, { y, x: x - 1 }]
          .forEach((cell) => {
            const insideBoard =
              cell.y >= 0 && cell.y < BOARD_HEIGHT && cell.x >= 0 && cell.x < BOARD_WIDTH;
            if (insideBoard && board[cell.y][cell.x] !== null) addCellToClear(cell.y, cell.x);
          });
        pointsEarned += POINTS.FRUIT_BOMB;
      }
    }

    // Standard full-line clear.
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board[y].every((cell) => cell !== null)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear(y, x);
      pointsEarned += POINTS.LINE_CLEAR;
    }

    // Connected components of 5+ same-colored normal blocks clear together.
    const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const startCell = board[y][x];
        if (!startCell || startCell.isFruit || startCell.isStone || visited[y][x]) continue;

        const color = startCell.color;
        const component = [];
        const stack = [{ y, x }];

        while (stack.length > 0) {
          const current = stack.pop();
          const cy = current.y;
          const cx = current.x;
          const cell = board[cy]?.[cx];
          if (
            cy < 0 ||
            cy >= BOARD_HEIGHT ||
            cx < 0 ||
            cx >= BOARD_WIDTH ||
            visited[cy][cx] ||
            cell === null ||
            cell.color !== color ||
            cell.isFruit ||
            cell.isStone
          ) {
            continue;
          }

          visited[cy][cx] = true;
          component.push({ y: cy, x: cx });
          stack.push({ y: cy + 1, x: cx }, { y: cy - 1, x: cx }, { y: cy, x: cx + 1 }, { y: cy, x: cx - 1 });
        }

        if (component.length >= 5) {
          pointsEarned += POINTS.COLOR_MATCH + (component.length - 5) * 5;
          component.forEach((cell) => addCellToClear(cell.y, cell.x));
        }
      }
    }

    if (cellsToClear.length > 0) {
      // Let React finish the resolver render before showing the clear animation.
      // This keeps the effect lint-clean while preserving Gemini's animation.
      queueMicrotask(() => setExplodingCells(cellsToClear));

      const timer = setTimeout(() => {
        const nextBoard = board.map((row) => [...row]);
        cellsToClear.forEach((cell) => {
          nextBoard[cell.y][cell.x] = null;
        });

        // Gravity compacts each column downward after clears.
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          let writeY = BOARD_HEIGHT - 1;
          for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
            if (nextBoard[y][x] === null) continue;
            if (writeY !== y) {
              nextBoard[writeY][x] = nextBoard[y][x];
              nextBoard[y][x] = null;
            }
            writeY -= 1;
          }
        }

        setBoard(nextBoard);
        setExplodingCells([]);
        setTotalScore((prev) => prev + pointsEarned);
      }, 400);

      return () => clearTimeout(timer);
    }

    queueMicrotask(() => {
      const projectedScore = totalScore + pointsEarned;
      if (misses >= STRIKES_ALLOWED) {
        setGameState("gameover");
      } else if (projectedScore >= WIN_SCORE_TARGET) {
        setGameState("level_win");
        if (level < FINAL_LEVEL_ID) setMaxUnlockedLevel((prev) => Math.max(prev, level + 1));
      } else if (stateRef.current.pendingBlocks > 0) {
        spawnPiece(stateRef.current.isControllable);
      } else if (questionIndex >= shuffledQuestions.length - 1) {
        setGameState("gameover");
      } else {
        setQuestionIndex((prev) => prev + 1);
        setGameState("quiz");
      }
    });

    return undefined;
  }, [gameState, board, questionIndex, totalScore, misses, spawnPiece, shuffledQuestions.length, level]);

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------
  const moveDown = useCallback(() => {
    const { activePiece: piece, board: currentBoard } = stateRef.current;
    if (!piece) return;

    const movedPiece = { ...piece, y: piece.y + 1 };
    if (!checkCollision(movedPiece, currentBoard)) setActivePiece(movedPiece);
    else lockPiece();
  }, [lockPiece]);

  const moveHorizontal = useCallback((dir) => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping") return;

    const movedPiece = { ...piece, x: piece.x + dir };
    if (!checkCollision(movedPiece, currentBoard)) setActivePiece(movedPiece);
  }, []);

  const rotatePiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping" || piece.isFruit) return;

    const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
    if (!checkCollision(rotatedPiece, currentBoard)) setActivePiece(rotatedPiece);
  }, []);

  const hardDrop = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping") return;

    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) y += 1;
    setActivePiece({ ...piece, y });
  }, []);

  useEffect(() => {
    if (gameState !== "dropping") return undefined;
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const speed = stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    const timer = setInterval(moveDown, speed);
    return () => clearInterval(timer);
  }, [gameState, level, moveDown]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key) && stateRef.current.gameState === "dropping") {
        event.preventDefault();
      }

      if (stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;

      if (event.key === "ArrowLeft") moveHorizontal(-1);
      if (event.key === "ArrowRight") moveHorizontal(1);
      if (event.key === "ArrowDown") moveDown();
      if (event.key === "ArrowUp") rotatePiece();
      if (event.key === " ") hardDrop();
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hardDrop, moveDown, moveHorizontal, rotatePiece]);

  // -------------------------------------------------------------------------
  // Quiz flow
  // -------------------------------------------------------------------------
  const startLevel = (nextLevel) => {
    setLevel(nextLevel);
    setShuffledQuestions(shuffleArray(QUESTION_BANKS[nextLevel] || QUESTION_BANKS[1]));
    setBoard(createEmptyBoard());
    setActivePiece(null);
    setQuestionIndex(0);
    setQuestionsAnsweredThisLevel(0);
    setMisses(0);
    setLastCorrectAnswer("");
    setTotalScore(0);
    setIsControllable(true);
    setPendingBlocks(0);
    setTotalBlocksThisTurn(1);
    setFeedback("");
    setExplodingCells([]);
    setGameState("quiz");
  };

  const handleAnswer = (selectedIndex) => {
    const question = shuffledQuestions[questionIndex];
    const correct = selectedIndex === question.answer;
    const blocksToDrop = correct && questionsAnsweredThisLevel >= 5 ? 2 : 1;

    setIsControllable(correct);
    setPendingBlocks(blocksToDrop);
    setTotalBlocksThisTurn(blocksToDrop);

    if (correct) {
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);
      setFeedback(`Correct! +${POINTS.CORRECT_ANSWER} Pts. ${blocksToDrop > 1 ? "Prepare for 2 Blocks!" : "You have control."}`);
    } else {
      const correctAnswer = question.options[question.answer];
      setMisses((count) => count + 1);
      setLastCorrectAnswer(correctAnswer);
      setFeedback(`Wrong! The answer was ${correctAnswer}. Stone block incoming!`);
    }

    setGameState("transition");
    setTimeout(() => spawnPiece(correct), 1500);
  };

  // Compose the visible board by overlaying the falling piece on the locked board.
  const displayBoard = board.map((row) => [...row]);
  if (activePiece) {
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = activePiece.y + y;
        const boardX = activePiece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          displayBoard[boardY][boardX] = {
            color: activePiece.color,
            isFruit: activePiece.isFruit,
            emoji: activePiece.emoji,
            isStone: activePiece.isStone,
          };
        }
      });
    });
  }

  const currentQuestion = shuffledQuestions[questionIndex];
  const currentLevel = LEVELS.find((item) => item.id === level) || LEVELS[0];

  return (
    <div className="min-h-screen animated-bg text-slate-100 font-sans flex flex-col items-center p-4 overflow-x-hidden">
      <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start pt-4 md:pt-12">
        <section className="w-full md:w-1/2 flex flex-col items-center z-10" aria-label="Game board">
          <div className="flex justify-between w-full max-w-[300px] mb-3 px-3 py-2 bg-slate-900/80 backdrop-blur-md rounded-xl text-sm font-bold border border-slate-700/50 shadow-xl">
            <span className="text-slate-300">Lvl {level} | Score: <span className="text-cyan-400 text-lg">{totalScore}/{WIN_SCORE_TARGET}</span></span>
            <span className="text-red-400">Strikes: {misses}/{STRIKES_ALLOWED}</span>
          </div>

          <div className="bg-slate-900 border-4 border-slate-700 p-1 rounded-lg w-full max-w-[300px] aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden">
            {displayBoard.map((row, y) =>
              row.map((cell, x) => {
                const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none ${cell ? cell.color : "bg-slate-800"}`;
                if (cell?.isStone) cellClass += " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                if (isExploding) cellClass += " transition-all duration-[400ms] ease-out scale-150 opacity-0 rotate-180 z-10 blur-sm";
                else if (cell) cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";

                return <div key={`${y}-${x}`} className={cellClass}>{cell?.emoji || ""}</div>;
              })
            )}

            {gameState === "dropping" && !isControllable && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center border-4 border-slate-500">
                <h3 className="text-slate-300 font-bold mb-2 uppercase tracking-widest text-sm drop-shadow-lg">STONE BLOCK DROP!</h3>
                <h4 className="text-red-400 font-bold mb-2 uppercase tracking-widest text-xs drop-shadow-lg">Correct Answer:</h4>
                <span className="text-white text-3xl font-black animate-bounce drop-shadow-2xl">{lastCorrectAnswer}</span>
              </div>
            )}
          </div>

          {gameState === "dropping" && isControllable && (
            <div className="grid grid-cols-3 gap-2 mt-6 w-full max-w-[300px] md:hidden">
              <div />
              <button type="button" onClick={rotatePiece} className="bg-slate-700 active:bg-slate-600 p-4 rounded-lg flex justify-center items-center shadow-lg text-xl border border-slate-600">↑</button>
              <div />
              <button type="button" onClick={() => moveHorizontal(-1)} className="bg-slate-700 active:bg-slate-600 p-4 rounded-lg flex justify-center items-center shadow-lg text-xl border border-slate-600">←</button>
              <button type="button" onClick={moveDown} className="bg-slate-700 active:bg-slate-600 p-4 rounded-lg flex justify-center items-center shadow-lg text-xl border border-slate-600">↓</button>
              <button type="button" onClick={() => moveHorizontal(1)} className="bg-slate-700 active:bg-slate-600 p-4 rounded-lg flex justify-center items-center shadow-lg text-xl border border-slate-600">→</button>
            </div>
          )}
        </section>

        <main className="w-full md:w-1/2 flex flex-col items-center md:items-start p-6 bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-3xl shadow-2xl min-h-[350px] justify-center text-center md:text-left relative animate-float z-10">
          {gameState !== "start" && (
            <div className="absolute top-4 right-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg border border-white/20">
              LEVEL {level}: {currentLevel.name}
            </div>
          )}

          {gameState === "start" && (
            <div className="flex flex-col items-center md:items-start w-full">
              <h1 className="text-5xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-sm">Think Fast Blast</h1>
              <div className="text-slate-300 mb-8 leading-relaxed space-y-4 text-sm md:text-base font-medium">
                <p className="text-xl">Answer fast, place smart, and reach <strong className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{WIN_SCORE_TARGET} points</strong> to beat each level.</p>
                <div className="grid gap-3">
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 shadow-inner text-left">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs mb-3">How to Play</h2>
                    <ul className="space-y-2">
                      <li>Answer correctly to earn a block you can move and rotate.</li>
                      <li>Connect 5 same-color blocks touching up, down, left, or right to blast them for points.</li>
                      <li>Fill a full row like Tetris to clear the whole line.</li>
                      <li>Fruit blocks explode nearby blocks after they land.</li>
                      <li>Wrong answers reveal the correct answer, then drop a stone block you cannot control.</li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-left">
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 shadow-inner">
                      <h2 className="text-white font-black uppercase tracking-widest text-xs mb-3">Points</h2>
                      <ul className="space-y-2">
                        <li>Correct answer: <strong className="text-green-400">+10</strong></li>
                        <li>Fruit blast: <strong className="text-yellow-400">+50</strong></li>
                        <li>5-color blast: <strong className="text-blue-400">+30</strong></li>
                        <li>Full line: <strong className="text-purple-400">+100</strong></li>
                      </ul>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-red-500/40 shadow-inner">
                      <h2 className="text-red-200 font-black uppercase tracking-widest text-xs mb-3">Watch Out</h2>
                      <ul className="space-y-2">
                        <li>3 wrong answers ends the run.</li>
                        <li>Blocks touching the top ends the run.</li>
                        <li>Stone blocks only clear with lines or fruit.</li>
                      </ul>
                    </div>
                  </div>
                  <p className="text-cyan-200 border-l-4 border-cyan-400 pl-3 text-left">
                    Progress saves on this device. Highest unlocked level: <strong>{maxUnlockedLevel}</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setMaxUnlockedLevel(FINAL_LEVEL_ID)} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-2.5 px-4 rounded-lg shadow-lg transition-transform hover:scale-105">
                    Unlock All Levels
                  </button>
                  <button type="button" onClick={() => setMaxUnlockedLevel(1)} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-2.5 px-4 rounded-lg shadow-lg transition-transform hover:scale-105 border border-slate-500">
                    Reset Progress
                  </button>
                </div>
              </div>

              <h2 className="text-xl font-bold mb-4 text-white drop-shadow-md">Select Level</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                {LEVELS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.id > maxUnlockedLevel}
                    onClick={() => startLevel(item.id)}
                    className={`text-left font-black p-4 rounded-xl transition-all border min-h-[96px] ${
                      item.id <= maxUnlockedLevel
                        ? "bg-gradient-to-r from-blue-600 to-cyan-500 hover:scale-[1.02] text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] border-white/20"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700/50"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-widest opacity-80">{item.id <= maxUnlockedLevel ? `Level ${item.id} · ${item.ageHint}` : `Level ${item.id} · Locked`}</span>
                    <span className="block text-xl mt-1">{item.name}</span>
                    <span className="block text-sm mt-1 font-semibold opacity-80">{item.theme}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === "quiz" && currentQuestion && (
            <div className="w-full flex flex-col">
              <h2 className="text-sm font-black text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2 justify-center md:justify-start">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Question {questionIndex + 1}
              </h2>
              <h3 className="text-2xl md:text-3xl font-bold mb-8 text-white leading-tight drop-shadow-md">{currentQuestion.q}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {currentQuestion.options.map((option, index) => (
                  <button key={option} type="button" onClick={() => handleAnswer(index)} className="bg-slate-700/80 hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500 hover:scale-[1.02] transition-all p-5 rounded-2xl text-lg font-bold text-left shadow-lg border border-slate-600/50">
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === "transition" && (
            <div className="w-full flex flex-col items-center justify-center py-12">
              <h2 className={`text-4xl md:text-5xl font-black ${isControllable ? "text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" : "text-slate-400 drop-shadow-[0_0_15px_rgba(148,163,184,0.5)]"} animate-pulse text-center leading-tight`}>
                {feedback}
              </h2>
            </div>
          )}

          {gameState === "dropping" && (
            <div className="w-full flex flex-col items-center md:items-start text-slate-300">
              <h3 className="text-2xl font-black mb-6 text-white drop-shadow-md">
                {isControllable
                  ? `Place your block! ${totalBlocksThisTurn > 1 ? `(Block ${totalBlocksThisTurn - pendingBlocks} of ${totalBlocksThisTurn})` : ""}`
                  : "STONE INCOMING!"}
              </h3>
              {isControllable ? (
                <div className="hidden md:flex flex-col gap-3 bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
                  <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Arrows</kbd> Move & Rotate</p>
                  <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Space</kbd> Hard Drop</p>
                </div>
              ) : (
                <div className="bg-slate-700/50 p-6 rounded-2xl border border-slate-500/50">
                  <p className="text-slate-300 font-black text-lg">You have no control over this stone piece!</p>
                </div>
              )}
            </div>
          )}

          {gameState === "level_win" && (
            <div className="w-full flex flex-col items-center md:items-start">
              <h2 className="text-5xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 drop-shadow-md">Level Complete!</h2>
              <p className="text-xl text-slate-300 mb-8 font-medium">You reached {WIN_SCORE_TARGET} points on {currentLevel.name}!</p>
              {level < FINAL_LEVEL_ID ? (
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <button type="button" onClick={() => startLevel(level + 1)} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 px-8 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transform transition hover:scale-105 border border-white/20">
                    START LEVEL {level + 1}
                  </button>
                  <button type="button" onClick={() => setGameState("start")} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-4 px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
                    Main Menu
                  </button>
                </div>
              ) : (
                <div className="text-center md:text-left bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 w-full">
                  <p className="text-3xl font-black text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">You beat the game!</p>
                  <button type="button" onClick={() => setGameState("start")} className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black py-3 px-8 rounded-full shadow-lg hover:scale-105 transition-transform">
                    Main Menu
                  </button>
                </div>
              )}
            </div>
          )}

          {gameState === "gameover" && (
            <div className="w-full flex flex-col items-center md:items-start">
              <h2 className="text-5xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 drop-shadow-md">Game Over!</h2>
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 mb-8 w-full text-center md:text-left">
                <p className="text-xl text-slate-300 mb-2 font-bold">
                  {misses >= STRIKES_ALLOWED ? "You got 3 strikes!" : questionIndex >= shuffledQuestions.length - 1 ? "Ran out of questions!" : "The board filled up!"}
                </p>
                <p className="text-3xl text-cyan-400 font-black mt-4">Final Points: {totalScore}</p>
              </div>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <button type="button" onClick={() => startLevel(level)} className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black py-4 px-8 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.4)] transform transition hover:scale-105 border border-white/20">
                  RESTART LEVEL {level}
                </button>
                <button type="button" onClick={() => setGameState("start")} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-4 px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
                  Main Menu
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
