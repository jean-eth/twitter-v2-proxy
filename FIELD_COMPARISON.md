# Twitter v2 API Field Comparison

## Official Twitter v2 API Tweet Response (Full Fields)

```json
{
  "data": {
    "id": "1212092628029698048",
    "text": "We believe the best future version of our API will come from building it with YOU. Here's to another great year 🥂",
    "created_at": "2019-12-31T19:26:16.000Z",
    "author_id": "2244994945",
    "edit_history_tweet_ids": ["1212092628029698048"],
    "conversation_id": "1212092628029698048",
    "reply_settings": "everyone",
    "lang": "en",
    "source": "Twitter Web App",
    "possibly_sensitive": false,
    "public_metrics": {
      "retweet_count": 8,
      "reply_count": 2,
      "like_count": 40,
      "quote_count": 1,
      "impression_count": 3264,
      "bookmark_count": 5
    },
    "organic_metrics": {
      "impression_count": 3100,
      "like_count": 35,
      "reply_count": 2,
      "retweet_count": 7
    },
    "non_public_metrics": {
      "impression_count": 3264,
      "url_link_clicks": 18,
      "user_profile_clicks": 32
    },
    "promoted_metrics": {
      "impression_count": 164,
      "like_count": 5,
      "reply_count": 0,
      "retweet_count": 1
    },
    "entities": {
      "hashtags": [
        {
          "start": 0,
          "end": 7,
          "tag": "future"
        }
      ],
      "mentions": [
        {
          "start": 32,
          "end": 41,
          "username": "TwitterDev",
          "id": "2244994945"
        }
      ],
      "urls": [
        {
          "start": 78,
          "end": 101,
          "url": "https://t.co/abc123",
          "expanded_url": "https://developer.twitter.com",
          "display_url": "developer.twitter.com",
          "unwound_url": "https://developer.twitter.com"
        }
      ]
    },
    "referenced_tweets": [
      {
        "type": "replied_to",
        "id": "1212092627178287104"
      },
      {
        "type": "quoted",
        "id": "1211797914437259264"
      }
    ],
    "attachments": {
      "media_keys": ["3_1212092627029698048"],
      "poll_ids": ["1199786642468413448"]
    },
    "geo": {
      "place_id": "01a9a39529b27f36",
      "coordinates": {
        "type": "Point",
        "coordinates": [-122.41942, 37.77599]
      }
    },
    "context_annotations": [
      {
        "domain": {
          "id": "47",
          "name": "Brand",
          "description": "Brands and Companies"
        },
        "entity": {
          "id": "10045225402",
          "name": "Twitter"
        }
      }
    ],
    "edit_controls": {
      "edits_remaining": 5,
      "is_edit_eligible": true,
      "editable_until": "2019-12-31T20:26:16.000Z"
    },
    "withheld": {
      "copyright": false,
      "country_codes": ["FR", "DE"]
    }
  },
  "includes": {
    "users": [
      {
        "id": "2244994945",
        "name": "Twitter Dev",
        "username": "TwitterDev",
        "created_at": "2013-12-14T04:35:55.000Z",
        "description": "The voice of the Twitter Dev team and your official source for updates",
        "profile_image_url": "https://pbs.twimg.com/profile_images/1283786620521652229/lEODkLTh_normal.jpg",
        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2244994945/1594913664",
        "protected": false,
        "verified": true,
        "verified_type": "blue",
        "location": "San Francisco, CA",
        "url": "https://t.co/3ZX3TNiZCY",
        "pinned_tweet_id": "1293595870563381249",
        "public_metrics": {
          "followers_count": 513958,
          "following_count": 2039,
          "tweet_count": 3635,
          "listed_count": 1672
        },
        "entities": {
          "url": {
            "urls": [
              {
                "start": 0,
                "end": 23,
                "url": "https://t.co/3ZX3TNiZCY",
                "expanded_url": "https://developer.twitter.com",
                "display_url": "developer.twitter.com"
              }
            ]
          },
          "description": {
            "hashtags": [
              {
                "start": 17,
                "end": 28,
                "tag": "TwitterDev"
              }
            ]
          }
        }
      }
    ],
    "media": [
      {
        "media_key": "3_1212092627029698048",
        "type": "photo",
        "url": "https://pbs.twimg.com/media/ENb7p5XU4AA1NlM.jpg",
        "preview_image_url": "https://pbs.twimg.com/media/ENb7p5XU4AA1NlM.jpg",
        "height": 900,
        "width": 1200,
        "alt_text": "Happy New Year!"
      }
    ],
    "polls": [
      {
        "id": "1199786642468413448",
        "options": [
          {
            "position": 1,
            "label": "Yes",
            "votes": 123
          },
          {
            "position": 2,
            "label": "No",
            "votes": 45
          }
        ],
        "duration_minutes": 1440,
        "end_datetime": "2020-01-01T19:26:16.000Z",
        "voting_status": "closed"
      }
    ],
    "places": [
      {
        "full_name": "San Francisco, CA",
        "id": "01a9a39529b27f36",
        "country": "United States",
        "country_code": "US",
        "name": "San Francisco",
        "place_type": "city",
        "geo": {
          "type": "Feature",
          "properties": {},
          "geometry": {
            "type": "Polygon",
            "coordinates": [[[-122.51, 37.70], [-122.35, 37.70], [-122.35, 37.82], [-122.51, 37.82], [-122.51, 37.70]]]
          }
        }
      }
    ],
    "tweets": [
      {
        "id": "1212092627178287104",
        "text": "Previous tweet in the thread"
      },
      {
        "id": "1211797914437259264",
        "text": "Quoted tweet content"
      }
    ]
  },
  "meta": {
    "result_count": 1,
    "newest_id": "1212092628029698048",
    "oldest_id": "1212092628029698048",
    "next_token": "b26v89c19zqg8o3fo7gesq32o5jmrw"
  }
}
```

## Our Proxy Response (Current Implementation)

```json
{
  "data": {
    "id": "1212092628029698048",
    "text": "We believe the best future version of our API will come from building it with YOU. Here's to another great year 🥂",
    "created_at": "2019-12-31T19:26:16.000Z",
    "author_id": "2244994945",
    "edit_history_tweet_ids": ["1212092628029698048"],
    "reply_settings": "everyone",
    "conversation_id": "1212092628029698048",
    "public_metrics": {
      "retweet_count": 8,
      "reply_count": 2,
      "like_count": 40,
      "quote_count": 1,
      "impression_count": 0,
      "bookmark_count": 0
    }
  },
  "meta": {
    "result_count": 1,
    "newest_id": "1212092628029698048",
    "oldest_id": "1212092628029698048"
  }
}
```

## Field Coverage Analysis

### ✅ Fields We Have (35%)
- `id` - Tweet ID
- `text` - Tweet content
- `created_at` - Creation timestamp
- `author_id` - Author user ID
- `edit_history_tweet_ids` - Edit history
- `reply_settings` - Reply permission settings
- `conversation_id` - Conversation thread ID
- `public_metrics` (partial) - Basic engagement metrics

### 🔶 Fields We Partially Have (15%)
- `entities` - Can get hashtags, mentions, URLs from v1.1
- `referenced_tweets` - Can synthesize from v1.1 data
- `lang` - Available from Nitter
- `source` - Available from Nitter
- `possibly_sensitive` - Available from Nitter
- `geo` - Basic location from v1.1
- `edit_controls` - Synthesized (not real)
- `withheld` - Available from some sources

### ❌ Fields We Don't Have (50%)
- `organic_metrics` - Requires advertiser access
- `non_public_metrics` - Requires tweet author access
- `promoted_metrics` - Requires advertiser access
- `context_annotations` - Twitter's ML categorization
- `attachments.poll_ids` - Need authenticated access for polls
- Full `includes` expansion:
  - Complete media objects with alt_text
  - Poll voting data
  - Referenced tweets full content
  - Place details beyond basic info

## User Object Comparison

### Official Twitter v2 User
```json
{
  "id": "2244994945",
  "name": "Twitter Dev",
  "username": "TwitterDev",
  "created_at": "2013-12-14T04:35:55.000Z",
  "description": "The voice of the Twitter Dev team",
  "profile_image_url": "https://pbs.twimg.com/profile_images/123.jpg",
  "profile_banner_url": "https://pbs.twimg.com/profile_banners/123.jpg",
  "protected": false,
  "verified": true,
  "verified_type": "blue",
  "location": "San Francisco, CA",
  "url": "https://developer.twitter.com",
  "pinned_tweet_id": "1293595870563381249",
  "public_metrics": {
    "followers_count": 513958,
    "following_count": 2039,
    "tweet_count": 3635,
    "listed_count": 1672
  },
  "entities": {
    "url": {...},
    "description": {...}
  }
}
```

### Our Proxy User
```json
{
  "id": "2244994945",
  "username": "TwitterDev",
  "name": "Twitter Dev",
  "created_at": "2013-12-14T04:35:55.000Z",
  "protected": false,
  "description": "The voice of the Twitter Dev team",
  "location": "San Francisco, CA",
  "url": "https://developer.twitter.com",
  "verified": false,
  "profile_image_url": "https://pbs.twimg.com/profile_images/123.jpg",
  "public_metrics": {
    "followers_count": 513958,
    "following_count": 2039,
    "tweet_count": 3635,
    "listed_count": 1672
  }
}
```

## Summary

**Current Coverage: ~35-40% of Twitter v2 API fields**

### What We Can Add:
- Better entities support (hashtags, mentions, URLs with indices)
- More complete referenced_tweets
- Media objects in includes (partial)
- Profile banner URLs for users
- Basic withheld information

### What We Cannot Add (Need Authentication):
- Metrics beyond public_metrics
- Context annotations (ML-based)
- Poll voting data
- Complete media metadata
- Edit history beyond IDs
- Non-public engagement data