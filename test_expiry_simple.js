// Simple test for expiry function

async function testExpirySimple() {
  console.log('🧪 Testing Simple Expiry API');
  console.log('============================');

  const API_BASE = 'https://api-functions-39s7ad6rh-khanhs-projects-3f746af3.vercel.app/api';
  
  try {
    console.log('📋 Testing extend user by 24 hours (1 day)...');
    
    // Test với user ID 30 (từ debug trước đó)
    const testResponse = await fetch(`${API_BASE}/test-expiry-simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 30,
        action: 'extend',
        hours: 24,
        reason: 'Test from script'
      })
    });

    if (testResponse.ok) {
      const testData = await testResponse.json();
      console.log('✅ Test successful');
      console.log(`   Message: ${testData.message}`);
      console.log(`   New expiry: ${testData.new_expiry}`);
    } else {
      const testError = await testResponse.json();
      console.log('❌ Test failed');
      console.log(`   Error: ${testError.error}`);
      console.log(`   Details:`, testError);
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

// Run test
testExpirySimple();