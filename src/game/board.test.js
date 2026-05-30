import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";
import {
  checkCollision,
  createEmptyBoard,
  findBlastCells,
  findConnectedColorMatches,
  findFullRows,
} from "./board.js";

test("checkCollision treats the board floor as a collision without reading past the board", () => {
  const piece = { shape: [[1]], x: 0, y: BOARD_HEIGHT };

  assert.equal(checkCollision(piece, createEmptyBoard()), true);
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
