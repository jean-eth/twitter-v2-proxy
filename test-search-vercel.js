const axios = require('axios');

// Test search with date ranges on Vercel deployment
async function testSearchWithDates() {
  // Using the Vercel deployment URL
  const API_URL = 'https://twitter-v2-proxy.vercel.app/api';
  
  console.log('Testing Twitter v2 API Search with Extended Date Ranges\n');
  console.log('='.repeat(60));
  
  // Test cases with different date ranges
  const testCases = [
    {
      name: 'Search without date filters (baseline)',
      params: {
        query: 'from:elonmusk',
        max_results: 3
      }
    },
    {
      name: 'Search last 7 days',
      params: {
        query: 'from:elonmusk',
        start_time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        max_results: 3
      }
    },
    {
      name: 'Search last 30 days',
      params: {
        query: 'from:elonmusk',
        start_time: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        max_results: 3
      }
    },
    {
      name: 'Search specific month (October 2024)',
      params: {
        query: 'from:elonmusk',
        start_time: '2024-10-01T00:00:00Z',
        end_time: '2024-10-31T23:59:59Z',
        max_results: 3
      }
    },
    {
      name: 'Search older content (6 months ago)',
      params: {
        query: 'from:elonmusk SpaceX',
        start_time: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
        max_results: 3
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('-'.repeat(60));
    
    // Build the URL with path
    const url = `${API_URL}/2/tweets/search/recent`;
    
    console.log(`Query: "${testCase.params.query}"`);
    if (testCase.params.start_time) {
      console.log(`Start: ${new Date(testCase.params.start_time).toISOString().split('T')[0]}`);
    }
    if (testCase.params.end_time) {
      console.log(`End: ${new Date(testCase.params.end_time).toISOString().split('T')[0]}`);
    }
    
    try {
      const response = await axios.get(url, {
        params: testCase.params,
        headers: {
          'Accept': 'application/json'
        },
        timeout: 15000
      });
      
      const data = response.data;
      
      if (data.data && data.data.length > 0) {
        console.log(`\n✅ Found ${data.data.length} tweets`);
        
        // Show date range of results
        const dates = data.data.map(t => new Date(t.created_at));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        console.log(`📅 Result date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
        
        // Show tweets with dates
        data.data.forEach((tweet, i) => {
          const tweetDate = new Date(tweet.created_at);
          console.log(`\nTweet ${i + 1}:`);
          console.log(`  Date: ${tweetDate.toISOString()}`);
          console.log(`  Text: ${tweet.text.substring(0, 80)}${tweet.text.length > 80 ? '...' : ''}`);
        });
      } else {
        console.log('\n⚠️  No tweets found');
      }
      
    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`  Status: ${error.response.status}`);
        if (error.response.data) {
          if (error.response.data.errors) {
            console.log(`  Details: ${JSON.stringify(error.response.data.errors, null, 2)}`);
          } else if (error.response.data.error) {
            console.log(`  Details: ${error.response.data.error}`);
          }
        }
      }
    }
    
    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed!');
  console.log('\n📝 Summary:');
  console.log('The search endpoint now supports extended date ranges using:');
  console.log('- start_time: ISO 8601 timestamp for the beginning of the search window');
  console.log('- end_time: ISO 8601 timestamp for the end of the search window');
  console.log('\nThese parameters are converted to Twitter search operators:');
  console.log('- since:YYYY-MM-DD');
  console.log('- until:YYYY-MM-DD');
  console.log('\n⚠️  Note: Actual results depend on Nitter instance capabilities');
}

// Run the test
testSearchWithDates().catch(console.error);