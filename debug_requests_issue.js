const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function debugRequestsIssue() {
  let client;
  
  try {
    client = await pool.connect();
    
    console.log('🔍 DEBUGGING REQUESTS ISSUE');
    console.log('='.repeat(50));
    
    // 1. Check users table structure
    console.log('\n📋 1. USERS TABLE STRUCTURE:');
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    console.table(tableInfo.rows);
    
    // 2. Check a few sample users
    console.log('\n👥 2. SAMPLE USERS DATA:');
    const users = await client.query(`
      SELECT id, username, requests, created_at, updated_at 
      FROM users 
      ORDER BY updated_at DESC 
      LIMIT 5
    `);
    console.table(users.rows);
    
    // 3. Check request_transactions table
    console.log('\n💰 3. RECENT REQUEST TRANSACTIONS:');
    const transactions = await client.query(`
      SELECT rt.*, u.username 
      FROM request_transactions rt
      JOIN users u ON rt.user_id = u.id
      ORDER BY rt.created_at DESC 
      LIMIT 10
    `);
    console.table(transactions.rows);
    
    // 4. Check if there are any triggers on users table
    console.log('\n🔧 4. TRIGGERS ON USERS TABLE:');
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'users'
    `);
    console.table(triggers.rows);
    
    // 5. Test a sample update
    console.log('\n🧪 5. TEST UPDATE ON A USER:');
    const testUser = users.rows[0];
    if (testUser) {
      console.log(`Testing update on user: ${testUser.username} (ID: ${testUser.id})`);
      console.log(`Current requests: ${testUser.requests}`);
      
      // Update requests
      const newRequests = testUser.requests + 100;
      await client.query(
        'UPDATE users SET requests = $1, updated_at = NOW() WHERE id = $2',
        [newRequests, testUser.id]
      );
      
      // Check if update worked
      const updatedUser = await client.query(
        'SELECT requests, updated_at FROM users WHERE id = $1',
        [testUser.id]
      );
      
      console.log(`New requests: ${updatedUser.rows[0].requests}`);
      console.log(`Updated at: ${updatedUser.rows[0].updated_at}`);
      
      // Rollback the test change
      await client.query(
        'UPDATE users SET requests = $1 WHERE id = $2',
        [testUser.requests, testUser.id]
      );
      console.log('✅ Test update rolled back');
    }
    
    // 6. Check admin_manage_users API logs
    console.log('\n📊 6. CHECKING FOR RECENT ADMIN ACTIVITIES:');
    try {
      const adminLogs = await client.query(`
        SELECT * FROM admin_activities 
        WHERE activity_type = 'adjust_requests'
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      if (adminLogs.rows.length > 0) {
        console.table(adminLogs.rows);
      } else {
        console.log('No admin activities found (table might not exist)');
      }
    } catch (error) {
      console.log('Admin activities table does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) client.release();
  }
}

// Run the debug
debugRequestsIssue();