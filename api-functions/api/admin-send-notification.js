const { executeQuery, getClient } = require('./db-utils');
const { verifyAdmin } = require('./admin-middleware');

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

  // Verify admin access
  await new Promise((resolve, reject) => {
    verifyAdmin(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch(() => {
    return; // Error already sent by middleware
  });

  const { title, message, type = 'info', target = 'all', target_user_id } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }

  let client;
  try {
    client = await getClient();

    // Create notifications table if it doesn't exist (with retry)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        target_user_id INTEGER REFERENCES users(id),
        admin_id INTEGER REFERENCES users(id),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index for better performance (with retry)
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_notifications_target_user_created 
      ON notifications(target_user_id, created_at DESC);
    `);

    let recipients = [];
    
    if (target === 'all') {
      // Get all user IDs
      const usersResult = await client.query('SELECT id FROM users WHERE role != $1', ['admin']);
      recipients = usersResult.rows.map(row => row.id);
      
      // Also create one notification for all users (target_user_id = NULL)
      await client.query(`
        INSERT INTO notifications (title, message, type, target_user_id, admin_id, created_at)
        VALUES ($1, $2, $3, NULL, $4, NOW())
      `, [title, message, type, req.user.id]);
      
    } else if (target === 'specific_user' && target_user_id) {
      // Verify user exists
      const userResult = await client.query('SELECT id FROM users WHERE id = $1', [target_user_id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      recipients = [parseInt(target_user_id)];
      
      // Create notification for specific user
      await client.query(`
        INSERT INTO notifications (title, message, type, target_user_id, admin_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [title, message, type, target_user_id, req.user.id]);
    }

    const recipientCount = target === 'all' ? recipients.length : 1;
    
    res.status(200).json({
      success: true,
      message: `Đã gửi thông báo tới ${recipientCount} người dùng`,
      recipients_count: recipientCount
    });

  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};