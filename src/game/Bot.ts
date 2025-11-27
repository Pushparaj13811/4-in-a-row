import type { Board, PlayerColor } from '../types/types.js';

export class Bot {
  private readonly color: PlayerColor;
  private readonly opponentColor: PlayerColor;
  private readonly ROWS = 6;
  private readonly COLS = 7;
  private readonly WIN_LENGTH = 4;

  constructor(color: PlayerColor) {
    this.color = color;
    this.opponentColor = color === 'red' ? 'yellow' : 'red';
  }

  /**
   * Gets the best move for the bot
   * Priority:
   * 1. Win if possible
   * 2. Block opponent's winning move
   * 3. Build towards a win
   * 4. Play center columns
   */
  getBestMove(board: Board): number {
    const validMoves = this.getValidMoves(board);

    if (validMoves.length === 0) return -1;
    if (validMoves.length === 1) return validMoves[0];

    // 1. Check if bot can win
    for (const col of validMoves) {
      if (this.wouldWin(board, col, this.color)) {
        return col;
      }
    }

    // 2. Block opponent's winning move
    for (const col of validMoves) {
      if (this.wouldWin(board, col, this.opponentColor)) {
        return col;
      }
    }

    // 3. Strategic positioning - score each move
    let bestScore = -Infinity;
    let bestMove = validMoves[0];

    for (const col of validMoves) {
      const score = this.evaluateMove(board, col);
      if (score > bestScore) {
        bestScore = score;
        bestMove = col;
      }
    }

    return bestMove;
  }

  /**
   * Evaluates the strategic value of a move
   */
  private evaluateMove(board: Board, column: number): number {
    const row = this.getLowestRow(board, column);
    if (row === -1) return -Infinity;

    let score = 0;

    // Prefer center columns
    const centerCol = Math.floor(this.COLS / 2);
    score += (3 - Math.abs(column - centerCol)) * 10;

    // Simulate the move
    const testBoard = this.copyBoard(board);
    testBoard[row][column] = this.color;

    // Check how many potential wins this creates
    score += this.countThreats(testBoard, row, column, this.color) * 50;

    // Check if this blocks opponent threats
    testBoard[row][column] = this.opponentColor;
    score += this.countThreats(testBoard, row, column, this.opponentColor) * 30;

    return score;
  }

  /**
   * Counts potential winning positions (3 in a row with empty space)
   */
  private countThreats(board: Board, row: number, col: number, color: PlayerColor): number {
    let threats = 0;

    // Check all 4 directions
    const directions = [
      [0, 1],  // Horizontal
      [1, 0],  // Vertical
      [1, 1],  // Diagonal \
      [1, -1]  // Diagonal /
    ];

    for (const [rowDir, colDir] of directions) {
      const count = this.countConsecutive(board, row, col, color, rowDir, colDir);
      if (count >= 3) threats++;
    }

    return threats;
  }

  /**
   * Counts consecutive discs in both directions
   */
  private countConsecutive(
    board: Board,
    row: number,
    col: number,
    color: PlayerColor,
    rowDir: number,
    colDir: number
  ): number {
    let count = 1;

    // Count in positive direction
    count += this.countInDirection(board, row, col, color, rowDir, colDir);

    // Count in negative direction
    count += this.countInDirection(board, row, col, color, -rowDir, -colDir);

    return count;
  }

  /**
   * Counts discs in one direction
   */
  private countInDirection(
    board: Board,
    row: number,
    col: number,
    color: PlayerColor,
    rowDir: number,
    colDir: number
  ): number {
    let count = 0;
    let r = row + rowDir;
    let c = col + colDir;

    while (
      r >= 0 &&
      r < this.ROWS &&
      c >= 0 &&
      c < this.COLS &&
      board[r][c] === color
    ) {
      count++;
      r += rowDir;
      c += colDir;
    }

    return count;
  }

  /**
   * Checks if a move would result in a win
   * CRITICAL: Works on a copy to avoid modifying the actual game board
   */
  private wouldWin(board: Board, column: number, color: PlayerColor): boolean {
    const row = this.getLowestRow(board, column);
    if (row === -1) return false;

    // CRITICAL FIX: Create a copy to avoid modifying the actual game board
    const boardCopy = this.copyBoard(board);
    boardCopy[row][column] = color;
    const isWin = this.checkWin(boardCopy, row, column, color);

    return isWin;
  }

  /**
   * Checks if a position creates a win
   */
  private checkWin(board: Board, row: number, col: number, color: PlayerColor): boolean {
    const directions = [
      [0, 1],  // Horizontal
      [1, 0],  // Vertical
      [1, 1],  // Diagonal \
      [1, -1]  // Diagonal /
    ];

    for (const [rowDir, colDir] of directions) {
      const count = this.countConsecutive(board, row, col, color, rowDir, colDir);
      if (count >= this.WIN_LENGTH) return true;
    }

    return false;
  }

  /**
   * Gets valid column moves
   */
  private getValidMoves(board: Board): number[] {
    const moves: number[] = [];
    for (let col = 0; col < this.COLS; col++) {
      if (board[0][col] === null) {
        moves.push(col);
      }
    }
    return moves;
  }

  /**
   * Finds the lowest available row in a column
   */
  private getLowestRow(board: Board, column: number): number {
    for (let row = this.ROWS - 1; row >= 0; row--) {
      if (board[row][column] === null) {
        return row;
      }
    }
    return -1;
  }

  /**
   * Creates a copy of the board
   */
  private copyBoard(board: Board): Board {
    return board.map((row: (PlayerColor | null)[]) => [...row]);
  }
}
