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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    client = await pool.connect();
    
    const debug = {};

    // 1. Kiểm tra tất cả bảng liên quan đến blocking
    debug.tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%block%' OR table_name LIKE '%attempt%' OR table_name LIKE '%limit%'
      ORDER BY table_name
    `);

    // 2. Kiểm tra key_attempts table
    debug.keyAttempts = await client.query(`
      SELECT ka.*, u.username, u.email
      FROM key_attempts ka
      LEFT JOIN users u ON ka.user_id = u.id
      ORDER BY ka.last_attempt DESC
      LIMIT 10
    `);

    // 3. Kiểm tra IP rate limiting tables (nếu có)
    try {
      debug.ipRateLimits = await client.query(`
        SELECT * FROM ip_rate_limits
        ORDER BY last_request DESC
        LIMIT 10
      `);
    } catch (e) {
      debug.ipRateLimitsError = 'Table ip_rate_limits không tồn tại';
    }

    // 4. Kiểm tra suspicious activities (nếu có)
    try {
      debug.suspiciousActivities = await client.query(`
        SELECT * FROM suspicious_activities
        ORDER BY created_at DESC
        LIMIT 10
      `);
    } catch (e) {
      debug.suspiciousActivitiesError = 'Table suspicious_activities không tồn tại';
    }

    // 5. Kiểm tra các bảng khác có thể liên quan
    debug.allTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // 6. Kiểm tra current time để so sánh với blocked_until
    debug.currentTime = new Date().toISOString();

    res.json({
      success: true,
      debug: debug,
      analysis: {
        note: 'Kiểm tra key_attempts để tìm user bị khóa IP',
        currentTime: debug.currentTime
      }
    });

  } catch (error) {
    console.error('Debug IP blocking error:', error);
    res.status(500).json({ 
      error: 'Lỗi debug IP blocking', 
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
};