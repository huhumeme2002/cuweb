const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ip, secret } = req.body;
  
  // Emergency secret để bypass authentication
  if (secret !== 'emergency-unblock-222.252.27.95-2025') {
    return res.status(401).json({ error: 'Invalid emergency secret' });
  }

  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  let client;
  try {
    client = await pool.connect();

    // 1. Check current IP blocking status
    const currentStatus = await client.query(
      'SELECT * FROM ip_rate_limits WHERE ip_address = $1',
      [ip]
    );

    // 2. Unblock IP completely
    const deleteResult = await client.query(
      'DELETE FROM ip_rate_limits WHERE ip_address = $1',
      [ip]
    );

    // 3. Also clear any frequency tracking
    await client.query(
      'DELETE FROM frequency_tracking WHERE ip_address = $1',
      [ip]
    );

    res.json({
      success: true,
      message: `IP ${ip} đã được unblock hoàn toàn`,
      ip: ip,
      previousStatus: currentStatus.rows.length > 0 ? currentStatus.rows[0] : null,
      recordsDeleted: deleteResult.rowCount,
      unblocked_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Emergency unblock error:', error);
    res.status(500).json({ 
      error: 'Lỗi khi unblock IP',
      details: error.message 
    });
  } finally {
    if (client) client.release();
  }
};