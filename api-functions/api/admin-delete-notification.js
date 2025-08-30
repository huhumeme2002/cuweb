const { executeQuery } = require('./db-utils');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Check if user is admin (with retry)
    const userResult = await executeQuery('SELECT role FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { notificationId } = req.body;
    
    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    // Delete notification (with retry)
    const deleteResult = await executeQuery(
      'DELETE FROM notifications WHERE id = $1 RETURNING id', 
      [notificationId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ 
      success: true, 
      message: 'Xóa thông báo thành công!',
      deletedId: notificationId
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.status(500).json({ error: 'Server error' });
  } catch (error) {
    console.error('Delete notification error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.status(500).json({ error: 'Server error' });
  }
};