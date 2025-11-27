import pg from 'pg';
import { Env } from '../config/env.js';

const { Pool } = pg;

// Create PostgreSQL connection pool
const pool = new Pool({
  host: Env.DB_HOST,
  port: Env.DB_PORT,
  database: Env.DB_NAME,
  user: Env.DB_USER,
  password: Env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 2000,
});

// Database interface for setup and lifecycle management
export const db = {
  pool,

  /**
   * Initialize database connection and run setup/migrations
   */
  async init(): Promise<void> {
    try {
      // Test connection
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as time, current_database() as database');
      console.log(`✅ Connected to database: ${result.rows[0].database}`);
      console.log(`⏰ Server time: ${result.rows[0].time}`);
      client.release();

      // Create tables if they don't exist
      await this.createTables();

    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  },

  /**
   * Create database tables
   */
  async createTables(): Promise<void> {
    // Create games table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY,
        player1 VARCHAR(255) NOT NULL,
        player2 VARCHAR(255) NOT NULL,
        winner VARCHAR(255),
        move_count INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create players table for leaderboard
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        username VARCHAR(255) PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        total_games INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create analytics tables for Kafka consumer
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_analytics (
        id SERIAL PRIMARY KEY,
        game_id UUID NOT NULL UNIQUE,
        player1 VARCHAR(255),
        player2 VARCHAR(255),
        winner VARCHAR(255),
        move_count INTEGER,
        duration INTEGER,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS move_analytics (
        id SERIAL PRIMARY KEY,
        game_id UUID NOT NULL,
        player VARCHAR(255) NOT NULL,
        column_number INTEGER NOT NULL,
        move_number INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_game_analytics_ended_at
      ON game_analytics(ended_at)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_game_analytics_winner
      ON game_analytics(winner)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_move_analytics_game_id
      ON move_analytics(game_id)
    `);

    // Add unique constraint on game_id if it doesn't exist (for existing tables)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          JOIN pg_namespace n ON t.relnamespace = n.oid
          WHERE c.conname = 'game_analytics_game_id_key'
            AND t.relname = 'game_analytics'
            AND n.nspname = 'public'
        ) THEN
          ALTER TABLE game_analytics ADD CONSTRAINT game_analytics_game_id_key UNIQUE (game_id);
        END IF;
      EXCEPTION
        WHEN duplicate_table THEN
          NULL; -- Constraint already exists, ignore
        WHEN duplicate_object THEN
          NULL; -- Constraint already exists, ignore
      END $$;
    `);

    console.log('✅ Database tables ready');
  },

  /**
   * Save a completed game and update player stats
   */
  async saveGame(
    gameId: string,
    player1: string,
    player2: string,
    winner: string | null,
    moveCount: number,
    duration: number
  ): Promise<void> {
    try {
      // Insert game record
      await pool.query(
        `INSERT INTO games (id, player1, player2, winner, move_count, duration)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [gameId, player1, player2, winner, moveCount, duration]
      );

      // Update player stats
      await this.updatePlayerStats(player1, winner);
      await this.updatePlayerStats(player2, winner);

      console.log(`💾 Game ${gameId} saved to database`);
    } catch (error) {
      console.error('❌ Failed to save game:', error);
      throw error;
    }
  },

  /**
   * Update player statistics
   */
  async updatePlayerStats(username: string, winner: string | null): Promise<void> {
    // Insert or update player record
    await pool.query(
      `INSERT INTO players (username, wins, losses, draws, total_games, updated_at)
       VALUES ($1::VARCHAR(255),
         CASE WHEN $2::VARCHAR(255) = $1::VARCHAR(255) THEN 1 ELSE 0 END,
         CASE WHEN $2::VARCHAR(255) IS NOT NULL AND $2::VARCHAR(255) != $1::VARCHAR(255) THEN 1 ELSE 0 END,
         CASE WHEN $2 IS NULL THEN 1 ELSE 0 END,
         1,
         CURRENT_TIMESTAMP)
       ON CONFLICT (username)
       DO UPDATE SET
         wins = players.wins + CASE WHEN $2::VARCHAR(255) = $1::VARCHAR(255) THEN 1 ELSE 0 END,
         losses = players.losses + CASE WHEN $2::VARCHAR(255) IS NOT NULL AND $2::VARCHAR(255) != $1::VARCHAR(255) THEN 1 ELSE 0 END,
         draws = players.draws + CASE WHEN $2 IS NULL THEN 1 ELSE 0 END,
         total_games = players.total_games + 1,
         updated_at = CURRENT_TIMESTAMP`,
      [username, winner]
    );
  },

  /**
   * Get leaderboard (top players by wins)
   */
  async getLeaderboard(limit: number = 10): Promise<any[]> {
    const result = await pool.query(
      `SELECT username, wins, losses, draws, total_games
       FROM players
       ORDER BY wins DESC, total_games ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  /**
   * Track game start event (from Kafka)
   */
  async trackGameStart(
    gameId: string,
    player1: string,
    player2: string,
    timestamp: Date
  ): Promise<void> {
    await pool.query(
      `INSERT INTO game_analytics (game_id, player1, player2, started_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [gameId, player1, player2, timestamp]
    );
  },

  /**
   * Track game end event (from Kafka)
   */
  async trackGameEnd(
    gameId: string,
    player1: string,
    player2: string,
    winner: string,
    moveCount: number,
    duration: number,
    timestamp: Date
  ): Promise<void> {
    await pool.query(
      `INSERT INTO game_analytics (game_id, player1, player2, winner, move_count, duration, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5::INTEGER, $6::INTEGER, $7::TIMESTAMP - ($6::INTEGER || ' seconds')::INTERVAL, $7::TIMESTAMP)
       ON CONFLICT (game_id) DO UPDATE SET
         winner = $4,
         move_count = $5::INTEGER,
         duration = $6::INTEGER,
         ended_at = $7::TIMESTAMP`,
      [gameId, player1, player2, winner === 'draw' ? null : winner, moveCount, duration, timestamp]
    );
  },

  /**
   * Track individual player move (from Kafka)
   */
  async trackPlayerMove(
    gameId: string,
    player: string,
    column: number,
    moveNumber: number,
    timestamp: Date
  ): Promise<void> {
    await pool.query(
      `INSERT INTO move_analytics (game_id, player, column_number, move_number, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [gameId, player, column, moveNumber, timestamp]
    );
  },

  /**
   * Get comprehensive analytics summary
   */
  async getAnalyticsSummary(): Promise<any> {
    // Get total games and averages
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_games,
        AVG(duration) as avg_duration,
        AVG(move_count) as avg_moves,
        COUNT(*) FILTER (WHERE winner IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0) as win_rate,
        COUNT(*) FILTER (WHERE winner IS NULL) * 100.0 / NULLIF(COUNT(*), 0) as draw_rate
      FROM game_analytics
      WHERE ended_at IS NOT NULL
    `);

    // Get games per hour
    const gamesPerHourResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM game_analytics
      WHERE ended_at >= NOW() - INTERVAL '1 hour'
    `);

    // Get games per day
    const gamesPerDayResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM game_analytics
      WHERE ended_at >= NOW() - INTERVAL '1 day'
    `);

    // Get top players from leaderboard
    const topPlayers = await this.getLeaderboard(10);

    return {
      totalGames: parseInt(statsResult.rows[0]?.total_games || 0),
      avgDuration: parseFloat(statsResult.rows[0]?.avg_duration || 0),
      avgMoves: parseFloat(statsResult.rows[0]?.avg_moves || 0),
      winRate: parseFloat(statsResult.rows[0]?.win_rate || 0),
      drawRate: parseFloat(statsResult.rows[0]?.draw_rate || 0),
      gamesPerHour: parseInt(gamesPerHourResult.rows[0]?.count || 0),
      gamesPerDay: parseInt(gamesPerDayResult.rows[0]?.count || 0),
      topPlayers,
    };
  },

  /**
   * Get player-specific analytics
   */
  async getPlayerAnalytics(username: string): Promise<any> {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_games,
        COUNT(*) FILTER (WHERE winner = $1) as wins,
        COUNT(*) FILTER (WHERE winner IS NOT NULL AND winner != $1) as losses,
        COUNT(*) FILTER (WHERE winner IS NULL) as draws,
        AVG(duration) FILTER (WHERE player1 = $1 OR player2 = $1) as avg_duration,
        AVG(move_count) FILTER (WHERE player1 = $1 OR player2 = $1) as avg_moves
       FROM game_analytics
       WHERE (player1 = $1 OR player2 = $1) AND ended_at IS NOT NULL`,
      [username]
    );

    return result.rows[0] || {};
  },

  /**
   * Get most popular columns (which columns are played most often)
   */
  async getPopularColumns(): Promise<any[]> {
    const result = await pool.query(`
      SELECT column_number, COUNT(*) as play_count
      FROM move_analytics
      GROUP BY column_number
      ORDER BY play_count DESC
    `);

    return result.rows;
  },

  /**
   * Get hourly game distribution
   */
  async getHourlyDistribution(): Promise<any[]> {
    const result = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM ended_at) as hour,
        COUNT(*) as game_count
      FROM game_analytics
      WHERE ended_at >= NOW() - INTERVAL '24 hours'
      GROUP BY EXTRACT(HOUR FROM ended_at)
      ORDER BY hour
    `);

    return result.rows;
  },

  /**
   * Close database pool
   */
  async close(): Promise<void> {
    try {
      await pool.end();
      console.log('🔌 Database pool closed');
    } catch (error) {
      console.error('❌ Error closing database pool:', error);
      throw error;
    }
  },

  /**
   * Query helper method
   */
  async query(text: string, params?: any[]): Promise<pg.QueryResult> {
    return pool.query(text, params);
  },
};

// Handle process termination
process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});
