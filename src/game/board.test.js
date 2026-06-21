import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";
import {
  checkCollision,
  clearBoardCells,
  createEmptyBoard,
  findBlastCells,
  findConnectedColorMatches,
  findFruitEffectCells,
  findFullRows,
} from "./board.js";

test("checkCollision treats the board floor as a collision without reading past the board", () => {
  const piece = { shape: [[1]], x: 0, y: BOARD_HEIGHT };

  assert.equal(checkCollision(piece, createEmptyBoard()), true);
});

test("checkCollision treats the board ceiling as a collision under inverse gravity", () => {
  const piece = { shape: [[1]], x: 0, y: -1 };

  assert.equal(checkCollision(piece, createEmptyBoard(), true), true);
});

test("checkCollision does not treat the board floor as a collision under inverse gravity", () => {
  const piece = { shape: [[1]], x: 0, y: BOARD_HEIGHT };

  assert.equal(checkCollision(piece, createEmptyBoard(), true), false);
});

test("findConnectedColorMatches clears any orthogonally touching group of five", () => {
  const board = createEmptyBoard();
  const red = { color: "bg-red-500" };

  [
    [15, 0],
    [15, 1],
    [15, 2],
    [14, 2],
    [13, 2],
  ].forEach(([y, x]) => {
    board[y][x] = red;
  });

  const matches = findConnectedColorMatches(board);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].length, 5);
});

test("findConnectedColorMatches ignores diagonals, stones, and wildcards", () => {
  const board = createEmptyBoard();
  const red = { color: "bg-red-500" };

  board[15][0] = red;
  board[14][1] = red;
  board[13][2] = red;
  board[12][3] = { ...red, isStone: true };
  board[11][4] = { ...red, isWildcard: true };

  assert.deepEqual(findConnectedColorMatches(board), []);
});

test("findFullRows reports rows filled by any locked block type", () => {
  const board = createEmptyBoard();
  board[BOARD_HEIGHT - 1] = Array.from({ length: BOARD_WIDTH }, (_, index) =>
    index === 0 ? { color: "bg-slate-500", isStone: true } : { color: "bg-blue-500" }
  );

  assert.deepEqual(findFullRows(board), [BOARD_HEIGHT - 1]);
});

test("findBlastCells returns occupied non-ghost cells in a bounded 3x3 area", () => {
  const board = createEmptyBoard();
  board[0][0] = { color: "bg-red-500", isFruit: true };
  board[0][1] = { color: "bg-slate-500", isStone: true };
  board[1][0] = { color: "bg-blue-500" };
  board[1][1] = { color: "bg-yellow-400", isGhost: true };
  board[2][2] = { color: "bg-green-500" };

  assert.deepEqual(findBlastCells(board, 0, 0), [
    { y: 0, x: 0 },
    { y: 0, x: 1 },
    { y: 1, x: 0 },
  ]);
});

test("fruit effects create distinct color, cross, and diagonal clear patterns", () => {
  const board = createEmptyBoard();
  board[10][4] = { color: "bg-red-500", isFruit: true, fruitType: "apple" };
  board[10][3] = { color: "bg-red-500" };
  board[10][2] = { color: "bg-red-500" };
  board[9][4] = { color: "bg-orange-500" };
  board[8][4] = { color: "bg-blue-500" };
  board[9][3] = { color: "bg-yellow-400" };
  board[8][2] = { color: "bg-green-500" };

  assert.deepEqual(findFruitEffectCells(board, 10, 4, "apple", "bg-red-500"), [
    { y: 10, x: 4 },
    { y: 10, x: 3 },
    { y: 10, x: 2 },
  ]);
  assert.deepEqual(findFruitEffectCells(board, 10, 4, "orange", "bg-red-500"), [
    { y: 10, x: 4 },
    { y: 9, x: 4 },
    { y: 10, x: 3 },
    { y: 8, x: 4 },
    { y: 10, x: 2 },
  ]);
  assert.deepEqual(findFruitEffectCells(board, 10, 4, "banana", "bg-red-500"), [
    { y: 10, x: 4 },
    { y: 9, x: 3 },
    { y: 8, x: 2 },
  ]);
});

test("findConnectedColorMatches ignores lava blocks similar to stones", () => {
  const board = createEmptyBoard();
  const red = { color: "bg-red-500" };

  board[15][0] = red;
  board[14][1] = red;
  board[13][2] = red;
  board[12][3] = { ...red, isLava: true, isStone: true };

  assert.deepEqual(findConnectedColorMatches(board), []);
});

test("findFullRows reports rows filled by lava blocks", () => {
  const board = createEmptyBoard();
  board[BOARD_HEIGHT - 1] = Array.from({ length: BOARD_WIDTH }, () =>
    ({ color: "bg-orange-600", isLava: true, isStone: true })
  );

  assert.deepEqual(findFullRows(board), [BOARD_HEIGHT - 1]);
});

test("clearBoardCells clears normal blocks and decrements heavy stone hits", () => {
  const board = createEmptyBoard();
  board[15][0] = { color: "bg-red-500" };
  board[15][1] = { color: "bg-zinc-800", isStone: true, isHeavyStone: true, heavyHits: 2, emoji: "🪨" };
  board[15][2] = { color: "bg-zinc-800", isStone: true, isHeavyStone: true, heavyHits: 1, emoji: "🪨" };

  const cellsToClear = [
    { y: 15, x: 0 },
    { y: 15, x: 1 },
    { y: 15, x: 2 }
  ];

  const nextBoard = clearBoardCells(board, cellsToClear);

  assert.equal(nextBoard[15][0], null);
  assert.ok(nextBoard[15][1]);
  assert.equal(nextBoard[15][1].heavyHits, 1);
  assert.equal(nextBoard[15][1].emoji, "🧱");
  assert.equal(nextBoard[15][2], null);
});

test("clearBoardCells leaves the input board untouched while damaging heavy stones", () => {
  const board = createEmptyBoard();
  const heavyStone = { color: "bg-zinc-800", isStone: true, isHeavyStone: true, heavyHits: 2, emoji: "🪨" };
  board[14][4] = heavyStone;

  const nextBoard = clearBoardCells(board, [{ y: 14, x: 4 }]);

  assert.notEqual(nextBoard, board);
  assert.notEqual(nextBoard[14], board[14]);
  assert.notEqual(nextBoard[14][4], heavyStone);
  assert.deepEqual(board[14][4], heavyStone);
  assert.equal(nextBoard[14][4].heavyHits, 1);
});

test("clearBoardCells treats duplicate clear coordinates as one hit during a single clear event", () => {
  const board = createEmptyBoard();
  board[10][5] = { color: "bg-zinc-800", isStone: true, isHeavyStone: true, heavyHits: 2, emoji: "🪨" };

  const nextBoard = clearBoardCells(board, [
    { y: 10, x: 5 },
    { y: 10, x: 5 },
  ]);

  assert.ok(nextBoard[10][5]);
  assert.equal(nextBoard[10][5].heavyHits, 1);
});

test("clearBoardCells ignores empty cells and out-of-bounds clear requests", () => {
  const board = createEmptyBoard();
  board[0][0] = { color: "bg-green-500" };

  const nextBoard = clearBoardCells(board, [
    { y: -1, x: 0 },
    { y: 0, x: -1 },
    { y: BOARD_HEIGHT, x: 0 },
    { y: 0, x: BOARD_WIDTH },
    { y: 5, x: 5 },
  ]);

  assert.deepEqual(nextBoard[0][0], { color: "bg-green-500" });
  assert.equal(nextBoard[5][5], null);
});

test("clearBoardCells requires three separate clear events to remove a desperation stone", () => {
  const board = createEmptyBoard();
  const desperationStone = {
    color: "bg-zinc-800",
    isStone: true,
    isHeavyStone: true,
    heavyHits: 3,
    emoji: "⛰️",
  };
  board[10][5] = desperationStone;

  let nextBoard = clearBoardCells(board, [{ y: 10, x: 5 }]);
  assert.ok(nextBoard[10][5]);
  assert.equal(nextBoard[10][5].heavyHits, 2);
  assert.equal(nextBoard[10][5].emoji, "🧱");
  assert.deepEqual(board[10][5], desperationStone);

  nextBoard = clearBoardCells(nextBoard, [{ y: 10, x: 5 }]);
  assert.ok(nextBoard[10][5]);
  assert.equal(nextBoard[10][5].heavyHits, 1);
  assert.equal(nextBoard[10][5].emoji, "🧱");

  nextBoard = clearBoardCells(nextBoard, [{ y: 10, x: 5 }]);
  assert.equal(nextBoard[10][5], null);
});

test("clearBoardCells counts duplicate desperation stone coordinates once per clear event", () => {
  const board = createEmptyBoard();
  board[8][3] = {
    color: "bg-zinc-800",
    isStone: true,
    isHeavyStone: true,
    heavyHits: 3,
    emoji: "⛰️",
  };

  const nextBoard = clearBoardCells(board, [
    { y: 8, x: 3 },
    { y: 8, x: 3 },
    { y: 8, x: 3 },
  ]);

  assert.ok(nextBoard[8][3]);
  assert.equal(nextBoard[8][3].heavyHits, 2);
  assert.equal(nextBoard[8][3].emoji, "🧱");
});
