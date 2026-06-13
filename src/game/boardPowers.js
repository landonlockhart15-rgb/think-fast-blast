import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";

export const BOARD_POWERS = {
  power_tornado: {
    name: "Tornado",
    emoji: "🌪",
    description: "Tears away the two highest occupied layers.",
    cost: 240,
    effect: "tornado",
  },
  power_earthquake: {
    name: "Earthquake",
    emoji: "🌋",
    description: "Shatters the lowest occupied layer.",
    cost: 220,
    effect: "earthquake",
  },
  power_fire: {
    name: "Firestorm",
    emoji: "🔥",
    description: "Burns the densest 3x3 section of blocks.",
    cost: 260,
    effect: "fire",
  },
  power_flood: {
    name: "Flash Flood",
    emoji: "🌊",
    description: "Washes away the fullest lower-board section.",
    cost: 280,
    effect: "flood",
  },
};

const occupied = (board, y, x) => Boolean(board[y]?.[x]);

const rowCells = (board, y) =>
  Array.from({ length: BOARD_WIDTH }, (_, x) => ({ y, x })).filter(({ x }) => occupied(board, y, x));

const densestWindow = (board, windowHeight, windowWidth, minY = 0) => {
  let best = { count: 0, top: minY, left: 0 };
  for (let top = minY; top <= BOARD_HEIGHT - windowHeight; top += 1) {
    for (let left = 0; left <= BOARD_WIDTH - windowWidth; left += 1) {
      let count = 0;
      for (let y = top; y < top + windowHeight; y += 1) {
        for (let x = left; x < left + windowWidth; x += 1) {
          count += Number(occupied(board, y, x));
        }
      }
      if (count > best.count || (count === best.count && top > best.top)) {
        best = { count, top, left };
      }
    }
  }
  return best;
};

export function getPowerCells(board, powerId) {
  if (powerId === "power_tornado") {
    const rows = [];
    for (let y = 0; y < BOARD_HEIGHT && rows.length < 2; y += 1) {
      if (board[y].some(Boolean)) rows.push(y);
    }
    return rows.flatMap((y) => rowCells(board, y));
  }

  if (powerId === "power_earthquake") {
    for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
      const cells = rowCells(board, y);
      if (cells.length) return cells;
    }
    return [];
  }

  const isFlood = powerId === "power_flood";
  const windowHeight = isFlood ? 2 : 3;
  const windowWidth = isFlood ? 5 : 3;
  const minY = isFlood ? Math.floor(BOARD_HEIGHT / 2) : 0;
  const target = densestWindow(board, windowHeight, windowWidth, minY);
  const cells = [];
  for (let y = target.top; y < target.top + windowHeight; y += 1) {
    for (let x = target.left; x < target.left + windowWidth; x += 1) {
      if (occupied(board, y, x)) cells.push({ y, x });
    }
  }
  return cells;
}

export function clearCellsWithGravity(board, cells) {
  const next = board.map((row) => [...row]);
  cells.forEach(({ y, x }) => {
    if (next[y]?.[x]) next[y][x] = null;
  });

  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    let writeY = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y -= 1) {
      if (next[y][x]) {
        next[writeY][x] = next[y][x];
        if (writeY !== y) next[y][x] = null;
        writeY -= 1;
      }
    }
    while (writeY >= 0) {
      next[writeY][x] = null;
      writeY -= 1;
    }
  }
  return next;
}

export function applyBoardPower(board, powerId) {
  const cells = getPowerCells(board, powerId);
  return {
    cells,
    board: clearCellsWithGravity(board, cells),
    cleared: cells.length,
  };
}
