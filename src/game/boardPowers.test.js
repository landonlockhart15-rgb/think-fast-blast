import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";
import { applyBoardPower, getPowerCells } from "./boardPowers.js";

const cell = { color: "bg-cyan-500" };
const emptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));

test("tornado removes the two highest occupied layers and gravity settles columns", () => {
  const board = emptyBoard();
  board[4][0] = cell;
  board[6][1] = cell;
  board[10][0] = cell;
  const result = applyBoardPower(board, "power_tornado");
  assert.deepEqual(result.cells, [{ y: 4, x: 0 }, { y: 6, x: 1 }]);
  assert.equal(result.board[BOARD_HEIGHT - 1][0], cell);
});

test("earthquake removes the lowest occupied layer", () => {
  const board = emptyBoard();
  board[8][2] = cell;
  board[14][2] = cell;
  board[14][3] = cell;
  assert.deepEqual(getPowerCells(board, "power_earthquake"), [{ y: 14, x: 2 }, { y: 14, x: 3 }]);
});

test("fire and flood target dense occupied sections", () => {
  const board = emptyBoard();
  for (let y = 8; y < 11; y += 1) {
    for (let x = 3; x < 6; x += 1) board[y][x] = cell;
  }
  for (let x = 0; x < 5; x += 1) board[BOARD_HEIGHT - 1][x] = cell;

  assert.ok(getPowerCells(board, "power_fire").length >= 9);
  assert.ok(getPowerCells(board, "power_flood").every(({ y }) => y >= BOARD_HEIGHT / 2));
});
