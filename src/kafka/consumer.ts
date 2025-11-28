import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { Env } from '../config/env.js';
import { db } from '../db/database.js';

/**
 * Kafka Consumer for Game Analytics
 *
 * Consumes game events and tracks:
 * - Average game duration
 * - Most frequent winners
 * - Games per day/hour
 * - User-specific metrics
 */

class GameAnalyticsConsumer {
  private kafka: Kafka;
  private consumer: Consumer;

  constructor() {
    this.kafka = new Kafka({
      clientId: Env.KAFKA_CLIENT_ID,
      brokers: [Env.KAFKA_BROKER],
      retry: {
        retries: 8,
        initialRetryTime: 300,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: 'game-analytics-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      retry: {
        retries: 10,
        initialRetryTime: 1000,
        multiplier: 2,
        maxRetryTime: 30000,
      },
    });
  }

  /**
   * Start the consumer
   */
  async start(): Promise<void> {
    try {
      console.log('🔌 Connecting to Kafka broker...');
      await this.consumer.connect();
      console.log('✅ Connected to Kafka broker');

      // Subscribe to game events topic
      await this.consumer.subscribe({
        topic: 'game-events',
        fromBeginning: false, // Only consume new messages
      });

      console.log('📊 Subscribed to game-events topic');
      console.log('⏳ Waiting for events...\n');

      // Start consuming messages
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });
    } catch (error) {
      console.error('❌ Failed to start consumer:', error);
      throw error;
    }
  }

  /**
   * Handle incoming Kafka messages
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { partition, message } = payload;

    try {
      if (!message.value) return;

      const event = JSON.parse(message.value.toString());
      const timestamp = new Date(event.timestamp);

      console.log(`\n📩 [${timestamp.toLocaleTimeString()}] Event: ${event.type}`);
      console.log(`   📍 Partition: ${partition}, Offset: ${message.offset}`);

      // Process event based on type
      switch (event.type) {
        case 'GAME_START':
          await this.handleGameStart(event);
          break;

        case 'GAME_END':
          await this.handleGameEnd(event);
          break;

        case 'PLAYER_MOVE':
          await this.handlePlayerMove(event);
          break;

        default:
          console.log(`⚠️  Unknown event type: ${event.type}`);
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
      // Don't throw - continue processing other messages
    }
  }

  /**
   * Handle GAME_START event
   */
  private async handleGameStart(event: any): Promise<void> {
    console.log(`   🎮 Game Started: ${event.gameId}`);
    console.log(`   👥 Players: ${event.player1} vs ${event.player2}`);

    try {
      // Track game start in analytics
      await db.trackGameStart(event.gameId, event.player1, event.player2, new Date(event.timestamp));
    } catch (error) {
      console.error('   ❌ Failed to track game start:', error);
    }
  }

  /**
   * Handle GAME_END event
   */
  private async handleGameEnd(event: any): Promise<void> {
    console.log(`   🏁 Game Ended: ${event.gameId}`);
    console.log(`   🏆 Winner: ${event.winner}`);
    console.log(`   📊 Moves: ${event.moveCount}, Duration: ${event.duration}s`);

    try {
      // Update analytics with game completion
      await db.trackGameEnd(
        event.gameId,
        event.player1,
        event.player2,
        event.winner,
        event.moveCount,
        event.duration,
        new Date(event.timestamp)
      );

      // Log analytics summary
      await this.logAnalyticsSummary();
    } catch (error) {
      console.error('   ❌ Failed to track game end:', error);
    }
  }

  /**
   * Handle PLAYER_MOVE event
   */
  private async handlePlayerMove(event: any): Promise<void> {
    console.log(`   ✋ Move: ${event.player} → Column ${event.column} (Move #${event.moveNumber})`);

    try {
      // Track individual move for detailed analytics
      await db.trackPlayerMove(
        event.gameId,
        event.player,
        event.column,
        event.moveNumber,
        new Date(event.timestamp)
      );
    } catch (error) {
      console.error('   ❌ Failed to track move:', error);
    }
  }

  /**
   * Log current analytics summary
   */
  private async logAnalyticsSummary(): Promise<void> {
    try {
      const stats = await db.getAnalyticsSummary();

      console.log('\n📈 ═══════════════ Analytics Summary ═══════════════');
      console.log(`   🎯 Total Games: ${stats.totalGames}`);
      console.log(`   ⏱️  Average Duration: ${stats.avgDuration?.toFixed(1)}s`);
      console.log(`   🎲 Average Moves: ${stats.avgMoves?.toFixed(1)}`);
      console.log(`   🎯 Win Rate: ${stats.winRate?.toFixed(1)}%`);
      console.log(`   🤝 Draw Rate: ${stats.drawRate?.toFixed(1)}%`);

      if (stats.topPlayers && stats.topPlayers.length > 0) {
        console.log('\n   🏆 Top 3 Players:');
        stats.topPlayers.slice(0, 3).forEach((player: any, index: number) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
          console.log(`      ${medal} ${player.username} - ${player.wins} wins`);
        });
      }

      if (stats.gamesPerHour) {
        console.log(`\n   📊 Games this hour: ${stats.gamesPerHour}`);
      }

      if (stats.gamesPerDay) {
        console.log(`   📅 Games today: ${stats.gamesPerDay}`);
      }

      console.log('═══════════════════════════════════════════════════\n');
    } catch (error) {
      console.error('   ❌ Failed to get analytics summary:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async stop(): Promise<void> {
    console.log('\n🛑 Shutting down consumer...');

    try {
      await this.consumer.disconnect();
      console.log('✅ Consumer disconnected');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Main execution
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   🎮 4-in-a-Row Analytics Consumer            ║');
  console.log('║   📊 Processing game events from Kafka        ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Initialize database
  try {
    console.log('🔌 Connecting to database...');
    await db.init();
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  // Start consumer
  const consumer = new GameAnalyticsConsumer();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await consumer.stop();
    await db.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await consumer.stop();
    await db.close();
    process.exit(0);
  });

  // Start consuming
  try {
    await consumer.start();
  } catch (error) {
    console.error('❌ Consumer failed:', error);
    process.exit(1);
  }
}

// Run the consumer
main();
