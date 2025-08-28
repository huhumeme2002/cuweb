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

    // 1. Kiểm tra cấu trúc bảng keys
    debug.keysStructure = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'keys' 
      ORDER BY ordinal_position
    `);

    // 2. Xem một vài key mẫu
    debug.sampleKeys = await client.query(`
      SELECT key_value, requests, expires_at, is_used 
      FROM keys 
      ORDER BY id DESC 
      LIMIT 5
    `);

    // 3. Kiểm tra user có 400 requests
    debug.users400 = await client.query(`
      SELECT id, username, requests, expiry_time 
      FROM users 
      WHERE requests = 400 
      LIMIT 3
    `);

    // 4. Kiểm tra key có 100 requests
    debug.keys100 = await client.query(`
      SELECT key_value, requests, expires_at, is_used
      FROM keys 
      WHERE requests = 100
      ORDER BY id DESC
      LIMIT 5
    `);

    // 5. Kiểm tra recent key redemptions
    debug.recentRedemptions = await client.query(`
      SELECT rt.*, u.username 
      FROM request_transactions rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.description LIKE '%Đổi key%'
      ORDER BY rt.created_at DESC
      LIMIT 5
    `);

    // 6. Kiểm tra key đã dùng gần đây
    debug.recentUsedKeys = await client.query(`
      SELECT key_value, requests, expires_at, used_by, used_at
      FROM keys 
      WHERE is_used = true
      ORDER BY used_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      debug: debug,
      analysis: {
        keyLogic: 'Nếu key có expires_at ≠ NULL → thay thế hoàn toàn. Nếu expires_at = NULL → cộng dồn',
        issue: 'Cần kiểm tra xem key vừa đổi có expires_at hay không'
      }
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      error: 'Lỗi debug', 
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
};