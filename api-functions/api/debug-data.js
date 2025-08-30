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

  try {
    // Check all tables for data
    const tables = [
      'users',
      'uploaded_tokens',
      'token_usage_log',
      'request_transactions'
    ];

    const results = {};

    for (const table of tables) {
      try {
        const countResult = await executeQuery(`SELECT COUNT(*) as count FROM ${table}`);
        const sampleResult = await executeQuery(`SELECT * FROM ${table} LIMIT 3`);
        
        results[table] = {
          count: parseInt(countResult.rows[0].count),
          sample: sampleResult.rows
        };
      } catch (error) {
        results[table] = {
          error: error.message
        };
      }
    }

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug data error:', error);
    res.status(500).json({ 
      error: 'Debug failed',
      details: error.message
    });
  }
};