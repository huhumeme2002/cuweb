const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

  let client;
  
  try {
    client = await pool.connect();
    
    const debug = {
      timestamp: new Date().toISOString(),
      checks: {}
    };
    
    // 1. Check users table structure
    try {
      const tableInfo = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY ordinal_position
      `);
      debug.checks.table_structure = tableInfo.rows;
    } catch (error) {
      debug.checks.table_structure = { error: error.message };
    }
    
    // 2. Check recent users
    try {
      const users = await client.query(`
        SELECT id, username, requests, email, created_at, updated_at 
        FROM users 
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 5
      `);
      debug.checks.recent_users = users.rows;
    } catch (error) {
      debug.checks.recent_users = { error: error.message };
    }
    
    // 3. Check request transactions
    try {
      const transactions = await client.query(`
        SELECT rt.id, rt.user_id, u.username, rt.requests_amount, rt.description, rt.created_at
        FROM request_transactions rt
        JOIN users u ON rt.user_id = u.id
        ORDER BY rt.created_at DESC
        LIMIT 10
      `);
      debug.checks.recent_transactions = transactions.rows;
    } catch (error) {
      debug.checks.recent_transactions = { error: error.message };
    }
    
    // 4. Check discrepancies
    try {
      const discrepancies = await client.query(`
        SELECT 
            u.id,
            u.username,
            u.requests as current_requests,
            COALESCE(SUM(rt.requests_amount), 0) as total_transactions,
            u.requests - COALESCE(SUM(rt.requests_amount), 0) as difference
        FROM users u
        LEFT JOIN request_transactions rt ON u.id = rt.user_id
        GROUP BY u.id, u.username, u.requests
        HAVING u.requests != COALESCE(SUM(rt.requests_amount), 0)
        ORDER BY difference DESC
        LIMIT 10
      `);
      debug.checks.discrepancies = discrepancies.rows;
    } catch (error) {
      debug.checks.discrepancies = { error: error.message };
    }
    
    // 5. Check triggers
    try {
      const triggers = await client.query(`
        SELECT trigger_name, event_manipulation, action_timing, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'users'
      `);
      debug.checks.triggers = triggers.rows;
    } catch (error) {
      debug.checks.triggers = { error: error.message };
    }
    
    // 6. Check admin activities (if exists)
    try {
      const adminLogs = await client.query(`
        SELECT * FROM admin_activities 
        WHERE activity_type = 'adjust_requests'
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      debug.checks.admin_activities = adminLogs.rows;
    } catch (error) {
      debug.checks.admin_activities = { error: 'Table does not exist or ' + error.message };
    }
    
    // 7. Test a simple update (on a test user if exists)
    try {
      // Find a test user or the first user
      const testUserQuery = await client.query(`
        SELECT id, username, requests FROM users 
        WHERE username ILIKE '%test%' OR username ILIKE '%admin%'
        LIMIT 1
      `);
      
      if (testUserQuery.rows.length > 0) {
        const testUser = testUserQuery.rows[0];
        const originalRequests = testUser.requests;
        
        // Test update
        await client.query(
          'UPDATE users SET requests = requests + 1, updated_at = NOW() WHERE id = $1',
          [testUser.id]
        );
        
        // Check if update worked
        const updatedUser = await client.query(
          'SELECT requests, updated_at FROM users WHERE id = $1',
          [testUser.id]
        );
        
        // Rollback
        await client.query(
          'UPDATE users SET requests = $1 WHERE id = $2',
          [originalRequests, testUser.id]
        );
        
        debug.checks.update_test = {
          user: testUser.username,
          original_requests: originalRequests,
          after_update: updatedUser.rows[0].requests,
          test_successful: updatedUser.rows[0].requests === (originalRequests + 1),
          updated_at: updatedUser.rows[0].updated_at
        };
      } else {
        debug.checks.update_test = { error: 'No test user found' };
      }
    } catch (error) {
      debug.checks.update_test = { error: error.message };
    }

    res.status(200).json({
      success: true,
      message: 'Database debug completed',
      debug: debug
    });

  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ 
      error: 'Database debug failed',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
};