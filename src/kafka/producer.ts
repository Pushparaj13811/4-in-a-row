/**
 * Kafka Producer for Game Events
 *
 * Sends events to Kafka for analytics processing:
 * - GAME_START: When a game begins
 * - GAME_END: When a game finishes
 * - PLAYER_MOVE: Each move made by players
 *
 * To enable Kafka:
 * 1. Ensure Kafka broker is running on localhost:9092
 * 2. Set ENABLE_KAFKA=true in .env
 * 3. Restart the server
 */

import { Kafka, Producer } from 'kafkajs';
import { Env } from '../config/env.js';

// Enable Kafka via environment variable (defaults to true for production readiness)
const KAFKA_ENABLED = process.env.ENABLE_KAFKA !== 'false';

class KafkaProducer {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private isConnected: boolean = false;

  /**
   * Initialize Kafka producer
   */
  async connect(): Promise<void> {
    if (!KAFKA_ENABLED) {
      console.log('ℹ️  Kafka is disabled - events will be logged locally');
      console.log('   To enable: Set ENABLE_KAFKA=true in .env');
      return;
    }

    try {
      console.log(`🔌 Connecting to Kafka broker at ${Env.KAFKA_BROKER}...`);

      this.kafka = new Kafka({
        clientId: 'game-server',
        brokers: [Env.KAFKA_BROKER],
        retry: {
          retries: 5,
          initialRetryTime: 300,
        },
      });

      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.isConnected = true;
      console.log('✅ Kafka producer connected');
    } catch (error) {
      console.error('❌ Failed to connect to Kafka:', error);
      console.log('   Server will continue without Kafka - events logged locally');
      this.isConnected = false;
    }
  }

  /**
   * Send game start event
   */
  async sendGameStart(gameId: string, player1: string, player2: string): Promise<void> {
    const event = {
      type: 'GAME_START',
      gameId,
      player1,
      player2,
      timestamp: new Date().toISOString(),
    };

    if (KAFKA_ENABLED && this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic: 'game-events',
          messages: [{ value: JSON.stringify(event) }],
        });
      } catch (error) {
        console.error('❌ Failed to send Kafka event:', error);
        console.log('📊 [KAFKA EVENT]', event);
      }
    } else {
      console.log('📊 [KAFKA EVENT]', event);
    }
  }

  /**
   * Send game end event
   */
  async sendGameEnd(
    gameId: string,
    player1: string,
    player2: string,
    winner: string,
    moveCount: number,
    duration: number
  ): Promise<void> {
    const event = {
      type: 'GAME_END',
      gameId,
      player1,
      player2,
      winner,
      moveCount,
      duration,
      timestamp: new Date().toISOString(),
    };

    if (KAFKA_ENABLED && this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic: 'game-events',
          messages: [{ value: JSON.stringify(event) }],
        });
      } catch (error) {
        console.error('❌ Failed to send Kafka event:', error);
        console.log('📊 [KAFKA EVENT]', event);
      }
    } else {
      console.log('📊 [KAFKA EVENT]', event);
    }
  }

  /**
   * Send player move event
   */
  async sendMove(
    gameId: string,
    player: string,
    column: number,
    moveNumber: number
  ): Promise<void> {
    const event = {
      type: 'PLAYER_MOVE',
      gameId,
      player,
      column,
      moveNumber,
      timestamp: new Date().toISOString(),
    };

    if (KAFKA_ENABLED && this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic: 'game-events',
          messages: [{ value: JSON.stringify(event) }],
        });
      } catch (error) {
        console.error('❌ Failed to send Kafka event:', error);
        console.log('📊 [KAFKA EVENT]', event);
      }
    } else {
      console.log('📊 [KAFKA EVENT]', event);
    }
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      try {
        await this.producer.disconnect();
        this.isConnected = false;
        console.log('🔌 Kafka producer disconnected');
      } catch (error) {
        console.error('❌ Failed to disconnect from Kafka:', error);
      }
    }
  }
}

export const kafkaProducer = new KafkaProducer();
