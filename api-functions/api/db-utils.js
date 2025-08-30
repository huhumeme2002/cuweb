const { Pool } = require('pg');

// Enhanced pool configuration with timeout and retry settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection timeout settings
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds  
  max: 10, // maximum connections
  // Query timeout
  query_timeout: 15000, // 15 seconds
});

// Retry logic for database operations
const retryQuery = async (queryFn, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      console.log(`Database query attempt ${attempt} failed:`, error.message);
      
      // Don't retry for authentication or permission errors
      if (error.code === '28P01' || error.code === '42501') {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

// Enhanced database connection with retry
const getClient = async () => {
  return await retryQuery(async () => {
    const client = await pool.connect();
    return client;
  });
};

// Execute query with retry logic
const executeQuery = async (query, params = []) => {
  return await retryQuery(async () => {
    const client = await pool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } finally {
      client.release();
    }
  });
};

module.exports = {
  pool,
  getClient,
  executeQuery,
  retryQuery
};