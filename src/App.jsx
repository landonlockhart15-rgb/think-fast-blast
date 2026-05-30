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
  const [feedback, setFeedback] = useState("");
  const [explodingCells, setExplodingCells] = useState([]);

  // --- REDESIGN STATES ---
  const [correctStreak, setCorrectStreak] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [shake, setShake] = useState(false);
  const [windForce, setWindForce] = useState(0);
  const [questionsSinceLastRise, setQuestionsSinceLastRise] = useState(0);
  const [recoveryTimer, setRecoveryTimer] = useState(4);
  const [questionStartTime, setQuestionStartTime] = useState(0);

  // Timers and keyboard events need the newest state without being rebuilt on
  // every render. This ref mirrors the live game state for those callbacks.
  const stateRef = useRef({
    board,
    activePiece,
    gameState,
    isControllable,
    level,
    correctStreak,
    questionIndex,
    shuffledQuestions,
    misses,
    questionsSinceLastRise,
  });
  const touchStartRef = useRef(null);

  useEffect(() => {
    stateRef.current = {
      board,
      activePiece,
      gameState,
      isControllable,
      level,
      correctStreak,
      questionIndex,
      shuffledQuestions,
      misses,
      questionsSinceLastRise,
    };
  }, [board, activePiece, gameState, isControllable, level, correctStreak, questionIndex, shuffledQuestions, misses, questionsSinceLastRise]);

  useEffect(() => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, String(maxUnlockedLevel));
  }, [maxUnlockedLevel]);

  // Trigger screen shake
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  };

  // Add floating point/combo popup feedback
  const addFloatingText = (text, x = 4, y = 8) => {
    const id = Math.random().toString(36).substring(2, 9);
    setFloatingTexts((prev) => [...prev, { id, text, x, y }]);
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== id));
    }, 900);
  };

  // Helper to generate a Power-up block
  const makePowerUp = (piece, streak) => {
    if (streak === 3) {
      return {
        ...piece,
        isTNT: true,
        color: "bg-red-600 animate-glow-tnt shadow-[0_0_15px_rgba(239,68,68,0.8)]",
        emoji: "💣",
        shape: [[1]],
      };
    }
    if (streak === 5) {
      return {
        ...piece,
        isDrill: true,
        color: "bg-amber-500 animate-glow-drill shadow-[0_0_15px_rgba(245,158,11,0.8)]",
        emoji: "🌀",
        shape: [[1]],
      };
    }
    if (streak >= 7) {
      return {
        ...piece,
        isLightning: true,
        color: "bg-yellow-400 animate-glow-lightning shadow-[0_0_15px_rgba(250,204,21,0.8)]",
        emoji: "⚡",
        shape: [[1]],
      };
    }
    return piece;
  };

  // -------------------------------------------------------------------------
  // Piece lifecycle
  // -------------------------------------------------------------------------
  const spawnQuizPiece = useCallback(() => {
    const activeLevel = stateRef.current.level;
    const pieceBase = Math.random() < 0.15 ? randomItem(FRUITS) : randomItem(TETROMINOES);
    const width = pieceBase.shape[0].length;
    const x = Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2);

    let color = pieceBase.color;
    let emoji = pieceBase.emoji || "";
    let isSlime = false;

    // Apply Sticky Slime blocks hazard to level 5 & 6
    if ((activeLevel === 5 || activeLevel === 6) && Math.random() < 0.35) {
      isSlime = true;
      color = "bg-emerald-700 border-2 border-emerald-400";
      emoji = "🦠";
    }

    const newPiece = {
      ...pieceBase,
      color,
      emoji,
      isSlime,
      x,
      y: 0,
    };

    if (checkCollision(newPiece, stateRef.current.board)) {
      setGameState("gameover");
      return;
    }

    setActivePiece(newPiece);
    setQuestionStartTime(Date.now());
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
            isTNT: piece.isTNT || false,
            isDrill: piece.isDrill || false,
            isLightning: piece.isLightning || false,
            isSlime: piece.isSlime || false,
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
    let hasTnt = false;
    let hasDrill = false;
    let hasLightning = false;

    const addCellToClear = (y, x) => {
      if (!cellsToClear.some((cell) => cell.y === y && cell.x === x)) {
        cellsToClear.push({ y, x });
      }
    };

    const nextBoard = board.map((row) => [...row]);

    // 1. Process TNT detonators (3x3 blast)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isTNT) {
          hasTnt = true;
          nextBoard[y][x].isTNT = false; // Detonate once
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const cy = y + dy;
              const cx = x + dx;
              if (cy >= 0 && cy < BOARD_HEIGHT && cx >= 0 && cx < BOARD_WIDTH) {
                if (board[cy][cx] !== null) addCellToClear(cy, cx);
              }
            }
          }
          pointsEarned += 80;
        }
      }
    }

    // 2. Process Drills (clear cell and 3 cells below)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isDrill) {
          hasDrill = true;
          nextBoard[y][x].isDrill = false; // Use once
          for (let dy = 0; dy <= 3; dy += 1) {
            const cy = y + dy;
            if (cy >= 0 && cy < BOARD_HEIGHT) {
              if (board[cy][x] !== null) addCellToClear(cy, x);
            }
          }
          pointsEarned += 60;
        }
      }
    }

    // 3. Process Lightning (zap all blocks of the most common color)
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (board[y][x]?.isLightning) {
          hasLightning = true;
          nextBoard[y][x].isLightning = false; // Zap once

          const colorCounts = {};
          for (let by = 0; by < BOARD_HEIGHT; by += 1) {
            for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
              const cell = board[by][bx];
              if (cell && !cell.isStone && !cell.isFruit && cell.color) {
                colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1;
              }
            }
          }

          let targetColor = null;
          let maxCount = 0;
          Object.entries(colorCounts).forEach(([color, count]) => {
            if (count > maxCount) {
              maxCount = count;
              targetColor = color;
            }
          });

          if (targetColor) {
            for (let by = 0; by < BOARD_HEIGHT; by += 1) {
              for (let bx = 0; bx < BOARD_WIDTH; bx += 1) {
                if (board[by][bx]?.color === targetColor) {
                  addCellToClear(by, bx);
                }
              }
            }
            pointsEarned += maxCount * 15;
          }
        }
      }
    }

    // 4. Fruit bombs clear themselves and their four cardinal neighbors.
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

    // 5. Standard full-line clear.
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      if (!board[y].every((cell) => cell !== null)) continue;
      for (let x = 0; x < BOARD_WIDTH; x += 1) addCellToClear(y, x);
      pointsEarned += POINTS.LINE_CLEAR;
    }

    // 6. Connected components of 5+ same-colored normal blocks clear together.
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
      const anchor = cellsToClear[0];
      if (pointsEarned > 0) addFloatingText(`+${pointsEarned}`, anchor.x, anchor.y);
      if (hasTnt) addFloatingText("TNT BLAST! 💣", anchor.x, anchor.y - 1);
      if (hasDrill) addFloatingText("DRILL BLAST! 🌀", anchor.x, anchor.y - 1);
      if (hasLightning) addFloatingText("ZAP! ⚡", anchor.x, anchor.y - 1);

      triggerShake();
      setBoard(nextBoard);

      queueMicrotask(() => setExplodingCells(cellsToClear));

      const timer = setTimeout(() => {
        const afterClearBoard = board.map((row) => [...row]);
        cellsToClear.forEach((cell) => {
          afterClearBoard[cell.y][cell.x] = null;
        });

        // Gravity compacts each column downward.
        for (let x = 0; x < BOARD_WIDTH; x += 1) {
          let writeY = BOARD_HEIGHT - 1;
          for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
            if (afterClearBoard[y][x] === null) continue;
            if (writeY !== y) {
              afterClearBoard[writeY][x] = afterClearBoard[y][x];
              afterClearBoard[y][x] = null;
            }
            writeY -= 1;
          }
        }

        setBoard(afterClearBoard);
        setExplodingCells([]);
        setTotalScore((prev) => prev + pointsEarned);

        // Check if floor rise is triggered
        if ((level === 9 || level === 10) && stateRef.current.questionsSinceLastRise === 0) {
          triggerFloorRise(afterClearBoard);
        }
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
      } else if (questionIndex >= shuffledQuestions.length - 1) {
        setGameState("gameover");
      } else {
        setQuestionIndex((prev) => prev + 1);
        setGameState("quiz");
        spawnQuizPiece();
      }
    });

    return undefined;
  }, [gameState, board, questionIndex, totalScore, misses, shuffledQuestions.length, level, spawnQuizPiece]);

  // -------------------------------------------------------------------------
  // Floor rising hazard (Level 9 & 10)
  // -------------------------------------------------------------------------
  const triggerFloorRise = (currentBoard) => {
    const newRow = Array(BOARD_WIDTH).fill(null);
    const gap1 = Math.floor(Math.random() * BOARD_WIDTH);
    let gap2 = Math.floor(Math.random() * BOARD_WIDTH);
    while (gap2 === gap1) gap2 = Math.floor(Math.random() * BOARD_WIDTH);

    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (x !== gap1 && x !== gap2) {
        newRow[x] = {
          color: "bg-slate-500",
          emoji: "🧱",
          isStone: true,
        };
      }
    }

    // Verify row 0 has no blocks before shifting
    if (currentBoard[0].some((cell) => cell !== null)) {
      setGameState("gameover");
      return;
    }

    const nextBoard = [...currentBoard.slice(1), newRow];
    setBoard(nextBoard);
    triggerShake();
    addFloatingText("FLOOR RISING! 🌋", 4, BOARD_HEIGHT - 2);
    setFeedback("Warning: Floor rising!");
  };

  // -------------------------------------------------------------------------
  // Time-out logic (block reaches bottom before answering)
  // -------------------------------------------------------------------------
  const handleTimeOut = () => {
    const { activePiece: piece, board: currentBoard, misses: currentMisses, questionIndex: qIdx, shuffledQuestions: questions } = stateRef.current;
    if (!piece) return;

    const nextBoard = currentBoard.map((row) => [...row]);
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const boardY = piece.y + y;
        const boardX = piece.x + x;
        if (boardY >= 0) {
          nextBoard[boardY][boardX] = {
            color: "bg-slate-500",
            emoji: "🧱",
            isStone: true,
          };
        }
      });
    });

    setBoard(nextBoard);
    setActivePiece(null);
    setCorrectStreak(0);

    const question = questions[qIdx];
    const correctAnswer = question ? question.options[question.answer] : "unknown";

    const nextMisses = currentMisses + 1;
    setMisses(nextMisses);
    setLastCorrectAnswer(correctAnswer);
    setFeedback(`Time's up! The answer was: ${correctAnswer}. Stone block locked!`);

    if (nextMisses >= STRIKES_ALLOWED) {
      setGameState("strike_recovery");
    } else {
      setGameState("transition");
      setTimeout(() => setGameState("resolving"), 1500);
    }
  };

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
      setActivePiece(movedPiece);
    } else if (piece.isSlime) {
      addFloatingText("STUCK! 🦠", piece.x, piece.y);
      lockPiece();
    }
  }, [lockPiece]);

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
    const droppedPiece = { ...piece, y };
    setActivePiece(droppedPiece);

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
            isTNT: droppedPiece.isTNT || false,
            isDrill: droppedPiece.isDrill || false,
            isLightning: droppedPiece.isLightning || false,
            isSlime: droppedPiece.isSlime || false,
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
    event.preventDefault();
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleBoardTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || stateRef.current.gameState !== "dropping" || !stateRef.current.isControllable) return;
    event.preventDefault();

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

    if (absX > absY && absX > 18) {
      moveHorizontal(dx > 0 ? 1 : -1);
      return;
    }

    if (dy > 20) {
      moveDown();
    }
  };

  // dropping speed
  useEffect(() => {
    if (gameState !== "dropping") return undefined;
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const speed = stateRef.current.isControllable ? config.baseSpeed : config.fastSpeed;
    const timer = setInterval(moveDown, speed);
    return () => clearInterval(timer);
  }, [gameState, level, moveDown]);

  // Keyboard events
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
  // Level Wind Turbulence (Level 7 & 8)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (level !== 7 && level !== 8) {
      setWindForce(0);
      return undefined;
    }

    const timer = setInterval(() => {
      const choices = [-1, 0, 1];
      const nextWind = randomItem(choices);
      setWindForce(nextWind);
      if (nextWind !== 0) {
        addFloatingText(nextWind > 0 ? "WIND RIGHT! 💨" : "WIND LEFT! 💨", 4, 2);
      } else {
        addFloatingText("WIND CALM", 4, 2);
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [level, gameState]);

  useEffect(() => {
    if (gameState !== "dropping" || windForce === 0 || !activePiece) return undefined;

    const timer = setInterval(() => {
      const { activePiece: piece, board: currentBoard } = stateRef.current;
      if (!piece) return;

      const movedPiece = { ...piece, x: piece.x + windForce };
      if (!checkCollision(movedPiece, currentBoard)) {
        setActivePiece(movedPiece);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [gameState, windForce, activePiece]);

  // -------------------------------------------------------------------------
  // Slow fall during quiz phase (Thinking time limits)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "quiz" || !activePiece) return undefined;

    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
    const quizSpeed = Math.max(900, config.baseSpeed * 3);

    const timer = setInterval(() => {
      const { activePiece: piece, board: currentBoard } = stateRef.current;
      if (!piece) return;

      const movedPiece = { ...piece, y: piece.y + 1 };
      if (!checkCollision(movedPiece, currentBoard)) {
        setActivePiece(movedPiece);
      } else {
        clearInterval(timer);
        handleTimeOut();
      }
    }, quizSpeed);

    return () => clearInterval(timer);
  }, [gameState, activePiece, level]);

  // -------------------------------------------------------------------------
  // Strike Recovery Mode countdown timer
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gameState !== "strike_recovery") return undefined;

    setRecoveryTimer(4);

    const activeLevel = stateRef.current.level;
    const levelQuestions = QUESTION_BANKS[activeLevel] || QUESTION_BANKS[1];
    const q = randomItem(levelQuestions);
    setShuffledQuestions([q]);
    setQuestionIndex(0);

    const timer = setInterval(() => {
      setRecoveryTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState("gameover");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, level]);

  // -------------------------------------------------------------------------
  // Quiz answers handler
  // -------------------------------------------------------------------------
  const handleAnswer = (selectedIndex) => {
    const question = shuffledQuestions[questionIndex];
    const correct = selectedIndex === question.answer;
    const { activePiece: piece, misses: currentMisses, board: currentBoard } = stateRef.current;

    // Handle Strike Recovery Phase
    if (gameState === "strike_recovery") {
      if (correct) {
        setMisses(2);
        const nextBoard = board.map((row, y) => {
          if (y < 3) return Array(BOARD_WIDTH).fill(null);
          return [...row];
        });
        setBoard(nextBoard);
        triggerShake();
        addFloatingText("RECOVERY SUCCESS! 💥", 4, 4);
        setFeedback("Recovery Success! Strikes set to 2.");

        setShuffledQuestions(shuffleArray(QUESTION_BANKS[level] || QUESTION_BANKS[1]));
        setQuestionIndex(0);
        setGameState("transition");
        setTimeout(() => {
          setGameState("quiz");
          spawnQuizPiece();
        }, 1500);
      } else {
        setGameState("gameover");
      }
      return;
    }

    if (correct) {
      const nextStreak = correctStreak + 1;
      setCorrectStreak(nextStreak);
      setTotalScore((score) => score + POINTS.CORRECT_ANSWER);
      setQuestionsAnsweredThisLevel((answered) => answered + 1);

      // Perfect Quick Answer Bonus check
      const elapsed = (Date.now() - questionStartTime) / 1000;
      let bonusText = "";
      if (elapsed <= 2.2) {
        setTotalScore((score) => score + 15);
        bonusText = " PERFECT! Quick Bonus +15 Pts!";
        addFloatingText("PERFECT! ⚡", piece?.x || 5, piece?.y || 4);
      }

      setIsControllable(true);

      // Check combo power-up conversion
      let newPiece = { ...piece };
      if (nextStreak === 3) {
        newPiece = makePowerUp(piece, 3);
        addFloatingText("COMBO x3! TNT Block 💣", piece?.x || 5, piece?.y || 2);
      } else if (nextStreak === 5) {
        newPiece = makePowerUp(piece, 5);
        addFloatingText("COMBO x5! Drill Block 🌀", piece?.x || 5, piece?.y || 2);
      } else if (nextStreak >= 7) {
        newPiece = makePowerUp(piece, 7);
        addFloatingText("COMBO x7! Lightning Rod ⚡", piece?.x || 5, piece?.y || 2);
      }

      setActivePiece(newPiece);
      setFeedback(`Correct!${bonusText} You have control.`);
      setGameState("dropping");
    } else {
      setCorrectStreak(0);
      const correctAnswer = question.options[question.answer];
      const nextMisses = currentMisses + 1;
      setMisses(nextMisses);
      setLastCorrectAnswer(correctAnswer);
      setFeedback(`Wrong! The answer was ${correctAnswer}. Stone block incoming!`);

      // Incorrect answer: block turns to stone and immediately hard-drops
      setIsControllable(false);
      const stonePiece = {
        ...piece,
        color: "bg-slate-500",
        emoji: "🧱",
        isStone: true,
      };

      let y = stonePiece.y;
      while (!checkCollision({ ...stonePiece, y: y + 1 }, currentBoard)) {
        y += 1;
      }
      const lockedStonePiece = { ...stonePiece, y };

      const nextBoard = currentBoard.map((row) => [...row]);
      lockedStonePiece.shape.forEach((row, shapeY) => {
        row.forEach((value, shapeX) => {
          if (!value) return;
          const boardY = lockedStonePiece.y + shapeY;
          const boardX = lockedStonePiece.x + shapeX;
          if (boardY >= 0) {
            nextBoard[boardY][boardX] = {
              color: lockedStonePiece.color,
              isStone: true,
              emoji: lockedStonePiece.emoji,
            };
          }
        });
      });

      setBoard(nextBoard);
      setActivePiece(null);

      if (nextMisses >= STRIKES_ALLOWED) {
        setGameState("strike_recovery");
      } else {
        setGameState("transition");
        setTimeout(() => setGameState("resolving"), 1500);
      }
    }

    if (level === 9 || level === 10) {
      setQuestionsSinceLastRise((prev) => {
        const next = prev + 1;
        return next >= 3 ? 0 : next;
      });
    }
  };

  // -------------------------------------------------------------------------
  // Level Initialization
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
    setFeedback("");
    setExplodingCells([]);

    setCorrectStreak(0);
    setWindForce(0);
    setQuestionsSinceLastRise(0);

    setGameState("quiz");
    // Ensure stateRef has level set before spawning
    stateRef.current.level = nextLevel;
    spawnQuizPiece();
  };

  // Compose display board by overlaying the active piece
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
            isTNT: activePiece.isTNT,
            isDrill: activePiece.isDrill,
            isLightning: activePiece.isLightning,
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
      <div className={`w-full h-full mx-auto flex min-h-0 ${isMenu ? "max-w-5xl items-center justify-center" : "max-w-6xl flex-col md:flex-row gap-2 md:gap-6 items-center md:items-stretch"}`}>
        {!isMenu && (
          <section className="w-full md:w-[42%] flex flex-col items-center justify-center min-h-0 z-10 animate-float" aria-label="Game board">
            <div className="game-board-width flex justify-between mb-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg text-xs md:text-sm font-bold border border-slate-700/50 shadow-xl">
              <span className="text-slate-300">Lvl {level} | Score: <span className="text-cyan-400 text-lg">{totalScore}/{WIN_SCORE_TARGET}</span></span>
              {windForce !== 0 && (
                <span className="text-sky-300 font-bold animate-pulse text-xs flex items-center gap-1">
                  💨 Wind: {windForce > 0 ? "👉 Right" : "👈 Left"}
                </span>
              )}
              {correctStreak >= 3 && (
                <span className="text-yellow-400 font-black animate-pulse text-xs">
                  🔥 Streak: {correctStreak}
                </span>
              )}
              <span className="text-red-400">Strikes: {misses}/{STRIKES_ALLOWED}</span>
            </div>

            <div
              className={`game-board bg-slate-900 border-4 border-slate-700 p-1 rounded-lg aspect-[10/16] grid grid-rows-16 grid-cols-10 gap-px mx-auto shadow-2xl relative overflow-hidden touch-none ${shake ? "animate-shake" : ""}`}
              onTouchStart={handleBoardTouchStart}
              onTouchEnd={handleBoardTouchEnd}
            >
              {displayBoard.map((row, y) =>
                row.map((cell, x) => {
                  const isExploding = explodingCells.some((item) => item.y === y && item.x === x);
                  let cellClass = `w-full h-full rounded-sm flex items-center justify-center text-sm md:text-base select-none ${cell ? cell.color : "bg-slate-800"}`;
                  if (cell?.isStone) cellClass += " border-2 border-slate-400 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-500 to-slate-700";
                  if (cell?.isTNT) cellClass += " animate-glow-tnt";
                  if (cell?.isDrill) cellClass += " animate-glow-drill";
                  if (cell?.isLightning) cellClass += " animate-glow-lightning";
                  if (isExploding) cellClass += " transition-all duration-[400ms] ease-out scale-150 opacity-0 rotate-180 z-10 blur-sm";
                  else if (cell) cellClass += " transition-all duration-75 scale-100 opacity-100 rotate-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]";

                  return <div key={`${y}-${x}`} className={cellClass}>{cell?.emoji || ""}</div>;
                })
              )}

              {/* Floating Combo / Points Feedback Popups */}
              {floatingTexts.map((t) => (
                <div
                  key={t.id}
                  className="absolute z-30 font-black text-sm md:text-base text-yellow-400 pointer-events-none animate-float-text select-none text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  style={{
                    top: `${(t.y / BOARD_HEIGHT) * 100}%`,
                    left: `${(t.x / BOARD_WIDTH) * 100}%`,
                  }}
                >
                  {t.text}
                </div>
              ))}

              {gameState === "dropping" && !isControllable && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center border-4 border-slate-500">
                  <h3 className="text-slate-300 font-bold mb-2 uppercase tracking-widest text-sm drop-shadow-lg">STONE BLOCK DROP!</h3>
                  <h4 className="text-red-400 font-bold mb-2 uppercase tracking-widest text-xs drop-shadow-lg">Correct Answer:</h4>
                  <span className="text-white text-3xl font-black animate-bounce drop-shadow-2xl">{lastCorrectAnswer}</span>
                </div>
              )}
            </div>

            {gameState === "dropping" && isControllable && (
              <div className="game-controls grid grid-cols-3 gap-1.5 mt-2 md:hidden">
                <div />
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
                      <li>The block falls slowly while the question is active. Answer quickly!</li>
                      <li>Correct: You gain control. Answer streaks trigger power-ups (💣, ⚡, 🌀).</li>
                      <li>Answer in under 2.2s for a <strong>PERFECT Quick Bonus (+15 Pts)</strong>.</li>
                      <li>Wrong / Timeout: Turns block to grey stone and drops it immediately.</li>
                    </ul>
                  </div>
                  <div className="bg-slate-900/50 p-3 md:p-4 rounded-xl border border-slate-700/50 shadow-inner">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs mb-2">Combo Explosions</h2>
                    <ul className="space-y-1.5">
                      <li>Connect 5 same-color blocks to blast them.</li>
                      <li>Fill a full horizontal row to clear the line.</li>
                      <li>Level Mutators: Slime (Sticky), Wind (Pushes blocks), Lava (Rising floors).</li>
                      <li>Fail recovery questions to save yourself from strikes!</li>
                    </ul>
                  </div>
                </div>
                <button type="button" onClick={() => setShowInstructions(false)} className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 px-8 rounded-xl shadow-lg transition-transform hover:scale-105">
                  Let's Play
                </button>
              </div>
            ) : (
              <div className="menu-panel w-full max-w-5xl bg-slate-800/80 backdrop-blur-lg border border-slate-700/50 rounded-2xl shadow-2xl p-3 md:p-5">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3 text-left">
                  <div>
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 drop-shadow-sm">Think Fast Blast</h1>
                    <p className="text-sm md:text-base text-cyan-200">Highest unlocked level: <strong>{maxUnlockedLevel}</strong></p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowInstructions(true)} className="menu-small-button">Rules</button>
                    <button type="button" onClick={() => setMaxUnlockedLevel(FINAL_LEVEL_ID)} className="menu-small-button bg-cyan-500 text-slate-950 border-cyan-300">Unlock All</button>
                    <button type="button" onClick={() => setMaxUnlockedLevel(1)} className="menu-small-button">Reset</button>
                  </div>
                </div>
                <div className="level-grid">
                  {LEVELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.id > maxUnlockedLevel}
                      onClick={() => startLevel(item.id)}
                      className={`level-card ${
                        item.id <= maxUnlockedLevel
                          ? "bg-gradient-to-r from-blue-600 to-cyan-500 hover:scale-[1.01] text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] border-white/20"
                          : "bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700/50"
                      }`}
                    >
                      <span className="block text-[10px] md:text-xs uppercase tracking-widest opacity-80">{item.id <= maxUnlockedLevel ? `Level ${item.id} · ${item.ageHint}` : `Level ${item.id} · Locked`}</span>
                      <span className="block text-base md:text-xl mt-0.5">{item.name}</span>
                      <span className="block text-xs md:text-sm mt-0.5 font-semibold opacity-80">{item.theme}</span>
                    </button>
                  ))}
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

          {gameState === "strike_recovery" && currentQuestion && (
            <div className="w-full flex flex-col min-h-0 text-center items-center">
              <h2 className="text-xs md:text-sm font-black text-red-500 uppercase tracking-widest mb-2 animate-pulse">
                🚨 STRIKE RECOVERY MODE 🚨
              </h2>
              <div className="w-full bg-slate-900 rounded-full h-2.5 mb-4 overflow-hidden border border-red-500/30">
                <div
                  className="bg-red-500 h-full transition-all duration-1000"
                  style={{ width: `${(recoveryTimer / 4) * 100}%` }}
                />
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-4 text-white leading-tight drop-shadow-md">
                {currentQuestion.q}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 w-full">
                {currentQuestion.options.map((option, index) => (
                  <button key={option} type="button" onClick={() => handleAnswer(index)} className="answer-button bg-slate-700/80 hover:bg-gradient-to-r hover:from-red-600 hover:to-orange-500 hover:scale-[1.02] transition-all rounded-xl md:rounded-2xl text-sm sm:text-base md:text-lg font-bold text-left shadow-lg border border-red-500/50">
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === "transition" && (
            <div className="w-full flex flex-col items-center justify-center py-4 md:py-12">
              <h2 className={`text-2xl md:text-5xl font-black ${isControllable ? "text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" : "text-red-400 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"} animate-pulse text-center leading-tight`}>
                {feedback}
              </h2>
            </div>
          )}

          {gameState === "dropping" && (
            <div className="w-full flex flex-col items-center md:items-start text-slate-300">
              <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-6 text-white drop-shadow-md">
                {isControllable
                  ? `Place your block! ${activePiece?.isTNT ? "💣 TNT active" : activePiece?.isDrill ? "🌀 Drill active" : activePiece?.isLightning ? "⚡ Lightning active" : activePiece?.isSlime ? "🦠 Sticky Slime active" : ""}`
                  : "STONE INCOMING!"}
              </h3>
              {isControllable ? (
                <>
                  <p className="md:hidden text-cyan-200 text-xs font-bold mb-1">Tap board to rotate. Swipe sideways to move. Swipe down to drop.</p>
                  <div className="hidden md:flex flex-col gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                    <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Arrows</kbd> Move & Rotate</p>
                    <p className="flex items-center gap-3"><kbd className="bg-slate-700 text-white font-black px-3 py-1.5 rounded shadow-inner border-b-4 border-slate-800">Space</kbd> Hard Drop</p>
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
                  {misses >= STRIKES_ALLOWED ? "You ran out of recovery options!" : questionIndex >= shuffledQuestions.length - 1 ? "Ran out of questions!" : "The board filled up!"}
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
