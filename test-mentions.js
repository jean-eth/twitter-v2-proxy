const axios = require('axios');

// Test the mentions endpoint with the new search implementation
async function testMentions() {
  const API_URL = 'http://localhost:3000'; // Adjust if your API runs on a different port
  
  try {
    console.log('Testing mentions endpoint with Nitter search...\n');
    
    // Test with a known user ID (example: Twitter's official account)
    const userId = '783214'; // Twitter's user ID
    
    console.log(`Fetching mentions for user ID: ${userId}`);
    
    const response = await axios.get(`${API_URL}/2/users/${userId}/mentions`, {
      params: {
        max_results: 5,
        'tweet.fields': 'created_at,public_metrics,entities'
      }
    });
    
    console.log('\nResponse received:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.data && response.data.data.length > 0) {
      console.log(`\n✅ Successfully fetched ${response.data.data.length} mentions`);
      console.log('First mention:');
      console.log(`- ID: ${response.data.data[0].id}`);
      console.log(`- Text: ${response.data.data[0].text.substring(0, 100)}...`);
      console.log(`- Author: ${response.data.data[0].author_id}`);
    } else {
      console.log('\n⚠️ No mentions found (this could be normal if there are no recent mentions)');
    }
    
  } catch (error) {
    console.error('\n❌ Error testing mentions:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\nUser not found. Try with a different user ID.');
    } else if (error.response?.status === 500) {
      console.log('\nServer error. Check if the API server is running and Nitter API is accessible.');
    }
  }
}

// Test with pagination
async function testMentionsWithPagination() {
  const API_URL = 'http://localhost:3000';
  
  try {
    console.log('\n\nTesting mentions with pagination...\n');
    
    const userId = '44196397'; // Elon Musk's user ID (lots of mentions)
    
    // First request
    console.log(`Fetching first page of mentions for user ID: ${userId}`);
    const firstResponse = await axios.get(`${API_URL}/2/users/${userId}/mentions`, {
      params: {
        max_results: 3
      }
    });
    
    console.log(`First page: ${firstResponse.data.data.length} tweets`);
    
    if (firstResponse.data.meta.next_token) {
      console.log('Next token available, fetching second page...');
      
      // Second request with pagination token
      const secondResponse = await axios.get(`${API_URL}/2/users/${userId}/mentions`, {
        params: {
          max_results: 3,
          pagination_token: firstResponse.data.meta.next_token
        }
      });
      
      console.log(`Second page: ${secondResponse.data.data.length} tweets`);
      console.log('\n✅ Pagination working correctly');
    } else {
      console.log('No pagination token available');
    }
    
  } catch (error) {
    console.error('\n❌ Error testing pagination:', error.response?.data || error.message);
  }
}

// Run tests
async function runTests() {
  console.log('='.repeat(60));
  console.log('MENTIONS ENDPOINT TEST - Using Nitter Search');
  console.log('='.repeat(60));
  
  await testMentions();
  await testMentionsWithPagination();
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests completed');
  console.log('='.repeat(60));
}

runTests();