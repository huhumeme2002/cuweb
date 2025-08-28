const { Client } = require('./api-functions/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_67BPVAIWZEDg@ep-wispy-fog-adt9noug-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function debugKeyStructure() {
  try {
    await client.connect();
    console.log('🔍 Debugging Key Structure and Logic');
    console.log('=====================================');

    // 1. Kiểm tra cấu trúc bảng keys
    console.log('📋 1. Cấu trúc bảng keys:');
    const keysStructure = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'keys' 
      ORDER BY ordinal_position
    `);
    
    keysStructure.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });

    // 2. Xem một vài key mẫu
    console.log('\n🔑 2. Một vài key mẫu:');
    const sampleKeys = await client.query(`
      SELECT key_value, requests, expires_at, is_used 
      FROM keys 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    sampleKeys.rows.forEach(key => {
      console.log(`   Key: ${key.key_value}`);
      console.log(`   Requests: ${key.requests}`);
      console.log(`   Expires at: ${key.expires_at || 'NULL (vô thời hạn)'}`);
      console.log(`   Is used: ${key.is_used}`);
      console.log(`   ---`);
    });

    // 3. Kiểm tra user hiện tại có requests = 400
    console.log('\n👤 3. User có 400 requests:');
    const user400 = await client.query(`
      SELECT id, username, requests, expiry_time 
      FROM users 
      WHERE requests = 400 
      LIMIT 3
    `);
    
    if (user400.rows.length > 0) {
      user400.rows.forEach(user => {
        console.log(`   User: ${user.username} (ID: ${user.id})`);
        console.log(`   Requests: ${user.requests}`);
        console.log(`   Expiry: ${user.expiry_time || 'NULL (không thời hạn)'}`);
        console.log(`   ---`);
      });
    } else {
      console.log('   Không tìm thấy user nào có 400 requests');
    }

    // 4. Kiểm tra key có 100 requests và expires_at
    console.log('\n🔍 4. Key có 100 requests:');
    const keys100 = await client.query(`
      SELECT key_value, requests, expires_at, is_used
      FROM keys 
      WHERE requests = 100
      ORDER BY id DESC
      LIMIT 3
    `);
    
    if (keys100.rows.length > 0) {
      keys100.rows.forEach(key => {
        console.log(`   Key: ${key.key_value}`);
        console.log(`   Requests: ${key.requests}`);
        console.log(`   Expires at: ${key.expires_at || 'NULL (vô thời hạn)'}`);
        console.log(`   Is used: ${key.is_used}`);
        console.log(`   ---`);
      });
    } else {
      console.log('   Không tìm thấy key nào có 100 requests');
    }

    console.log('\n💡 Phân tích:');
    console.log('- Nếu key có expires_at = NULL → key vô thời hạn → cộng dồn');
    console.log('- Nếu key có expires_at ≠ NULL → key có thời hạn → thay thế');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

debugKeyStructure();