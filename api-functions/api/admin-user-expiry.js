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

  let adminId, adminRole, adminUsername;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'unified-aivannang-secret-2024');
    adminId = decoded.userId;
    adminRole = decoded.role;
    adminUsername = decoded.username;
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
      // Get users with expiry information
      const { search, status } = req.query;
      
      let whereClause = '';
      let queryParams = [];
      let paramCount = 0;

      if (search) {
        paramCount++;
        whereClause += ` WHERE (username ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
        queryParams.push(`%${search}%`);
      }

      if (status) {
        const connector = whereClause ? ' AND ' : ' WHERE ';
        if (status === 'expired') {
          whereClause += connector + `(expiry_time < NOW() OR is_expired = true)`;
        } else if (status === 'active') {
          whereClause += connector + `(expiry_time IS NULL OR (expiry_time > NOW() AND is_expired = false))`;
        } else if (status === 'expiring') {
          whereClause += connector + `(expiry_time > NOW() AND expiry_time < NOW() + INTERVAL '24 hours' AND is_expired = false)`;
        }
      }

      const result = await client.query(`
        SELECT 
          id,
          username,
          email,
          requests,
          expiry_time,
          is_expired,
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
        ${whereClause}
        ORDER BY 
          CASE 
            WHEN expiry_time IS NULL THEN 3
            WHEN expiry_time < NOW() OR is_expired = true THEN 1
            ELSE 2
          END,
          expiry_time ASC NULLS LAST
        LIMIT 50
      `, queryParams);

      res.json({
        users: result.rows,
        total: result.rows.length
      });

    } else if (req.method === 'POST' || req.method === 'PUT') {
      // Update user expiry time
      const { userId, action, hours, reason } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID bắt buộc' });
      }

      // Kiểm tra user có tồn tại không
      const userCheck = await client.query('SELECT username, expiry_time FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy user' });
      }

      const targetUser = userCheck.rows[0];
      let newExpiryTime = null;
      let actionDescription = '';

      switch (action) {
        case 'extend':
          if (!hours || hours <= 0) {
            return res.status(400).json({ error: 'Số giờ gia hạn phải lớn hơn 0' });
          }
          
          if (targetUser.expiry_time) {
            const currentExpiry = new Date(targetUser.expiry_time);
            const now = new Date();
            // Nếu đã hết hạn, tính từ bây giờ. Nếu chưa, cộng thêm vào thời gian hiện có
            newExpiryTime = currentExpiry > now ? currentExpiry : now;
          } else {
            newExpiryTime = new Date();
          }
          newExpiryTime.setHours(newExpiryTime.getHours() + parseInt(hours));
          actionDescription = `Gia hạn thêm ${hours} giờ`;
          break;

        case 'decrease':
          if (!hours || hours <= 0) {
            return res.status(400).json({ error: 'Số giờ giảm phải lớn hơn 0' });
          }
          
          if (!targetUser.expiry_time) {
            return res.status(400).json({ error: 'User không có thời hạn để giảm' });
          }
          
          const currentExpiry = new Date(targetUser.expiry_time);
          const now = new Date();
          
          // Chỉ cho phép giảm nếu chưa hết hạn
          if (currentExpiry <= now) {
            return res.status(400).json({ error: 'Không thể giảm thời hạn đã hết' });
          }
          
          newExpiryTime = new Date(currentExpiry);
          newExpiryTime.setHours(newExpiryTime.getHours() - parseInt(hours));
          
          // Nếu sau khi giảm mà nhỏ hơn hiện tại, set về hết hạn ngay
          if (newExpiryTime <= now) {
            newExpiryTime = new Date(); // Hết hạn ngay
            actionDescription = `Giảm ${hours} giờ - hết hạn ngay`;
          } else {
            actionDescription = `Giảm ${hours} giờ`;
          }
          break;

        case 'set':
          if (!hours || hours <= 0) {
            return res.status(400).json({ error: 'Số giờ đặt mới phải lớn hơn 0' });
          }
          newExpiryTime = new Date();
          newExpiryTime.setHours(newExpiryTime.getHours() + parseInt(hours));
          actionDescription = `Đặt thời hạn mới: ${hours} giờ`;
          break;

        case 'remove':
          newExpiryTime = null;
          actionDescription = 'Loại bỏ thời hạn (vĩnh viễn)';
          break;

        case 'expire':
          newExpiryTime = new Date(); // Set to current time = expired
          actionDescription = 'Hết hạn ngay lập tức';
          break;

        default:
          return res.status(400).json({ error: 'Action không hợp lệ: extend, decrease, set, remove, expire' });
      }

      // Cập nhật database
      const updateResult = await client.query(`
        UPDATE users 
        SET expiry_time = $1, is_expired = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING username, expiry_time, is_expired
      `, [
        newExpiryTime, 
        action === 'expire' || (newExpiryTime && newExpiryTime <= new Date()),
        userId
      ]);

      const updatedUser = updateResult.rows[0];

      // Ghi log hành động
      await client.query(`
        INSERT INTO request_transactions (user_id, requests_amount, description, created_at)
        VALUES ($1, $2, $3, NOW())
      `, [
        userId, 
        0, 
        `[ADMIN] ${adminUsername}: ${actionDescription}${reason ? ` - Lý do: ${reason}` : ''}`
      ]);

      let responseMessage = `${actionDescription} cho user ${updatedUser.username}`;
      if (newExpiryTime && action !== 'expire') {
        responseMessage += ` (Hết hạn: ${newExpiryTime.toLocaleString('vi-VN')})`;
      }

      res.json({
        message: responseMessage,
        user: {
          id: userId,
          username: updatedUser.username,
          expiry_time: updatedUser.expiry_time,
          is_expired: updatedUser.is_expired
        },
        action_by: adminUsername,
        action_at: new Date().toISOString(),
        reason: reason || null
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Admin user expiry error:', error);
    res.status(500).json({ 
      error: 'Lỗi máy chủ',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};