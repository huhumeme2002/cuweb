const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify JWT token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let adminId, adminRole;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unified-aivannang-secret-2024');
    adminId = decoded.userId;
    adminRole = decoded.role;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check if user is admin
  if (adminRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  let client;
  try {
    client = await pool.connect();

    if (req.method === 'GET') {
      // Get current daily login code
      const result = await client.query(`
        SELECT * FROM daily_login_codes 
        WHERE date = CURRENT_DATE 
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      res.json({
        success: true,
        current_code: result.rows[0] || null,
        today: new Date().toISOString().split('T')[0]
      });

    } else if (req.method === 'POST') {
      // Set/Update daily login code
      const { code } = req.body;
      
      if (!code || !code.trim()) {
        return res.status(400).json({ error: 'Mã login không được để trống' });
      }

      // Check if code already exists for today
      const existingResult = await client.query(`
        SELECT id FROM daily_login_codes 
        WHERE date = CURRENT_DATE
      `);

      if (existingResult.rows.length > 0) {
        // Update existing code
        await client.query(`
          UPDATE daily_login_codes 
          SET code = $1, updated_at = NOW()
          WHERE date = CURRENT_DATE
        `, [code.trim()]);
      } else {
        // Create new code
        await client.query(`
          INSERT INTO daily_login_codes (date, code, created_at, updated_at)
          VALUES (CURRENT_DATE, $1, NOW(), NOW())
        `, [code.trim()]);
      }

      res.json({
        success: true,
        message: 'Mã login đã được cập nhật',
        code: code.trim(),
        date: new Date().toISOString().split('T')[0]
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Admin daily codes error:', error);
    res.status(500).json({ 
      error: 'Lỗi máy chủ',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};