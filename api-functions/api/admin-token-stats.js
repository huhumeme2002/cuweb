const jwt = require('jsonwebtoken');
const { executeQuery } = require('../db-utils');

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

  try {
    // Get total uploaded tokens from uploaded_tokens table
    const totalTokensResult = await executeQuery(`
      SELECT COUNT(*) as total_tokens
      FROM uploaded_tokens
    `);

    // Get used tokens from token_usage_log table
    const usedTokensResult = await executeQuery(`
      SELECT COUNT(*) as used_tokens
      FROM token_usage_log
    `);

    const totalTokens = parseInt(totalTokensResult.rows[0].total_tokens) || 0;
    const usedTokens = parseInt(usedTokensResult.rows[0].used_tokens) || 0;

    res.json({
      success: true,
      data: {
        total_tokens: totalTokens,
        used_tokens: usedTokens,
        unused_tokens: totalTokens - usedTokens,
        usage_percentage: totalTokens > 0 ? Math.round((usedTokens / totalTokens) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Admin token stats error:', error);
    res.status(500).json({ 
      error: 'Lỗi máy chủ',
      details: error.message
    });
  }
};