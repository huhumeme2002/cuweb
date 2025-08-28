// Test script for expiry management API

async function testExpiryAPI() {
  console.log('🧪 Testing Admin User Expiry API');
  console.log('==================================');

  const API_BASE = 'https://api-functions-bp68xi5x3-khanhs-projects-3f746af3.vercel.app/api';
  
  // You need to replace with real admin JWT token
  const adminToken = 'YOUR_ADMIN_JWT_TOKEN_HERE';
  
  if (adminToken === 'YOUR_ADMIN_JWT_TOKEN_HERE') {
    console.log('❌ Vui lòng thay adminToken bằng JWT token thực của admin');
    console.log('💡 Để lấy token:');
    console.log('   1. Login admin trên https://aivannang.vn');
    console.log('   2. F12 > Application > Local Storage > token');
    return;
  }

  try {
    console.log('📋 1. Testing GET users for expiry management...');
    
    // Test GET users
    const getUsersResponse = await fetch(`${API_BASE}/admin-user-expiry`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    if (getUsersResponse.ok) {
      const userData = await getUsersResponse.json();
      console.log('✅ GET users successful');
      console.log(`   Found ${userData.users.length} users`);
      
      if (userData.users.length > 0) {
        const testUser = userData.users[0];
        console.log(`   Test user: ${testUser.username} (ID: ${testUser.id})`);
        console.log(`   Current expiry: ${testUser.expiry_time || 'No expiry'}`);
        
        console.log('\n🔧 2. Testing extend user expiry by 1 day...');
        
        // Test extend expiry
        const extendResponse = await fetch(`${API_BASE}/admin-user-expiry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            userId: testUser.id,
            action: 'extend',
            hours: 24,
            reason: 'Test from API script'
          })
        });

        if (extendResponse.ok) {
          const extendData = await extendResponse.json();
          console.log('✅ Extend expiry successful');
          console.log(`   Message: ${extendData.message}`);
        } else {
          const extendError = await extendResponse.json();
          console.log('❌ Extend expiry failed');
          console.log(`   Error: ${extendError.error}`);
        }
      } else {
        console.log('ℹ️ No users found to test with');
      }
    } else {
      const getUsersError = await getUsersResponse.json();
      console.log('❌ GET users failed');
      console.log(`   Error: ${getUsersError.error}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testExpiryAPI();