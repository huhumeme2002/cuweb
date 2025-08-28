const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify JWT token
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

    // Get user info and expiry
    const userResult = await client.query(`
      SELECT username, expiry_time, is_expired 
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if user has valid expiry time
    if (!user.expiry_time || user.is_expired) {
      return res.status(400).json({ 
        error: 'Key đã hết hạn hoặc không có thời hạn',
        code: 'EXPIRED_KEY'
      });
    }

    const now = new Date();
    const expiryTime = new Date(user.expiry_time);
    
    if (expiryTime <= now) {
      return res.status(400).json({ 
        error: 'Key đã hết hạn',
        code: 'EXPIRED_KEY'
      });
    }

    // Calculate remaining days
    const timeDiff = expiryTime.getTime() - now.getTime();
    const remainingDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (remainingDays <= 0) {
      return res.status(400).json({ 
        error: 'Key đã hết hạn',
        code: 'EXPIRED_KEY'
      });
    }

    // Check if user already got code today
    const todayResult = await client.query(`
      SELECT id FROM user_daily_code_claims
      WHERE user_id = $1 AND date = CURRENT_DATE
    `, [userId]);

    if (todayResult.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Bạn đã lấy mã login hôm nay rồi',
        code: 'ALREADY_CLAIMED_TODAY'
      });
    }

    // Check total claims vs remaining days
    const totalClaimsResult = await client.query(`
      SELECT COUNT(*) as claim_count
      FROM user_daily_code_claims
      WHERE user_id = $1 AND date >= $2
    `, [userId, expiryTime.toISOString().split('T')[0]]);

    const totalClaims = parseInt(totalClaimsResult.rows[0].claim_count);
    
    if (totalClaims >= remainingDays) {
      return res.status(400).json({ 
        error: `Bạn đã sử dụng hết lượt lấy mã (${totalClaims}/${remainingDays} ngày)`,
        code: 'MAX_CLAIMS_REACHED'
      });
    }

    // Get today's daily code
    const codeResult = await client.query(`
      SELECT code FROM daily_login_codes 
      WHERE date = CURRENT_DATE
    `);

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Chưa có mã login cho hôm nay, vui lòng liên hệ admin',
        code: 'NO_CODE_TODAY'
      });
    }

    const dailyCode = codeResult.rows[0].code;

    // Record the claim
    await client.query(`
      INSERT INTO user_daily_code_claims (user_id, date, created_at)
      VALUES ($1, CURRENT_DATE, NOW())
    `, [userId]);

    // Log transaction
    await client.query(`
      INSERT INTO request_transactions (user_id, requests_amount, description, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [userId, 0, `Lấy mã login ngày ${new Date().toLocaleDateString('vi-VN')}`]);

    const remainingClaims = remainingDays - totalClaims - 1;

    res.json({
      success: true,
      code: dailyCode,
      message: 'Lấy mã login thành công!',
      remaining_days: remainingDays,
      remaining_claims: remainingClaims,
      total_claims: totalClaims + 1,
      date: new Date().toLocaleDateString('vi-VN')
    });

  } catch (error) {
    console.error('Get daily code error:', error);
    res.status(500).json({ 
      error: 'Lỗi máy chủ',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};