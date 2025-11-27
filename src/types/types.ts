import type { WebSocket } from 'ws';

export type PlayerColor = 'red' | 'yellow';
export type CellState = PlayerColor | null;
export type Board = CellState[][];

export interface Player {
  username: string;
  ws: WebSocket;
  color: PlayerColor;
  isBot?: boolean;
}

export interface GameResult {
  winner: PlayerColor | 'draw' | null;
  winningCells?: [number, number][];
}

export interface GameState {
  gameId: string;
  board: Board;
  currentPlayer: PlayerColor;
  winner: PlayerColor | 'draw' | null;
  moveCount: number;
  startTime: number;
}

export interface GameStats {
  gameId: string;
  player1: string;
  player2: string;
  winner: string | null;
  moveCount: number;
  duration: number;
  createdAt: Date;
}
