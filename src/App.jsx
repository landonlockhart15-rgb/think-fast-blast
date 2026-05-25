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
import { playSFX } from "./game/audio";
import Confetti from "./game/Confetti";

const STATS_STORAGE_KEY = "think-fast-blast-stats";

const readSavedStats = () => {
  try {
    const saved = localStorage.getItem(STATS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0 };
  } catch {
    return { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0 };
  }
};

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
  const [showInstructions, setShowInstructions] = useState(true);
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

  const [heldPiece, setHeldPiece] = useState(null);
  const [hasHeldThisTurn, setHasHeldThisTurn] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [stats, setStats] = useState(readSavedStats);

  // Timers and keyboard events need the newest state without being rebuilt on
  // every render. This ref mirrors the live game state for those callbacks.
  const stateRef = useRef({ board, activePiece, gameState, isControllable, pendingBlocks, heldPiece, hasHeldThisTurn });
  const touchStartRef = useRef(null);

  useEffect(() => {
    stateRef.current = { board, activePiece, gameState, isControllable, pendingBlocks, heldPiece, hasHeldThisTurn };
  }, [board, activePiece, gameState, isControllable, pendingBlocks, heldPiece, hasHeldThisTurn]);

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
      playSFX("gameover");
      setGameState("gameover");
      setStats((prevStats) => {
        const newStats = {
          ...prevStats,
          totalGames: prevStats.totalGames + 1,
          totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
          totalQuestions: prevStats.totalQuestions + (questionIndex + 1)
        };
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
        return newStats;
      });
      return;
    }

    setPendingBlocks((prev) => prev - 1);
    setHasHeldThisTurn(false);
    setActivePiece(newPiece);
    setGameState("dropping");
  }, [questionsAnsweredThisLevel, questionIndex]);

  const lockPiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard } = stateRef.current;
    if (!piece) return;

    playSFX("lock");

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
  // Board resolver: cascading fruit blasts, line clears, matches, gravity, win/loss
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "resolving") return undefined;

    let cleanupCurrentTimers = null;

    const runCascadeStep = (currentBoardState, currentCombo, currentPointsAccumulated) => {
      let stepPoints = 0;
      const cellsToClear = [];
      let hasFruitBomb = false;

      const addCellToClear = (y, x) => {
        if (!cellsToClear.some((cell) => cell.y === y && cell.x === x)) {
          cellsToClear.push({ y, x });
        }
      };

      // 1. Fruit bombs
      for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          if (!currentBoardState[y][x]?.isFruit) continue;
          hasFruitBomb = true;
          [{ y, x }, { y: y + 1, x }, { y: y - 1, x }, { y, x: x + 1 }, { y, x: x - 1 }]
            .forEach((cell) => {
              const insideBoard =
                cell.y >= 0 && cell.y < BOARD_HEIGHT && cell.x >= 0 && cell.x < BOARD_WIDTH;
              if (insideBoard && currentBoardState[cell.y][cell.x] !== null) addCellToClear(cell.y, cell.x);
            });
          stepPoints += POINTS.FRUIT_BOMB;
        }
      }

      // 2. Standard full-line clears
      for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        if (!currentBoardState[y].every((cell) => cell !== null)) continue;
        for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear(y, x);
        stepPoints += POINTS.LINE_CLEAR;
      }

      // 3. Same-colored normal blocks connected components (5+)
      const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
      for (let y = 0; y < BOARD_HEIGHT; y += 1) {
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          const startCell = currentBoardState[y][x];
          if (!startCell || startCell.isFruit || startCell.isStone || visited[y][x]) continue;

          const color = startCell.color;
          const component = [];
          const stack = [{ y, x }];

          while (stack.length > 0) {
            const current = stack.pop();
            const cy = current.y;
            const cx = current.x;
            const cell = currentBoardState[cy]?.[cx];
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
            stepPoints += POINTS.COLOR_MATCH + (component.length - 5) * 5;
            component.forEach((cell) => addCellToClear(cell.y, cell.x));
          }
        }
      }

      if (cellsToClear.length > 0) {
        setExplodingCells(cellsToClear);
        
        if (hasFruitBomb) {
          playSFX("explosion");
        } else {
          playSFX("match", currentCombo);
        }

        setIsShaking(true);
        const shakeTimer = setTimeout(() => setIsShaking(false), 250);

        const resolveTimer = setTimeout(() => {
          const nextBoard = currentBoardState.map((row) => [...row]);
          cellsToClear.forEach((cell) => {
            nextBoard[cell.y][cell.x] = null;
          });

          // Gravity compact downward
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

          const multiplier = 1 + currentCombo * 0.5;
          const comboScoreEarned = Math.floor(stepPoints * multiplier);
          const nextPointsAccumulated = currentPointsAccumulated + comboScoreEarned;

          setBoard(nextBoard);
          setExplodingCells([]);
          setTotalScore((prev) => prev + comboScoreEarned);
          
          if (currentCombo > 0) {
            setFeedback(`COMBO x${currentCombo + 1}! +${comboScoreEarned} Pts!`);
          }

          runCascadeStep(nextBoard, currentCombo + 1, nextPointsAccumulated);
        }, 400);

        cleanupCurrentTimers = () => {
          clearTimeout(shakeTimer);
          clearTimeout(resolveTimer);
        };
      } else {
        // No matches left in this turn. Apply Win/Lose conditions.
        const finalScore = totalScore + currentPointsAccumulated;

        queueMicrotask(() => {
          if (misses >= STRIKES_ALLOWED) {
            playSFX("gameover");
            setGameState("gameover");
            
            setStats((prevStats) => {
              const newStats = {
                ...prevStats,
                totalGames: prevStats.totalGames + 1,
                totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
                totalQuestions: prevStats.totalQuestions + (questionIndex + 1)
              };
              localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
              return newStats;
            });
          } else if (finalScore >= WIN_SCORE_TARGET) {
            playSFX("level_win");
            setGameState("level_win");
            if (level < FINAL_LEVEL_ID) setMaxUnlockedLevel((prev) => Math.max(prev, level + 1));
            
            setStats((prevStats) => {
              const updatedHighScores = { ...prevStats.highScores };
              const previousBest = updatedHighScores[level] || 0;
              updatedHighScores[level] = Math.max(previousBest, finalScore);
              
              const newStats = {
                ...prevStats,
                highScores: updatedHighScores,
                totalGames: prevStats.totalGames + 1,
                totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
                totalQuestions: prevStats.totalQuestions + (questionIndex + 1)
              };
              localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
              return newStats;
            });
          } else if (stateRef.current.pendingBlocks > 0) {
            spawnPiece(stateRef.current.isControllable);
          } else if (questionIndex >= shuffledQuestions.length - 1) {
            playSFX("gameover");
            setGameState("gameover");

            setStats((prevStats) => {
              const newStats = {
                ...prevStats,
                totalGames: prevStats.totalGames + 1,
                totalCorrect: prevStats.totalCorrect + questionsAnsweredThisLevel,
                totalQuestions: prevStats.totalQuestions + (questionIndex + 1)
              };
              localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(newStats));
              return newStats;
            });
          } else {
            setQuestionIndex((prev) => prev + 1);
            setGameState("quiz");
          }
        });
      }
    };

    runCascadeStep(board, 0, 0);

    return () => {
      if (cleanupCurrentTimers) cleanupCurrentTimers();
    };
  }, [gameState, board, questionIndex, totalScore, misses, spawnPiece, shuffledQuestions.length, level, questionsAnsweredThisLevel]);

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
    if (!checkCollision(movedPiece, currentBoard)) {
      playSFX("rotate");
      setActivePiece(movedPiece);
    }
  }, []);

  const rotatePiece = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping" || piece.isFruit) return;

    const rotatedPiece = { ...piece, shape: rotateShapeClockwise(piece.shape) };
    if (!checkCollision(rotatedPiece, currentBoard)) {
      playSFX("rotate");
      setActivePiece(rotatedPiece);
    }
  }, []);

  const holdPiece = useCallback(() => {
    const { activePiece: piece, heldPiece: held, hasHeldThisTurn: alreadyHeld, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping" || alreadyHeld) return;

    playSFX("rotate");

    const width = piece.shape[0].length;
    const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);
    const pieceToHold = {
      shape: piece.shape,
      color: piece.color,
      isFruit: piece.isFruit || false,
      emoji: piece.emoji || "",
      isStone: piece.isStone || false,
      x,
      y: 0
    };

    if (held === null) {
      setHeldPiece(pieceToHold);
      setHasHeldThisTurn(true);
      
      let pieceBase = Math.random() < 0.1 ? randomItem(FRUITS) : randomItem(TETROMINOES);
      const newWidth = pieceBase.shape[0].length;
      const newX = Math.floor(BOARD_WIDTH / 2) - Math.floor(newWidth / 2);
      const newPiece = { ...pieceBase, x: newX, y: 0 };

      if (checkCollision(newPiece, stateRef.current.board)) {
        playSFX("gameover");
        setGameState("gameover");
        return;
      }
      setActivePiece(newPiece);
      setGameState("dropping");
    } else {
      const nextActive = { ...held, x, y: 0 };
      if (checkCollision(nextActive, stateRef.current.board)) {
        playSFX("gameover");
        setGameState("gameover");
        return;
      }
      setHeldPiece(pieceToHold);
      setActivePiece(nextActive);
      setHasHeldThisTurn(true);
    }
  }, []);

  const hardDrop = useCallback(() => {
    const { activePiece: piece, board: currentBoard, isControllable: canControl, gameState: state } = stateRef.current;
    if (!piece || !canControl || state !== "dropping") return;

    playSFX("drop");

    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) y += 1;
    const droppedPiece = { ...piece, y };
    setActivePiece(droppedPiece);

    // Lock immediately so touch/space hard-drops always advance the quiz flow.
    const nextBoard = currentBoard.map((row) => [...row]);
    droppedPiece.shape.forEach((row, shapeY) => {
      row.forEach((value, shapeX) => {
        if (!value) return;
        const boardY = droppedPiece.y + shapeY;
        const boardX = droppedPiece.x + shapeX;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: droppedPiece.color,
            isFruit: droppedPiece.isFruit || false,
            emoji: droppedPiece.emoji || "",
            isStone: droppedPiece.isStone || false,
          };
        }
      });
    });
    setBoard(nextBoard);
    setActivePiece(null);
    setGameState("resolving");
  }, []);

  const handleBoardTouchStart = (event) => {
    if (stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleBoardTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const quickTap = Date.now() - start.time < 260 && absX < 14 && absY < 14;

    if (quickTap) {
      rotatePiece();
      return;
    }

    if (absX > absY && absX > 24) {
      moveHorizontal(dx > 0 ? 1 : -1);
      return;
    }

    if (dy > 28 || dy < -36) {
      hardDrop();
    }
  };

  useEffect(() => {
    if (gameState !== "dropping") return undefined;
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const speed = stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    const timer = setInterval(moveDown, speed);
    return () => clearInterval(timer);
  }, [gameState, level, moveDown]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "c", "C", "Shift"].includes(event.key) && stateRef.current.gameState === "dropping") {
        event.preventDefault();
      }

      if (stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;

      if (event.key === "ArrowLeft") moveHorizontal(-1);
      if (event.key === "ArrowRight") moveHorizontal(1);
      if (event.key === "ArrowDown") moveDown();
      if (event.key === "ArrowUp") rotatePiece();
      if (event.key === " ") hardDrop();
      if (event.key === "c" || event.key === "C" || event.key === "Shift") holdPiece();
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hardDrop, moveDown, moveHorizontal, rotatePiece, holdPiece]);

  // -------------------------------------------------------------------------
  // Quiz flow
  // -------------------------------------------------------------------------
  const getGhostY = useCallback((piece, currentBoard) => {
    if (!piece) return 0;
    let y = piece.y;
    while (!checkCollision({ ...piece, y: y + 1 }, currentBoard)) {
      y += 1;
    }
    return y;
  }, []);

  const startLevel = (nextLevel) => {
    setLevel(nextLevel);
    setShuffledQuestions(shuffleArray(QUESTION_BANKS[nextLevel] || QUESTION_BANKS[1]));
    setBoard(createEmptyBoard());
    setActivePiece(null);
    setHeldPiece(null);
    setHasHeldThisTurn(false);
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
      playSFX("correct");
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);
      setFeedback(`Correct! +${POINTS.CORRECT_ANSWER} Pts. ${blocksToDrop > 1 ? "Prepare for 2 Blocks!" : "You have control."}`);
    } else {
      playSFX("incorrect");
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
  if (activePiece && isControllable && gameState === "dropping") {
    const ghostY = getGhostY(activePiece, board);
    activePiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = ghostY + y;
        const boardX = activePiece.x + x;
        if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
          displayBoard[boardY][boardX] = {
            color: activePiece.color,
            isFruit: activePiece.isFruit,
            emoji: activePiece.emoji,
            isStone: activePiece.isStone,
            isGhost: true,
          };
        }
      });
    });
  }
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
            isGhost: false,
          };
        }
      });
    });
  }

  const currentQuestion = shuffledQuestions[questionIndex];
  const currentLevel = LEVELS.find((item) => item.id === level) || LEVELS[0];
  const isMenu = gameState === "start";
  const panelClass = isMenu
    ? "w-full max-w-5xl h-full flex flex-col items-center justify-center text-center z-10"
    : "w-full md:w-[58%] max-h-[43dvh] md:max-h-none flex flex-col items-center md:items-start p-3 md:p-5 bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl min-h-0 justify-center text-center md:text-left relative overflow-hidden z-10";

  return (
    <div className="h-dvh animated-bg text-slate-100 font-sans flex flex-col items-center p-2 md:p-4 overflow-hidden touch-manipulation">
      <Confetti active={gameState === "level_win"} />

      <div className={`w-full h-full mx-auto flex min-h-0 ${isMenu ? "max-w-5xl items-center justify-center" : "max-w-6xl flex-col md:flex-row gap-2 md:gap-6 items-center md:items-stretch"}`}>
        {!isMenu && (
        <section className="w-full md:w-[42%] flex flex-col items-center justify-center min-h-0 z-10" aria-label="Game board">
          <div className="game-board-width flex justify-between items-center mb-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-xs md:text-sm font-bold border border-slate-700/50 shadow-xl gap-2">
            <span className="text-slate-300">Lvl {level} | Score: <span className="text-cyan-400 text-lg">{totalScore}/{WIN_SCORE_TARGET}</span></span>
            <button 
              type="button" 
              onClick={holdPiece} 
              disabled={!isControllable || gameState !== "dropping" || hasHeldThisTurn}
              className={`lg:hidden px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition ${
                !isControllable || gameState !== "dropping" || hasHeldThisTurn 
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                  : "bg-purple-600 hover:bg-purple-500 text-white"
              }`}
            >
              {heldPiece ? "Swap" : "Hold"}
            </button>
            <span className="text-red-400">Strikes: {misses}/{STRIKES_ALLOWED}</span>
          </div>

          <div className="flex gap-4 items-center justify-center w-full min-h-0">
            {/* Desktop Hold Box */}
            <div className="hidden lg:flex flex-col items-center justify-start p-3 bg-slate-900/85 backdrop-blur-md border border-slate-700/50 rounded-2xl w-24 shadow-2xl h-[120px]">
              <span className="text-[10px] uppercase tracking-wider text-purple-300 font-black mb-2">Hold (C)</span>
              {heldPiece ? (
                <div className="flex-1 flex items-center justify-center scale-90">
                  <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${heldPiece.shape[0].length}, minmax(0, 1fr))` }}>
                    {heldPiece.shape.map((row, rY) =>
                      row.map((val, rX) => (
                        <div key={`${rY}-${rX}`} className={`w-3.5 h-3.5 rounded-sm ${val ? heldPiece.color : "bg-transparent"}`} />
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[10px] text-slate-500 font-bold border border-dashed border-slate-700 rounded-xl w-full">Empty</div>
              )}
            </div>

            <div
              className={`game-board bg-slate-900 border-4 border-slate-700 p-1 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden touch-none ${isShaking ? "animate-shake" : ""}`}
              onTouchStart={handleBoardTouchStart}
              onTouchEnd={handleBoardTouchEnd}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                  let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none `;
                  
                  if (cell) {
                    if (cell.isGhost) {
                      cellClass += "ghost-block";
                    } else {
                      cellClass += cell.color;
                      if (cell.isStone) cellClass += " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                      if (isExploding) cellClass += " transition-all duration-[400ms] ease-out scale-150 opacity-0 rotate-180 z-10 blur-sm";
                      else cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";
                    }
                  } else {
                    cellClass += "bg-slate-800";
                  }

                  return <div key={`${y}-${x}`} className={cellClass}>{cell?.isGhost ? "" : (cell?.emoji || "")}</div>;
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
          </div>

          {gameState === "dropping" && isControllable && (
            <div className="game-controls grid grid-cols-3 gap-1.5 mt-2 md:hidden">
              <button type="button" onClick={holdPiece} disabled={hasHeldThisTurn} className="mobile-control-button bg-purple-600 disabled:opacity-40 disabled:bg-slate-800">Swap</button>
              <button type="button" onClick={rotatePiece} className="mobile-control-button">↑</button>
              <div />
              <button type="button" onClick={() => moveHorizontal(-1)} className="mobile-control-button">←</button>
              <button type="button" onClick={hardDrop} className="mobile-control-button">↓</button>
              <button type="button" onClick={() => moveHorizontal(1)} className="mobile-control-button">→</button>
            </div>
          )}
        </section>
        )}

        <main className={panelClass}>
          {gameState !== "start" && (
            <div className="static md:absolute md:top-4 md:right-4 mb-2 md:mb-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-[10px] md:text-xs font-black px-3 md:px-4 py-1.5 rounded-full shadow-lg border border-white/20">
              LEVEL {level}: {currentLevel.name}
            </div>
          )}

          {gameState === "start" && (
            showInstructions ? (
              <div className="menu-panel w-full max-w-3xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-4 md:p-6">
                <h1 className="text-4xl md:text-6xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-sm">Think Fast Blast</h1>
                <p className="text-base md:text-xl text-slate-300 mb-4">Answer fast, place smart, and reach <strong className="text-cyan-400">{WIN_SCORE_TARGET} points</strong> to beat each level.</p>
                <div className="grid md:grid-cols-[1.4fr_1fr] gap-3 text-left text-sm md:text-base">
                  <div className="bg-slate-900/50 p-3 md:p-4 rounded-xl border border-slate-700/50 shadow-inner">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs mb-2">How to Play</h2>
                    <ul className="space-y-1.5">
                      <li>Answer correctly to earn a block you can move and rotate.</li>
                      <li>Connect 5 same-color blocks touching up, down, left, or right to blast them.</li>
                      <li>Fill a full row like Tetris to clear the line.</li>
                      <li>Wrong answers reveal the answer, then drop a stone block.</li>
                    </ul>
                  </div>
                  <div className="bg-slate-900/50 p-3 md:p-4 rounded-xl border border-slate-700/50 shadow-inner">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs mb-2">Win & Lose</h2>
                    <ul className="space-y-1.5">
                      <li>Correct: <strong className="text-green-400">+10</strong></li>
                      <li>5-color blast: <strong className="text-blue-400">+30</strong></li>
                      <li>Full line: <strong className="text-purple-400">+100</strong></li>
                      <li>Fruit blast: <strong className="text-yellow-400">+50</strong></li>
                      <li>Lose at 3 strikes or if blocks touch the top.</li>
                    </ul>
                  </div>
                </div>
                <button type="button" onClick={() => setShowInstructions(false)} className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 px-8 rounded-xl shadow-lg transition-transform hover:scale-105">
                  Let's Play
                </button>
              </div>
            ) : (
              <div className="menu-panel w-full max-w-5xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-3 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3 text-left">
                  <div>
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-sm">Think Fast Blast</h1>
                    <p className="text-sm md:text-base text-cyan-200">Highest unlocked level: <strong>{maxUnlockedLevel}</strong></p>
                    
                    {/* Mini Stats Panel */}
                    <div className="flex flex-wrap gap-4 text-xs mt-2 text-slate-300 bg-slate-950/40 px-3.5 py-2 rounded-xl border border-slate-700/30">
                      <div>Games Played: <strong className="text-white">{stats.totalGames}</strong></div>
                      <div>Accuracy: <strong className="text-green-400">{stats.totalQuestions > 0 ? `${Math.round((stats.totalCorrect / stats.totalQuestions) * 100)}%` : "0%"}</strong></div>
                      <div>Total Correct: <strong className="text-cyan-400">{stats.totalCorrect}</strong></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" onClick={() => setShowInstructions(true)} className="menu-small-button">Rules</button>
                    <button type="button" onClick={() => setMaxUnlockedLevel(FINAL_LEVEL_ID)} className="menu-small-button bg-cyan-500 text-slate-950 border-cyan-300">Unlock All</button>
                    <button type="button" 
                            onClick={() => {
                              setMaxUnlockedLevel(1);
                              const reset = { highScores: {}, totalGames: 0, totalCorrect: 0, totalQuestions: 0 };
                              setStats(reset);
                              localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(reset));
                            }} 
                            className="menu-small-button">Reset</button>
                  </div>
                </div>
                <div className="level-grid">
                  {LEVELS.map((item) => {
                    const bestScore = stats.highScores[item.id] || 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={item.id > maxUnlockedLevel}
                        onClick={() => startLevel(item.id)}
                        className={`level-card flex flex-col justify-between ${
                          item.id <= maxUnlockedLevel
                            ? "bg-gradient-to-r from-blue-600 to-cyan-500 hover:scale-[1.01] text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] border-white/20"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700/50"
                        }`}
                      >
                        <div>
                          <span className="block text-[10px] md:text-xs uppercase tracking-widest opacity-80">{item.id <= maxUnlockedLevel ? `Level ${item.id} · ${item.ageHint}` : `Level ${item.id} · Locked`}</span>
                          <span className="block text-base md:text-lg mt-0.5">{item.name}</span>
                          <span className="block text-xs mt-0.5 font-semibold opacity-70">{item.theme}</span>
                        </div>
                        {item.id <= maxUnlockedLevel && bestScore > 0 && (
                          <div className="mt-1 text-[10px] font-black text-yellow-300 bg-slate-950/40 px-2 py-0.5 rounded border border-yellow-500/20 self-start">
                            🏆 Best: {bestScore}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {gameState === "quiz" && currentQuestion && (
            <div className="w-full flex flex-col min-h-0">
              <h2 className="text-xs md:text-sm font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2 justify-center md:justify-start">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Question {questionIndex + 1}
              </h2>
              <h3 className="text-lg sm:text-xl md:text-3xl font-bold mb-3 md:mb-5 text-white leading-tight drop-shadow-md">{currentQuestion.q}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 w-full">
                {currentQuestion.options.map((option, index) => (
                  <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button bg-slate-700/80 hover:bg-gradient-to-r hover:from-blue-600 hover:to-cyan-500 hover:scale-[1.02] transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-slate-600/50">
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === "transition" && (
            <div className="w-full flex flex-col items-center justify-center py-4 md:py-12">
              <h2 className={`text-2xl md:text-5xl font-black ${isControllable ? "text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" : "text-slate-400 drop-shadow-[0_0_15px_rgba(148,163,184,0.5)]"} animate-pulse text-center leading-tight`}>
                {feedback}
              </h2>
            </div>
          )}

          {gameState === "dropping" && (
            <div className="w-full flex flex-col items-center md:items-start text-slate-300">
              <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-6 text-white drop-shadow-md">
                {isControllable
                  ? `Place your block! ${totalBlocksThisTurn > 1 ? `(Block ${totalBlocksThisTurn - pendingBlocks} of ${totalBlocksThisTurn})` : ""}`
                  : "STONE INCOMING!"}
              </h3>
              {isControllable ? (
                <>
                <p className="md:hidden text-cyan-200 text-xs font-bold mb-1">Tap board to rotate. Swipe sideways to move. Swipe down to drop.</p>
                <div className="hidden md:flex flex-col gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                  <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Arrows</kbd> Move & Rotate</p>
                  <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Space</kbd> Hard Drop</p>
                  <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">C / Shift</kbd> Hold/Swap Block</p>
                </div>
                </>
              ) : (
                <div className="bg-slate-700/50 p-3 md:p-6 rounded-2xl border border-slate-500/50">
                  <p className="text-slate-300 font-black text-base md:text-lg">You have no control over this stone piece!</p>
                </div>
              )}
            </div>
          )}

          {gameState === "level_win" && (
            <div className="w-full flex flex-col items-center md:items-start">
              <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 drop-shadow-md">Level Complete!</h2>
              <p className="text-base md:text-xl text-slate-300 mb-4 md:mb-8 font-medium">You reached {WIN_SCORE_TARGET} points on {currentLevel.name}!</p>
              {level < FINAL_LEVEL_ID ? (
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <button type="button" onClick={() => startLevel(level + 1)} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] transform transition hover:scale-105 border border-white/20">
                    START LEVEL {level + 1}
                  </button>
                  <button type="button" onClick={() => setGameState("start")} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
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
              <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 drop-shadow-md">Game Over!</h2>
              <div className="bg-slate-900/50 p-3 md:p-6 rounded-2xl border border-slate-700/50 mb-4 md:mb-8 w-full text-center md:text-left">
                <p className="text-base md:text-xl text-slate-300 mb-2 font-bold">
                  {misses >= STRIKES_ALLOWED ? "You got 3 strikes!" : questionIndex >= shuffledQuestions.length - 1 ? "Ran out of questions!" : "The board filled up!"}
                </p>
                <p className="text-2xl md:text-3xl text-cyan-400 font-black mt-2 md:mt-4">Final Points: {totalScore}</p>
              </div>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <button type="button" onClick={() => startLevel(level)} className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.4)] transform transition hover:scale-105 border border-white/20">
                  RESTART LEVEL {level}
                </button>
                <button type="button" onClick={() => setGameState("start")} className="bg-slate-700 hover:bg-slate-600 text-white font-black py-3 md:py-4 px-6 md:px-8 rounded-full shadow-lg transition-transform hover:scale-105 border border-slate-500">
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
