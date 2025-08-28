const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple test endpoint - bypass auth for testing
  const { userId, action, hours, reason } = req.body;

  console.log('Test Expiry Request:', { userId, action, hours, reason });

  let client;
  try {
    client = await pool.connect();

    // Simple extend test
    if (action === 'extend' && userId && hours) {
      const result = await client.query(`
        UPDATE users 
        SET expiry_time = CASE 
          WHEN expiry_time IS NULL THEN NOW() + INTERVAL '${hours} hours'
          WHEN expiry_time < NOW() THEN NOW() + INTERVAL '${hours} hours'
          ELSE expiry_time + INTERVAL '${hours} hours'
        END,
        is_expired = false,
        updated_at = NOW()
        WHERE id = $1
        RETURNING username, expiry_time
      `, [userId]);

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return res.json({
          success: true,
          message: `Gia hạn ${hours} giờ cho ${user.username}`,
          new_expiry: user.expiry_time
        });
      } else {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    // Simple set test  
    if (action === 'set' && userId && hours) {
      const result = await client.query(`
        UPDATE users 
        SET expiry_time = NOW() + INTERVAL '${hours} hours',
        is_expired = false,
        updated_at = NOW()
        WHERE id = $1
        RETURNING username, expiry_time
      `, [userId]);

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return res.json({
          success: true,
          message: `Đặt ${hours} giờ cho ${user.username}`,
          new_expiry: user.expiry_time
        });
      } else {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    // Remove expiry test
    if (action === 'remove' && userId) {
      const result = await client.query(`
        UPDATE users 
        SET expiry_time = NULL,
        is_expired = false,
        updated_at = NOW()
        WHERE id = $1
        RETURNING username
      `, [userId]);

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return res.json({
          success: true,
          message: `Loại bỏ thời hạn cho ${user.username}`,
          new_expiry: null
        });
      }
    }

    return res.status(400).json({ 
      error: 'Invalid action or missing parameters',
      received: { userId, action, hours, reason }
    });

  } catch (error) {
    console.error('Test expiry error:', error);
    res.status(500).json({ 
      error: 'Database error',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};