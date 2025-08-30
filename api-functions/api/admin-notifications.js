const { executeQuery } = require('./db-utils');
const { verifyAdmin } = require('./admin-middleware');

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

  // Verify admin access
  await new Promise((resolve, reject) => {
    verifyAdmin(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch(() => {
    return; // Error already sent by middleware
  });

  let client;
  try {
    client = await pool.connect();

    // Get recent notifications sent by admins
    const result = await client.query(`
      SELECT 
        n.id,
        n.title,
        n.message,
        n.type,
        n.target_user_id,
        n.created_at,
        u.username as admin_username
      FROM notifications n
      LEFT JOIN users u ON n.admin_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 50
    `);

    res.status(200).json({
      success: true,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Get admin notifications error:', error);
    
    // If notifications table doesn't exist, return empty array
    if (error.code === '42P01') {
      res.status(200).json({
        success: true,
        notifications: []
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to get notifications',
        details: error.message
      });
    }
  } finally {
    if (client) client.release();
  }
};