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

export const checkCollision = (piece, currentBoard) => {
  for (let y = 0; y < piece.shape.length; y += 1) {
    for (let x = 0; x < piece.shape[y].length; x += 1) {
      if (!piece.shape[y][x]) continue;

      const boardX = piece.x + x;
      const boardY = piece.y + y;
      const isOutOfBounds =
        boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT;
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
