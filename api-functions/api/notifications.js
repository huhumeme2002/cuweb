const { executeQuery } = require('./db-utils');
const jwt = require('jsonwebtoken');

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

  try {
    // Get user notifications with retry logic
    const result = await executeQuery(`
      SELECT 
        id,
        title,
        message,
        type,
        is_read,
        created_at
      FROM notifications 
      WHERE (target_user_id = $1 OR target_user_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.status(200).json({
      success: true,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    
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
  }
};