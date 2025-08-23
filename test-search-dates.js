const axios = require('axios');

// Test search with date ranges
async function testSearchWithDates() {
  const API_URL = 'http://localhost:3001'; // Adjust port if needed
  
  console.log('Testing Twitter v2 API Search with Date Ranges\n');
  console.log('='.repeat(50));
  
  // Test cases with different date ranges
  const testCases = [
    {
      name: 'Search last 7 days',
      params: {
        query: 'javascript',
        start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        max_results: 5
      }
    },
    {
      name: 'Search last 30 days',
      params: {
        query: 'AI',
        start_time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        max_results: 5
      }
    },
    {
      name: 'Search specific date range (1 year ago)',
      params: {
        query: 'technology',
        start_time: '2023-01-01T00:00:00Z',
        end_time: '2023-12-31T23:59:59Z',
        max_results: 5
      }
    },
    {
      name: 'Search without date filters',
      params: {
        query: 'news',
        max_results: 5
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\nTest: ${testCase.name}`);
    console.log('-'.repeat(40));
    
    try {
      const response = await axios.get(`${API_URL}/2/tweets/search/recent`, {
        params: testCase.params,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const data = response.data;
      
      if (data.data && data.data.length > 0) {
        console.log(`✓ Found ${data.data.length} tweets`);
        
        // Show date range of results
        const dates = data.data.map(t => new Date(t.created_at));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        console.log(`  Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
        
        // Show sample tweet
        const firstTweet = data.data[0];
        console.log(`  Sample tweet:`);
        console.log(`    ID: ${firstTweet.id}`);
        console.log(`    Date: ${firstTweet.created_at}`);
        console.log(`    Text: ${firstTweet.text.substring(0, 100)}...`);
      } else {
        console.log('✗ No tweets found');
      }
      
      // Check if the search query was modified correctly
      if (testCase.params.start_time || testCase.params.end_time) {
        console.log('  Date filters applied:');
        if (testCase.params.start_time) {
          console.log(`    Start: ${new Date(testCase.params.start_time).toISOString().split('T')[0]}`);
        }
        if (testCase.params.end_time) {
          console.log(`    End: ${new Date(testCase.params.end_time).toISOString().split('T')[0]}`);
        }
      }
      
    } catch (error) {
      console.log(`✗ Error: ${error.message}`);
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        if (error.response.data && error.response.data.errors) {
          console.log(`  Details: ${JSON.stringify(error.response.data.errors)}`);
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Test completed!');
  console.log('\nNote: The actual date range of results depends on:');
  console.log('- Nitter instance capabilities');
  console.log('- Twitter search API limitations');
  console.log('- Available tweets matching the query');
}

// Run the test
testSearchWithDates().catch(console.error);