const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let client;
  try {
    client = await pool.connect();

    // Create daily_login_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_login_codes (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        code VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create user_daily_code_claims table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_daily_code_claims (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, date)
      );
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_login_codes_date 
      ON daily_login_codes(date);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_daily_code_claims_user_date 
      ON user_daily_code_claims(user_id, date);
    `);

    res.json({
      success: true,
      message: 'Daily codes tables initialized successfully',
      tables: [
        'daily_login_codes',
        'user_daily_code_claims'
      ],
      indexes: [
        'idx_daily_login_codes_date',
        'idx_user_daily_code_claims_user_date'
      ]
    });

  } catch (error) {
    console.error('Init daily codes tables error:', error);
    res.status(500).json({ 
      error: 'Failed to initialize tables',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};