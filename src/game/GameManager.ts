import { Game } from './Game.js';
import { Bot } from './Bot.js';
import type { Player, PlayerColor } from '../types/types.js';
import { kafkaProducer } from '../kafka/producer.js';
import { db } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

export class GameManager {
  readonly #games = new Map<string, Game>();
  readonly #waitingPlayers = new Map<string, { player: Player; timeout: NodeJS.Timeout }>();
  readonly #playerToGame = new Map<string, string>();
  readonly #disconnectedPlayers = new Map<string, { 
    gameId: string; 
    color: PlayerColor; 
    timeout: NodeJS.Timeout 
  }>();

  readonly MATCHMAKING_TIMEOUT = 10_000; // 10 seconds
  readonly RECONNECT_TIMEOUT = 30_000; // 30 seconds

  /**
   * Adds a player to the matchmaking queue
   */
  addPlayer(username: string, ws: WebSocket): void {
    // Check if player is already in a game
    const existingGameId = this.#playerToGame.get(username);
    if (existingGameId) {
      this.send(ws, {
        type: 'error',
        message: 'You are already in a game'
      });
      return;
    }

    // Check if player is already waiting
    if (this.#waitingPlayers.has(username)) {
      this.send(ws, {
        type: 'error',
        message: 'You are already waiting for a match'
      });
      return;
    }

    // Try to match with another waiting player
    const [waitingUsername, waitingData] = this.#waitingPlayers.entries().next().value ?? [null, null];
    
    if (waitingUsername && waitingUsername !== username) {
      // Match found - start game
      clearTimeout(waitingData.timeout);
      this.#waitingPlayers.delete(waitingUsername);
      this.#startGame(waitingData.player, { username, ws, color: 'yellow' });
    } else {
      // No match - add to waiting queue
      const player: Player = { username, ws, color: 'red' };
      
      const timeout = setTimeout(() => {
        this.#waitingPlayers.delete(username);
        this.#startGameWithBot(player);
      }, this.MATCHMAKING_TIMEOUT);

      this.#waitingPlayers.set(username, { player, timeout });
      
      this.send(ws, {
        type: 'waiting',
        timeLeft: this.MATCHMAKING_TIMEOUT / 1000
      });
    }
  }

  /**
   * Starts a game between two players
   */
  async #startGame(player1: Player, player2: Player): Promise<void> {
    const gameId = randomUUID();
    const game = new Game(player1, player2, gameId);
    
    this.#games.set(gameId, game);
    this.#playerToGame.set(player1.username, gameId);
    this.#playerToGame.set(player2.username, gameId);
    
    // Send Kafka event
    await kafkaProducer.sendGameStart(gameId, player1.username, player2.username);

    // Notify both players
    this.send(player1.ws, {
      type: 'gameStart',
      gameId,
      yourColor: player1.color,
      currentPlayer: game.currentPlayer,
      board: game.board,
      opponent: player2.username
    });

    this.send(player2.ws, {
      type: 'gameStart',
      gameId,
      yourColor: player2.color,
      currentPlayer: game.currentPlayer,
      board: game.board,
      opponent: player1.username
    });
  }

  /**
   * Starts a game with a bot opponent
   */
  #startGameWithBot(player: Player): void {
    const botPlayer: Player = {
      username: 'Bot 🤖',
      color: 'yellow',
      ws: null as any, // Bot doesn't need WebSocket
      isBot: true
    };

    const gameId = randomUUID();
    const game = new Game(player, botPlayer, gameId);
    
    this.#games.set(gameId, game);
    this.#playerToGame.set(player.username, gameId);

    this.send(player.ws, {
      type: 'gameStart',
      gameId,
      yourColor: player.color,
      currentPlayer: game.currentPlayer,
      board: game.board,
      opponent: botPlayer.username
    });

    // If bot goes first
    if (game.currentPlayer === botPlayer.color) {
      setTimeout(() => this.#makeBotMove(gameId), 500);
    }
  }

  /**
   * Handles a player's move
   */
  makeMove(username: string, gameId: string, column: number): void {
    const game = this.#games.get(gameId);
    if (!game) return;

    const player = game.players.find(p => p.username === username);
    if (!player) return;

    if (game.makeMove(column, player.color)) {
      this.#broadcastGameState(game);

      // If game is not over and opponent is bot, make bot move
      if (!game.winner && game.getPlayerByColor(game.currentPlayer).isBot) {
        setTimeout(() => this.#makeBotMove(gameId), 300);
      }
    }
  }

  /**
   * Makes a bot move
   */
  #makeBotMove(gameId: string): void {
    const game = this.#games.get(gameId);
    if (!game || game.winner) return;

    const botPlayer = game.getPlayerByColor(game.currentPlayer);
    if (!botPlayer.isBot) return;

    const bot = new Bot(botPlayer.color);
    const column = bot.getBestMove(game.board);

    if (game.makeMove(column, botPlayer.color)) {
      this.#broadcastGameState(game);
    }
  }

  /**
   * Broadcasts game state to all players
   */
  async #broadcastGameState(game: Game): Promise<void> {
    for (const player of game.players) {
      if (player.isBot) continue;

      this.send(player.ws, {
        type: 'move',
        board: game.board,
        currentPlayer: game.currentPlayer,
        winner: game.winner
      });
    }
    
    // If game ended, send Kafka event and save to database
    if (game.winner) {
      const duration = game.getDuration();
      const winner = game.winner === 'draw' ? null : game.getPlayerByColor(game.winner).username;
      
      await kafkaProducer.sendGameEnd(
        game.id,
        game.players[0].username,
        game.players[1].username,
        winner || 'draw',
        game.moveCount,
        duration
      );
      
      await db.saveGame(
        game.id,
        game.players[0].username,
        game.players[1].username,
        winner,
        game.moveCount,
        duration
      );
      
      // Clean up after a delay
      setTimeout(() => this.#cleanupGame(game.id), 5000);
    }
  }

  /**
   * Handles player disconnection
   */
  handleDisconnect(username: string): void {
    const gameId = this.#playerToGame.get(username);
    if (!gameId) return;

    const game = this.#games.get(gameId);
    if (!game) return;

    const player = game.players.find(p => p.username === username);
    if (!player) return;

    // Set up reconnection timeout
    const timeout = setTimeout(() => {
      this.#handleForfeit(gameId, username);
    }, this.RECONNECT_TIMEOUT);

    this.#disconnectedPlayers.set(username, {
      gameId,
      color: player.color,
      timeout
    });

    // Notify opponent
    const opponent = game.players.find(p => p.username !== username);
    if (opponent && !opponent.isBot) {
      this.send(opponent.ws, {
        type: 'error',
        message: `${username} disconnected. They have 30s to reconnect.`
      });
    }
  }

  /**
   * Handles player forfeit due to disconnect timeout
   */
  #handleForfeit(gameId: string, username: string): void {
    const game = this.#games.get(gameId);
    if (!game) return;

    const opponent = game.players.find(p => p.username !== username);
    if (opponent && !opponent.isBot) {
      this.send(opponent.ws, {
        type: 'opponentLeft',
        winner: opponent.color
      });
    }

    this.#cleanupGame(gameId);
  }

  /**
   * Handles player reconnection
   */
  rejoinGame(username: string, gameId: string, ws: WebSocket): void {
    const disconnectData = this.#disconnectedPlayers.get(username);
    
    if (!disconnectData || disconnectData.gameId !== gameId) {
      this.send(ws, {
        type: 'error',
        message: 'Cannot rejoin this game'
      });
      return;
    }

    clearTimeout(disconnectData.timeout);
    this.#disconnectedPlayers.delete(username);

    const game = this.#games.get(gameId);
    if (!game) {
      this.send(ws, {
        type: 'error',
        message: 'Game no longer exists'
      });
      return;
    }

    // Update player's WebSocket
    const player = game.players.find(p => p.username === username);
    if (player) {
      player.ws = ws;

      const opponent = game.players.find(p => p.username !== username);

      this.send(ws, {
        type: 'rejoinSuccess',
        gameId,
        yourColor: player.color,
        currentPlayer: game.currentPlayer,
        board: game.board,
        opponent: opponent?.username
      });
    }
  }

  /**
   * Cleans up a finished game
   */
  #cleanupGame(gameId: string): void {
    const game = this.#games.get(gameId);
    if (!game) return;

    for (const player of game.players) {
      this.#playerToGame.delete(player.username);
      this.#disconnectedPlayers.delete(player.username);
    }

    this.#games.delete(gameId);
  }

  /**
   * Removes a player from all queues and games
   */
  removePlayer(username: string): void {
    // Remove from waiting queue
    const waitingData = this.#waitingPlayers.get(username);
    if (waitingData) {
      clearTimeout(waitingData.timeout);
      this.#waitingPlayers.delete(username);
      console.log(`🗑️  Removed ${username} from waiting queue`);
    }

    // Remove from disconnected players
    const disconnectData = this.#disconnectedPlayers.get(username);
    if (disconnectData) {
      clearTimeout(disconnectData.timeout);
      this.#disconnectedPlayers.delete(username);
      console.log(`🗑️  Removed ${username} from disconnected players`);
    }

    // Handle active game
    const gameId = this.#playerToGame.get(username);
    if (gameId) {
      this.#handleForfeit(gameId, username);
      console.log(`🗑️  Removed ${username} from active game ${gameId}`);
    }

    // Clean up player mapping
    this.#playerToGame.delete(username);
  }

  /**
   * Gets a game by ID
   */
  getGame(gameId: string): Game | undefined {
    return this.#games.get(gameId);
  }

  /**
   * Sends a message to a WebSocket client
   */
  send(ws: WebSocket, data: unknown): void {
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}