const axios = require('axios');
const { Rettiwt } = require('rettiwt-api');

// Configuration
const BEARER_TOKEN = process.env.BEARER_TOKEN || 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const API_BASE = 'https://api.twitter.com';
const NITTER_API = process.env.NITTER_API || 'https://nitter.r2d2.to/api';
const SNAPLYTICS_API = process.env.SNAPLYTICS_API || 'https://twittermedia.b-cdn.net/viewer/';

const ENDPOINT_CATALOG = Object.freeze({
  users: [
    'GET /2/users/:id',
    'GET /2/users/:id/followers',
    'GET /2/users/:id/following',
    'GET /2/users/by/username/:username',
    'GET /2/users/search',
    'GET /2/users/:id/list_memberships',
    'GET /2/users/:id/owned_lists',
    'GET /2/users/:id/followed_lists',
    'GET /2/users/:source_id/following/:target_id'
  ],
  tweets: [
    'GET /2/tweets/:id',
    'GET /2/tweets/search/recent',
    'GET /2/users/:id/tweets',
    'GET /2/users/by/username/:username/tweets',
    'GET /2/tweets/:id/liking_users',
    'GET /2/tweets/:id/retweeted_by'
  ],
  lists: [
    'GET /2/lists/:id',
    'GET /2/lists/:id/members',
    'GET /2/lists/:id/followers',
    'GET /2/lists/:id/tweets'
  ],
  geo: [
    'GET /2/geo/search'
  ],
  other: [
    'GET /2/tweets/search/recent'
  ],
  system: [
    'GET /2/system/init-tokens'
  ]
});

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

  const raw = rettiwtUser.raw ?? {};
  const legacy = raw.legacy ?? {};
  const entities = legacy.entities ?? {};

  const createdAt = rettiwtUser.createdAt
    ? new Date(rettiwtUser.createdAt).toISOString()
    : new Date().toISOString();

  const urlEntity = Array.isArray(entities.url?.urls) ? entities.url.urls[0] : null;

  const user = {
    id: rettiwtUser.id || legacy.rest_id || rettiwtUser.restId,
    username: rettiwtUser.userName || legacy.screen_name,
    name: rettiwtUser.fullName || legacy.name,
    created_at: createdAt,
    protected: legacy.protected ?? false,
    description: rettiwtUser.description ?? legacy.description ?? '',
    location: rettiwtUser.location ?? legacy.location ?? '',
    url: urlEntity?.expanded_url ?? legacy.url ?? null,
    verified: rettiwtUser.isVerified ?? legacy.verified ?? false,
    profile_image_url: rettiwtUser.profileImage ?? legacy.profile_image_url_https ?? null,
    profile_banner_url: rettiwtUser.profileBanner ?? legacy.profile_banner_url ?? null,
    public_metrics: {
      followers_count: rettiwtUser.followersCount ?? legacy.followers_count ?? 0,
      following_count: rettiwtUser.followingsCount ?? legacy.friends_count ?? 0,
      tweet_count: rettiwtUser.statusesCount ?? legacy.statuses_count ?? 0,
      listed_count: legacy.listed_count ?? 0,
      like_count: rettiwtUser.likeCount ?? legacy.favourites_count ?? 0
    }
  };

  if (legacy.verified_type) {
    user.verified_type = legacy.verified_type;
  }

  if (rettiwtUser.pinnedTweet) {
    user.pinned_tweet_id = rettiwtUser.pinnedTweet;
  } else if (Array.isArray(legacy.pinned_tweet_ids_str) && legacy.pinned_tweet_ids_str.length > 0) {
    user.pinned_tweet_id = legacy.pinned_tweet_ids_str[0];
  }

  if (entities.description) {
    user.entities = {
      description: entities.description
    };
  }

  if (entities.url) {
    user.entities = {
      ...(user.entities || {}),
      url: entities.url
    };
  }

  if (legacy.withheld_in_countries && legacy.withheld_in_countries.length > 0) {
    user.withheld = {
      scope: legacy.withheld_scope || 'user',
      country_codes: legacy.withheld_in_countries
    };
  }

  return user;
}

function stripHtml(input) {
  if (!input) return '';
  return input.replace(/<[^>]+>/g, '');
}

function prependMediaUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `https://pbs.twimg.com/${path}`;
}

function transformNitterUserToV2(nitterUser) {
  if (!nitterUser) return null;

  const joinDate = Number(nitterUser.joinDate);
  const createdAt = Number.isFinite(joinDate) ? new Date(joinDate * 1000).toISOString() : new Date().toISOString();

  const publicMetrics = {
    followers_count: nitterUser.followers || 0,
    following_count: nitterUser.following || 0,
    tweet_count: nitterUser.tweets || 0,
    listed_count: 0,
    like_count: nitterUser.likes || 0
  };

  const user = {
    id: nitterUser.id ? nitterUser.id.toString() : undefined,
    username: nitterUser.username,
    name: nitterUser.fullname || nitterUser.username,
    created_at: createdAt,
    protected: Boolean(nitterUser.protected),
    description: stripHtml(nitterUser.bio || ''),
    location: nitterUser.location || '',
    url: nitterUser.website || '',
    verified: Boolean(nitterUser.verifiedType && nitterUser.verifiedType !== 'None'),
    profile_image_url: prependMediaUrl(nitterUser.userPic),
    profile_banner_url: prependMediaUrl(nitterUser.banner),
    public_metrics: publicMetrics
  };

  if (nitterUser.verifiedType && nitterUser.verifiedType !== 'None') {
    user.verified_type = nitterUser.verifiedType.toLowerCase();
  }

  if (nitterUser.pinnedTweet && nitterUser.pinnedTweet !== 0) {
    user.pinned_tweet_id = nitterUser.pinnedTweet.toString();
  }

  return user;
}

async function fetchRettiwtUserProfile(identifier, fieldsParam) {
  if (!identifier && identifier !== 0) {
    return null;
  }

  try {
    const target = String(identifier).trim();
    const detail = await rettiwt.user.details(target);
    const user = transformRettiwtUserToV2(detail);
    return applyUserFieldFilter(user, fieldsParam);
  } catch (error) {
    console.error('Rettiwt user details error:', error.message);
    return null;
  }
}

async function fetchUserProfile(identifier, userFieldsParam) {
  const userFromRettiwt = await fetchRettiwtUserProfile(identifier, userFieldsParam);
  if (userFromRettiwt && !Array.isArray(userFromRettiwt)) {
    return userFromRettiwt;
  }

  const candidate = typeof identifier === 'string' ? identifier.trim() : String(identifier);
  if (/^\d+$/.test(candidate)) {
    return null;
  }

  const nitterUser = await fetchNitterUser(candidate.replace(/^@/, ''));
  return applyUserFieldFilter(nitterUser, userFieldsParam);
}

const DEFAULT_USER_FIELDS = Object.freeze([
  'id',
  'name',
  'username',
  'created_at',
  'description',
  'entities',
  'location',
  'pinned_tweet_id',
  'profile_image_url',
  'protected',
  'public_metrics',
  'url',
  'verified',
  'verified_type'
]);

const DEFAULT_LIST_FIELDS = Object.freeze([
  'id',
  'name',
  'description',
  'owner_id',
  'created_at',
  'private',
  'follower_count',
  'member_count'
]);

const DEFAULT_TWEET_FIELDS = Object.freeze([
  'id',
  'text',
  'edit_history_tweet_ids'
]);

function normalizeFieldList(value, defaults) {
  if (!value) {
    return new Set(defaults);
  }

  if (Array.isArray(value)) {
    value = value.join(',');
  }

  return new Set(
    String(value)
      .split(',')
      .map(field => field.trim())
      .filter(Boolean)
  );
}

function applyUserFieldFilter(user, fieldsParam, extraAlways = []) {
  if (!user) return user;

  const fieldSet = normalizeFieldList(fieldsParam, DEFAULT_USER_FIELDS);
  ['id', 'name', 'username', ...extraAlways].forEach(f => fieldSet.add(f));

  const filtered = {};
  for (const field of fieldSet) {
    if (user[field] !== undefined) {
      filtered[field] = user[field];
    }
  }

  return filtered;
}

function applyTweetFieldFilter(tweet, fieldsParam, extraAlways = []) {
  if (!tweet) return tweet;

  const fieldSet = normalizeFieldList(fieldsParam, DEFAULT_TWEET_FIELDS);
  ['id', 'text', 'edit_history_tweet_ids', ...extraAlways].forEach(f => fieldSet.add(f));

  const filtered = {};
  for (const field of fieldSet) {
    if (tweet[field] !== undefined) {
      filtered[field] = tweet[field];
    }
  }

  return filtered;
}

function applyListFieldFilter(list, fieldsParam, extraAlways = []) {
  if (!list) return list;

  const fieldSet = normalizeFieldList(fieldsParam, DEFAULT_LIST_FIELDS);
  ['id', 'name', ...extraAlways].forEach(f => fieldSet.add(f));

  const filtered = {};
  for (const field of fieldSet) {
    if (list[field] !== undefined) {
      filtered[field] = list[field];
    }
  }

  return filtered;
}

const DEFAULT_MEDIA_FIELDS = Object.freeze([
  'media_key',
  'type'
]);

function resolveMediaKey(media) {
  if (!media) return undefined;
  const candidates = [
    media.media_key,
    media.mediaKey,
    media.media_id,
    media.mediaId,
    media.media_id_string,
    media.mediaIdString,
    media.id_str,
    media.id,
    media.key,
    media.url,
    media.src,
    media.path,
    media.asset_id,
    media.assetId
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const key = String(candidate).trim();
    if (key.length > 0) {
      return key;
    }
  }

  return undefined;
}

function mergeDefinedProperties(base, update) {
  if (!base) return update;
  if (!update) return base;

  const merged = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  return merged;
}

function transformMediaEntityToV2(media) {
  if (!media) return null;

  if (typeof media === 'string') {
    media = { url: media };
  }

  const mediaKey = resolveMediaKey(media);
  if (!mediaKey) return null;

  const inferredType =
    media.type ||
    media.media_type ||
    media.mediaCategory ||
    (Array.isArray(media.variants) && media.variants.length > 0 ? 'video' : undefined) ||
    (media.duration_ms || media.durationMs || media.duration ? 'video' : undefined) ||
    (media.preview_image_url || media.previewUrl ? 'video' : undefined) ||
    undefined;

  const v2Media = {
    media_key: mediaKey,
    type: (inferredType || '').toLowerCase() || 'photo'
  };

  const urlCandidate =
    media.url ||
    media.media_url_https ||
    media.media_url ||
    media.full_url ||
    media.src ||
    media.source ||
    media.display_url;

  if (urlCandidate) {
    v2Media.url = prependMediaUrl(urlCandidate);
  }

  const previewCandidate =
    media.preview_image_url ||
    media.previewUrl ||
    media.thumbnail_url ||
    media.poster ||
    media.thumbnail;

  if (previewCandidate) {
    v2Media.preview_image_url = prependMediaUrl(previewCandidate);
  }

  const height =
    media.height ??
    media.original_info?.height ??
    media.sizes?.large?.h ??
    media.sizes?.medium?.h;

  const width =
    media.width ??
    media.original_info?.width ??
    media.sizes?.large?.w ??
    media.sizes?.medium?.w;

  if (Number.isFinite(height)) {
    v2Media.height = height;
  }

  if (Number.isFinite(width)) {
    v2Media.width = width;
  }

  const duration =
    media.duration_ms ??
    media.durationMs ??
    media.duration ??
    media.video_info?.duration_millis;

  if (Number.isFinite(duration)) {
    v2Media.duration_ms = duration;
  }

  const altText = media.alt_text || media.altText || media.ext_alt_text;
  if (altText) {
    v2Media.alt_text = altText;
  }

  const variantsSource =
    media.variants ||
    media.video_info?.variants ||
    media.videoVariants ||
    media.video_versions;

  if (Array.isArray(variantsSource) && variantsSource.length > 0) {
    v2Media.variants = variantsSource
      .map(variant => {
        if (!variant) return null;
        const contentType = variant.content_type || variant.contentType || variant.type;
        const url = variant.url || variant.src || variant.location;
        if (!contentType && !url) {
          return null;
        }
        const bitRate = variant.bit_rate ?? variant.bitRate ?? variant.bitrate;
        const variantObj = {};
        if (Number.isFinite(bitRate)) {
          variantObj.bit_rate = bitRate;
        }
        if (contentType) {
          variantObj.content_type = contentType;
        }
        if (url) {
          variantObj.url = prependMediaUrl(url);
        }
        return Object.keys(variantObj).length > 0 ? variantObj : null;
      })
      .filter(Boolean);

    if (v2Media.variants.length === 0) {
      delete v2Media.variants;
    }
  }

  if (media.additional_media_info) {
    v2Media.additional_info = media.additional_media_info;
  } else if (media.additionalInfo) {
    v2Media.additional_info = media.additionalInfo;
  }

  return v2Media;
}

function collectMediaEntities(mediaSource, collector) {
  if (!collector || !mediaSource) return;

  let items = [];

  if (Array.isArray(mediaSource)) {
    items = mediaSource;
  } else if (typeof mediaSource === 'object') {
    const candidateArrays = [
      mediaSource.all,
      mediaSource.photos,
      mediaSource.videos,
      mediaSource.video,
      mediaSource.gifs,
      mediaSource.gif,
      mediaSource.items,
      mediaSource.media
    ];

    candidateArrays.forEach(arr => {
      if (Array.isArray(arr)) {
        items.push(...arr);
      }
    });

    for (const value of Object.values(mediaSource)) {
      if (Array.isArray(value)) {
        items.push(...value);
      }
    }

    if (items.length === 0) {
      items = [mediaSource];
    }
  } else {
    items = [mediaSource];
  }

  for (const media of items) {
    const v2Media = transformMediaEntityToV2(media);
    if (!v2Media || !v2Media.media_key) continue;
    const existing = collector.get(v2Media.media_key);
    collector.set(v2Media.media_key, mergeDefinedProperties(existing, v2Media));
  }
}

function applyMediaFieldFilter(media, fieldsParam, extraAlways = []) {
  if (!media) return media;

  const fieldSet = normalizeFieldList(fieldsParam, DEFAULT_MEDIA_FIELDS);
  ['media_key', 'type', ...extraAlways].forEach(f => fieldSet.add(f));

  const filtered = {};
  for (const field of fieldSet) {
    if (media[field] !== undefined) {
      filtered[field] = media[field];
    }
  }
  return filtered;
}

function buildMediaIncludes(mediaCollector, mediaFieldsParam) {
  if (!mediaCollector || mediaCollector.size === 0) {
    return undefined;
  }

  const mediaList = Array.from(mediaCollector.values())
    .map(media => applyMediaFieldFilter(media, mediaFieldsParam))
    .filter(Boolean);

  return mediaList.length > 0 ? mediaList : undefined;
}

function appendMediaIncludes(target, mediaCollector, mediaFieldsParam) {
  if (!target) return target;
  const mediaIncludes = buildMediaIncludes(mediaCollector, mediaFieldsParam);
  if (!mediaIncludes) return target;

  if (!target.includes) {
    target.includes = {};
  }

  target.includes.media = mediaIncludes;
  return target;
}

function transformTypeaheadUserToV2(typeaheadUser) {
  if (!typeaheadUser) return null;

  const createdAt = typeaheadUser.created_at
    ? new Date(typeaheadUser.created_at).toISOString()
    : new Date().toISOString();

  return {
    id: typeaheadUser.id_str || typeaheadUser.id?.toString(),
    username: typeaheadUser.screen_name,
    name: typeaheadUser.name,
    created_at: createdAt,
    protected: Boolean(typeaheadUser.protected),
    description: typeaheadUser.description || '',
    location: typeaheadUser.location || '',
    url: typeaheadUser.url || '',
    verified: Boolean(typeaheadUser.verified),
    profile_image_url: typeaheadUser.profile_image_url_https || typeaheadUser.profile_image_url,
    public_metrics: {
      followers_count: Number(typeaheadUser.followers_count) || 0,
      following_count: Number(typeaheadUser.friends_count) || 0,
      tweet_count: Number(typeaheadUser.statuses_count) || 0,
      listed_count: Number(typeaheadUser.listed_count) || 0,
      like_count: Number(typeaheadUser.favourites_count) || 0
    }
  };
}

function transformListToV2(listData) {
  if (!listData) return null;

  const createdAt = listData.created_at ? new Date(listData.created_at).toISOString() : new Date().toISOString();

  const v2List = {
    id: listData.id_str || listData.id?.toString(),
    name: listData.name,
    description: listData.description || '',
    created_at: createdAt,
    private: listData.mode === 'private',
    owner_id: listData.user?.id_str || listData.user?.id?.toString() || undefined,
    follower_count: listData.subscriber_count || 0,
    member_count: listData.member_count || 0,
    slug: listData.slug,
    url: listData.uri ? `https://twitter.com${listData.uri}` : undefined
  };

  if (listData.full_name) {
    v2List.full_name = listData.full_name;
  }

  if (listData.entities?.description?.urls?.length) {
    v2List.description_urls = listData.entities.description.urls.map(url => ({
      url: url.url,
      expanded_url: url.expanded_url,
      display_url: url.display_url
    }));
  }

  return v2List;
}

async function fetchTwitterV1(path, params = {}, timeout = 5000) {
  const guestToken = await getGuestToken();
  const response = await axios.get(
    `${API_BASE}/1.1/${path}`,
    {
      params,
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`,
        'x-guest-token': guestToken
      },
      timeout
    }
  );
  return response.data;
}

function getFirstFiniteNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return undefined;
}

async function fetchTweetMetrics(tweetId) {
  try {
    const response = await axios.get(
      `https://api.fxtwitter.com/Twitter/status/${tweetId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 5000
      }
    );

    const tweet = response.data?.tweet;
    if (!tweet) return null;

    const author = tweet.author || {};
    const publicMetricsSource =
      tweet.public_metrics ||
      tweet.publicMetrics ||
      tweet.stats ||
      tweet.legacy?.public_metrics ||
      tweet.original_tweet?.public_metrics ||
      {};

    const likeCount = getFirstFiniteNumber(
      publicMetricsSource.like_count,
      publicMetricsSource.favorite_count,
      tweet.likes,
      tweet.like_count,
      tweet.favorite_count,
      tweet.stats?.likes,
      tweet.legacy?.favorite_count
    );

    const retweetCount = getFirstFiniteNumber(
      publicMetricsSource.retweet_count,
      publicMetricsSource.repost_count,
      tweet.retweets,
      tweet.retweet_count,
      tweet.reposts,
      tweet.stats?.retweets
    );

    const replyCount = getFirstFiniteNumber(
      publicMetricsSource.reply_count,
      tweet.replies,
      tweet.reply_count,
      tweet.conversation_count,
      tweet.stats?.replies
    );

    const quoteCount = getFirstFiniteNumber(
      publicMetricsSource.quote_count,
      tweet.quotes,
      tweet.quote_count,
      tweet.stats?.quotes
    );

    const bookmarkCount = getFirstFiniteNumber(
      publicMetricsSource.bookmark_count,
      tweet.bookmarks,
      tweet.bookmark_count,
      tweet.stats?.bookmarks
    );

    const impressionCount = getFirstFiniteNumber(
      publicMetricsSource.impression_count,
      tweet.impression_count,
      tweet.impressionCount,
      tweet.stats?.impressions,
      tweet.views,
      tweet.view_count
    );

    const viewCount = getFirstFiniteNumber(
      publicMetricsSource.view_count,
      tweet.view_count,
      tweet.views,
      tweet.stats?.views
    );

    const publicMetrics = {
      like_count: likeCount ?? 0,
      retweet_count: retweetCount ?? 0,
      reply_count: replyCount ?? 0,
      quote_count: quoteCount ?? 0
    };

    if (bookmarkCount !== undefined) {
      publicMetrics.bookmark_count = bookmarkCount;
    }

    if (viewCount !== undefined) {
      publicMetrics.view_count = viewCount;
    }

    if (impressionCount !== undefined) {
      publicMetrics.impression_count = impressionCount;
    } else if (viewCount !== undefined) {
      publicMetrics.impression_count = viewCount;
    }

    return {
      ...publicMetrics,
      username: author.screen_name || author.username || null,
      public_metrics: publicMetrics
    };
  } catch (error) {
    console.error('Tweet metrics fetch error:', error.message);
    return null;
  }
}

async function fetchNitterUser(username) {
  try {
    const response = await axios.get(
      `${NITTER_API}/${encodeURIComponent(username)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 8000
      }
    );

    const data = response.data?.data;
    if (!data) {
      return null;
    }

    const userData = data.user || (Array.isArray(data.timeline) && data.timeline.length > 0 ? data.timeline[0].user : null);
    if (!userData) {
      return null;
    }

    const user = transformNitterUserToV2(userData);
    if (!user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Nitter user fetch error:', error.message);
    return null;
  }
}

function parsePaginationToken(token) {
  if (!token) {
    return { cursor: undefined, offset: 0 };
  }

  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          cursor: parsed.cursor === null ? undefined : parsed.cursor,
          offset: Number(parsed.offset) || 0
        };
      }
    } catch (_) {
      // Not JSON, treat the decoded value as the raw cursor
      return {
        cursor: raw || undefined,
        offset: 0
      };
    }
  } catch (_) {
    // Token was not base64 encoded, treat as raw cursor
    return {
      cursor: token,
      offset: 0
    };
  }

  return { cursor: undefined, offset: 0 };
}

function encodePaginationToken(cursor, offset = 0) {
  const normalizedCursor = cursor === undefined ? null : cursor;
  if (normalizedCursor === null && (!offset || offset === 0)) {
    return undefined;
  }

  const payload = {
    cursor: normalizedCursor,
    offset: offset || 0
  };

  try {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  } catch (_) {
    return undefined;
  }
}

// Transform Rettiwt tweet to Twitter v2 format
function transformRettiwtTweetToV2(rettiwtTweet, options = {}) {
  if (!rettiwtTweet) return null;

  let mediaCollector;

  if (options && typeof options === 'object') {
    mediaCollector = options.mediaCollector;
  }
  
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
  if (Array.isArray(rettiwtTweet.media) && rettiwtTweet.media.length > 0) {
    const mediaKeys = rettiwtTweet.media
      .map(resolveMediaKey)
      .filter(Boolean);

    if (mediaKeys.length > 0) {
      v2Tweet.attachments = {
        media_keys: mediaKeys
      };
    }

    collectMediaEntities(rettiwtTweet.media, mediaCollector);
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

function buildV2TweetFromRettiwt(rettiwtTweet, { tweetFieldsParam, userFieldsParam, mediaCollector } = {}) {
  const v2Tweet = transformRettiwtTweetToV2(rettiwtTweet, { mediaCollector });
  if (!v2Tweet) return null;

  const filteredTweet = applyTweetFieldFilter(v2Tweet, tweetFieldsParam);

  let author;
  if (rettiwtTweet.tweetBy) {
    const authorCandidate = transformRettiwtUserToV2(rettiwtTweet.tweetBy);
    if (authorCandidate) {
      author = applyUserFieldFilter(authorCandidate, userFieldsParam);
    }
  }

  return { tweet: filteredTweet, author };
}

function buildV2TweetFromV1(v1Tweet, { tweetFieldsParam, userFieldsParam, mediaCollector } = {}) {
  if (!v1Tweet) return null;

  const expansions = {};
  const v2Tweet = transformTweetToV2(v1Tweet, true, expansions, mediaCollector);
  if (!v2Tweet) return null;

  const filteredTweet = applyTweetFieldFilter(v2Tweet, tweetFieldsParam);

  let author;
  if (v1Tweet.user) {
    const authorCandidate = transformUserToV2(v1Tweet.user, true);
    if (authorCandidate) {
      author = applyUserFieldFilter(authorCandidate, userFieldsParam);
    }
  }

  return { tweet: filteredTweet, author };
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
function transformTweetToV2(v1Tweet, includeAllFields = false, expansions = {}, mediaCollector) {
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
        expansions.retweetedTweets.push(transformTweetToV2(v1Tweet.retweeted_status, includeAllFields, {}, mediaCollector));
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
        expansions.quotedTweets.push(transformTweetToV2(v1Tweet.quoted_status, includeAllFields, {}, mediaCollector));
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
      if (Array.isArray(mediaEntities) && mediaEntities.length > 0) {
        const mediaKeys = mediaEntities
          .map(resolveMediaKey)
          .filter(Boolean);

        if (mediaKeys.length > 0) {
          v2Tweet.attachments = {
            media_keys: mediaKeys
          };
        }

        collectMediaEntities(mediaEntities, mediaCollector);
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
  const pathParts = path.split('/').filter(p => p);
  const authRequired = (detail = 'You are not allowed to use this endpoint', type = 'https://api.twitter.com/2/problems/client-not-enrolled') =>
    res.status(403).json({
      errors: [{
        title: 'Forbidden',
        detail,
        type
      }]
    });

  const resourceNotFound = (resourceType, value, parameter = 'id') =>
    res.status(404).json({
      errors: [{
        title: 'Not Found Error',
        detail: `Could not find ${resourceType} with referenced ${parameter}`,
        type: 'https://api.twitter.com/2/problems/resource-not-found',
        resource_type: resourceType,
        parameter,
        value,
        resource_id: value
      }]
    });

  try {

    // Root endpoint
    if (path === '/' || path === '') {
      return res.json({
        name: 'Twitter v2 API Proxy',
        version: '1.0.0',
        endpoints: {
          users: ENDPOINT_CATALOG.users,
          tweets: ENDPOINT_CATALOG.tweets,
          lists: ENDPOINT_CATALOG.lists,
          system: ENDPOINT_CATALOG.system
        },
        note: 'This proxy provides FREE access to Twitter v2 API endpoints using rotating guest tokens to bypass rate limits'
      });
    }

    if (path === '/health') {
      const hasActiveGuestToken = Array.isArray(tokenPool.tokens)
        && tokenPool.tokens.some(token => token.expires > Date.now());

      return res.json({
        status: 'ok',
        guestTokenActive: hasActiveGuestToken,
        endpoints: {
          users: ENDPOINT_CATALOG.users,
          tweets: ENDPOINT_CATALOG.tweets,
          lists: ENDPOINT_CATALOG.lists,
          geo: ENDPOINT_CATALOG.geo,
          other: ENDPOINT_CATALOG.other,
          system: ENDPOINT_CATALOG.system
        }
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

    // USERS ENDPOINTS
    
    // GET /2/users/:id/followers
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 4 && pathParts[3] === 'followers') {
      const userId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const userFieldsParam = query['user.fields'];
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const followers = await rettiwt.user.followers(userId, desiredCount, fetchCursor);
        const list = Array.isArray(followers.list) ? followers.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const users = list
          .slice(safeOffset, endIndex)
          .map(user => transformRettiwtUserToV2(user))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        let nextCursor = undefined;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursor = fetchCursor;
          nextOffset = endIndex;
        } else if (followers.next) {
          nextCursor = followers.next;
          nextOffset = 0;
        }

        const nextToken = encodePaginationToken(nextCursor, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        console.error('Rettiwt followers error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Rettiwt unavailable for followers lookup',
            detail: error.message,
            code: 'rettiwt_unavailable'
          }]
        });
      }
    }

    // GET /2/users/:id/following
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 4 && pathParts[3] === 'following') {
      const userId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;
      const userFieldsParam = query['user.fields'];

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const following = await rettiwt.user.following(userId, desiredCount, fetchCursor);
        const list = Array.isArray(following.list) ? following.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const users = list
          .slice(safeOffset, endIndex)
          .map(user => transformRettiwtUserToV2(user))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        let nextCursor = undefined;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursor = fetchCursor;
          nextOffset = endIndex;
        } else if (following.next) {
          nextCursor = following.next;
          nextOffset = 0;
        }

        const nextToken = encodePaginationToken(nextCursor, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        console.error('Rettiwt following error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Rettiwt unavailable for following lookup',
            detail: error.message,
            code: 'rettiwt_unavailable'
          }]
        });
      }
    }

    // GET /2/users/:source_id/following/:target_id
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'following' && pathParts.length === 5) {
      const sourceId = pathParts[2];
      const targetId = pathParts[4];

      try {
        const relationshipData = await fetchTwitterV1('friendships/show.json', {
          source_id: sourceId,
          target_id: targetId,
          include_entities: true
        }, 4000);

        const relationship = relationshipData?.relationship;
        if (!relationship) {
          return res.status(404).json({
            errors: [{
              message: 'Relationship not found',
              code: 'resource_not_found'
            }]
          });
        }

        return res.json({
          data: {
            following: Boolean(relationship.source?.following),
            pending_follow: Boolean(relationship.source?.following_requested),
            muting: Boolean(relationship.source?.muting),
            blocking: Boolean(relationship.source?.blocking)
          }
        });
      } catch (error) {
        console.error('Relationship lookup error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Relationship lookup unavailable',
            detail: error.message,
            code: 'relationship_unavailable'
          }]
        });
      }
    }

    // GET /2/lists/:id
    if (pathParts[0] === '2' && pathParts[1] === 'lists' && pathParts.length === 3) {
      const listId = pathParts[2];
      const userFieldsParam = query['user.fields'];
      const listFieldsParam = query['list.fields'];

      try {
        const listData = await fetchTwitterV1('lists/show.json', { list_id: listId });

        const v2List = transformListToV2(listData);
        if (!v2List) {
          return res.status(404).json({
            errors: [{
              message: 'List not found',
              code: 'resource_not_found'
            }]
          });
        }

        const result = { data: applyListFieldFilter(v2List, listFieldsParam) };

        const expansions = query.expansions?.split(',') || [];
        if (expansions.includes('owner_id') && listData.user) {
          const owner = transformUserToV2(listData.user, true);
          if (owner) {
            result.includes = { users: [applyUserFieldFilter(owner, userFieldsParam)] };
          }
        }

        return res.json(result);
      } catch (error) {
        const status = error.response?.status;
        if (status === 404) {
          return res.status(404).json({
            errors: [{
              message: 'List not found',
              code: 'resource_not_found'
            }]
          });
        }

        console.error('List details error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'List details unavailable',
            detail: error.message,
            code: 'list_unavailable'
          }]
        });
      }
    }

    // GET /2/lists/:id/followers
    if (pathParts[0] === '2' && pathParts[1] === 'lists' && pathParts[3] === 'followers') {
      const listId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const v1Cursor = cursor ?? '-1';
      const userFieldsParam = query['user.fields'];
      const includeAllFields = Boolean(userFieldsParam);

      try {
        const data = await fetchTwitterV1('lists/subscribers.json', {
          list_id: listId,
          count: maxResults,
          cursor: v1Cursor,
          include_entities: true,
          skip_status: true
        });

        const users = (data.users || [])
          .map(user => transformUserToV2(user, includeAllFields))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        if (data.next_cursor_str && data.next_cursor_str !== '0') {
          metaParams.next_token = encodePaginationToken(data.next_cursor_str, 0);
        }
        if (data.previous_cursor_str && data.previous_cursor_str !== '0') {
          metaParams.previous_token = encodePaginationToken(data.previous_cursor_str, 0);
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        const status = error.response?.status;
        if (status === 404) {
          return res.status(404).json({
            errors: [{
              message: 'List not found',
              code: 'resource_not_found'
            }]
          });
        }

        console.error('List followers error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'List followers unavailable',
            detail: error.message,
            code: 'list_followers_unavailable'
          }]
        });
      }
    }

    // GET /2/lists/:id/members
    if (pathParts[0] === '2' && pathParts[1] === 'lists' && pathParts[3] === 'members') {
      const listId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const members = await rettiwt.list.members(listId, desiredCount, fetchCursor);
        const list = Array.isArray(members.list) ? members.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const users = list
          .slice(safeOffset, endIndex)
          .map(user => transformRettiwtUserToV2(user))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        let nextCursorValue;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursorValue = fetchCursor;
          nextOffset = endIndex;
        } else if (members.next) {
          nextCursorValue = members.next;
        }

        const nextToken = encodePaginationToken(nextCursorValue, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        console.error('List members error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'List members unavailable',
            detail: error.message,
            code: 'list_members_unavailable'
          }]
        });
      }
    }

    // GET /2/lists/:id/tweets
    if (pathParts[0] === '2' && pathParts[1] === 'lists' && pathParts[3] === 'tweets') {
      const listId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const mediaFieldsParam = query['media.fields'];
      const expansions = query.expansions?.split(',') || [];
      const includeAuthorExpansion = expansions.includes('author_id');
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      const mediaCollector = includeMediaExpansion ? new Map() : null;

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const listTimeline = await rettiwt.list.tweets(listId, desiredCount, fetchCursor);
        const list = Array.isArray(listTimeline.list) ? listTimeline.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const tweets = list
          .slice(safeOffset, endIndex)
          .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
          .filter(Boolean)
          .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));

        const metaParams = {
          result_count: tweets.length
        };

        let nextCursorValue;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursorValue = fetchCursor;
          nextOffset = endIndex;
        } else if (listTimeline.next) {
          nextCursorValue = listTimeline.next;
        }

        const nextToken = encodePaginationToken(nextCursorValue, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        const response = {
          data: tweets,
          meta: buildMetaObject(metaParams)
        };

        if (includeAuthorExpansion && list.length > 0) {
          const users = new Map();
          list.slice(safeOffset, endIndex).forEach(tweet => {
            if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
              const user = transformRettiwtUserToV2(tweet.tweetBy);
              if (user) {
                users.set(user.id, applyUserFieldFilter(user, userFieldsParam));
              }
            }
          });

          if (users.size > 0) {
            response.includes = {
              users: Array.from(users.values())
            };
          }
        }

        appendMediaIncludes(response, mediaCollector, mediaFieldsParam);

        return res.json(response);
      } catch (error) {
        console.error('List tweets error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'List tweets unavailable',
            detail: error.message,
            code: 'list_tweets_unavailable'
          }]
        });
      }
    }

    // GET /2/users/:id/list_memberships
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'list_memberships') {
      const userId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor } = parsePaginationToken(query.pagination_token);
      const v1Cursor = cursor ?? '-1';
      const userFieldsParam = query['user.fields'];

      try {
        const data = await fetchTwitterV1('lists/memberships.json', {
          user_id: userId,
          count: maxResults,
          cursor: v1Cursor,
          include_entities: true
        });

        const rawLists = Array.isArray(data.lists) ? data.lists : [];
        const listFieldsParam = query['list.fields'];
        const lists = rawLists
          .map(transformListToV2)
          .filter(Boolean)
          .map(list => applyListFieldFilter(list, listFieldsParam));

        const metaParams = {
          result_count: lists.length
        };

        if (data.next_cursor_str && data.next_cursor_str !== '0') {
          metaParams.next_token = encodePaginationToken(data.next_cursor_str, 0);
        }
        if (data.previous_cursor_str && data.previous_cursor_str !== '0') {
          metaParams.previous_token = encodePaginationToken(data.previous_cursor_str, 0);
        }

        const response = {
          data: lists,
          meta: buildMetaObject(metaParams)
        };

        const expansions = query.expansions?.split(',') || [];
        if (expansions.includes('owner_id')) {
          const owners = new Map();
          rawLists.forEach(list => {
            if (list.user) {
              const owner = transformUserToV2(list.user, true);
              if (owner && owner.id && !owners.has(owner.id)) {
                owners.set(owner.id, applyUserFieldFilter(owner, userFieldsParam));
              }
            }
          });
          if (owners.size > 0) {
            response.includes = { users: Array.from(owners.values()) };
          }
        }

        return res.json(response);
      } catch (error) {
        console.error('List memberships error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'List memberships unavailable',
            detail: error.message,
            code: 'list_memberships_unavailable'
          }]
        });
      }
    }

    // GET /2/users/:id/owned_lists
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'owned_lists') {
      const userId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor } = parsePaginationToken(query.pagination_token);
      const v1Cursor = cursor ?? '-1';

      try {
        const data = await fetchTwitterV1('lists/ownerships.json', {
          user_id: userId,
          count: maxResults,
          cursor: v1Cursor,
          include_entities: true
        });

        const rawLists = Array.isArray(data.lists) ? data.lists : [];
        const listFieldsParam = query['list.fields'];
        const lists = rawLists
          .map(transformListToV2)
          .filter(Boolean)
          .map(list => applyListFieldFilter(list, listFieldsParam));

        const metaParams = {
          result_count: lists.length
        };

        if (data.next_cursor_str && data.next_cursor_str !== '0') {
          metaParams.next_token = encodePaginationToken(data.next_cursor_str, 0);
        }
        if (data.previous_cursor_str && data.previous_cursor_str !== '0') {
          metaParams.previous_token = encodePaginationToken(data.previous_cursor_str, 0);
        }

        const response = {
          data: lists,
          meta: buildMetaObject(metaParams)
        };

        const expansions = query.expansions?.split(',') || [];
        if (expansions.includes('owner_id')) {
          const owners = new Map();
          rawLists.forEach(list => {
            if (list.user) {
              const owner = transformUserToV2(list.user, true);
              if (owner && owner.id && !owners.has(owner.id)) {
                owners.set(owner.id, applyUserFieldFilter(owner, userFieldsParam));
              }
            }
          });
          if (owners.size > 0) {
            response.includes = { users: Array.from(owners.values()) };
          }
        }

        return res.json(response);
      } catch (error) {
        console.error('Owned lists error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Owned lists unavailable',
            detail: error.message,
            code: 'owned_lists_unavailable'
          }]
        });
      }
    }

    // GET /2/users/:id/followed_lists
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'followed_lists') {
      const userId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor } = parsePaginationToken(query.pagination_token);
      const v1Cursor = cursor ?? '-1';

      try {
        const data = await fetchTwitterV1('lists/subscriptions.json', {
          user_id: userId,
          count: maxResults,
          cursor: v1Cursor,
          include_entities: true
        });

        const rawLists = Array.isArray(data.lists) ? data.lists : [];
        const listFieldsParam = query['list.fields'];
        const lists = rawLists
          .map(transformListToV2)
          .filter(Boolean)
          .map(list => applyListFieldFilter(list, listFieldsParam));

        const metaParams = {
          result_count: lists.length
        };

        if (data.next_cursor_str && data.next_cursor_str !== '0') {
          metaParams.next_token = encodePaginationToken(data.next_cursor_str, 0);
        }
        if (data.previous_cursor_str && data.previous_cursor_str !== '0') {
          metaParams.previous_token = encodePaginationToken(data.previous_cursor_str, 0);
        }

        const response = {
          data: lists,
          meta: buildMetaObject(metaParams)
        };

        const expansions = query.expansions?.split(',') || [];
        if (expansions.includes('owner_id')) {
          const owners = new Map();
          rawLists.forEach(list => {
            if (list.user) {
              const owner = transformUserToV2(list.user, true);
              if (owner && owner.id && !owners.has(owner.id)) {
                owners.set(owner.id, applyUserFieldFilter(owner, userFieldsParam));
              }
            }
          });
          if (owners.size > 0) {
            response.includes = { users: Array.from(owners.values()) };
          }
        }

        return res.json(response);
      } catch (error) {
        console.error('Followed lists error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Followed lists unavailable',
            detail: error.message,
            code: 'followed_lists_unavailable'
          }]
        });
      }
    }

    // GET /2/users?ids=... (multiple users by ID)
    const hasIdsParam = ('ids' in query) || /\bids=/.test(req.url || '');
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 2 && hasIdsParam) {
      const userFieldsParam = query['user.fields'];
      const rawIds = String(query.ids || '').split(',');
      const uniqueIds = Array.from(new Set(rawIds.map(id => id.trim()).filter(Boolean))).slice(0, 100);

      if (uniqueIds.length === 0) {
        return res.status(400).json({
          errors: [{
            detail: 'ids parameter must contain at least one user id',
            title: 'Invalid Request',
            type: 'https://api.twitter.com/2/problems/invalid-request',
            parameter: 'ids'
          }]
        });
      }

      const data = [];
      const errorsList = [];

      for (const id of uniqueIds) {
        const user = await fetchRettiwtUserProfile(id, userFieldsParam);
        if (user) {
          data.push(user);
        } else {
          errorsList.push({
            value: id,
            detail: 'Could not find user with referenced id',
            title: 'Not Found Error',
            type: 'https://api.twitter.com/2/problems/resource-not-found',
            resource_type: 'user',
            parameter: 'ids',
            resource_id: id
          });
        }
      }

      const responsePayload = { data };
      if (errorsList.length > 0) {
        responsePayload.errors = errorsList;
      }

      return res.json(responsePayload);
    }

    // GET /2/users/:id (single user by ID)
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts.length === 3 && !isNaN(pathParts[2])) {
      const userId = pathParts[2];
      const userFieldsParam = query['user.fields'];

      const user = await fetchRettiwtUserProfile(userId, userFieldsParam);
      if (user) {
        return res.json({ data: user });
      }

      // Rettiwt failed, attempt legacy fallback
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

          const fallbackUser = applyUserFieldFilter(
            transformUserToV2(response.data, includeAllFields),
            userFieldsParam
          );
          return res.json({
            data: fallbackUser
          });
        }
      } catch (error) {
        console.error('User lookup fallback failed:', error.response?.data || error.message);
      }

      return res.status(404).json({
        errors: [{
          value: userId,
          detail: 'Could not find user with referenced id',
          title: 'Not Found Error',
          type: 'https://api.twitter.com/2/problems/resource-not-found',
          resource_type: 'user',
          parameter: 'id',
          resource_id: userId
        }]
      });
    }

    // GET /2/users/by/username/:username/tweets - Check this BEFORE the profile endpoint
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'by' && pathParts[3] === 'username' && pathParts[5] === 'tweets') {
      const username = pathParts[4];
      const { max_results = 10, pagination_token } = query;
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const mediaFieldsParam = query['media.fields'];
      const expansions = query.expansions?.split(',') || [];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      
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
          const userData = nitterResponse.data.data.user ||
                          (timeline.length > 0 ? timeline[0].user : null);
          
          const tweetFields = tweetFieldsParam?.split(',') || [];
          const includeAllFields = tweetFields.length > 0;
          const mediaCollector = includeMediaExpansion ? new Map() : null;
          
          const v2Tweets = timeline.slice(0, max_results).map(tweet => {
            const baseTweet = {
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
            
            if (includeAllFields) {
              if (tweet.conversationId) {
                baseTweet.conversation_id = tweet.conversationId;
              } else {
                baseTweet.conversation_id = tweet.id;
              }
              
              if (tweet.lang) {
                baseTweet.lang = tweet.lang;
              }
              
              if (tweet.sensitive !== undefined) {
                baseTweet.possibly_sensitive = tweet.sensitive;
              }
              
              if (tweet.replyTo) {
                baseTweet.in_reply_to_user_id = tweet.replyTo;
              }
              
              if (tweet.hashtags || tweet.mentions || tweet.urls) {
                baseTweet.entities = {};
                
                if (tweet.hashtags && tweet.hashtags.length > 0) {
                  baseTweet.entities.hashtags = tweet.hashtags;
                }
                
                if (tweet.mentions && tweet.mentions.length > 0) {
                  baseTweet.entities.mentions = tweet.mentions;
                }
                
                if (tweet.urls && tweet.urls.length > 0) {
                  baseTweet.entities.urls = tweet.urls;
                }
              }
            }
            
            if (Array.isArray(tweet.media) && tweet.media.length > 0) {
              const mediaKeys = tweet.media
                .map(resolveMediaKey)
                .filter(Boolean);
              
              if (mediaKeys.length > 0) {
                baseTweet.attachments = {
                  media_keys: mediaKeys
                };
              }
              
              collectMediaEntities(tweet.media, mediaCollector);
            }
            
            return applyTweetFieldFilter(baseTweet, tweetFieldsParam);
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
              users: [applyUserFieldFilter(userV2, userFieldsParam)]
            };
            } else if (v2Tweets.length > 0) {
              // No userData from Nitter, but we have tweets
              // Use oEmbed to get author info from the first tweet
              const firstTweetId = v2Tweets[0].id;
              const oEmbedAuthor = await fetchAuthorFromOEmbed(firstTweetId);
              
              if (oEmbedAuthor) {
                const fallbackUser = {
                  id: v2Tweets[0].author_id,
                  username: oEmbedAuthor.username,
                  name: oEmbedAuthor.name
                };

                response.includes = {
                  users: [applyUserFieldFilter(fallbackUser, userFieldsParam)]
                };
              }
            }
          }

          appendMediaIncludes(response, mediaCollector, mediaFieldsParam);
          
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
      const userFieldsParam = query['user.fields'];
      const user = await fetchUserProfile(username, userFieldsParam);

      if (user) {
        return res.json({ data: user });
      }

      return res.status(404).json({
        errors: [{
          value: username,
          detail: 'Could not find user with referenced username',
          title: 'Not Found Error',
          type: 'https://api.twitter.com/2/problems/resource-not-found',
          resource_type: 'user',
          parameter: 'username'
        }]
      });
    }

    // GET /2/users/by?usernames=...
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'by' && pathParts.length === 3) {
      const usernamesParam = query.usernames || query.usernames?.join?.(',');
      const userFieldsParam = query['user.fields'];

      if (!usernamesParam) {
        return res.status(400).json({
          errors: [{
            detail: 'usernames parameter is required',
            title: 'Invalid Request',
            type: 'https://api.twitter.com/2/problems/invalid-request',
            parameter: 'usernames'
          }]
        });
      }

      const usernameList = Array.from(new Set(usernamesParam.split(',').map(name => name.trim()).filter(Boolean))).slice(0, 100);
      const results = [];
      const errorsList = [];

      for (const username of usernameList) {
        const user = await fetchUserProfile(username, userFieldsParam);
        if (user) {
          results.push(user);
        } else {
          errorsList.push({
            value: username,
            detail: 'Could not find user with referenced username',
            title: 'Not Found Error',
            type: 'https://api.twitter.com/2/problems/resource-not-found',
            resource_type: 'user',
            parameter: 'usernames'
          });
        }
      }

      const response = { data: results };
      if (errorsList.length > 0) {
        response.errors = errorsList;
      }

      return res.json(response);
    }

    // GET /2/users/search
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[2] === 'search') {
      const searchQuery = query.query || query.q;
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 10 : maxResultsParam, 100));
      const { cursor } = parsePaginationToken(query.pagination_token);
      const userFieldsParam = query['user.fields'];

      if (!searchQuery) {
        return res.status(400).json({
          errors: [{
            message: 'Query parameter is required'
          }]
        });
      }

      try {
        const typeahead = await fetchTwitterV1('search/typeahead.json', {
          q: searchQuery,
          result_type: 'users',
          count: maxResults,
          src: 'search_box'
        }, 6000);

        const users = Array.isArray(typeahead.users)
          ? typeahead.users
              .slice(0, maxResults)
              .map(transformTypeaheadUserToV2)
              .filter(Boolean)
              .map(user => applyUserFieldFilter(user, userFieldsParam))
          : [];

        const responsePayload = {
          data: users,
          meta: buildMetaObject({ result_count: users.length })
        };

        return res.json(responsePayload);
      } catch (error) {
        console.error('Typeahead user search error:', error.message);

        // Fallback to Nitter if typeahead fails
        try {
          const params = {
            q: searchQuery,
            f: 'users'
          };

          if (cursor) {
            params.cursor = cursor;
          }

          const response = await axios.get(
            `${NITTER_API}/search`,
            {
              params,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 10000
            }
          );

          const nitterUsers = response.data?.data?.users || [];
          const resultUsers = nitterUsers
            .slice(0, maxResults)
            .map(user => transformNitterUserToV2(user))
            .filter(Boolean)
            .map(user => applyUserFieldFilter(user, userFieldsParam));

          const metaParams = {
            result_count: resultUsers.length
          };

          const bottomCursor = response.data?.data?.pagination?.bottom;
          if (bottomCursor) {
            const nextToken = encodePaginationToken(bottomCursor, 0);
            if (nextToken) {
              metaParams.next_token = nextToken;
            }
          }

          return res.json({
            data: resultUsers,
            meta: buildMetaObject(metaParams)
          });
        } catch (fallbackError) {
          console.error('Nitter fallback user search error:', fallbackError.message);
          return res.status(503).json({
            errors: [{
              message: 'User search unavailable',
              detail: fallbackError.message,
              code: 'user_search_unavailable'
            }]
          });
        }
      }
    }

    // TWEET ENDPOINTS

    // GET /2/tweets/:id/liking_users
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[3] === 'liking_users') {
      const tweetId = pathParts[2];
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const mediaFieldsParam = query['media.fields'];
      const expansions = query.expansions?.split(',') || [];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      const mediaCollector = includeMediaExpansion ? new Map() : null;
      const includeAuthorExpansion = expansions.includes('author_id');
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const likers = await rettiwt.tweet.likers(tweetId, desiredCount, fetchCursor);
        const list = Array.isArray(likers.list) ? likers.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const users = list
          .slice(safeOffset, endIndex)
          .map(user => transformRettiwtUserToV2(user))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        let nextCursorValue;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursorValue = fetchCursor;
          nextOffset = endIndex;
        } else if (likers.next) {
          nextCursorValue = likers.next;
        }

        const nextToken = encodePaginationToken(nextCursorValue, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        if (users.length === 0) {
          const metrics = await fetchTweetMetrics(tweetId);
          if (!metrics || metrics.like_count > 0) {
            return res.status(503).json({
              errors: [{
                message: 'Tweet likers unavailable',
                detail: 'Upstream returned no liker data despite recorded likes',
                code: 'tweet_likers_unavailable'
              }]
            });
          }
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        console.error('Tweet likers error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Tweet likers unavailable',
            detail: error.message,
            code: 'tweet_likers_unavailable'
          }]
        });
      }
    }

    // GET /2/tweets/:id/retweeted_by
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[3] === 'retweeted_by') {
      const tweetId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor, offset } = parsePaginationToken(query.pagination_token);
      const paginationOffset = Math.max(0, Number(offset) || 0);
      const fetchCursor = cursor === undefined ? undefined : cursor;

      try {
        const desiredCount = Math.min(100, Math.max(maxResults + paginationOffset, 20));
        const retweeters = await rettiwt.tweet.retweeters(tweetId, desiredCount, fetchCursor);
        const list = Array.isArray(retweeters.list) ? retweeters.list : [];

        const safeOffset = Math.min(paginationOffset, list.length);
        const endIndex = Math.min(safeOffset + maxResults, list.length);
        const users = list
          .slice(safeOffset, endIndex)
          .map(user => transformRettiwtUserToV2(user))
          .filter(Boolean)
          .map(user => applyUserFieldFilter(user, userFieldsParam));

        const metaParams = {
          result_count: users.length
        };

        let nextCursorValue;
        let nextOffset = 0;

        if (endIndex < list.length) {
          nextCursorValue = fetchCursor;
          nextOffset = endIndex;
        } else if (retweeters.next) {
          nextCursorValue = retweeters.next;
        }

        const nextToken = encodePaginationToken(nextCursorValue, nextOffset);
        if (nextToken) {
          metaParams.next_token = nextToken;
        }

        if (users.length === 0) {
          const metrics = await fetchTweetMetrics(tweetId);
          if (!metrics || metrics.retweet_count > 0) {
            return res.status(503).json({
              errors: [{
                message: 'Tweet retweeters unavailable',
                detail: 'Upstream returned no retweeter data despite recorded retweets',
                code: 'tweet_retweeters_unavailable'
              }]
            });
          }
        }

        return res.json({
          data: users,
          meta: buildMetaObject(metaParams)
        });
      } catch (error) {
        console.error('Tweet retweeters error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Tweet retweeters unavailable',
            detail: error.message,
            code: 'tweet_retweeters_unavailable'
          }]
        });
      }
    }

    // GET /2/tweets/:id/quote_tweets
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[3] === 'quote_tweets') {
      const tweetId = pathParts[2];
      const maxResultsParam = Number(query.max_results);
      const maxResults = Math.max(1, Math.min(isNaN(maxResultsParam) ? 100 : maxResultsParam, 100));
      const { cursor } = parsePaginationToken(query.pagination_token);
      const fetchCursor = cursor === undefined ? undefined : cursor;
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const expansions = query.expansions?.split(',') || [];

      try {
        const searchResult = await rettiwt.tweet.search({ quoted: tweetId }, maxResults, fetchCursor);
        const list = Array.isArray(searchResult.list) ? searchResult.list : [];

        const v2Tweets = list
          .filter(tweet => tweet.id !== tweetId)
          .slice(0, maxResults)
          .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
          .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));

        const metaParams = {
          result_count: v2Tweets.length
        };

        if (v2Tweets.length > 0) {
          metaParams.newest_id = v2Tweets[0].id;
          metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
        }

        if (searchResult.next) {
          const nextToken = encodePaginationToken(searchResult.next, 0);
          if (nextToken) {
            metaParams.next_token = nextToken;
          }
        }

        const responsePayload = {
          data: v2Tweets,
          meta: buildMetaObject(metaParams)
        };

        if (expansions.includes('author_id') && list.length > 0) {
          const users = new Map();
          list.slice(0, maxResults).forEach(tweet => {
            if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
              const author = transformRettiwtUserToV2(tweet.tweetBy);
              if (author) {
                users.set(author.id, applyUserFieldFilter(author, userFieldsParam));
              }
            }
          });

          if (users.size > 0) {
            responsePayload.includes = {
              users: Array.from(users.values())
            };
          }
        }

        appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);

        return res.json(responsePayload);
      } catch (error) {
        console.error('Quote tweets error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Quote tweets unavailable',
            detail: error.message,
            code: 'tweet_quotes_unavailable'
          }]
        });
      }
    }

    // GET /2/tweets?ids=... (multiple tweets)
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts.length === 2 && query.ids) {
      const tweetIds = query.ids.split(',');
      const expansions = query.expansions?.split(',') || [];
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const mediaFieldsParam = query['media.fields'];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      const mediaCollector = includeMediaExpansion ? new Map() : null;
      const includeAuthorExpansion = expansions.includes('author_id');
      
      const tweets = [];
      const users = new Map(); // Use Map to avoid duplicate users
      const ids = tweetIds.slice(0, 100).map(id => id.trim()).filter(Boolean);

      // Primary: bulk fetch via Rettiwt
      let rettiwtDetails = [];
      try {
        const details = await rettiwt.tweet.details(ids);
        if (Array.isArray(details)) {
          rettiwtDetails = details;
        } else if (details) {
          rettiwtDetails = [details];
        }
      } catch (error) {
        console.error('Rettiwt bulk tweet details error:', error.message);
      }

      const rettiwtMap = new Map();
      rettiwtDetails.forEach(detail => {
        if (detail && detail.id) {
          rettiwtMap.set(String(detail.id), detail);
        }
      });

      // Fetch each tweet with fallback
      for (const tweetId of ids) {
        const detail = rettiwtMap.get(tweetId);
        if (detail) {
          const mapped = buildV2TweetFromRettiwt(detail, {
            tweetFieldsParam,
            userFieldsParam,
            mediaCollector
          });
          if (mapped && mapped.tweet && mapped.tweet.text) {
            tweets.push(mapped.tweet);
            if (includeAuthorExpansion && mapped.author && mapped.author.id && !users.has(mapped.author.id)) {
              users.set(mapped.author.id, mapped.author);
            }
            continue;
          }
        }

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

          if (vxResponse.data && typeof vxResponse.data === 'object' && !String(vxResponse.data).startsWith('<')) {
            const tweet = vxResponse.data;

            const baseTweet = {
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

            if (!baseTweet.text) {
              throw new Error('vx tweet has no text');
            }

            if (Array.isArray(tweet.media) && tweet.media.length > 0) {
              const mediaKeys = tweet.media
                .map(resolveMediaKey)
                .filter(Boolean);

              if (mediaKeys.length > 0) {
                baseTweet.attachments = {
                  media_keys: mediaKeys
                };
              }

              collectMediaEntities(tweet.media, mediaCollector);
            }

            const v2Tweet = applyTweetFieldFilter(baseTweet, tweetFieldsParam);
            tweets.push(v2Tweet);

            if (includeAuthorExpansion) {
              let userInfo = {
                id: tweet.user_id || 'unknown',
                username: tweet.user_screen_name || 'unknown',
                name: tweet.user_name || 'Unknown'
              };

              if ((userInfo.username === 'unknown' || userInfo.name === 'Unknown') && !users.has(userInfo.id)) {
                const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
                if (oEmbedAuthor) {
                  userInfo.username = oEmbedAuthor.username || userInfo.username;
                  userInfo.name = oEmbedAuthor.name || userInfo.name;
                }
              }

              if (!users.has(userInfo.id)) {
                users.set(userInfo.id, applyUserFieldFilter(userInfo, userFieldsParam));
              }
            }

            continue;
          }
        } catch (vxError) {
          // Ignore and try next fallback
        }

        try {
          const fxResponse = await axios.get(
            `https://api.fxtwitter.com/Twitter/status/${tweetId}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0'
              },
              timeout: 3000
            }
          );

          if (fxResponse.data && fxResponse.data.tweet) {
            const tweet = fxResponse.data.tweet;

            const baseTweet = {
              id: tweetId,
              text: tweet.text || '',
              created_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
              author_id: tweet.author?.id || 'unknown',
              edit_history_tweet_ids: [tweetId],
              public_metrics: {
                retweet_count: tweet.retweets || 0,
                reply_count: tweet.replies || 0,
                like_count: tweet.likes || 0,
                quote_count: tweet.quotes || 0,
                impression_count: tweet.views || 0
              }
            };

            if (!baseTweet.text) {
              throw new Error('fx tweet has no text');
            }

            const mediaItems = Array.isArray(tweet.media?.all)
              ? tweet.media.all
              : Array.isArray(tweet.media)
                ? tweet.media
                : Array.isArray(tweet.attachments)
                  ? tweet.attachments
                  : [];

            if (mediaItems.length > 0) {
              const mediaKeys = mediaItems
                .map(resolveMediaKey)
                .filter(Boolean);

              if (mediaKeys.length > 0) {
                baseTweet.attachments = {
                  media_keys: mediaKeys
                };
              }

              collectMediaEntities(mediaItems, mediaCollector);
            }

            const v2Tweet = applyTweetFieldFilter(baseTweet, tweetFieldsParam);
            tweets.push(v2Tweet);

            if (includeAuthorExpansion) {
              let userInfo = {
                id: tweet.author?.id || 'unknown',
                username: tweet.author?.screen_name || 'unknown',
                name: tweet.author?.name || 'Unknown'
              };

              if ((userInfo.username === 'unknown' || userInfo.name === 'Unknown') && !users.has(userInfo.id)) {
                const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
                if (oEmbedAuthor) {
                  userInfo.username = oEmbedAuthor.username || userInfo.username;
                  userInfo.name = oEmbedAuthor.name || userInfo.name;
                }
              }

              if (!users.has(userInfo.id)) {
                users.set(userInfo.id, applyUserFieldFilter(userInfo, userFieldsParam));
              }
            }

            continue;
          }
        } catch (fxError) {
          console.error(`Failed to fetch tweet ${tweetId}:`, fxError.message);
        }

        // Final fallback: Twitter v1.1 statuses/show via guest token
        try {
          const v1Tweet = await fetchTwitterV1('statuses/show.json', {
            id: tweetId,
            tweet_mode: 'extended',
            include_entities: true
          }, 6000);

          if (v1Tweet && v1Tweet.id_str) {
            const mapped = buildV2TweetFromV1(v1Tweet, {
              tweetFieldsParam,
              userFieldsParam,
              mediaCollector
            });

            if (mapped && mapped.tweet) {
              tweets.push(mapped.tweet);
              if (includeAuthorExpansion && mapped.author && mapped.author.id && !users.has(mapped.author.id)) {
                users.set(mapped.author.id, mapped.author);
              }
            }
          }
        } catch (v1Error) {
          console.error(`v1 fallback failed for tweet ${tweetId}:`, v1Error.message);
        }
      }

      const response = {
        data: tweets,
        meta: buildMetaObject({ result_count: tweets.length })
      };

      if (expansions.includes('author_id') && users.size > 0) {
        response.includes = {
          users: Array.from(users.values())
        };
      }

      appendMediaIncludes(response, mediaCollector, mediaFieldsParam);

      return res.json(response);
    }

    // GET /2/tweets/:id (single tweet)
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts.length === 3) {
      const tweetId = pathParts[2];
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const expansions = query.expansions?.split(',') || [];
      const includeAuthorExpansion = expansions.includes('author_id');
      const mediaFieldsParam = query['media.fields'];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      const mediaCollector = includeMediaExpansion ? new Map() : null;
      
      // Primary: use Rettiwt tweet details (guest-capable)
      try {
        const rettiwtTweet = await rettiwt.tweet.details(tweetId);
        if (rettiwtTweet) {
          const mapped = buildV2TweetFromRettiwt(rettiwtTweet, {
            tweetFieldsParam,
            userFieldsParam,
            mediaCollector
          });

          if (mapped && mapped.tweet && mapped.tweet.text) {
            const responsePayload = { data: mapped.tweet };

            if (includeAuthorExpansion && mapped.author) {
              responsePayload.includes = { users: [mapped.author] };
            }

            appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);
            return res.json(responsePayload);
          }
        }
      } catch (error) {
        console.error('Rettiwt tweet details error:', error.message);
      }

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

            const includeAllFields = Boolean(tweetFieldsParam);

            const baseTweet = {
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

          if (!baseTweet.text) {
            throw new Error('vx tweet has no text');
          }

            if (includeAllFields) {
              baseTweet.conversation_id = tweet.conversation_id || tweetId;
              if (tweet.lang) {
                baseTweet.lang = tweet.lang;
              }
            if (tweet.possibly_sensitive !== undefined) {
              baseTweet.possibly_sensitive = tweet.possibly_sensitive;
            }
          }

          if (Array.isArray(tweet.media) && tweet.media.length > 0) {
            const mediaKeys = tweet.media
              .map(resolveMediaKey)
              .filter(Boolean);

            if (mediaKeys.length > 0) {
              baseTweet.attachments = {
                media_keys: mediaKeys
              };
            }

            collectMediaEntities(tweet.media, mediaCollector);
          }

          const filteredTweet = applyTweetFieldFilter(baseTweet, tweetFieldsParam);

          let includes;
          if (includeAuthorExpansion) {
            let userInfo = {
              id: tweet.user_id || 'unknown',
              username: tweet.user_screen_name || 'unknown',
              name: tweet.user_name || 'Unknown'
            };

            if (userInfo.username === 'unknown' || userInfo.name === 'Unknown') {
              const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
              if (oEmbedAuthor) {
                userInfo.username = oEmbedAuthor.username || userInfo.username;
                userInfo.name = oEmbedAuthor.name || userInfo.name;
              }
            }

            includes = {
              users: [applyUserFieldFilter(userInfo, userFieldsParam)]
            };
          }

          const responsePayload = {
            data: filteredTweet,
            ...(includes ? { includes } : {})
          };

          appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);

          return res.json(responsePayload);
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

            const baseTweet = {
              id: tweetId,
              text: tweet.text || '',
              created_at: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
              author_id: tweet.author?.id || 'unknown',
              edit_history_tweet_ids: [tweetId],
              public_metrics: {
                retweet_count: tweet.retweets || 0,
                reply_count: tweet.replies || 0,
                like_count: tweet.likes || 0,
                quote_count: tweet.quotes || 0,
                impression_count: tweet.views || 0
              }
            };

            if (!baseTweet.text) {
              throw new Error('fx tweet has no text');
            }

            const mediaItems = Array.isArray(tweet.media?.all)
              ? tweet.media.all
              : Array.isArray(tweet.media)
                ? tweet.media
                : Array.isArray(tweet.attachments)
                  ? tweet.attachments
                  : [];

            if (mediaItems.length > 0) {
              const mediaKeys = mediaItems
                .map(resolveMediaKey)
                .filter(Boolean);

              if (mediaKeys.length > 0) {
                baseTweet.attachments = {
                  media_keys: mediaKeys
                };
              }

              collectMediaEntities(mediaItems, mediaCollector);
            }

            const filteredTweet = applyTweetFieldFilter(baseTweet, tweetFieldsParam);

            let includes;
            if (includeAuthorExpansion) {
              let userInfo = {
                id: tweet.author?.id || 'unknown',
                username: tweet.author?.screen_name || 'unknown',
                name: tweet.author?.name || 'Unknown'
              };

              if (userInfo.username === 'unknown' || userInfo.name === 'Unknown') {
                const oEmbedAuthor = await fetchAuthorFromOEmbed(tweetId);
                if (oEmbedAuthor) {
                  userInfo.username = oEmbedAuthor.username || userInfo.username;
                  userInfo.name = oEmbedAuthor.name || userInfo.name;
                }
              }

              includes = {
                users: [applyUserFieldFilter(userInfo, userFieldsParam)]
              };
            }

            const responsePayload = {
              data: filteredTweet,
              ...(includes ? { includes } : {})
            };

            appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);

          return res.json(responsePayload);
        }
      } catch (fxError) {
          // Try Twitter v1.1 guest lookup as last resort
          try {
            const v1Tweet = await fetchTwitterV1('statuses/show.json', {
              id: tweetId,
              tweet_mode: 'extended',
              include_entities: true
            }, 6000);

            if (v1Tweet && v1Tweet.id_str) {
              const mapped = buildV2TweetFromV1(v1Tweet, {
                tweetFieldsParam,
                userFieldsParam,
                mediaCollector
              });

              if (mapped && mapped.tweet) {
                const responsePayload = { data: mapped.tweet };

                if (includeAuthorExpansion && mapped.author) {
                  responsePayload.includes = { users: [mapped.author] };
                }

                appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);
                return res.json(responsePayload);
              }
            }
          } catch (v1Error) {
            console.error('v1 tweet fallback error:', v1Error.message);
          }
        }
      }

      return resourceNotFound('tweet', tweetId, 'id');
    }

    // Unsupported auth-required endpoints: counts and full-archive search
    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[2] === 'counts' && (pathParts[3] === 'recent' || pathParts[3] === 'all')) {
      return authRequired('This endpoint requires elevated or academic access');
    }

    if (pathParts[0] === '2' && pathParts[1] === 'tweets' && pathParts[2] === 'search' && pathParts[3] === 'all') {
      return authRequired('This endpoint requires full-archive (academic) access');
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
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const expansions = query.expansions?.split(',') || [];
      const mediaFieldsParam = query['media.fields'];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      
      // Check if date filtering is requested
      const hasDateFilter = query.start_time || query.end_time;
      
      if (hasDateFilter) {
        // Use Nitter for date-filtered searches
        let nitterQuery = searchQuery;
        
        // Add date filters to the query
        if (query.start_time) {
          const startDate = new Date(query.start_time).toISOString().split('T')[0];
          nitterQuery += ` since:${startDate}`;
        }
        if (query.end_time) {
          const endDate = new Date(query.end_time).toISOString().split('T')[0];
          nitterQuery += ` until:${endDate}`;
        }
        
        try {
          const nitterResponse = await axios.get(
            `${NITTER_API}/search`,
            {
              params: {
                q: nitterQuery
              },
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 8000
            }
          );
          
          const timeline = nitterResponse.data?.data?.timeline || [];
          const mediaCollector = includeMediaExpansion ? new Map() : null;

          const v2Tweets = timeline
            .slice(0, maxResults)
            .map(tweet => {
              const baseTweet = {
                id: tweet.id,
                text: tweet.text || '',
                created_at: tweet.time ? new Date(tweet.time * 1000).toISOString() : new Date().toISOString(),
                author_id: tweet.userId || tweet.user?.id,
                edit_history_tweet_ids: [tweet.id],
                public_metrics: {
                  retweet_count: tweet.retweets || 0,
                  reply_count: tweet.replies || 0,
                  like_count: tweet.likes || 0,
                  quote_count: tweet.quotes || 0
                }
              };

              if (Array.isArray(tweet.media) && tweet.media.length > 0) {
                const mediaKeys = tweet.media
                  .map(resolveMediaKey)
                  .filter(Boolean);

                if (mediaKeys.length > 0) {
                  baseTweet.attachments = {
                    media_keys: mediaKeys
                  };
                }

                collectMediaEntities(tweet.media, mediaCollector);
              }

              return applyTweetFieldFilter(baseTweet, tweetFieldsParam);
            });

          const metaParams = {
            result_count: v2Tweets.length
          };
          if (v2Tweets.length > 0) {
            metaParams.newest_id = v2Tweets[0].id;
            metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
          }

          const response = {
            data: v2Tweets,
            meta: buildMetaObject(metaParams)
          };

          if (expansions.includes('author_id')) {
            const users = new Map();

            timeline.slice(0, maxResults).forEach(tweet => {
              if (tweet.user && !users.has(tweet.user.id)) {
                const user = transformNitterUserToV2(tweet.user);
                if (user) {
                  users.set(user.id, applyUserFieldFilter(user, userFieldsParam));
                }
              }
            });

            if (users.size > 0) {
              response.includes = {
                users: Array.from(users.values())
              };
            }
          }

          appendMediaIncludes(response, mediaCollector, mediaFieldsParam);

          return res.json(response);
        } catch (error) {
          console.error('Nitter search error:', error.message);
          // Fall through to use Rettiwt without date filtering
        }
      }

      // Use Rettiwt for non-date-filtered searches
      // Parse search operators from the query
      const searchParams = {
        count: maxResults
      };
      
      // Extract from:username operator
      const fromMatch = searchQuery.match(/from:(\S+)/);
      if (fromMatch) {
        searchParams.fromUsers = [fromMatch[1]];
        // Remove from: operator from the query
        searchQuery = searchQuery.replace(/from:\S+/g, '').trim();
      }
      
      // Extract to:username operator
      const toMatch = searchQuery.match(/to:(\S+)/);
      if (toMatch) {
        searchParams.toUsers = [toMatch[1]];
        searchQuery = searchQuery.replace(/to:\S+/g, '').trim();
      }
      
      // Add remaining query as includeWords if not empty
      if (searchQuery) {
        searchParams.includeWords = [searchQuery];
      }

      try {
        // Use Rettiwt for search
        const searchResult = await rettiwt.tweet.search(searchParams);

        const tweets = searchResult.list || [];
        const mediaCollector = includeMediaExpansion ? new Map() : null;
        const v2Tweets = tweets
          .slice(0, maxResults)
          .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
          .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));

        const metaParams = {
          result_count: v2Tweets.length
        };
        if (v2Tweets.length > 0) {
          metaParams.newest_id = v2Tweets[0].id;
          metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
        }

        const response = {
          data: v2Tweets,
          meta: buildMetaObject(metaParams)
        };

        if (expansions.includes('author_id') && tweets.length > 0) {
          const users = new Map();

          tweets.slice(0, maxResults).forEach(tweet => {
            if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
              const author = transformRettiwtUserToV2(tweet.tweetBy);
              if (author) {
                users.set(author.id, applyUserFieldFilter(author, userFieldsParam));
              }
            }
          });

          if (users.size > 0) {
            response.includes = {
              users: Array.from(users.values())
            };
          }
        }

        appendMediaIncludes(response, mediaCollector, mediaFieldsParam);

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

    // RETTIWT-POWERED ADDITIONAL ENDPOINTS
    
    // GET /2/users/:id/liked_tweets - Get tweets liked by a user
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'liked_tweets') {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      
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
    
    // GET /2/users/:id/mentions - Get tweets mentioning a user
    if (pathParts[0] === '2' && pathParts[1] === 'users' && pathParts[3] === 'mentions') {
      const userId = pathParts[2];
      const maxResults = Math.min(parseInt(query.max_results) || 20, 100);
      const { cursor } = parsePaginationToken(query.pagination_token);
      const fetchCursor = cursor === undefined ? undefined : cursor;
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const expansions = query.expansions?.split(',') || [];
      const mediaFieldsParam = query['media.fields'];
      const includeMediaExpansion = expansions.includes('attachments.media_keys');
      const mediaCollector = includeMediaExpansion ? new Map() : null;

      try {
        const userProfile = await fetchRettiwtUserProfile(userId);
        const username = userProfile?.username;

        if (!username) {
          return res.status(404).json({
            errors: [{
              message: 'User not found',
              code: 'resource_not_found'
            }]
          });
        }

        const searchResult = await rettiwt.tweet.search({ mentions: [username] }, maxResults, fetchCursor);
        const tweets = searchResult.list || [];

        const v2Tweets = tweets
          .slice(0, maxResults)
          .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
          .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));

        const metaParams = {
          result_count: v2Tweets.length
        };

        if (v2Tweets.length > 0) {
          metaParams.newest_id = v2Tweets[0].id;
          metaParams.oldest_id = v2Tweets[v2Tweets.length - 1].id;
        }

        if (searchResult.next) {
          const nextToken = encodePaginationToken(searchResult.next, 0);
          if (nextToken) {
            metaParams.next_token = nextToken;
          }
        }

        const responsePayload = {
          data: v2Tweets,
          meta: buildMetaObject(metaParams)
        };

        if (expansions.includes('author_id') && tweets.length > 0) {
          const users = new Map();

          tweets.slice(0, maxResults).forEach(tweet => {
            if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
              const author = transformRettiwtUserToV2(tweet.tweetBy);
              if (author) {
                users.set(author.id, applyUserFieldFilter(author, userFieldsParam));
              }
            }
          });

          if (users.size > 0) {
            responsePayload.includes = {
              users: Array.from(users.values())
            };
          }
        }

        appendMediaIncludes(responsePayload, mediaCollector, mediaFieldsParam);

        return res.json(responsePayload);
      } catch (error) {
        console.error('Mentions error:', error.message);
        return res.status(503).json({
          errors: [{
            message: 'Mentions unavailable',
            detail: error.message,
            code: 'mentions_unavailable'
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
          const tweetFieldsParam = query['tweet.fields'];
          const userFieldsParam = query['user.fields'];
          const mediaFieldsParam = query['media.fields'];
          const expansions = query.expansions?.split(',') || [];
          const includeMediaExpansion = expansions.includes('attachments.media_keys');
          const mediaCollector = includeMediaExpansion ? new Map() : null;

          const rawTweets = bookmarks.list.slice(0, maxResults);
          const tweets = rawTweets
            .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
            .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));
          
          const response = {
            data: tweets,
            meta: {
              result_count: tweets.length
            }
          };
          
          if (expansions.includes('author_id') && rawTweets.length > 0) {
            const users = new Map();
            rawTweets.forEach(tweet => {
              if (tweet.tweetBy && !users.has(tweet.tweetBy.id)) {
                const user = transformRettiwtUserToV2(tweet.tweetBy);
                if (user) {
                  users.set(user.id, applyUserFieldFilter(user, userFieldsParam));
                }
              }
            });
            
            if (users.size > 0) {
              response.includes = {
                users: Array.from(users.values())
              };
            }
          }

          appendMediaIncludes(response, mediaCollector, mediaFieldsParam);
          
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
      const tweetFieldsParam = query['tweet.fields'];
      const userFieldsParam = query['user.fields'];
      const mediaFieldsParam = query['media.fields'];
      
      try {
        const timeline = await rettiwt.user.timeline(userId);
        
        if (timeline && timeline.list) {
          const expansions = query.expansions?.split(',') || [];
          const includeMediaExpansion = expansions.includes('attachments.media_keys');
          const mediaCollector = includeMediaExpansion ? new Map() : null;

          const tweets = timeline.list
            .slice(0, maxResults)
            .map(tweet => transformRettiwtTweetToV2(tweet, { mediaCollector }))
            .map(tweet => applyTweetFieldFilter(tweet, tweetFieldsParam));
          
          const response = {
            data: tweets,
            meta: {
              result_count: tweets.length
            }
          };
          
          if (expansions.includes('author_id') && timeline.list.length > 0) {
            const firstTweet = timeline.list[0];
            if (firstTweet && firstTweet.tweetBy) {
              const author = transformRettiwtUserToV2(firstTweet.tweetBy);
              if (author) {
                response.includes = {
                  users: [applyUserFieldFilter(author, userFieldsParam)]
                };
              }
            }
          }

          appendMediaIncludes(response, mediaCollector, mediaFieldsParam);
          
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

      const guestToken = await getGuestToken();

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
