const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { AdvancedRateLimiter, getClientIP } = require('./advanced-security-middleware');
const { FrequencyDetector } = require('./frequency-detector');

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

  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'Unknown';

  // BƯỚC 0: FREQUENCY DETECTION - Detect automated tools like Key Checker
  const freqCheck = await FrequencyDetector.detectSuspiciousFrequency(clientIP, 'redeem-key-protected', userAgent);
  
  if (freqCheck.suspicious) {
    await AdvancedRateLimiter.logSuspiciousActivity(
      clientIP, 
      'redeem-key-protected', 
      userAgent,
      {
        reason: freqCheck.reason,
        detection_type: 'AUTOMATED_TOOL_DETECTED',
        count_10s: freqCheck.count_10s,
        count_60s: freqCheck.count_60s,
        user_agent: userAgent
      }
    );

    return res.status(429).json({
      error: 'Automated tool detected',
      message: `Tool bị chặn. Hệ thống phát hiện công cụ tự động (${freqCheck.count_10s} requests/10s)`,
      reason: 'AUTOMATED_TOOL_BLOCKED',
      blocked_duration_minutes: freqCheck.block_duration_minutes,
      detection: {
        requests_10s: freqCheck.count_10s,
        requests_60s: freqCheck.count_60s,
        user_agent: userAgent
      }
    });
  }

  // BƯỚC 1: Kiểm tra IP-based rate limiting TRƯỚC JWT validation để bảo vệ khỏi API attacks
  const ipLimitCheck = await AdvancedRateLimiter.checkIPRateLimit(clientIP, 'redeem-key-protected');
  
  if (!ipLimitCheck.allowed) {
    // Log suspicious activity
    await AdvancedRateLimiter.logSuspiciousActivity(
      clientIP, 
      'redeem-key-protected', 
      userAgent,
      {
        reason: ipLimitCheck.reason,
        requests_this_hour: ipLimitCheck.requests_this_hour,
        requests_last_10min: ipLimitCheck.requests_last_10min,
        user_id: 'pre-auth-blocked'
      }
    );

    return res.status(429).json({
      error: 'Quá nhiều requests từ IP này',
      message: `IP bị tạm khóa. Thử lại sau ${ipLimitCheck.remaining_minutes} phút`,
      reason: 'IP_RATE_LIMIT_EXCEEDED',
      blocked_until: ipLimitCheck.blocked_until,
      remaining_minutes: ipLimitCheck.remaining_minutes
    });
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

  const { key } = req.body;
  if (!key || key.trim().length < 5) {
    return res.status(400).json({ error: 'Key không hợp lệ' });
  }

  let client;
  try {
    client = await pool.connect();

    // Kiểm tra rate limiting cho user này
    const attemptResult = await client.query(
      `SELECT failed_count, blocked_until, last_attempt 
       FROM key_attempts 
       WHERE user_id = $1 
       ORDER BY last_attempt DESC 
       LIMIT 1`,
      [userId]
    );

    const now = new Date();

    if (attemptResult.rows.length > 0) {
      const attempt = attemptResult.rows[0];
      
      // Kiểm tra nếu user đang bị block
      if (attempt.blocked_until && new Date(attempt.blocked_until) > now) {
        const blockedUntil = new Date(attempt.blocked_until);
        const remainingMinutes = Math.ceil((blockedUntil - now) / (1000 * 60));
        
        return res.status(429).json({ 
          error: 'Bạn đã nhập sai key quá nhiều lần',
          message: `Vui lòng thử lại sau ${remainingMinutes} phút`,
          blocked_until: attempt.blocked_until,
          remaining_minutes: remainingMinutes
        });
      }
    }

    // Tìm key
    const keyResult = await client.query(
      `SELECT id, key_value, requests, expires_at, is_used, used_by, used_at 
       FROM keys 
       WHERE key_value = $1`,
      [key.trim()]
    );

    // Nếu key không tồn tại hoặc sai → Tăng failed count
    if (keyResult.rows.length === 0) {
      await handleFailedAttempt(client, userId, clientIP);
      return res.status(404).json({ error: 'Key không tồn tại' });
    }

    const keyData = keyResult.rows[0];

    if (keyData.is_used) {
      await handleFailedAttempt(client, userId, clientIP);
      return res.status(400).json({ error: 'Key đã được sử dụng' });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      await handleFailedAttempt(client, userId, clientIP);
      return res.status(400).json({ error: 'Key đã hết hạn' });
    }

    // Key hợp lệ → Reset failed attempts và thực hiện redeem
    await client.query('BEGIN');

    try {
      // Reset failed attempts
      await client.query(
        `DELETE FROM key_attempts WHERE user_id = $1`,
        [userId]
      );

      // Đánh dấu key đã được sử dụng
      await client.query(
        `UPDATE keys 
         SET is_used = true, used_by = $1, used_at = NOW() 
         WHERE id = $2`,
        [userId, keyData.id]
      );

      // Lấy thông tin user hiện tại
      const currentUserResult = await client.query(
        `SELECT username, requests, expiry_time, is_expired FROM users WHERE id = $1`,
        [userId]
      );

      if (currentUserResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentUser = currentUserResult.rows[0];

      // Logic mới: Key có thời hạn THAY THẾ hoàn toàn, key vô thời hạn CỘNG DỒN
      let newExpiryTime = currentUser.expiry_time;
      let shouldReplaceCompletely = false;
      let shouldUpdateExpiry = false;
      
      if (keyData.expires_at) {
        // Key có thời hạn → THAY THẾ hoàn toàn
        const keyExpiryDate = new Date(keyData.expires_at);
        const now = new Date();
        
        // Tính thời gian hết hạn dựa trên key
        const hoursToAdd = Math.ceil((keyExpiryDate - now) / (1000 * 60 * 60));
        
        if (hoursToAdd > 0) {
          const keyBasedExpiry = new Date();
          keyBasedExpiry.setHours(keyBasedExpiry.getHours() + hoursToAdd);
          
          newExpiryTime = keyBasedExpiry;
          shouldReplaceCompletely = true; // THAY THẾ requests hoàn toàn
          shouldUpdateExpiry = true;
        }
      }

      // Cập nhật requests và expiry time cho user
      let updateQuery, updateParams;
      
      if (shouldReplaceCompletely) {
        // Key có thời hạn: THAY THẾ hoàn toàn requests + expiry time
        updateQuery = `UPDATE users 
                       SET requests = $1, expiry_time = $2, is_expired = false, updated_at = NOW()
                       WHERE id = $3 
                       RETURNING username, requests, expiry_time`;
        updateParams = [keyData.requests, newExpiryTime, userId];
      } else {
        // Key vô thời hạn: CỘNG DỒN requests, không thay đổi expiry
        updateQuery = `UPDATE users 
                       SET requests = requests + $1, updated_at = NOW()
                       WHERE id = $2 
                       RETURNING username, requests, expiry_time`;
        updateParams = [keyData.requests, userId];
      }

      const userUpdateResult = await client.query(updateQuery, updateParams);
      
      if (userUpdateResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const updatedUser = userUpdateResult.rows[0];

      // Ghi lại transaction với thông tin chính xác
      let transactionDescription;
      let transactionAmount;
      
      if (shouldReplaceCompletely) {
        // Key có thời hạn: thay thế hoàn toàn
        const oldRequests = currentUser.requests;
        transactionAmount = keyData.requests - oldRequests; // Có thể âm nếu key mới ít hơn
        transactionDescription = `Đổi key có thời hạn: ${keyData.key_value} (Thay thế: ${oldRequests} → ${keyData.requests} requests, Thời hạn: ${newExpiryTime.toLocaleString('vi-VN')})`;
      } else {
        // Key vô thời hạn: cộng dồn
        transactionAmount = keyData.requests;
        transactionDescription = `Đổi key vô thời hạn: ${keyData.key_value} (+${keyData.requests} requests)`;
      }
      
      await client.query(
        `INSERT INTO request_transactions (user_id, requests_amount, description, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [userId, transactionAmount, transactionDescription]
      );

      await client.query('COMMIT');

      // Tạo response message chính xác
      let responseMessage;
      
      if (shouldReplaceCompletely) {
        responseMessage = `Đổi key thành công! ${keyData.requests} requests`;
        const timeRemaining = Math.ceil((newExpiryTime - new Date()) / (1000 * 60 * 60));
        responseMessage += ` | Thời hạn: ${timeRemaining}h`;
      } else {
        responseMessage = `Đổi key thành công! +${keyData.requests} requests`;
        if (currentUser.expiry_time) {
          const timeRemaining = Math.ceil((new Date(currentUser.expiry_time) - new Date()) / (1000 * 60 * 60));
          if (timeRemaining > 0) {
            responseMessage += ` | Thời hạn còn: ${timeRemaining}h`;
          }
        }
      }

      res.status(200).json({
        message: responseMessage,
        requests_change: shouldReplaceCompletely ? 
          `Thay thế: ${currentUser.requests} → ${keyData.requests}` : 
          `Cộng thêm: +${keyData.requests}`,
        current_requests: updatedUser.requests,
        key_value: keyData.key_value,
        key_type: shouldReplaceCompletely ? 'có thời hạn' : 'vô thời hạn',
        expiry_updated: shouldUpdateExpiry,
        expiry_time: updatedUser.expiry_time,
        expiry_info: shouldUpdateExpiry 
          ? `Thời hạn mới: ${newExpiryTime.toLocaleString('vi-VN')}`
          : currentUser.expiry_time 
            ? `Thời hạn hiện tại: ${new Date(currentUser.expiry_time).toLocaleString('vi-VN')}`
            : 'Key không có thời hạn'
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Redeem key error:', error);
    res.status(500).json({ 
      error: 'Lỗi khi đổi key',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};

// Helper function to handle failed attempts
async function handleFailedAttempt(client, userId, clientIP) {
  try {
    // Lấy attempt hiện tại
    const attemptResult = await client.query(
      `SELECT id, failed_count FROM key_attempts WHERE user_id = $1`,
      [userId]
    );

    const now = new Date();
    
    if (attemptResult.rows.length === 0) {
      // Tạo record mới
      await client.query(
        `INSERT INTO key_attempts (user_id, ip_address, failed_count, last_attempt) 
         VALUES ($1, $2, 1, $3)`,
        [userId, clientIP, now]
      );
    } else {
      // Cập nhật record hiện có
      const attempt = attemptResult.rows[0];
      const newFailedCount = attempt.failed_count + 1;
      
      // Nếu đã sai 3 lần → Block 5 phút
      let blockedUntil = null;
      if (newFailedCount >= 3) {
        blockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 phút
      }
      
      await client.query(
        `UPDATE key_attempts 
         SET failed_count = $1, last_attempt = $2, blocked_until = $3, ip_address = $4
         WHERE id = $5`,
        [newFailedCount, now, blockedUntil, clientIP, attempt.id]
      );
    }
  } catch (error) {
    console.error('Handle failed attempt error:', error);
  }
}