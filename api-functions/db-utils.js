const { Pool } = require('pg');

// Create a single pool instance with better configuration for Neon
let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // Better configuration for Neon free tier
      max: 3, // Maximum 3 connections (Neon free has ~5 limit)
      idleTimeoutMillis: 30000, // 30 seconds idle timeout
      connectionTimeoutMillis: 10000, // 10 seconds to connect
      acquireTimeoutMillis: 10000, // 10 seconds to acquire connection
      // Force close idle connections
      allowExitOnIdle: true
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Database pool error:', err);
      // Reset pool on error
      pool = null;
    });
  }
  return pool;
}

// Helper function to execute queries with proper connection management
async function executeQuery(queryText, values = []) {
  const pool = getPool();
  let client = null;
  
  try {
    // Get client with timeout
    client = await pool.connect();
    
    // Execute query
    const result = await client.query(queryText, values);
    return result;
    
  } catch (error) {
    console.error('Database query error:', error);
    
    // If connection error, reset pool
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      console.log('Resetting database pool due to connection error');
      pool = null;
    }
    
    throw error;
  } finally {
    // Always release client back to pool
    if (client) {
      client.release();
    }
  }
}

// Helper to close all connections (for cleanup)
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  executeQuery,
  closePool,
  getPool
};