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

  // Verify JWT token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let userId, userRole;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unified-aivannang-secret-2024');
    userId = decoded.userId;
    userRole = decoded.role;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check if user is admin
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  let client;
  try {
    client = await pool.connect();

    if (req.method === 'GET') {
      // Get blocked users from key attempts
      const keyAttempts = await client.query(`
        SELECT 
          ka.user_id,
          u.username,
          u.email,
          ka.failed_count,
          ka.blocked_until,
          ka.last_attempt,
          ka.ip_address,
          'key_attempts' as block_type,
          CASE 
            WHEN ka.blocked_until > NOW() THEN true 
            ELSE false 
          END as is_currently_blocked,
          EXTRACT(EPOCH FROM (ka.blocked_until - NOW()))/60 as remaining_minutes
        FROM key_attempts ka
        JOIN users u ON ka.user_id = u.id
        WHERE ka.failed_count >= 3 OR ka.blocked_until IS NOT NULL
        ORDER BY ka.last_attempt DESC
      `);

      // Get blocked IPs from rate limiting  
      const ipBlocks = await client.query(`
        SELECT 
          NULL as user_id,
          'Unknown User' as username,
          NULL as email,
          ipl.request_count as failed_count,
          ipl.blocked_until,
          ipl.last_request as last_attempt,
          ipl.ip_address,
          'ip_rate_limit' as block_type,
          CASE 
            WHEN ipl.blocked_until > NOW() THEN true 
            ELSE false 
          END as is_currently_blocked,
          EXTRACT(EPOCH FROM (ipl.blocked_until - NOW()))/60 as remaining_minutes
        FROM ip_rate_limits ipl
        WHERE ipl.blocked_until IS NOT NULL AND ipl.blocked_until > NOW()
        ORDER BY ipl.last_request DESC
      `);

      // Combine results
      const allBlocked = [...keyAttempts.rows, ...ipBlocks.rows];
      
      res.json({
        blockedUsers: keyAttempts.rows,
        blockedIPs: ipBlocks.rows,
        allBlocked: allBlocked
      });

    } else if (req.method === 'POST') {
      // Unblock user or IP
      const { targetUserId, action, targetIP } = req.body;
      
      if (!targetUserId && !targetIP) {
        return res.status(400).json({ error: 'User ID hoặc IP address bắt buộc' });
      }

      // Handle IP unblocking
      if (targetIP) {
        if (action === 'unblock') {
          // Unblock IP from rate limiting
          const deleteResult = await client.query(
            'DELETE FROM ip_rate_limits WHERE ip_address = $1',
            [targetIP]
          );

          res.json({
            message: `Đã gỡ khóa IP ${targetIP} thành công`,
            targetIP: targetIP,
            recordsDeleted: deleteResult.rowCount,
            unblocked_by: userId,
            unblocked_at: new Date().toISOString()
          });
          return;
        } else if (action === 'reset') {
          // Reset IP rate limiting
          const updateResult = await client.query(`
            UPDATE ip_rate_limits 
            SET blocked_until = NULL, is_suspicious = false
            WHERE ip_address = $1
          `, [targetIP]);

          res.json({
            message: `Đã reset khóa IP ${targetIP}`,
            targetIP: targetIP,
            recordsUpdated: updateResult.rowCount,
            reset_by: userId,
            reset_at: new Date().toISOString()
          });
          return;
        }
      }

      // Handle user unblocking
      if (!targetUserId) {
        return res.status(400).json({ error: 'User ID bắt buộc cho user operations' });
      }

      // Kiểm tra user có tồn tại không
      const userCheck = await client.query('SELECT username FROM users WHERE id = $1', [targetUserId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy user' });
      }

      const targetUsername = userCheck.rows[0].username;

      if (action === 'unblock') {
        // Xóa hoàn toàn record key_attempts
        const deleteResult = await client.query(
          'DELETE FROM key_attempts WHERE user_id = $1',
          [targetUserId]
        );

        res.json({
          message: `Đã gỡ khóa thành công cho user ${targetUsername}`,
          userId: targetUserId,
          username: targetUsername,
          recordsDeleted: deleteResult.rowCount,
          unblocked_by: userId,
          unblocked_at: new Date().toISOString()
        });

      } else if (action === 'reset') {
        // Reset soft - chỉ reset failed_count và blocked_until
        const updateResult = await client.query(`
          UPDATE key_attempts 
          SET failed_count = 0, blocked_until = NULL, last_attempt = NOW()
          WHERE user_id = $1
        `, [targetUserId]);

        if (updateResult.rowCount === 0) {
          return res.json({
            message: `User ${targetUsername} không có lịch sử nhập sai key`,
            userId: targetUserId,
            username: targetUsername
          });
        }

        res.json({
          message: `Đã reset attempts cho user ${targetUsername}`,
          userId: targetUserId,
          username: targetUsername,
          recordsUpdated: updateResult.rowCount,
          reset_by: userId,
          reset_at: new Date().toISOString()
        });

      } else {
        return res.status(400).json({ error: 'Action không hợp lệ. Chỉ chấp nhận: unblock, reset' });
      }

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Admin blocked users error:', error);
    res.status(500).json({ 
      error: 'Lỗi máy chủ',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};