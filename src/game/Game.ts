import type { Player, PlayerColor, Board} from '../types/types.js';

export class Game {
  readonly id: string;
  readonly players: [Player, Player];
  readonly board: Board;

  currentPlayer: PlayerColor;
  winner: PlayerColor | 'draw' | null = null;
  moveCount: number = 0;
  readonly startTime: number;

  private readonly ROWS = 6;
  private readonly COLS = 7;
  private readonly WIN_LENGTH = 4;

  constructor(player1: Player, player2: Player, gameId: string) {
    this.id = gameId;
    this.players = [player1, player2];
    this.board = this.createEmptyBoard();
    this.currentPlayer = 'red'; // Red always starts
    this.startTime = Date.now();
  }

  /**
   * Creates an empty 6x7 board
   */
  private createEmptyBoard(): Board {
    return Array.from({ length: this.ROWS }, () =>
      Array.from({ length: this.COLS }, () => null)
    );
  }

  /**
   * Makes a move in the specified column
   */
  makeMove(column: number, color: PlayerColor): boolean {
    // Validate move
    if (this.winner !== null) return false;
    if (color !== this.currentPlayer) return false;
    if (column < 0 || column >= this.COLS) return false;
    if (this.board[0][column] !== null) return false; // Column is full

    // Find the lowest available row in the column
    let row = -1;
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.board[r][column] === null) {
        row = r;
        break;
      }
    }

    if (row === -1) return false; // Column is full

    // Place the disc
    this.board[row][column] = color;
    this.moveCount++;

    // Check for win
    if (this.checkWin(row, column, color)) {
      this.winner = color;
      return true;
    }

    // Check for draw
    if (this.isBoardFull()) {
      this.winner = 'draw';
      return true;
    }

    // Switch player
    this.currentPlayer = color === 'red' ? 'yellow' : 'red';
    return true;
  }

  /**
   * Checks if the last move resulted in a win
   */
  private checkWin(row: number, col: number, color: PlayerColor): boolean {
    // First verify the disc is actually on the board
    if (this.board[row][col] !== color) {
      console.error(`❌ WIN CHECK ERROR: Expected ${color} at [${row},${col}], but found ${this.board[row][col]}`);
      return false;
    }

    const horizontal = this.checkDirection(row, col, color, 0, 1);
    const vertical = this.checkDirection(row, col, color, 1, 0);
    const diagonal1 = this.checkDirection(row, col, color, 1, 1);
    const diagonal2 = this.checkDirection(row, col, color, 1, -1);

    const hasWon = horizontal || vertical || diagonal1 || diagonal2;

    if (hasWon) {
      console.log(`🏆 WIN DETECTED for ${color} at [${row},${col}]`);
      console.log(`   Horizontal: ${horizontal}, Vertical: ${vertical}`);
      console.log(`   Diagonal\\: ${diagonal1}, Diagonal/: ${diagonal2}`);
      console.log(`   Board state:`, JSON.stringify(this.board));
    }

    return hasWon;
  }

  /**
   * Checks for 4 in a row in a specific direction
   */
  private checkDirection(
    row: number,
    col: number,
    color: PlayerColor,
    rowDir: number,
    colDir: number
  ): boolean {
    let count = 1; // Count the current disc

    // Check in positive direction
    const positiveCount = this.countInDirection(row, col, color, rowDir, colDir);
    count += positiveCount;

    // Check in negative direction
    const negativeCount = this.countInDirection(row, col, color, -rowDir, -colDir);
    count += negativeCount;

    const isWin = count >= this.WIN_LENGTH;

    // Log detailed count for debugging
    if (count >= 3) {
      console.log(`   Direction[${rowDir},${colDir}]: count=${count} (pos:${positiveCount}, neg:${negativeCount}) - ${isWin ? 'WIN' : 'not enough'}`);
    }

    return isWin;
  }

  /**
   * Counts consecutive discs in a given direction
   */
  private countInDirection(
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
      this.board[r][c] === color
    ) {
      count++;
      r += rowDir;
      c += colDir;
    }

    return count;
  }

  /**
   * Checks if the board is completely full
   */
  private isBoardFull(): boolean {
    return this.board[0].every(cell => cell !== null);
  }

  /**
   * Gets a player by their color
   */
  getPlayerByColor(color: PlayerColor): Player {
    return this.players.find(p => p.color === color)!;
  }

  /**
   * Gets game duration in seconds
   */
  getDuration(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Checks if a column is valid and not full
   */
  isValidMove(column: number): boolean {
    if (column < 0 || column >= this.COLS) return false;
    return this.board[0][column] === null;
  }

  /**
   * Gets all valid column moves
   */
  getValidMoves(): number[] {
    const moves: number[] = [];
    for (let col = 0; col < this.COLS; col++) {
      if (this.isValidMove(col)) {
        moves.push(col);
      }
    }
    return moves;
  }

  /**
   * Simulates a move without actually making it (for bot AI)
   */
  simulateMove(column: number, color: PlayerColor): Board | null {
    if (!this.isValidMove(column)) return null;

    // Create a copy of the board
    const boardCopy: Board = this.board.map(row => [...row]);

    // Find the lowest available row
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (boardCopy[r][column] === null) {
        boardCopy[r][column] = color;
        return boardCopy;
      }
    }

    return null;
  }

  /**
   * Checks if a specific move would result in a win
   */
  wouldWin(column: number, color: PlayerColor): boolean {
    if (!this.isValidMove(column)) return false;

    // Find where the disc would land
    let row = -1;
    for (let r = this.ROWS - 1; r >= 0; r--) {
      if (this.board[r][column] === null) {
        row = r;
        break;
      }
    }

    if (row === -1) return false;

    // Temporarily place the disc
    this.board[row][column] = color;

    // Use direct win checking instead of checkWin to avoid logging noise
    const horizontal = this.checkDirection(row, column, color, 0, 1);
    const vertical = this.checkDirection(row, column, color, 1, 0);
    const diagonal1 = this.checkDirection(row, column, color, 1, 1);
    const diagonal2 = this.checkDirection(row, column, color, 1, -1);
    const isWin = horizontal || vertical || diagonal1 || diagonal2;

    // CRITICAL: Always restore board state
    this.board[row][column] = null;

    return isWin;
  }
}
