const axios = require('axios');
const { Rettiwt } = require('rettiwt-api');

// Configuration
const BEARER_TOKEN = process.env.BEARER_TOKEN || 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const API_BASE = 'https://api.twitter.com';
const NITTER_API = process.env.NITTER_API || 'https://nitter.r2d2.to/api';
const SNAPLYTICS_API = process.env.SNAPLYTICS_API || 'https://twittermedia.b-cdn.net/viewer/';

// Initialize Rettiwt API with auth token  
const RETTIWT_API_KEY = process.env.RETTIWT_API_KEY || 'a2R0PTAzbVYwbWJYMzdsbnZnS29aemp2WVZzVlhEbEVUM3pjQzZ0RGJrYkY7YXV0aF90b2tlbj0xMDkzN2FkY2I1M2M0ZDU2MmMyN2U0N2ZmNGMxNjlkZGIwODMyZTU4O2N0MD03MTkzNDRkYzdmODgzODBhYWFlYTE2MDAwOTdmYWJhZGUyZTJmNjA5MjE2OTJjNGUxZjE0ZjUzOTE4NDZkODY1MWE1YzU3ZGNiZmU1MjM4ZDQ2MjU1ZDg3MzQzN2Q3MDlhOTQwZDQ1ZjU0YjhmMDU0NGRlOWMzOGM3YjI3NzdhZjk3NWNjNzM2NTczMTIzN2E2YWNkNzU3NTk5MTU4NDQ5O3R3aWQ9dSUzRDE5NTc5NjkwNDA0MjI2ODY3MjA7';
const rettiwt = new Rettiwt({ apiKey: RETTIWT_API_KEY });

// Helper to build X API v2 compliant meta object
function buildMetaObject(params) {
  const meta = {};
  
  // Always include result_count first
  if (params.result_count !== undefined) {
    meta.result_count = params.result_count;
  }
  
  // Add IDs if present
  if (params.newest_id) {
    meta.newest_id = params.newest_id;
  }
  if (params.oldest_id) {
    meta.oldest_id = params.oldest_id;
  }
  
  // Add pagination tokens if present
  if (params.next_token) {
    meta.next_token = params.next_token;
  }
  if (params.previous_token) {
    meta.previous_token = params.previous_token;
  }
  
  return meta;
}

// Guest token pool for rate limit bypass
class GuestTokenPool {
  constructor() {
    this.tokens = [];
    this.currentIndex = 0;
    this.tokenUsage = new Map(); // Track usage per token
    this.MAX_REQUESTS_PER_TOKEN = 10; // Conservative limit per token
    this.TOKEN_RESET_TIME = 15 * 60 * 1000; // 15 minutes
  }

  async getToken() {
    // Clean up old usage records
    this.cleanupUsageRecords();
    
    // Try to find a token with available capacity
    for (let attempts = 0; attempts < this.tokens.length; attempts++) {
      const token = this.tokens[this.currentIndex];
      const usage = this.tokenUsage.get(token.token) || { count: 0, resetTime: Date.now() + this.TOKEN_RESET_TIME };
      
      if (usage.count < this.MAX_REQUESTS_PER_TOKEN) {
        // Use this token
        usage.count++;
        usage.resetTime = usage.resetTime || Date.now() + this.TOKEN_RESET_TIME;
        this.tokenUsage.set(token.token, usage);
        
        // Move to next token for next request (round-robin)
        this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
        
        return token.token;
      }
      
      // Try next token
      this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
    }
    
    // All tokens exhausted, create a new one
    const newToken = await this.createNewToken();
    return newToken;
  }
  
  async createNewToken() {
    try {
      const response = await axios.post(
        `${API_BASE}/1.1/guest/activate.json`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`
          }
        }
      );
      
      const token = {
        token: response.data.guest_token,
        created: Date.now(),
        expires: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
      };
      
      this.tokens.push(token);
      
      // Initialize usage tracking
      this.tokenUsage.set(token.token, { 
        count: 1, 
        resetTime: Date.now() + this.TOKEN_RESET_TIME 
      });
      
      return token.token;
    } catch (error) {
      console.error('Error creating guest token:', error.message);
      throw error;
    }
  }
  
  cleanupUsageRecords() {
    const now = Date.now();
    
    // Reset usage counts for tokens whose rate limit window has passed
    for (const [token, usage] of this.tokenUsage.entries()) {
      if (now > usage.resetTime) {
        this.tokenUsage.delete(token);
      }
    }
    
    // Remove expired tokens
    this.tokens = this.tokens.filter(t => t.expires > now);
    
    // Ensure we have at least one token
    if (this.tokens.length === 0) {
      this.currentIndex = 0;
    } else {
      this.currentIndex = this.currentIndex % this.tokens.length;
    }
  }
  
  async ensureMinimumTokens(count = 3) {
    // Pre-create multiple tokens for better distribution
    while (this.tokens.length < count) {
      await this.createNewToken();
      // Small delay to avoid hammering the endpoint
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Initialize token pool
const tokenPool = new GuestTokenPool();

// Get guest token from pool
async function getGuestToken() {
  return tokenPool.getToken();
}

// Transform Rettiwt user to Twitter v2 format
function transformRettiwtUserToV2(rettiwtUser) {
  if (!rettiwtUser) return null;
  
  return {
    id: rettiwtUser.id || rettiwtUser.restId,
    username: rettiwtUser.userName,
    name: rettiwtUser.fullName,
    created_at: rettiwtUser.createdAt ? new Date(rettiwtUser.createdAt).toISOString() : new Date().toISOString(),
    protected: rettiwtUser.isProtected || false,
    description: rettiwtUser.description || '',
    location: rettiwtUser.location || '',
    url: rettiwtUser.url || '',
    verified: rettiwtUser.isVerified || false,
    profile_image_url: rettiwtUser.profileImage || null,
    profile_banner_url: rettiwtUser.profileBanner || null,
    public_metrics: {
      followers_count: rettiwtUser.followersCount || 0,
      following_count: rettiwtUser.followingsCount || 0,
      tweet_count: rettiwtUser.statusesCount || 0,
      listed_count: rettiwtUser.listedCount || 0,
      like_count: rettiwtUser.favoritesCount || 0
    }
  };
}

// Transform Rettiwt tweet to Twitter v2 format
function transformRettiwtTweetToV2(rettiwtTweet) {
  if (!rettiwtTweet) return null;
  
  const v2Tweet = {
    id: rettiwtTweet.id,
    text: rettiwtTweet.fullText || rettiwtTweet.text || '',
    created_at: rettiwtTweet.createdAt ? new Date(rettiwtTweet.createdAt).toISOString() : new Date().toISOString(),
    author_id: rettiwtTweet.tweetBy?.id || rettiwtTweet.userId || 'unknown',
    edit_history_tweet_ids: [rettiwtTweet.id],
    reply_settings: rettiwtTweet.replySettings || 'everyone',
    conversation_id: rettiwtTweet.conversationId || rettiwtTweet.id,
    public_metrics: {
      retweet_count: rettiwtTweet.retweetCount || 0,
      reply_count: rettiwtTweet.replyCount || 0,
      like_count: rettiwtTweet.likeCount || 0,
      quote_count: rettiwtTweet.quoteCount || 0,
      impression_count: rettiwtTweet.viewCount || 0,
      bookmark_count: rettiwtTweet.bookmarkCount || 0
    }
  };
  
  // Add language if available
  if (rettiwtTweet.lang) {
    v2Tweet.lang = rettiwtTweet.lang;
  }
  
  // Add possibly sensitive flag
  if (rettiwtTweet.isSensitive !== undefined) {
    v2Tweet.possibly_sensitive = rettiwtTweet.isSensitive;
  }
  
  // Add entities if available
  if (rettiwtTweet.entities) {
    v2Tweet.entities = rettiwtTweet.entities;
  }
  
  // Add media attachments if available
  if (rettiwtTweet.media && rettiwtTweet.media.length > 0) {
    v2Tweet.attachments = {
      media_keys: rettiwtTweet.media.map(m => m.id || m.mediaKey || m.url)
    };
  }
  
  // Add referenced tweets if this is a reply, quote, or retweet
  if (rettiwtTweet.inReplyToStatusId || rettiwtTweet.quotedStatusId || rettiwtTweet.retweetedStatusId) {
    v2Tweet.referenced_tweets = [];
    
    if (rettiwtTweet.inReplyToStatusId) {
      v2Tweet.referenced_tweets.push({
        type: 'replied_to',
        id: rettiwtTweet.inReplyToStatusId
      });
    }
    
    if (rettiwtTweet.quotedStatusId) {
      v2Tweet.referenced_tweets.push({
        type: 'quoted',
        id: rettiwtTweet.quotedStatusId
      });
    }
    
    if (rettiwtTweet.retweetedStatusId) {
      v2Tweet.referenced_tweets.push({
        type: 'retweeted',
        id: rettiwtTweet.retweetedStatusId
      });
    }
  }
  
  return v2Tweet;
}

// Fetch author data using Twitter oEmbed API (no auth required)
async function fetchAuthorFromOEmbed(tweetId) {
  try {
    const response = await axios.get(
      'https://publish.twitter.com/oembed',
      {
        params: {
          url: `https://twitter.com/i/status/${tweetId}`,
          dnt: true,
          omit_script: true
        },
        timeout: 2000 // Quick timeout to avoid slowing down responses
      }
    );
    
    if (response.data && response.data.author_name && response.data.author_url) {
      // Extract username from author_url
      const username = response.data.author_url.split('/').pop();
      return {
        name: response.data.author_name,
        username: username
      };
    }
  } catch (error) {
    // Silently fail - oEmbed is just a fallback
  }
  return null;
}

// Transform v1.1 user to v2 format with enhanced fields
function transformUserToV2(v1User, includeAllFields = false) {
  const v2User = {
    id: v1User.id_str,
    username: v1User.screen_name,
    name: v1User.name,
    created_at: new Date(v1User.created_at).toISOString(),
    protected: v1User.protected,
    description: v1User.description || '',
    location: v1User.location || '',
    url: v1User.url || null,
    verified: v1User.verified || false,
    profile_image_url: v1User.profile_image_url_https,
    public_metrics: {
      followers_count: v1User.followers_count || v1User.normal_followers_count || 0,
      following_count: v1User.friends_count || 0,
      tweet_count: v1User.statuses_count || 0,
      listed_count: v1User.listed_count || 0,
      like_count: v1User.favourites_count || 0
    }
  };
  
  // Add additional fields when requested
  if (includeAllFields) {
    // Add profile banner if available
    if (v1User.profile_banner_url) {
      v2User.profile_banner_url = v1User.profile_banner_url;
    }
    
    // Add profile background if available
    if (v1User.profile_background_image_url_https) {
      v2User.profile_background_image_url = v1User.profile_background_image_url_https;
    }
    
    // Add entities if available
    if (v1User.entities) {
      v2User.entities = {
        url: v1User.entities.url || {},
        description: v1User.entities.description || {}
      };
    }
    
    // Add pinned tweet IDs if available
    if (v1User.pinned_tweet_ids && v1User.pinned_tweet_ids.length > 0) {
      v2User.pinned_tweet_id = v1User.pinned_tweet_ids_str?.[0] || v1User.pinned_tweet_ids[0]?.toString();
    } else if (v1User.status?.id_str) {
      v2User.pinned_tweet_id = v1User.status.id_str;
    }
    
    // Add withheld information if available
    if (v1User.withheld_in_countries && v1User.withheld_in_countries.length > 0) {
      v2User.withheld = {
        scope: v1User.withheld_scope || 'user',
        country_codes: v1User.withheld_in_countries
      };
    }
    
    // Add verified type
    if (v1User.verified) {
      v2User.verified_type = v1User.ext?.verified_type || 'legacy';
    }
    
    // Add translator info
    if (v1User.is_translator) {
      v2User.is_translator = true;
      v2User.translator_type = v1User.translator_type;
    }
  }
  
  return v2User;
}

// Transform v1.1 tweet to v2 format with enhanced fields
function transformTweetToV2(v1Tweet, includeAllFields = false, expansions = {}) {
  const v2Tweet = {
    id: v1Tweet.id_str,
    text: v1Tweet.full_text || v1Tweet.text || '',
    created_at: new Date(v1Tweet.created_at).toISOString(),
    author_id: v1Tweet.user?.id_str || v1Tweet.user_id_str || 'unknown',
    edit_history_tweet_ids: [v1Tweet.id_str],
    reply_settings: v1Tweet.reply_settings || 'everyone'
  };
  
  // Add metrics if available
  if (v1Tweet.retweet_count !== undefined || v1Tweet.favorite_count !== undefined) {
    v2Tweet.public_metrics = {
      retweet_count: v1Tweet.retweet_count || 0,
      reply_count: v1Tweet.reply_count || 0,
      like_count: v1Tweet.favorite_count || 0,
      quote_count: v1Tweet.quote_count || 0,
      impression_count: v1Tweet.impression_count || 0,
      bookmark_count: v1Tweet.bookmark_count || 0,
      view_count: v1Tweet.view_count || 0
    };
  }
  
  // Add additional fields when requested
  if (includeAllFields) {
    // Add language
    if (v1Tweet.lang) {
      v2Tweet.lang = v1Tweet.lang;
    }
    
    // Add source (client app)
    if (v1Tweet.source) {
      v2Tweet.source = v1Tweet.source;
    }
    
    // Add possibly_sensitive flag
    if (v1Tweet.possibly_sensitive !== undefined) {
      v2Tweet.possibly_sensitive = v1Tweet.possibly_sensitive;
    }
    
    // Add reply settings and referenced tweets
    const referencedTweets = [];
    if (v1Tweet.in_reply_to_status_id_str) {
      v2Tweet.in_reply_to_user_id = v1Tweet.in_reply_to_user_id_str;
      referencedTweets.push({
        type: 'replied_to',
        id: v1Tweet.in_reply_to_status_id_str
      });
    }
    
    // Add retweet reference and include full tweet if available
    if (v1Tweet.retweeted_status) {
      referencedTweets.push({
        type: 'retweeted',
        id: v1Tweet.retweeted_status.id_str
      });
      // Store retweeted tweet for includes
      if (expansions.retweetedTweets) {
        expansions.retweetedTweets.push(transformTweetToV2(v1Tweet.retweeted_status, includeAllFields));
      }
    }
    
    // Add quoted tweet reference and include full tweet if available
    if (v1Tweet.quoted_status || v1Tweet.quoted_status_id_str) {
      referencedTweets.push({
        type: 'quoted',
        id: v1Tweet.quoted_status_id_str || v1Tweet.quoted_status?.id_str
      });
      // Store quoted tweet for includes
      if (v1Tweet.quoted_status && expansions.quotedTweets) {
        expansions.quotedTweets.push(transformTweetToV2(v1Tweet.quoted_status, includeAllFields));
      }
    }
    
    if (referencedTweets.length > 0) {
      v2Tweet.referenced_tweets = referencedTweets;
    }
    
    // Add conversation_id (same as tweet ID for root tweets)
    v2Tweet.conversation_id = v1Tweet.conversation_id_str || v1Tweet.id_str;
    
    // Add entities
    if (v1Tweet.entities) {
      v2Tweet.entities = {};
      
      // Add hashtags
      if (v1Tweet.entities.hashtags && v1Tweet.entities.hashtags.length > 0) {
        v2Tweet.entities.hashtags = v1Tweet.entities.hashtags.map(tag => ({
          start: tag.indices?.[0],
          end: tag.indices?.[1],
          tag: tag.text
        }));
      }
      
      // Add mentions
      if (v1Tweet.entities.user_mentions && v1Tweet.entities.user_mentions.length > 0) {
        v2Tweet.entities.mentions = v1Tweet.entities.user_mentions.map(mention => ({
          start: mention.indices?.[0],
          end: mention.indices?.[1],
          username: mention.screen_name,
          id: mention.id_str
        }));
      }
      
      // Add URLs
      if (v1Tweet.entities.urls && v1Tweet.entities.urls.length > 0) {
        v2Tweet.entities.urls = v1Tweet.entities.urls.map(url => ({
          start: url.indices?.[0],
          end: url.indices?.[1],
          url: url.url,
          expanded_url: url.expanded_url,
          display_url: url.display_url,
          unwound_url: url.unwound_url
        }));
      }
      
      // Add media attachments from extended_entities (preferred) or entities
      const mediaEntities = v1Tweet.extended_entities?.media || v1Tweet.entities?.media;
      if (mediaEntities && mediaEntities.length > 0) {
        v2Tweet.attachments = {
          media_keys: mediaEntities.map(m => m.id_str)
        };
      }
    }
    
    // Add geo information if available
    if (v1Tweet.geo || v1Tweet.coordinates || v1Tweet.place) {
      v2Tweet.geo = {};
      if (v1Tweet.place?.id) {
        v2Tweet.geo.place_id = v1Tweet.place.id;
      }
      if (v1Tweet.coordinates?.coordinates) {
        v2Tweet.geo.coordinates = {
          type: 'Point',
          coordinates: v1Tweet.coordinates.coordinates
        };
      }
    }
    
    // Add edit controls (synthesized)
    const createdDate = new Date(v1Tweet.created_at);
    const editableUntil = new Date(createdDate.getTime() + 60 * 60 * 1000); // 1 hour after creation
    v2Tweet.edit_controls = {
      edits_remaining: 5,
      is_edit_eligible: new Date() < editableUntil,
      editable_until: editableUntil.toISOString()
    };
    
    // Add withheld information if available
    if (v1Tweet.withheld_in_countries && v1Tweet.withheld_in_countries.length > 0) {
      v2Tweet.withheld = {
        copyright: v1Tweet.withheld_copyright || false,
        country_codes: v1Tweet.withheld_in_countries,
        scope: v1Tweet.withheld_scope || 'tweet'
      };
    }
    
    // Add scopes if available
    if (v1Tweet.scopes) {
      v2Tweet.scopes = v1Tweet.scopes;
    }
  }
  
  return v2Tweet;
}

// Build includes object for v2 response
function buildIncludesObject(tweets, users = [], media = [], places = [], polls = []) {
  const includes = {};
  
  if (users && users.length > 0) {
    includes.users = users;
  }
  
  if (media && media.length > 0) {
    includes.media = media.map(m => {
      const mediaObj = {
        media_key: m.id_str || m.id,
        type: m.type || 'photo',
        url: m.media_url_https || m.url
      };
      
      // Add preview image
      if (m.type === 'video' || m.type === 'animated_gif') {
        mediaObj.preview_image_url = m.media_url_https || m.preview_url;
      }
      
      // Add dimensions
      if (m.original_info) {
        mediaObj.height = m.original_info.height;
        mediaObj.width = m.original_info.width;
      } else if (m.sizes?.large) {
        mediaObj.height = m.sizes.large.h;
        mediaObj.width = m.sizes.large.w;
      }
      
      // Add video info
      if (m.video_info) {
        mediaObj.duration_ms = m.video_info.duration_millis;
        if (m.video_info.variants && m.video_info.variants.length > 0) {
          mediaObj.variants = m.video_info.variants.map(v => ({
            bit_rate: v.bitrate,
            content_type: v.content_type,
            url: v.url
          }));
        }
      }
      
      // Add alt text for accessibility
      if (m.ext_alt_text) {
        mediaObj.alt_text = m.ext_alt_text;
      }
      
      // Add additional media info
      if (m.additional_media_info) {
        mediaObj.additional_info = m.additional_media_info;
      }
      
      return mediaObj;
    });
  }
  
  if (places && places.length > 0) {
    includes.places = places.map(p => ({
      full_name: p.full_name,
      id: p.id,
      contained_within: p.contained_within,
      country: p.country,
      country_code: p.country_code,
      geo: p.bounding_box,
      name: p.name,
      place_type: p.place_type
    }));
  }
  
  if (polls && polls.length > 0) {
    includes.polls = polls;
  }
  
  // Extract referenced tweets if any
  const referencedTweets = [];
  tweets.forEach(tweet => {
    if (tweet.referenced_tweets) {
      tweet.referenced_tweets.forEach(ref => {
        if (!referencedTweets.find(t => t.id === ref.id)) {
          // This is a placeholder - in real implementation, we'd fetch these tweets
          referencedTweets.push({ id: ref.id });
        }
      });
    }
  });
  
  if (referencedTweets.length > 0) {
    includes.tweets = referencedTweets;
  }
  
  return Object.keys(includes).length > 0 ? includes : undefined;
}

// Main handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.replace(/\?.*$/, '');
  const query = req.query;

  try {
    // Root endpoint
    if (path === '/' || path === '') {
      return res.json({
        name: 'Twitter v2 API Proxy',
        version: '1.0.0',
        endpoints: {
          users: [
            'GET /2/users/:id',
            'GET /2/users/:id/followers',
            'GET /2/users/:id/following',
            'GET /2/users/by/username/:username',
            'GET /2/users/search'
          ],
          tweets: [
            'GET /2/tweets/:id',
            'GET /2/tweets/search/recent',
            'GET /2/users/:id/tweets',
            'GET /2/users/by/username/:username/tweets'
          ],
          lists: [
            'GET /2/lists/:id',
            'GET /2/lists/:id/members',
            'GET /2/lists/:id/followers'
          ],
          trends: [
            'GET /2/trends/place/:woeid',
            'GET /2/trends/available',
            'GET /2/trends/closest'
          ],
          geo: [
            'GET /2/geo/search',
            'GET /2/geo/reverse_geocode',
            'GET /2/geo/id/:place_id'
          ],
          system: [
            'GET /2/system/init-tokens'
          ]
        },
        note: 'This proxy provides FREE access to Twitter v2 API endpoints using rotating guest tokens to bypass rate limits'
      });
    }
    
    // System endpoint to initialize token pool
    if (path === '/2/system/init-tokens') {
      try {
        const count = parseInt(query.count) || 5;
        await tokenPool.ensureMinimumTokens(Math.min(count, 10)); // Cap at 10 for safety
        
        return res.json({
          success: true,
          message: `Token pool initialized with ${tokenPool.tokens.length} tokens`,
          tokens_available: tokenPool.tokens.length,
          max_requests_per_token: tokenPool.MAX_REQUESTS_PER_TOKEN
        });
      } catch (error) {
        return res.status(500).json({
          errors: [{
            message: 'Failed to initialize token pool: ' + error.message
          }]
        });
      }
    }

    // Parse the path
    const pathParts = path.split('/').filter(p => p);

    // USERS ENDPOINTS
    
    // GET /2/users/:id/followers
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'followers') {
      const userId = pathParts[2];
      let cursor = query.pagination_token ? Buffer.from(query.pagination_token, 'base64').toString('ascii') : '-1';
      const requestedCount = Math.min(parseInt(query.max_results) || 100, 1000);
      
      // Since v1.1 API limits to 200 per request, we need to make multiple requests
      // to fulfill requests for more than 200 followers
      let allUsers = [];
      let nextCursor = cursor;
      let previousCursor = null;
      let remainingCount = requestedCount;
      
      while (remainingCount > 0 && nextCursor !== '0') {
        const batchSize = Math.min(remainingCount, 200);
        
        // Get a fresh token for each request from the pool
        const guestToken = await getGuestToken();
        
        const response = await axios.get(
          `${API_BASE}/1.1/followers/list.json`,
          {
            params: {
              user_id: userId,
              cursor: nextCursor,
              count: batchSize,
              skip_status: false,  // Get status for pinned tweets
              include_user_entities: true  // Get entities for URLs
            },
            headers: {
              'Authorization': `Bearer ${BEARER_TOKEN}`,
              'x-guest-token': guestToken
            }
          }
        );
        
        allUsers = allUsers.concat(response.data.users);
        remainingCount -= response.data.users.length;
        
        // Keep track of cursors for pagination
        if (allUsers.length === 0) {
          // First batch - save the previous cursor
          previousCursor = response.data.previous_cursor_str;
        }
        
        nextCursor = response.data.next_cursor_str;
        
        // If we've got enough users or no more data, stop
        if (response.data.users.length < batchSize || nextCursor === '0') {
          break;
        }
      }
      
      const metaParams = {
        result_count: allUsers.length
      };
      
      if (nextCursor && nextCursor !== '0') {
        metaParams.next_token = Buffer.from(nextCursor).toString('base64');
      }
      
      if (previousCursor && previousCursor !== '0') {
        metaParams.previous_token = Buffer.from(previousCursor).toString('base64');
      }
      
      // Check if user.fields was requested
      const userFields = query['user.fields']?.split(',') || [];
      const includeAllFields = userFields.length > 0;
      
      const v2Response = {
        data: allUsers.map(user => transformUserToV2(user, includeAllFields)),
        meta: buildMetaObject(metaParams)
      };

      return res.json(v2Response);
    }

    // GET /2/users/:id/following
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'following') {
      const userId = pathParts[2];
      let cursor = query.pagination_token ? Buffer.from(query.pagination_token, 'base64').toString('ascii') : '-1';
      const requestedCount = Math.min(parseInt(query.max_results) || 100, 1000);
      
      // Since v1.1 API limits to 200 per request, we need to make multiple requests
      // to fulfill requests for more than 200 users
      let allUsers = [];
      let nextCursor = cursor;
      let previousCursor = null;
      let remainingCount = requestedCount;
      
      while (remainingCount > 0 && nextCursor !== '0') {
        const batchSize = Math.min(remainingCount, 200);
        
        // Get a fresh token for each request from the pool
        const guestToken = await getGuestToken();
        
        const response = await axios.get(
          `${API_BASE}/1.1/friends/list.json`,
          {
            params: {
              user_id: userId,
              cursor: nextCursor,
              count: batchSize,
              skip_status: false,  // Get status for pinned tweets
              include_user_entities: true  // Get entities for URLs
            },
            headers: {
              'Authorization': `Bearer ${BEARER_TOKEN}`,
              'x-guest-token': guestToken
            }
          }
        );
        
        allUsers = allUsers.concat(response.data.users);
        remainingCount -= response.data.users.length;
        
        // Keep track of cursors for pagination
        if (allUsers.length === 0) {
          // First batch - save the previous cursor
          previousCursor = response.data.previous_cursor_str;
        }
        
        nextCursor = response.data.next_cursor_str;
        
        // If we've got enough users or no more data, stop
        if (response.data.users.length < batchSize || nextCursor === '0') {
          break;
        }
      }
      
      const metaParams = {
        result_count: allUsers.length
      };
      
      if (nextCursor && nextCursor !== '0') {
        metaParams.next_token = Buffer.from(nextCursor).toString('base64');
      }
      
      if (previousCursor && previousCursor !== '0') {
        metaParams.previous_token = Buffer.from(previousCursor).toString('base64');
      }
      
      // Check if user.fields was requested
      const userFields = query['user.fields']?.split(',') || [];
      const includeAllFields = userFields.length > 0;
      
      const v2Response = {
        data: allUsers.map(user => transformUserToV2(user, includeAllFields)),
        meta: buildMetaObject(metaParams)
      };

      return res.json(v2Response);
    }

    // GET /2/users?ids=... (multiple users by ID)
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 2 && query.ids) {
      const userIds = query.ids.split(',');
      const users = [];
      
      for (const userId of userIds.slice(0, 100)) { // Limit to 100 users
        try {
          // Use Rettiwt to get user timeline which includes user data
          const timeline = await rettiwt.user.timeline(userId);
          
          if (timeline && timeline.list && timeline.list.length > 0) {
            const firstTweet = timeline.list[0];
            if (firstTweet && firstTweet.tweetBy) {
              const rettiwtUser = firstTweet.tweetBy;
              const v2User = transformRettiwtUserToV2(rettiwtUser);
              
              if (v2User) {
                v2User.id = userId; // Ensure correct ID
                users.push(v2User);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error.message);
          // Skip failed users
        }
      }
      
      return res.json({
        data: users
      });
    }

    // GET /2/users/:id (single user by ID)
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 3 && !isNaN(pathParts[2])) {
      const userId = pathParts[2];
      
      try {
        // Use Rettiwt to get user timeline which includes user data
        const timeline = await rettiwt.user.timeline(userId);
        
        // Extract user data from the timeline response
        if (timeline && timeline.list && timeline.list.length > 0) {
          const firstTweet = timeline.list[0];
          if (firstTweet && firstTweet.tweetBy) {
            const rettiwtUser = firstTweet.tweetBy;
            const v2User = transformRettiwtUserToV2(rettiwtUser);
            
            if (v2User) {
              // Ensure the ID matches what was requested
              v2User.id = userId;
              return res.json({
                data: v2User
              });
            }
          }
        }
        
        // If no timeline data, try to get user following list which also has user info
        const following = await rettiwt.user.following(userId);
        if (following && following.list && following.list.length > 0) {
          // We can infer some basic info from the fact that this user exists
          // But we don't have full profile data this way
          return res.json({
            data: {
              id: userId,
              username: `user_${userId}`,
              name: `User ${userId}`,
              created_at: new Date().toISOString(),
              protected: false,
              description: '',
              location: '',
              url: '',
              verified: false,
              profile_image_url: null,
              public_metrics: {
                followers_count: 0,
                following_count: following.list.length,
                tweet_count: 0,
                listed_count: 0
              }
            }
          });
        }
      } catch (error) {
        console.error('Rettiwt user lookup error:', error.message);
        
        // Try v1.1 API as fallback
        try {
          const guestToken = await getGuestToken();
          const response = await axios.get(
            `${API_BASE}/1.1/users/show.json`,
            {
              params: {
                user_id: userId,
                include_entities: true
              },
              headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'x-guest-token': guestToken
              },
              timeout: 5000
            }
          );

          if (response.data) {
            const userFields = query['user.fields']?.split(',') || [];
            const includeAllFields = userFields.length > 0;
            
            return res.json({
              data: transformUserToV2(response.data, includeAllFields)
            });
          }
        } catch (v1Error) {
          console.error('v1.1 fallback failed:', v1Error.response?.data || v1Error.message);
        }
      }
      
      return res.status(404).json({
        errors: [{
          message: 'User not found',
          code: 'resource_not_found'
        }]
      });
    }

    // GET /2/users/by/username/:username/tweets - Check this BEFORE the profile endpoint
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'by' && pathParts[3] === 'username' && pathParts[5] === 'tweets') {
      const username = pathParts[4];
      const { max_results = 10, pagination_token } = query;
      
      try {
        const nitterResponse = await axios.get(
          `${NITTER_API}/${username}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            params: pagination_token ? { cursor: pagination_token } : {}
          }
        );

        if (nitterResponse.data && nitterResponse.data.data) {
          const timeline = nitterResponse.data.data.timeline || [];
          // User data might be in data.user or in the first timeline item
          const userData = nitterResponse.data.data.user || 
                          (timeline.length > 0 ? timeline[0].user : null);
          
          // Check if tweet.fields was requested
          const tweetFields = query['tweet.fields']?.split(',') || [];
          const includeAllFields = tweetFields.length > 0;
          
          const v2Tweets = timeline.slice(0, max_results).map(tweet => {
            const v2Tweet = {
              id: tweet.id,
              text: tweet.text || tweet.fullText || '',
              created_at: tweet.time ? new Date(tweet.time * 1000).toISOString() : new Date().toISOString(),
              author_id: tweet.user?.id || userData?.id || 'unknown',
              edit_history_tweet_ids: [tweet.id],
              public_metrics: {
                retweet_count: tweet.stats?.retweets || 0,
                reply_count: tweet.stats?.replies || 0,
                like_count: tweet.stats?.likes || 0,
                quote_count: tweet.stats?.quotes || 0,
                impression_count: tweet.stats?.views || 0
              }
            };
            
            // Add additional fields when requested
            if (includeAllFields) {
              // Add conversation_id (from Nitter)
              if (tweet.conversationId) {
                v2Tweet.conversation_id = tweet.conversationId;
              } else {
                v2Tweet.conversation_id = tweet.id; // Default to tweet ID for root tweets
              }
              
              // Add language if available
              if (tweet.lang) {
                v2Tweet.lang = tweet.lang;
              }
              
              // Add possibly_sensitive flag
              if (tweet.sensitive !== undefined) {
                v2Tweet.possibly_sensitive = tweet.sensitive;
              }
              
              // Add reply info
              if (tweet.replyTo) {
                v2Tweet.in_reply_to_user_id = tweet.replyTo;
              }
              
              // Add entities if available
              if (tweet.hashtags || tweet.mentions || tweet.urls) {
                v2Tweet.entities = {};
                
                if (tweet.hashtags && tweet.hashtags.length > 0) {
                  v2Tweet.entities.hashtags = tweet.hashtags;
                }
                
                if (tweet.mentions && tweet.mentions.length > 0) {
                  v2Tweet.entities.mentions = tweet.mentions;
                }
                
                if (tweet.urls && tweet.urls.length > 0) {
                  v2Tweet.entities.urls = tweet.urls;
                }
              }
              
              // Add media attachments
              if (tweet.media && tweet.media.length > 0) {
                v2Tweet.attachments = {
                  media_keys: tweet.media.map(m => m.id || m.url)
                };
              }
            }
            
            return v2Tweet;
          });

          // Build meta object in exact X API v2 format
          const metaParams = {
            result_count: v2Tweets.length
          };
          
          if (v2Tweets.length > 0) {
            metaParams.newest_id = v2Tweets[0].id;
            metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
          }
          
          // Check for pagination
          const cursor = nitterResponse.data.cursor || 
                        nitterResponse.data.data.cursor ||
                        nitterResponse.data.data.pagination?.bottom;
          
          if (cursor) {
            metaParams.next_token = cursor;
          }
          
          const response = {
            data: v2Tweets,
            meta: buildMetaObject(metaParams)
          };

          // Check if expansions were requested
          const expansions = query.expansions?.split(',') || [];
          
          // Add includes section if author_id expansion was requested
          if (expansions.includes('author_id')) {
            // If we have userData from Nitter, use it
            if (userData) {
            const userV2 = {
              id: userData.id,
              username: userData.username,
              name: userData.fullname || userData.name
            };
            
            // Add profile image URL if available
            if (userData.userPic) {
              userV2.profile_image_url = `https://pbs.twimg.com/${userData.userPic}`;
            } else if (userData.avatar) {
              userV2.profile_image_url = userData.avatar;
            }
            
            // Add profile banner URL if available
            if (userData.banner) {
              userV2.profile_banner_url = `https://pbs.twimg.com/${userData.banner}`;
            }
            
            // Add verified type if available
            if (userData.verifiedType) {
              userV2.verified_type = userData.verifiedType.toLowerCase();
            } else if (userData.verified) {
              userV2.verified = true;
            }
            
            // Add public metrics if available
            if (userData.followers !== undefined || userData.following !== undefined) {
              userV2.public_metrics = {
                followers_count: userData.followers || 0,
                following_count: userData.following || 0,
                tweet_count: userData.tweets || 0,
                listed_count: userData.listed_count || 0
              };
            }
            
            response.includes = {
              users: [userV2]
            };
            } else if (v2Tweets.length > 0) {
              // No userData from Nitter, but we have tweets
              // Use oEmbed to get author info from the first tweet
              const firstTweetId = v2Tweets[0].id;
              const oEmbedAuthor = await fetchAuthorFromOEmbed(firstTweetId);
              
              if (oEmbedAuthor) {
                response.includes = {
                  users: [{
                    id: v2Tweets[0].author_id,
                    username: oEmbedAuthor.username,
                    name: oEmbedAuthor.name
                  }]
                };
              }
            }
          }

          return res.json(response);
        }
      } catch (error) {
        console.error('Nitter timeline error:', error.message);
      }

      return res.json({
        data: [],
        meta: {
          result_count: 0
        }
      });
    }

    // GET /2/users/by/username/:username
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'by' && pathParts[3] === 'username' && pathParts.length === 5) {
      const username = pathParts[4];
      
      try {
        // Use Nitter to get user data
        const response = await axios.get(
          `${NITTER_API}/${username}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        );

        if (response.data && response.data.data) {
          // Extract user data from timeline response
          const userData = response.data.data.user || (response.data.data.timeline && response.data.data.timeline[0]?.user);
          
          if (userData) {
            const v2User = {
              id: userData.id || userData.rest_id,
              username: userData.username || userData.screen_name,
              name: userData.fullname || userData.name,
              created_at: userData.joinDate ? new Date(userData.joinDate * 1000).toISOString() : new Date().toISOString(),
              protected: userData.protected || false,
              description: userData.bio || userData.description || '',
              location: userData.location || '',
              url: userData.website || '',
              verified: userData.verified || false,
              public_metrics: {
                followers_count: userData.followers || userData.followers_count || 0,
                following_count: userData.following || userData.friends_count || 0,
                tweet_count: userData.tweets || userData.statuses_count || 0,
                listed_count: userData.listed_count || 0
              }
            };
            
            // Add profile image URL if available
            if (userData.userPic) {
              v2User.profile_image_url = `https://pbs.twimg.com/${userData.userPic}`;
            }
            
            // Add profile banner URL if available
            if (userData.banner) {
              v2User.profile_banner_url = `https://pbs.twimg.com/${userData.banner}`;
            }
            
            // Add pinned tweet ID if available
            if (userData.pinnedTweet && userData.pinnedTweet !== 0) {
              v2User.pinned_tweet_id = userData.pinnedTweet.toString();
            }
            
            // Add verified type if available
            if (userData.verifiedType) {
              v2User.verified_type = userData.verifiedType.toLowerCase();
            }
            
            return res.json({
              data: v2User
            });
          }
        }
      } catch (error) {
        console.error('Nitter user lookup error:', error.message);
      }

      return res.status(404).json({
        errors: [{
          message: 'User not found'
        }]
      });
    }

    // GET /2/users/search
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'search') {
      const searchQuery = query.query || query.q;
      
      if (!searchQuery) {
        return res.status(400).json({
          errors: [{
            message: 'Query parameter is required'
          }]
        });
      }

      try {
        const response = await axios.get(
          `${SNAPLYTICS_API}`,
          {
            params: {
              data: `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}&f=user`,
              type: 'user'
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        );

        const users = response.data.users || [];
        
        const v2Users = users.map(user => ({
          id: user.rest_id,
          username: user.screen_name,
          name: user.name,
          description: user.description || '',
          created_at: new Date(user.created_at).toISOString(),
          protected: user.protected || false,
          verified: user.verified || false,
          profile_image_url: user.profile_image_url_https,
          public_metrics: {
            followers_count: user.followers_count || 0,
            following_count: user.friends_count || 0,
            tweet_count: user.statuses_count || 0,
            listed_count: user.listed_count || 0
          }
        }));
        
        return res.json({
          data: v2Users,
          meta: buildMetaObject({
            result_count: users.length
          })
        });
      } catch (error) {
        console.error('Snaplytics error:', error.message);
        return res.json({
          data: [],
          meta: {
            result_count: 0
          }
        });
      }
    }

    // TWEET ENDPOINTS

    // GET /2/tweets?ids=... (multiple tweets)
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts.length === 2 && query.ids) {
      const tweetIds = query.ids.split(',');
      const expansions = query.expansions?.split(',') || [];
      const tweetFields = query['tweet.fields']?.split(',') || [];
      const userFields = query['user.fields']?.split(',') || [];
      
      const tweets = [];
      const users = new Map(); // Use Map to avoid duplicate users
      
      // Fetch each tweet
      for (const tweetId of tweetIds.slice(0, 100)) { // Limit to 100 tweets
        try {
          // Try vxtwitter first
          const vxResponse = await axios.get(
            `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0'
              },
              timeout: 3000
            }
          );

          if (vxResponse.data) {
            const tweet = vxResponse.data;
            
            const v2Tweet = {
              id: tweetId,
              text: tweet.text || '',
              created_at: tweet.date ? new Date(tweet.date).toISOString() : new Date().toISOString(),
              author_id: tweet.user_id || 'unknown',
              edit_history_tweet_ids: [tweetId],
              public_metrics: {
                retweet_count: tweet.retweets || 0,
                reply_count: tweet.replies || 0,
                like_count: tweet.likes || 0,
                quote_count: tweet.quotes || 0,
                impression_count: tweet.views || 0
              }
            };
            
            tweets.push(v2Tweet);
            
            // If author_id expansion requested, build user object
            if (expansions.includes('author_id')) {
              let userInfo = {
                id: tweet.user_id || 'unknown',
                username: tweet.user_screen_name || 'unknown',
                name: tweet.user_name || 'Unknown'
              };
              
              // If username or name is unknown, try oEmbed as fallback
              if ((userInfo.username === 'unknown' || userInfo.name === 'Unknown') && !users.has(userInfo.id)) {
                const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
                if (oEmbedAuthor) {
                  userInfo.username = oEmbedAuthor.username || userInfo.username;
                  userInfo.name = oEmbedAuthor.name || userInfo.name;
                }
              }
              
              // Add user to map if not already present
              if (!users.has(userInfo.id)) {
                users.set(userInfo.id, userInfo);
              }
            }
          }
        } catch (error) {
          // Skip failed tweets
          console.error(`Failed to fetch tweet ${tweetId}:`, error.message);
        }
      }
      
      const response = {
        data: tweets,
        meta: {
          result_count: tweets.length
        }
      };
      
      // Add includes if expansions were requested
      if (expansions.includes('author_id') && users.size > 0) {
        response.includes = {
          users: Array.from(users.values())
        };
      }
      
      return res.json(response);
    }

    // GET /2/tweets/:id (single tweet)
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts.length === 3) {
      const tweetId = pathParts[2];
      
      try {
        // Try vxtwitter first
        const vxResponse = await axios.get(
          `https://api.vxtwitter.com/Twitter/status/${tweetId}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0'
            },
            timeout: 5000
          }
        );

        if (vxResponse.data) {
          const tweet = vxResponse.data;
          
          // Check if tweet.fields was requested
          const tweetFields = query['tweet.fields']?.split(',') || [];
          const includeAllFields = tweetFields.length > 0;
          
          const v2Tweet = {
            id: tweetId,
            text: tweet.text || '',
            created_at: tweet.date ? new Date(tweet.date).toISOString() : new Date().toISOString(),
            author_id: tweet.user_id || 'unknown',
            edit_history_tweet_ids: [tweetId],
            public_metrics: {
              retweet_count: tweet.retweets || 0,
              reply_count: tweet.replies || 0,
              like_count: tweet.likes || 0,
              quote_count: tweet.quotes || 0,
              impression_count: tweet.views || 0
            }
          };
          
          // Add additional fields when requested
          if (includeAllFields) {
            // Add conversation_id (default to tweet ID)
            v2Tweet.conversation_id = tweet.conversation_id || tweetId;
            
            // Add language if available
            if (tweet.lang) {
              v2Tweet.lang = tweet.lang;
            }
            
            // Add possibly_sensitive flag
            if (tweet.possibly_sensitive !== undefined) {
              v2Tweet.possibly_sensitive = tweet.possibly_sensitive;
            }
            
            // Add media attachments if available
            if (tweet.media && tweet.media.length > 0) {
              v2Tweet.attachments = {
                media_keys: tweet.media.map(m => m.id || m.url)
              };
            }
          }
          
          // Build user object for includes
          let userInfo = {
            id: tweet.user_id || 'unknown',
            username: tweet.user_screen_name || 'unknown',
            name: tweet.user_name || 'Unknown'
          };
          
          // If username or name is unknown, try oEmbed as fallback
          if (userInfo.username === 'unknown' || userInfo.name === 'Unknown') {
            const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
            if (oEmbedAuthor) {
              userInfo.username = oEmbedAuthor.username || userInfo.username;
              userInfo.name = oEmbedAuthor.name || userInfo.name;
            }
          }
          
          return res.json({
            data: v2Tweet,
            includes: {
              users: [userInfo]
            }
          });
        }
      } catch (vxError) {
        // Try fxtwitter as fallback
        try {
          const fxResponse = await axios.get(
            `https://api.fxtwitter.com/Twitter/status/${tweetId}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0'
              },
              timeout: 5000
            }
          );

          if (fxResponse.data && fxResponse.data.tweet) {
            const tweet = fxResponse.data.tweet;
            
            // Build user object for includes
            let userInfo = {
              id: tweet.author?.id || 'unknown',
              username: tweet.author?.screen_name || 'unknown',
              name: tweet.author?.name || 'Unknown'
            };
            
            // If username or name is unknown, try oEmbed as fallback
            if (userInfo.username === 'unknown' || userInfo.name === 'Unknown') {
              const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
              if (oEmbedAuthor) {
                userInfo.username = oEmbedAuthor.username || userInfo.username;
                userInfo.name = oEmbedAuthor.name || userInfo.name;
              }
            }
            
            return res.json({
              data: {
                id: tweetId,
                text: tweet.text || '',
                created_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
                author_id: userInfo.id,
                edit_history_tweet_ids: [tweetId],
                public_metrics: {
                  retweet_count: tweet.retweets || 0,
                  reply_count: tweet.replies || 0,
                  like_count: tweet.likes || 0,
                  quote_count: 0,
                  impression_count: 0
                }
              },
              includes: {
                users: [userInfo]
              }
            });
          }
        } catch (fxError) {
          // Both failed
        }
      }

      return res.status(404).json({
        errors: [{
          message: 'Tweet not found'
        }]
      });
    }

    // GET /2/tweets/search/recent
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[2] === 'search' && pathParts[3] === 'recent') {
      let searchQuery = query.query || query.q;
      
      if (!searchQuery) {
        return res.status(400).json({
          errors: [{
            message: 'Query parameter is required'
          }]
        });
      }

      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);

      // Build Rettiwt search parameters
      const searchParams = {
        includeWords: [searchQuery],
        count: maxResults
      };

      // Add date filtering if provided
      if (query.start_time) {
        const startDate = new Date(query.start_time);
        searchParams.startDate = startDate.toISOString().split('T')[0];
      }
      
      if (query.end_time) {
        const endDate = new Date(query.end_time);
        searchParams.endDate = endDate.toISOString().split('T')[0];
      }

      try {
        // Use Rettiwt for search
        const searchResult = await rettiwt.tweet.search(searchParams);

        // Transform Rettiwt tweets to v2 format
        const tweets = searchResult.list || [];
        const v2Tweets = tweets.slice(0, maxResults).map(tweet => transformRettiwtTweetToV2(tweet));
        
        // Build response
        const response = {
          data: v2Tweets,
          meta: {
            result_count: v2Tweets.length
          }
        };
        
        // Add pagination info if available
        if (v2Tweets.length > 0) {
          response.meta.newest_id = v2Tweets[0].id;
          response.meta.oldest_id = v2Tweets[v2Tweets.length - 1].id;
        }
        
        // Check if expansions were requested
        const expansions = query.expansions?.split(',') || [];
        
        // Add includes if author_id expansion was requested
        if (expansions.includes('author_id') && tweets.length > 0) {
          const users = new Map();
          
          tweets.slice(0, maxResults).forEach(tweet => {
            if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
              users.set(tweet.tweetBy.id, transformRettiwtUserToV2(tweet.tweetBy));
            }
          });
          
          if (users.size > 0) {
            response.includes = {
              users: Array.from(users.values())
            };
          }
        }
        
        return res.json(response);
      } catch (error) {
        console.error('Search error:', error.message);
        return res.json({
          data: [],
          meta: {
            result_count: 0
          }
        });
      }
    }
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'x-guest-token': guestToken
          }
        }
      );

      if (response.data && response.data.length > 0) {
        const trends = response.data[0].trends || [];
        
        return res.json({
          data: trends.map((trend, index) => ({
            id: `trend_${woeid}_${index}`,
            name: trend.name,
            url: trend.url,
            query: trend.query,
            tweet_volume: trend.tweet_volume,
            promoted_content: trend.promoted_content
          })),
          meta: {
            location: response.data[0].locations?.[0] || { name: 'Unknown', woeid },
            as_of: response.data[0].as_of,
            created_at: response.data[0].created_at,
            result_count: trends.length
          }
        });
      }

      return res.json({
        data: [],
        meta: { result_count: 0 }
      });
    }

    // RETTIWT-POWERED ADDITIONAL ENDPOINTS
    
    // GET /2/users/:id/liked_tweets - Get tweets liked by a user
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'liked_tweets') {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      
      try {
        // Rettiwt doesn't have a direct liked_tweets endpoint
        // This would require authenticated access
        return res.status(403).json({
          errors: [{
            message: 'This endpoint requires user authentication',
            code: 'authentication_required'
          }]
        });
      } catch (error) {
        console.error('Liked tweets error:', error.message);
        return res.status(500).json({
          errors: [{
            message: 'Failed to fetch liked tweets'
          }]
        });
      }
    }
    
    // GET /2/tweets/:id/liking_users - Get users who liked a tweet
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[3] === 'liking_users') {
      const tweetId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      
      try {
        // This endpoint typically requires authentication
        // Rettiwt might not support this directly
        return res.status(403).json({
          errors: [{
            message: 'This endpoint requires authentication',
            code: 'authentication_required'
          }]
        });
      } catch (error) {
        console.error('Liking users error:', error.message);
        return res.status(500).json({
          errors: [{
            message: 'Failed to fetch liking users'
          }]
        });
      }
    }
    
    // GET /2/tweets/:id/retweeted_by - Get users who retweeted a tweet
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[3] === 'retweeted_by') {
      const tweetId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      
      try {
        const retweeters = await rettiwt.tweet.retweeters(tweetId);
        
        if (retweeters && retweeters.list) {
          const users = retweeters.list.slice(0, maxResults).map(user => transformRettiwtUserToV2(user));
          
          return res.json({
            data: users,
            meta: {
              result_count: users.length
            }
          });
        }
        
        return res.json({
          data: [],
          meta: {
            result_count: 0
          }
        });
      } catch (error) {
        console.error('Retweeters error:', error.message);
        return res.status(500).json({
          errors: [{
            message: 'Failed to fetch retweeters'
          }]
        });
      }
    }
    
    // GET /2/users/:id/mentions - Get tweets mentioning a user
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'mentions') {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      const paginationToken = query.pagination_token;
      
      try {
        // First, we need to get the username for the user ID
        // Try to get user details from rettiwt or use Nitter
        let username = null;
        
        // Try rettiwt first for user details
        try {
          const userDetails = await rettiwt.user.details(userId);
          if (userDetails && userDetails.userName) {
            username = userDetails.userName;
          }
        } catch (rettiwtError) {
          console.log('Rettiwt user details failed, trying alternative methods');
        }
        
        // If rettiwt failed, try getting user from a timeline request
        if (!username) {
          try {
            const timeline = await rettiwt.user.timeline(userId);
            if (timeline && timeline.list && timeline.list.length > 0) {
              const firstTweet = timeline.list[0];
              if (firstTweet && firstTweet.tweetBy && firstTweet.tweetBy.userName) {
                username = firstTweet.tweetBy.userName;
              }
            }
          } catch (timelineError) {
            console.log('Timeline fetch failed for username');
          }
        }
        
        if (!username) {
          // If we still don't have a username, return an error
          return res.status(404).json({
            errors: [{
              message: 'User not found',
              code: 'resource_not_found'
            }]
          });
        }
        
        // Now use Nitter search to find mentions
        const searchQuery = `@${username}`;
        
        const nitterResponse = await axios.get(
          `${NITTER_API}/search`,
          {
            params: {
              q: searchQuery,
              cursor: paginationToken
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 8000
          }
        );
        
        // Handle both old and new Nitter response formats
        const responseData = nitterResponse.data.data || nitterResponse.data;
        const timeline = responseData.timeline || [];
        const tweets = responseData.tweets || timeline;
        const users = responseData.users || [];
        
        // Check if tweet.fields was requested
        const tweetFields = query['tweet.fields']?.split(',') || [];
        const includeAllFields = tweetFields.length > 0;
        
        // Transform tweets to v2 format
        const v2Tweets = (Array.isArray(tweets) ? tweets : [])
          .slice(0, maxResults)
          .map(tweet => {
            // Handle both formats
            const tweetId = tweet.id || tweet.tweetId;
            const text = tweet.text || tweet.fullText || '';
            const authorId = tweet.userId || tweet.user?.id || 'unknown';
            
            // Convert Unix timestamp if available (Nitter format), otherwise use other date formats
            const dateValue = tweet.time ? new Date(tweet.time * 1000).toISOString() : 
                             tweet.date ? new Date(tweet.date).toISOString() :
                             tweet.createdAt ? new Date(tweet.createdAt).toISOString() :
                             new Date().toISOString();
            
            // Extract username from tweet data or user object
            const username = tweet.user?.username || tweet.user?.screen_name || tweet.username || tweet.screen_name || null;
            
            // Extract profile image from tweet data or user object
            const profileImageUrl = tweet.user?.profile_image_url || tweet.user?.profile_image_url_https || 
                                   tweet.user?.profileImage || tweet.user?.userPic || tweet.user?.avatar || null;
            
            const v2Tweet = {
              id: tweetId,
              text: text,
              created_at: dateValue,
              author_id: authorId,
              edit_history_tweet_ids: [tweetId],
              public_metrics: {
                retweet_count: tweet.retweets || tweet.retweetCount || 0,
                reply_count: tweet.replies || tweet.replyCount || 0,
                like_count: tweet.likes || tweet.likeCount || 0,
                quote_count: tweet.quotes || tweet.quoteCount || 0,
                impression_count: tweet.views || 0
              }
            };
            
            // Add author_username directly to the tweet if available
            if (username) {
              v2Tweet.author_username = username;
            }
            
            // Add author_profile_image directly to the tweet if available
            if (profileImageUrl) {
              v2Tweet.author_profile_image = profileImageUrl.startsWith('http') 
                ? profileImageUrl 
                : `https://pbs.twimg.com/${profileImageUrl.replace(/^\//, '')}`;
            }
            
            // Add additional fields when requested
            if (includeAllFields) {
              // Add conversation_id
              if (tweet.conversationId) {
                v2Tweet.conversation_id = tweet.conversationId;
              } else {
                v2Tweet.conversation_id = tweetId;
              }
              
              // Add language if available
              if (tweet.lang) {
                v2Tweet.lang = tweet.lang;
              }
              
              // Add possibly_sensitive flag
              if (tweet.sensitive !== undefined) {
                v2Tweet.possibly_sensitive = tweet.sensitive;
              }
              
              // Add reply info
              if (tweet.replyTo || tweet.in_reply_to_user_id) {
                v2Tweet.in_reply_to_user_id = tweet.replyTo || tweet.in_reply_to_user_id;
              }
              
              // Add entities if available
              if (tweet.hashtags || tweet.mentions || tweet.urls || tweet.entities) {
                v2Tweet.entities = {};
                
                if (tweet.hashtags && tweet.hashtags.length > 0) {
                  v2Tweet.entities.hashtags = tweet.hashtags;
                } else if (tweet.entities?.hashtags) {
                  v2Tweet.entities.hashtags = tweet.entities.hashtags;
                }
                
                if (tweet.mentions && tweet.mentions.length > 0) {
                  v2Tweet.entities.mentions = tweet.mentions;
                } else if (tweet.entities?.mentions) {
                  v2Tweet.entities.mentions = tweet.entities.mentions;
                }
                
                if (tweet.urls && tweet.urls.length > 0) {
                  v2Tweet.entities.urls = tweet.urls;
                } else if (tweet.entities?.urls) {
                  v2Tweet.entities.urls = tweet.entities.urls;
                }
              }
              
              // Add media attachments
              if (tweet.media && tweet.media.length > 0) {
                v2Tweet.attachments = {
                  media_keys: tweet.media.map(m => m.id || m.url)
                };
              }
            }
            
            return v2Tweet;
          });
        
        // Build meta object
        const metaParams = {
          result_count: v2Tweets.length
        };
        
        if (v2Tweets.length > 0) {
          metaParams.newest_id = v2Tweets[0].id;
          metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
        }
        
        // Check for pagination token
        const cursor = nitterResponse.data.cursor || 
                       responseData.pagination?.bottom || 
                       responseData.pagination?.cursor ||
                       responseData.cursor;
        
        if (cursor) {
          metaParams.next_token = cursor;
        }
        
        const response = {
          data: v2Tweets,
          meta: buildMetaObject(metaParams)
        };
        
        // Build user map from tweets and users data
        const userMap = new Map();
        
        // First, add users from the users array if available
        if (users.length > 0) {
          users.forEach(user => {
            userMap.set(user.id, {
              id: user.id,
              username: user.username,
              name: user.name,
              created_at: user.joined ? new Date(user.joined).toISOString() : undefined,
              protected: user.protected || false,
              description: user.bio || '',
              location: user.location || '',
              url: user.website || '',
              verified: user.verified || false,
              profile_image_url: user.avatar ? (user.avatar.startsWith('http') ? user.avatar : `https://pbs.twimg.com/${user.avatar.replace(/^\//, '')}`) : null,
              public_metrics: {
                followers_count: user.followers || 0,
                following_count: user.following || 0,
                tweet_count: user.tweets || 0,
                listed_count: 0
              }
            });
          });
        }
        
        // Then, extract user data from tweets themselves if not already in map
        (Array.isArray(tweets) ? tweets : []).forEach(tweet => {
          if (tweet.user && !userMap.has(tweet.user.id || tweet.userId)) {
            const userId = tweet.user.id || tweet.userId || tweet.user?.id_str;
            const profileImageUrl = tweet.user.profile_image_url || tweet.user.profile_image_url_https || 
                                   tweet.user.profileImage || tweet.user.userPic || tweet.user.avatar;
            
            userMap.set(userId, {
              id: userId,
              username: tweet.user.username || tweet.user.screen_name || tweet.username,
              name: tweet.user.name || tweet.user.fullName || tweet.user.fullname,
              protected: tweet.user.protected || false,
              description: tweet.user.description || tweet.user.bio || '',
              verified: tweet.user.verified || false,
              profile_image_url: profileImageUrl ? (profileImageUrl.startsWith('http') ? profileImageUrl : `https://pbs.twimg.com/${profileImageUrl.replace(/^\//, '')}`) : null,
              public_metrics: {
                followers_count: tweet.user.followers_count || tweet.user.followers || 0,
                following_count: tweet.user.following_count || tweet.user.following || tweet.user.friends_count || 0,
                tweet_count: tweet.user.statuses_count || tweet.user.tweets || 0,
                listed_count: tweet.user.listed_count || 0
              }
            });
          }
        });
        
        // Add includes if we have user data and expansions requested
        if (query.expansions && userMap.size > 0) {
          response.includes = {
            users: Array.from(userMap.values())
          };
        }
        
        return res.json(response);
      } catch (error) {
        console.error('Mentions error:', error.message);
        return res.status(500).json({
          errors: [{
            message: 'Failed to fetch mentions'
          }]
        });
      }
    }
    
    // GET /2/users/:id/bookmarks - Get user's bookmarked tweets
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'bookmarks') {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      
      try {
        const bookmarks = await rettiwt.user.bookmarks();
        
        if (bookmarks && bookmarks.list) {
          const tweets = bookmarks.list.slice(0, maxResults).map(tweet => transformRettiwtTweetToV2(tweet));
          
          // Build includes section with users if expansion requested
          const expansions = query.expansions?.split(',') || [];
          const response = {
            data: tweets,
            meta: {
              result_count: tweets.length
            }
          };
          
          if (expansions.includes('author_id') && bookmarks.list.length > 0) {
            const users = new Map();
            bookmarks.list.slice(0, maxResults).forEach(tweet => {
              if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
                users.set(tweet.tweetBy.id, transformRettiwtUserToV2(tweet.tweetBy));
              }
            });
            
            if (users.size > 0) {
              response.includes = {
                users: Array.from(users.values())
              };
            }
          }
          
          return res.json(response);
        }
        
        return res.json({
          data: [],
          meta: {
            result_count: 0
          }
        });
      } catch (error) {
        console.error('Bookmarks error:', error.message);
        // Bookmarks require authentication
        return res.status(403).json({
          errors: [{
            message: 'This endpoint requires user authentication',
            code: 'authentication_required'
          }]
        });
      }
    }
    
    // GET /2/users/:id/tweets - Get user's tweets (enhanced with Rettiwt)
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'tweets' && !isNaN(pathParts[2])) {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      
      try {
        const timeline = await rettiwt.user.timeline(userId);
        
        if (timeline && timeline.list) {
          const tweets = timeline.list.slice(0, maxResults).map(tweet => transformRettiwtTweetToV2(tweet));
          
          // Build includes section with users if expansion requested
          const expansions = query.expansions?.split(',') || [];
          const response = {
            data: tweets,
            meta: {
              result_count: tweets.length
            }
          };
          
          if (expansions.includes('author_id') && timeline.list.length > 0) {
            // Get unique user from the timeline
            const firstTweet = timeline.list[0];
            if (firstTweet && firstTweet.tweetBy) {
              response.includes = {
                users: [transformRettiwtUserToV2(firstTweet.tweetBy)]
              };
            }
          }
          
          return res.json(response);
        }
        
        return res.json({
          data: [],
          meta: {
            result_count: 0
          }
        });
      } catch (error) {
        console.error('User tweets error:', error.message);
        return res.status(404).json({
          errors: [{
            message: 'User not found',
            code: 'resource_not_found'
          }]
        });
      }
    }

    // GEO ENDPOINTS

    // GET /2/geo/search
    if (pathParts[0] === '2' && pathParts[1] === 'geo' && pathParts[2] === 'search') {
      const searchQuery = query.query || query.q;
      
      if (!searchQuery) {
        return res.status(400).json({
          errors: [{
            message: 'Query parameter is required'
          }]
        });
      }

      const response = await axios.get(
        `${API_BASE}/1.1/geo/search.json`,
        {
          params: {
            query: searchQuery,
            granularity: query.granularity
          },
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`,
            'x-guest-token': guestToken
          }
        }
      );

      return res.json({
        data: response.data.result?.places || [],
        meta: {
          result_count: response.data.result?.places?.length || 0
        }
      });
    }

    // Default 404
    return res.status(404).json({
      errors: [{
        message: `Endpoint ${path} not found`
      }]
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        errors: [{
          message: 'Rate limit exceeded',
          type: 'rate_limit'
        }]
      });
    }

    return res.status(500).json({
      errors: [{
        message: error.message || 'Internal server error'
      }]
    });
  }
};