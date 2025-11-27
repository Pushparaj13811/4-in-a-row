import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { Env } from './config/env.js';

const PORT = Env.PORT;

class GameServer {
  #wss: WebSocketServer;

  constructor() {
    const server = createServer();
    this.#wss = new WebSocketServer({ server });

    this.#setupWebSocket();

    server.listen(PORT, () => {
      console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
    });
  }

  #setupWebSocket(): void {
    this.#wss.on('connection', (ws: WebSocket) => {
      console.log('👤 Client connected');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📩 Message:', message);

          // Temporary echo response
          this.#send(ws, {
            type: 'ack',
            message: 'Message received',
          });
        } catch {
          this.#send(ws, {
            type: 'error',
            message: 'Invalid JSON',
          });
        }
      });

      ws.on('close', () => {
        console.log('👋 Client disconnected');
      });

      ws.on('error', (err) => {
        console.error('❌ WebSocket error:', err);
      });
    });
  }

  #send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }
}

// ✅ Start server
new GameServer();
