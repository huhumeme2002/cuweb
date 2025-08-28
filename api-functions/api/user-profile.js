const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unified-aivannang-secret-2024');
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  let client;
  try {
    client = await pool.connect();

    // Lấy thông tin user hiện tại
    const result = await client.query(`
      SELECT 
        id,
        username,
        email,
        requests,
        expiry_time,
        is_expired,
        role,
        created_at,
        CASE 
          WHEN expiry_time IS NULL THEN 'no_expiry'
          WHEN expiry_time < NOW() OR is_expired = true THEN 'expired'
          WHEN expiry_time > NOW() AND expiry_time < NOW() + INTERVAL '24 hours' THEN 'expiring_soon'
          ELSE 'active'
        END as expiry_status,
        CASE 
          WHEN expiry_time IS NULL THEN NULL
          WHEN expiry_time < NOW() THEN 0
          ELSE EXTRACT(EPOCH FROM (expiry_time - NOW()))/3600
        END as hours_remaining
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        requests: user.requests,
        expiry_time: user.expiry_time,
        is_expired: user.is_expired,
        role: user.role,
        created_at: user.created_at,
        expiry_status: user.expiry_status,
        hours_remaining: user.hours_remaining
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get user profile',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};