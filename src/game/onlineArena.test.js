import assert from "node:assert/strict";
import test from "node:test";

import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";
import {
  addGarbageRows,
  createArenaPiece,
  createRoomCode,
  lockArenaPiece,
  normalizeRoomCode,
  resolveArenaBoard,
} from "./onlineArena.js";
import { createEmptyBoard } from "./board.js";

test("room codes are readable and normalized", () => {
  assert.equal(createRoomCode(() => 0), "AAAAAA");
  assert.equal(normalizeRoomCode(" ab-cd 23! "), "ABCD23");
});

test("arena pieces are deterministic per match round", () => {
  assert.deepEqual(createArenaPiece("match-seed", 4), createArenaPiece("match-seed", 4));
  assert.notDeepEqual(createArenaPiece("match-seed", 4), createArenaPiece("match-seed", 5));
});

test("locking and resolving a full row awards points and an attack", () => {
  const board = createEmptyBoard();
  for (let x = 0; x < BOARD_WIDTH - 1; x += 1) {
    board[BOARD_HEIGHT - 1][x] = { color: "bg-cyan-500" };
  }
  const piece = {
    shape: [[1]],
    color: "bg-cyan-500",
    x: BOARD_WIDTH - 1,
    y: BOARD_HEIGHT - 1,
  };
  const locked = lockArenaPiece(board, piece);
  const resolved = resolveArenaBoard(locked.board);

  assert.equal(locked.toppedOut, false);
  assert.equal(resolved.attacks, 1);
  assert.ok(resolved.points >= 100);
  assert.ok(resolved.board[BOARD_HEIGHT - 1].every((cell) => cell === null));
});

test("garbage rows preserve one gap and detect top out", () => {
  const result = addGarbageRows(createEmptyBoard(), 2, "garbage");
  assert.equal(result.toppedOut, false);
  assert.equal(result.board.at(-1).filter((cell) => cell === null).length, 1);
  assert.equal(result.board.at(-2).filter((cell) => cell === null).length, 1);

  const crowded = createEmptyBoard();
  crowded[0][0] = { color: "bg-red-500" };
  assert.equal(addGarbageRows(crowded, 1, "garbage").toppedOut, true);
});
