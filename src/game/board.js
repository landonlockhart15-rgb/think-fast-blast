import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants.js";

export const createEmptyBoard = () =>
  Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));

export const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const checkCollision = (piece, currentBoard, inverseGravity = false) => {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;

      const boardX = piece.x + x;
      const boardY = piece.y + y;
      const isOutOfBounds =
        boardX < 0 || boardX >= BOARD_WIDTH || boardY < 0 || boardY >= BOARD_HEIGHT;
      const hitsPlacedBlock =
        boardY >= 0 && boardY < BOARD_HEIGHT && currentBoard[boardY][boardX] !== null;

      if (isOutOfBounds || hitsPlacedBlock) return true;
    }
  }
  return false;
};

export const rotateShapeClockwise = (shape) =>
  shape[0].map((_, index) => shape.map((row) => row[index]).reverse());

export const isColorMatchCell = (cell) =>
  Boolean(cell && !cell.isGhost && !cell.isStone && !cell.isWildcard && cell.color);

export const findConnectedColorMatches = (currentBoard, minimumSize = 5) => {
  const visited = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(false));
  const matches = [];
  const directions = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (visited[y][x] || !isColorMatchCell(currentBoard[y][x])) continue;

      const color = currentBoard[y][x].color;
      const component = [];
      const stack = [{ y, x }];
      visited[y][x] = true;

      while (stack.length > 0) {
        const current = stack.pop();
        component.push(current);

        directions.forEach(([dy, dx]) => {
          const nextY = current.y + dy;
          const nextX = current.x + dx;
          const insideBoard =
            nextY >= 0 && nextY < BOARD_HEIGHT && nextX >= 0 && nextX < BOARD_WIDTH;

          if (
            insideBoard &&
            !visited[nextY][nextX] &&
            isColorMatchCell(currentBoard[nextY][nextX]) &&
            currentBoard[nextY][nextX].color === color
          ) {
            visited[nextY][nextX] = true;
            stack.push({ y: nextY, x: nextX });
          }
        });
      }

      if (component.length >= minimumSize) {
        matches.push(component);
      }
    }
  }

  return matches;
};

export const findFullRows = (currentBoard) => {
  const fullRows = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    if (currentBoard[y].every((cell) => cell !== null && !cell.isGhost)) {
      fullRows.push(y);
    }
  }
  return fullRows;
};

export const findBlastCells = (currentBoard, centerY, centerX, radius = 1) => {
  const cells = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const y = centerY + dy;
      const x = centerX + dx;
      const insideBoard = y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH;
      if (insideBoard && currentBoard[y][x] !== null && !currentBoard[y][x].isGhost) {
        cells.push({ y, x });
      }
    }
  }
  return cells;
};

export const findFruitEffectCells = (currentBoard, centerY, centerX, fruitType, color) => {
  const cells = [];
  const seen = new Set();
  const add = (y, x) => {
    const insideBoard = y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH;
    const key = `${y}:${x}`;
    if (
      insideBoard &&
      !seen.has(key) &&
      currentBoard[y][x] !== null &&
      !currentBoard[y][x].isGhost
    ) {
      seen.add(key);
      cells.push({ y, x });
    }
  };

  add(centerY, centerX);

  if (fruitType === "orange") {
    for (let distance = 1; distance <= 2; distance += 1) {
      add(centerY - distance, centerX);
      add(centerY + distance, centerX);
      add(centerY, centerX - distance);
      add(centerY, centerX + distance);
    }
    return cells;
  }

  if (fruitType === "banana") {
    for (let distance = 1; distance <= 3; distance += 1) {
      add(centerY - distance, centerX - distance);
      add(centerY - distance, centerX + distance);
      add(centerY + distance, centerX - distance);
      add(centerY + distance, centerX + distance);
    }
    return cells;
  }

  const queue = [
    [centerY - 1, centerX],
    [centerY + 1, centerX],
    [centerY, centerX - 1],
    [centerY, centerX + 1],
  ];
  const visited = new Set();

  while (queue.length > 0) {
    const [y, x] = queue.shift();
    const key = `${y}:${x}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (y < 0 || y >= BOARD_HEIGHT || x < 0 || x >= BOARD_WIDTH) continue;
    const cell = currentBoard[y][x];
    if (!cell || cell.isGhost || cell.isStone || cell.color !== color) continue;
    add(y, x);
    queue.push(
      [y - 1, x],
      [y + 1, x],
      [y, x - 1],
      [y, x + 1]
    );
  }

  if (cells.length === 1) {
    add(centerY - 1, centerX);
    add(centerY + 1, centerX);
    add(centerY, centerX - 1);
    add(centerY, centerX + 1);
  }

  return cells;
};

export const clearBoardCells = (currentBoard, cellsToClear) => {
  const nextBoard = currentBoard.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  const seen = new Set();
  const uniqueCells = cellsToClear.filter((cell) => {
    if (!cell) return false;
    const key = `${cell.y}:${cell.x}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  uniqueCells.forEach((cell) => {
    const boardCell = nextBoard[cell.y]?.[cell.x];
    if (boardCell) {
      if (boardCell.isHeavyStone && boardCell.heavyHits > 1) {
        boardCell.heavyHits -= 1;
        boardCell.emoji = "🧱"; // show cracked brick appearance when damaged
      } else {
        nextBoard[cell.y][cell.x] = null;
      }
    }
  });
  return nextBoard;
};

export const findRowClearCells = (currentBoard, centerY) => {
  const cells = [];
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    if (currentBoard[centerY]?.[x] !== null && !currentBoard[centerY]?.[x]?.isGhost) {
      cells.push({ y: centerY, x });
    }
  }
  return cells;
};

export const findArea2x2ClearCells = (currentBoard, centerY, centerX) => {
  const cells = [];
  const startY = centerY === 0 ? 0 : centerY - 1;
  const startX = centerX === 0 ? 0 : centerX - 1;
  for (let y = startY; y <= startY + 1 && y < BOARD_HEIGHT; y += 1) {
    for (let x = startX; x <= startX + 1 && x < BOARD_WIDTH; x += 1) {
      if (currentBoard[y]?.[x] !== null && !currentBoard[y]?.[x]?.isGhost) {
        cells.push({ y, x });
      }
    }
  }
  return cells;
};
