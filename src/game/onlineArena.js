import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FRUITS,
  POINTS,
  TETROMINOES,
} from "../data/constants.js";
import {
  createEmptyBoard,
  findConnectedColorMatches,
  findFruitEffectCells,
  findFullRows,
} from "./board.js";
import { createSeededRandom } from "./random.js";
import { SPECIAL_BLOCK_RATES } from "./specialBalance.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const createRoomCode = (random = Math.random) =>
  Array.from(
    { length: 6 },
    () => ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)]
  ).join("");

export const normalizeRoomCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 6);

export const createArenaPiece = (seed, roundIndex) => {
  const random = createSeededRandom(`${seed}:piece:${roundIndex}`);
  const pool =
    roundIndex > 0 && random() < SPECIAL_BLOCK_RATES.arenaFruit
      ? FRUITS
      : TETROMINOES;
  const base = pool[Math.floor(random() * pool.length)];
  const width = base.shape[0].length;

  return {
    ...base,
    shape: base.shape.map((row) => [...row]),
    x: Math.floor(BOARD_WIDTH / 2) - Math.floor(width / 2),
    y: 0,
  };
};

const uniqueCells = (cells) => {
  const byPosition = new Map();
  cells.forEach((cell) => byPosition.set(`${cell.y}:${cell.x}`, cell));
  return [...byPosition.values()];
};

const collapseBoard = (board) => {
  const next = board.map((row) => [...row]);
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    let writeY = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
      if (next[y][x] === null) continue;
      if (writeY !== y) {
        next[writeY][x] = next[y][x];
        next[y][x] = null;
      }
      writeY -= 1;
    }
  }
  return next;
};

export const lockArenaPiece = (board, piece) => {
  const next = board.map((row) => [...row]);
  let toppedOut = false;

  piece.shape.forEach((row, shapeY) => {
    row.forEach((value, shapeX) => {
      if (!value) return;
      const y = piece.y + shapeY;
      const x = piece.x + shapeX;
      if (y < 0) {
        toppedOut = true;
        return;
      }
      if (y >= BOARD_HEIGHT || x < 0 || x >= BOARD_WIDTH || next[y][x]) {
        toppedOut = true;
        return;
      }
      next[y][x] = {
        color: piece.color,
        emoji: piece.emoji || "",
        isFruit: Boolean(piece.isFruit),
        fruitType: piece.fruitType || "",
        isStone: Boolean(piece.isStone),
      };
    });
  });

  return { board: next, toppedOut };
};

export const resolveArenaBoard = (board) => {
  const clearCells = [];
  let points = 0;
  let attacks = 0;

  findFullRows(board).forEach((y) => {
    for (let x = 0; x < BOARD_WIDTH; x += 1) clearCells.push({ y, x });
    points += POINTS.LINE_CLEAR;
    attacks += 1;
  });

  findConnectedColorMatches(board, 5).forEach((component) => {
    clearCells.push(...component);
    points += POINTS.COLOR_MATCH + Math.max(0, component.length - 5) * 5;
  });

  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (!cell?.isFruit) continue;
      const fruitCells = findFruitEffectCells(
        board,
        y,
        x,
        cell.fruitType || "apple",
        cell.color
      );
      clearCells.push(...fruitCells);
      points += POINTS.FRUIT_BOMB + Math.max(0, fruitCells.length - 1) * 8;
    }
  }

  const unique = uniqueCells(clearCells);
  if (unique.length === 0) {
    return { board, clearedCells: [], points: 0, attacks: 0 };
  }

  const next = board.map((row) => [...row]);
  unique.forEach(({ y, x }) => {
    next[y][x] = null;
  });

  return {
    board: collapseBoard(next),
    clearedCells: unique,
    points,
    attacks,
  };
};

export const addGarbageRows = (board, count, seed = Date.now()) => {
  if (count <= 0) return { board, toppedOut: false };
  const rows = Math.min(count, BOARD_HEIGHT - 1);
  const toppedOut = board
    .slice(0, rows)
    .some((row) => row.some((cell) => cell !== null));
  if (toppedOut) return { board, toppedOut: true };

  const random = createSeededRandom(seed);
  const garbage = Array.from({ length: rows }, () => {
    const gap = Math.floor(random() * BOARD_WIDTH);
    return Array.from({ length: BOARD_WIDTH }, (_, x) =>
      x === gap
        ? null
        : { color: "bg-slate-500", emoji: "🧱", isStone: true }
    );
  });

  return {
    board: [...board.slice(rows), ...garbage],
    toppedOut: false,
  };
};

export const createOnlineArenaState = () => ({
  board: createEmptyBoard(),
  score: 0,
  streak: 0,
  round: 0,
  toppedOut: false,
});
