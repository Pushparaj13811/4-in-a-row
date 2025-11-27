import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Env } from './config/env.js';
import { GameManager } from './game/GameManager.js';
import { db } from './db/database.js';
import { kafkaProducer } from './kafka/producer.js';

const PORT = Env.PORT;

class GameServer {
  #wss: WebSocketServer;
  #gameManager: GameManager;
  #playerConnections = new Map<string, WebSocket>();
  #connectionToPlayer = new Map<WebSocket, string>();

  constructor() {
    const server = createServer();
    this.#wss = new WebSocketServer({ server });
    this.#gameManager = new GameManager();

    this.#init();
    this.#setupWebSocket();

    server.listen(PORT, () => {
      console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
      console.log(`🎮 4-in-a-Row Game Server Ready!`);
      console.log(`📊 Matchmaking timeout: 10 seconds`);
      console.log(`🔄 Reconnection timeout: 30 seconds\n`);
    });
  }

  /**
   * Initialize database and Kafka connections
   */
  async #init(): Promise<void> {
    try {
      // Initialize database
      await db.init();

      // Initialize Kafka producer (stub for now)
      await kafkaProducer.connect();

      console.log('✅ Server initialization complete\n');
    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      process.exit(1);
    }
  }

  #setupWebSocket(): void {
    this.#wss.on('connection', (ws: WebSocket) => {
      console.log('👤 New client connected');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.#handleMessage(ws, message);
        } catch (error) {
          this.#send(ws, {
            type: 'error',
            message: 'Invalid JSON format',
          });
        }
      });

      ws.on('close', () => {
        const username = this.#connectionToPlayer.get(ws);
        if (username) {
          console.log(`👋 ${username} disconnected`);
          this.#gameManager.handleDisconnect(username);
          this.#playerConnections.delete(username);
          this.#connectionToPlayer.delete(ws);
        } else {
          console.log('👋 Anonymous client disconnected');
        }
      });

      ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err);
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  #handleMessage(ws: WebSocket, message: any): void {
    console.log('📩 Message:', message.type, message);

    switch (message.type) {
      case 'join':
        this.#handleJoin(ws, message);
        break;

      case 'move':
        this.#handleMove(ws, message);
        break;

      case 'rejoin':
        this.#handleRejoin(ws, message);
        break;

      case 'leave':
        this.#handleLeave(ws, message);
        break;

      case 'getLeaderboard':
        this.#handleGetLeaderboard(ws);
        break;

      case 'ping':
        this.#send(ws, { type: 'pong' });
        break;

      default:
        this.#send(ws, {
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        });
    }
  }

  /**
   * Handle player joining matchmaking
   */
  #handleJoin(ws: WebSocket, message: any): void {
    const { username } = message;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      this.#send(ws, {
        type: 'error',
        message: 'Username is required',
      });
      return;
    }

    if (username.length > 20) {
      this.#send(ws, {
        type: 'error',
        message: 'Username must be 20 characters or less',
      });
      return;
    }

    // Store player connection
    this.#playerConnections.set(username, ws);
    this.#connectionToPlayer.set(ws, username);

    console.log(`🎮 ${username} joined matchmaking`);

    // Add to matchmaking queue
    this.#gameManager.addPlayer(username, ws);
  }

  /**
   * Handle player making a move
   */
  #handleMove(ws: WebSocket, message: any): void {
    const username = this.#connectionToPlayer.get(ws);
    const { gameId, column } = message;

    if (!username) {
      this.#send(ws, {
        type: 'error',
        message: 'You must join first',
      });
      return;
    }

    if (!gameId || typeof column !== 'number') {
      this.#send(ws, {
        type: 'error',
        message: 'Invalid move data',
      });
      return;
    }

    console.log(`🎯 ${username} played column ${column} in game ${gameId}`);

    this.#gameManager.makeMove(username, gameId, column);
  }

  /**
   * Handle player rejoining a game
   */
  #handleRejoin(ws: WebSocket, message: any): void {
    const { username, gameId } = message;

    if (!username || !gameId) {
      this.#send(ws, {
        type: 'error',
        message: 'Username and gameId are required',
      });
      return;
    }

    // Update player connection
    this.#playerConnections.set(username, ws);
    this.#connectionToPlayer.set(ws, username);

    console.log(`🔄 ${username} attempting to rejoin game ${gameId}`);

    this.#gameManager.rejoinGame(username, gameId, ws);
  }

  /**
   * Handle player leaving game
   */
  #handleLeave(ws: WebSocket, message: any): void {
    const { username } = message;

    if (!username) {
      this.#send(ws, {
        type: 'error',
        message: 'Username is required',
      });
      return;
    }

    console.log(`👋 ${username} is leaving the game`);

    // Remove from waiting queue and active games
    this.#gameManager.removePlayer(username);

    // Clean up connections
    this.#playerConnections.delete(username);
    this.#connectionToPlayer.delete(ws);

    console.log(`✅ ${username} has been removed from all games`);
  }

  /**
   * Handle leaderboard request
   */
  async #handleGetLeaderboard(ws: WebSocket): Promise<void> {
    try {
      const leaderboard = await db.getLeaderboard(10);
      this.#send(ws, {
        type: 'leaderboard',
        data: leaderboard,
      });
    } catch (error) {
      console.error('❌ Failed to fetch leaderboard:', error);
      this.#send(ws, {
        type: 'error',
        message: 'Failed to fetch leaderboard',
      });
    }
  }

  #send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

// ✅ Start server
new GameServer();