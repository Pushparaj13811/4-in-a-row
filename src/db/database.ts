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

      // TODO: table creation/migration logic goes here
      // Example:
      // await this.createTables();

    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
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
