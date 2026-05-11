import { BOARD_HEIGHT, BOARD_WIDTH } from "../data/constants";

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
        boardY >= 0 && currentBoard[boardY][boardX] !== null;

      if (isOutOfBounds || hitsPlacedBlock) return true;
    }
  }
  return false;
};

export const rotateShapeClockwise = (shape) =>
  shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
