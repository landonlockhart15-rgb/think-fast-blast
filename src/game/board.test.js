import test from "node:test";
import assert from "node:assert/strict";

import { BOARD_HEIGHT } from "../data/constants.js";
import { checkCollision, createEmptyBoard } from "./board.js";

test("checkCollision treats the board floor as a collision without reading past the board", () => {
  const piece = { shape: [[1]], x: 0, y: BOARD_HEIGHT };

  assert.equal(checkCollision(piece, createEmptyBoard()), true);
});

