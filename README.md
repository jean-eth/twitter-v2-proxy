# Twitter v2 API Proxy (FREE)

This Fastify server mimics Twitter's v2 API endpoints but uses guest tokens to fetch data from v1.1 endpoints for FREE.

## Features

- ✅ Exact v2 API response format
- ✅ No authentication required
- ✅ No API keys needed
- ✅ No cost ($0 vs $100-42,000/month)
- ✅ Pagination support
- ✅ Error handling matching v2 format

## Installation

```bash
npm install
npm start
```

## Endpoints

### 1. Get User Followers
```bash
GET http://localhost:3000/2/users/:id/followers

# Example: Get Elon Musk's followers
curl "http://localhost:3000/2/users/44196397/followers?max_results=100"
```

### 2. Get User Following
```bash
GET http://localhost:3000/2/users/:id/following

# Example: Get who Elon follows
curl "http://localhost:3000/2/users/44196397/following?max_results=100"
```

### 3. Get List Followers
```bash
GET http://localhost:3000/2/lists/:id/followers

# Example: Get list subscribers
curl "http://localhost:3000/2/lists/84839422/followers"
```

### 4. Get User by Username
```bash
GET http://localhost:3000/2/users/by/username/:username

# Example
curl "http://localhost:3000/2/users/by/username/elonmusk"
```

### 5. Search Recent Tweets (Limited)
```bash
GET http://localhost:3000/2/tweets/search/recent

# Note: Returns trending topics instead (search blocked for guest tokens)
curl "http://localhost:3000/2/tweets/search/recent"
```

## Query Parameters

- `max_results`: Number of results (1-200, default: 100)
- `pagination_token`: Token for next page
- `user.fields`: Additional fields to include

## Example Response (v2 Format)

```json
{
  "data": [
    {
      "id": "2244994945",
      "username": "TwitterDev",
      "name": "Twitter Dev",
      "created_at": "2013-12-14T04:35:55Z",
      "protected": false,
      "description": "The voice of the X Dev team",
      "verified": true,
      "profile_image_url": "https://pbs.twimg.com/...",
      "public_metrics": {
        "followers_count": 558853,
        "following_count": 2039,
        "tweet_count": 4131,
        "listed_count": 1703
      }
    }
  ],
  "meta": {
    "result_count": 100,
    "next_token": "MTIzNDU2Nzg5MA==",
    "previous_token": "OTg3NjU0MzIx"
  },
  "includes": {
    "tweets": [...],
    "media": [...]
  }
}
```

## Pagination

Use the `next_token` from the response:

```bash
# First page
curl "http://localhost:3000/2/users/44196397/followers"

# Next page
curl "http://localhost:3000/2/users/44196397/followers?pagination_token=MTIzNDU2Nzg5MA=="
```

## Error Handling

Errors match Twitter v2 format:

```json
{
  "errors": [
    {
      "detail": "The specified list does not exist",
      "status": 404,
      "title": "Not Found",
      "type": "https://api.twitter.com/2/problems/resource-not-found"
    }
  ]
}
```

## Comparison with Official API

| Feature | Official v2 API | This Proxy |
|---------|----------------|------------|
| Authentication | OAuth required | None |
| Cost | $100-42,000/mo | FREE |
| Rate Limits | Varies by tier | 15 req/15min per token |
| Data Format | v2 JSON | v2 JSON (identical) |
| Setup Time | Days/Weeks | 1 minute |

## How It Works

1. Server gets a guest token from Twitter (no auth needed)
2. Requests data from v1.1 endpoints using guest token
3. Transforms v1.1 response to match v2 format exactly
4. Returns data in v2 structure

## Limitations

- Search endpoints don't work (returns trends instead)
- Rate limited to 15 requests/15min per token
- Some v2 fields may be missing if not in v1.1 response

## Production Use

For production, consider:
1. Implementing token rotation
2. Adding Redis cache
3. Using multiple guest tokens
4. Adding request queuing

## Legal Notice

This is for educational purposes. Using this to bypass Twitter's API pricing may violate their Terms of Service.