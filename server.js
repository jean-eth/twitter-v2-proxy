const fastify = require('fastify')({ logger: true });
const axios = require('axios');

// Constants
const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const API_BASE = 'https://api.twitter.com';
const NITTER_API = 'https://nitter.r2d2.to/api';

// Guest token cache
let guestTokenCache = {
  token: null,
  expiresAt: 0
};

// Get or refresh guest token
async function getGuestToken() {
  if (guestTokenCache.token && Date.now() < guestTokenCache.expiresAt) {
    return guestTokenCache.token;
  }

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

    guestTokenCache.token = response.data.guest_token;
    guestTokenCache.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
    
    return guestTokenCache.token;
  } catch (error) {
    throw new Error('Failed to get guest token');
  }
}

// Convert v1.1 user format to v2 format
function convertUserToV2(v1User) {
  const createdDate = new Date(v1User.created_at);
  
  return {
    id: v1User.id_str,
    username: v1User.screen_name,
    name: v1User.name,
    created_at: createdDate.toISOString().replace('.000Z', 'Z'),
    protected: v1User.protected,
    // Optional fields that can be added based on field parameters
    description: v1User.description,
    location: v1User.location,
    url: v1User.url,
    verified: v1User.verified,
    profile_image_url: v1User.profile_image_url_https,
    public_metrics: {
      followers_count: v1User.followers_count,
      following_count: v1User.friends_count,
      tweet_count: v1User.statuses_count,
      listed_count: v1User.listed_count
    }
  };
}

// Convert cursor to next_token format
function encodeNextToken(cursor) {
  if (!cursor || cursor === '0' || cursor === 0) return undefined;
  return Buffer.from(cursor.toString()).toString('base64');
}

function decodeNextToken(token) {
  if (!token) return '-1';
  try {
    return Buffer.from(token, 'base64').toString('utf-8');
  } catch {
    return '-1';
  }
}

// GET /2/users/:id/followers
fastify.get('/2/users/:id/followers', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token,
      'user.fields': userFields = ''
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    // Fetch from v1.1 endpoint
    const response = await axios.get(
      `${API_BASE}/1.1/followers/list.json`,
      {
        params: {
          user_id: id,
          count: Math.min(max_results, 200), // v1.1 max is 200
          cursor: cursor,
          skip_status: false,
          include_user_entities: true
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.users.map(user => convertUserToV2(user)),
      meta: {
        result_count: response.data.users.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    // Add includes if requested
    if (userFields.includes('pinned_tweet_id')) {
      v2Response.includes = {
        tweets: response.data.users
          .filter(u => u.status)
          .map(u => ({
            id: u.status.id_str,
            text: u.status.text,
            created_at: u.status.created_at,
            author_id: u.id_str
          }))
      };
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    
    if (error.response?.status === 404) {
      reply.code(404).send({
        errors: [{
          detail: 'User not found',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    } else {
      reply.code(500).send({
        errors: [{
          detail: error.message,
          status: 500,
          title: 'Internal Server Error',
          type: 'https://api.twitter.com/2/problems/internal-error'
        }]
      });
    }
  }
});

// GET /2/users/:id/following
fastify.get('/2/users/:id/following', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token,
      'user.fields': userFields = ''
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    // Fetch from v1.1 endpoint
    const response = await axios.get(
      `${API_BASE}/1.1/friends/list.json`,
      {
        params: {
          user_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor,
          skip_status: false,
          include_user_entities: true
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.users.map(user => convertUserToV2(user)),
      meta: {
        result_count: response.data.users.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/lists/:id/followers
fastify.get('/2/lists/:id/followers', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token,
      'user.fields': userFields = ''
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    // Fetch list subscribers from v1.1 endpoint
    const response = await axios.get(
      `${API_BASE}/1.1/lists/subscribers.json`,
      {
        params: {
          list_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor,
          skip_status: false,
          include_user_entities: true
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.users.map(user => convertUserToV2(user)),
      meta: {
        result_count: response.data.users.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    // Add includes section if requested
    if (userFields.includes('pinned_tweet_id') || userFields.includes('entities')) {
      v2Response.includes = {};
      
      // Add tweets if any user has a status
      const tweets = response.data.users
        .filter(u => u.status)
        .map(u => ({
          id: u.status.id_str,
          text: u.status.text,
          created_at: u.status.created_at,
          author_id: u.id_str,
          username: u.screen_name
        }));
      
      if (tweets.length > 0) {
        v2Response.includes.tweets = tweets;
      }

      // Add media if present in statuses
      const media = [];
      response.data.users.forEach(user => {
        if (user.status?.entities?.media) {
          user.status.entities.media.forEach(m => {
            media.push({
              media_key: m.id_str,
              type: m.type,
              url: m.media_url_https,
              width: m.sizes?.large?.w,
              height: m.sizes?.large?.h
            });
          });
        }
      });
      
      if (media.length > 0) {
        v2Response.includes.media = media;
      }
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    
    // Handle specific error cases
    if (error.response?.data?.errors) {
      const twitterError = error.response.data.errors[0];
      
      if (twitterError.code === 34) {
        reply.code(404).send({
          errors: [{
            detail: 'The specified list does not exist',
            status: 404,
            title: 'Not Found',
            type: 'https://api.twitter.com/2/problems/resource-not-found'
          }]
        });
        return;
      }
    }

    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/users/:id - Get user by ID
fastify.get('/2/users/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    
    // Check if this is actually the followers endpoint
    if (request.url.includes('/followers') || request.url.includes('/following')) {
      return; // Let other handlers deal with it
    }
    
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/users/lookup.json`,
      {
        params: {
          user_id: id
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error('User not found');
    }

    const v2Response = {
      data: convertUserToV2(response.data[0])
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(error.response?.status || 500).send({
      errors: [{
        message: error.message || 'Failed to fetch user'
      }]
    });
  }
});

// GET /2/users/by/username/:username
fastify.get('/2/users/by/username/:username', async (request, reply) => {
  try {
    const { username } = request.params;
    
    // Use Nitter to get user data
    const response = await axios.get(
      `${NITTER_API}/${username}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.data || !response.data.data) {
      throw new Error('User not found');
    }

    // Extract user data from timeline response
    const userData = response.data.data.user || (response.data.data.timeline && response.data.data.timeline[0]?.user);
    
    if (!userData) {
      throw new Error('User data not found');
    }

    const v2Response = {
      data: {
        id: userData.id || userData.rest_id,
        username: userData.username || userData.screen_name,
        name: userData.fullname || userData.name,
        created_at: userData.joined ? new Date(userData.joined).toISOString() : new Date().toISOString(),
        protected: userData.protected || false,
        description: userData.bio || userData.description || '',
        location: userData.location || '',
        url: userData.website || '',
        verified: userData.verified || false,
        profile_image_url: userData.avatar || userData.profile_image_url_https,
        public_metrics: {
          followers_count: userData.followers || userData.followers_count || 0,
          following_count: userData.following || userData.friends_count || 0,
          tweet_count: userData.tweets || userData.statuses_count || 0,
          listed_count: userData.listed_count || 0
        }
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(404).send({
      errors: [{
        detail: 'User not found',
        status: 404,
        title: 'Not Found',
        type: 'https://api.twitter.com/2/problems/resource-not-found'
      }]
    });
  }
});

// GET /2/users/:source_id/following/:target_id - Check if source follows target
fastify.get('/2/users/:source_id/following/:target_id', async (request, reply) => {
  try {
    const { source_id, target_id } = request.params;
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/friendships/show.json`,
      {
        params: {
          source_id: source_id,
          target_id: target_id
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format - simple boolean response
    const relationship = response.data.relationship;
    const v2Response = {
      data: {
        following: relationship.source.following,
        pending_approval: relationship.source.following_requested || false
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/trends/place/:woeid
fastify.get('/2/trends/place/:woeid', async (request, reply) => {
  try {
    const { woeid } = request.params;
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/trends/place.json`,
      {
        params: { id: woeid },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2-like format
    const trends = response.data[0];
    const v2Response = {
      data: trends.trends.map((trend, index) => ({
        id: `trend_${woeid}_${index}`,
        name: trend.name,
        url: trend.url,
        promoted_content: trend.promoted_content,
        query: trend.query,
        tweet_volume: trend.tweet_volume,
        trending_type: trend.tweet_volume ? 'volume' : 'emerging'
      })),
      meta: {
        location: {
          woeid: woeid,
          name: trends.locations[0].name,
          created_at: trends.created_at,
          as_of: trends.as_of
        }
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/trends/available
fastify.get('/2/trends/available', async (request, reply) => {
  try {
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/trends/available.json`,
      {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2-like format
    const v2Response = {
      data: response.data.map(location => ({
        woeid: location.woeid,
        name: location.name,
        country: location.country,
        country_code: location.countryCode,
        place_type: {
          code: location.placeType.code,
          name: location.placeType.name
        },
        parent_id: location.parentid,
        url: location.url
      })),
      meta: {
        result_count: response.data.length
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/trends/closest
fastify.get('/2/trends/closest', async (request, reply) => {
  try {
    const { lat, long } = request.query;
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/trends/closest.json`,
      {
        params: { lat, long },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2-like format
    const v2Response = {
      data: response.data.map(location => ({
        woeid: location.woeid,
        name: location.name,
        country: location.country,
        country_code: location.countryCode,
        place_type: {
          code: location.placeType.code,
          name: location.placeType.name
        },
        parent_id: location.parentid,
        url: location.url
      })),
      meta: {
        result_count: response.data.length
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/geo/search
fastify.get('/2/geo/search', async (request, reply) => {
  try {
    const { query, lat, long, max_results = 20 } = request.query;
    const guestToken = await getGuestToken();

    const params = { max_results };
    if (query) params.query = query;
    if (lat) params.lat = lat;
    if (long) params.long = long;

    const response = await axios.get(
      `${API_BASE}/1.1/geo/search.json`,
      {
        params,
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2-like format
    const v2Response = {
      data: response.data.result.places.map(place => ({
        id: place.id,
        name: place.name,
        full_name: place.full_name,
        country: place.country,
        country_code: place.country_code,
        place_type: place.place_type,
        contained_within: place.contained_within,
        centroid: place.centroid,
        bounding_box: place.bounding_box,
        attributes: place.attributes
      })),
      meta: {
        result_count: response.data.result.places.length
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/geo/reverse_geocode
fastify.get('/2/geo/reverse_geocode', async (request, reply) => {
  try {
    const { lat, long, accuracy, granularity = 'neighborhood', max_results = 20 } = request.query;
    
    if (!lat || !long) {
      reply.code(400).send({
        errors: [{
          detail: 'lat and long parameters are required',
          status: 400,
          title: 'Bad Request',
          type: 'https://api.twitter.com/2/problems/invalid-request'
        }]
      });
      return;
    }

    const guestToken = await getGuestToken();

    const params = { lat, long, max_results, granularity };
    if (accuracy) params.accuracy = accuracy;

    const response = await axios.get(
      `${API_BASE}/1.1/geo/reverse_geocode.json`,
      {
        params,
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2-like format
    const v2Response = {
      data: response.data.result.places.map(place => ({
        id: place.id,
        name: place.name,
        full_name: place.full_name,
        country: place.country,
        country_code: place.country_code,
        place_type: place.place_type,
        contained_within: place.contained_within,
        centroid: place.centroid,
        bounding_box: place.bounding_box,
        attributes: place.attributes
      })),
      meta: {
        result_count: response.data.result.places.length
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/lists/:id - Get list details
fastify.get('/2/lists/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    const guestToken = await getGuestToken();

    const response = await axios.get(
      `${API_BASE}/1.1/lists/show.json`,
      {
        params: { list_id: id },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const list = response.data;
    const v2Response = {
      data: {
        id: list.id_str,
        name: list.name,
        description: list.description,
        private: list.mode === 'private',
        follower_count: list.subscriber_count,
        member_count: list.member_count,
        created_at: new Date(list.created_at).toISOString(),
        owner_id: list.user?.id_str
      }
    };

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(404).send({
      errors: [{
        detail: 'List not found',
        status: 404,
        title: 'Not Found',
        type: 'https://api.twitter.com/2/problems/resource-not-found'
      }]
    });
  }
});

// GET /2/lists/:id/members - Get list members (already exists as /2/lists/:id/followers, adding alias)
fastify.get('/2/lists/:id/members', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token,
      'user.fields': userFields = ''
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    const response = await axios.get(
      `${API_BASE}/1.1/lists/members.json`,
      {
        params: {
          list_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor,
          skip_status: false,
          include_user_entities: true
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.users.map(user => convertUserToV2(user)),
      meta: {
        result_count: response.data.users.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(404).send({
      errors: [{
        detail: 'List not found',
        status: 404,
        title: 'Not Found',
        type: 'https://api.twitter.com/2/problems/resource-not-found'
      }]
    });
  }
});

// GET /2/users/:id/list_memberships - Lists user is member of
fastify.get('/2/users/:id/list_memberships', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    const response = await axios.get(
      `${API_BASE}/1.1/lists/memberships.json`,
      {
        params: {
          user_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.lists.map(list => ({
        id: list.id_str,
        name: list.name,
        description: list.description,
        private: list.mode === 'private',
        follower_count: list.subscriber_count,
        member_count: list.member_count,
        created_at: new Date(list.created_at).toISOString(),
        owner_id: list.user?.id_str
      })),
      meta: {
        result_count: response.data.lists.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/users/:id/owned_lists - Lists user owns
fastify.get('/2/users/:id/owned_lists', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    const response = await axios.get(
      `${API_BASE}/1.1/lists/ownerships.json`,
      {
        params: {
          user_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.lists.map(list => ({
        id: list.id_str,
        name: list.name,
        description: list.description,
        private: list.mode === 'private',
        follower_count: list.subscriber_count,
        member_count: list.member_count,
        created_at: new Date(list.created_at).toISOString(),
        owner_id: list.user?.id_str
      })),
      meta: {
        result_count: response.data.lists.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/users/:id/followed_lists - Lists user follows/subscribes to
fastify.get('/2/users/:id/followed_lists', async (request, reply) => {
  try {
    const { id } = request.params;
    const { 
      max_results = 100,
      pagination_token
    } = request.query;

    const guestToken = await getGuestToken();
    const cursor = decodeNextToken(pagination_token);

    const response = await axios.get(
      `${API_BASE}/1.1/lists/subscriptions.json`,
      {
        params: {
          user_id: id,
          count: Math.min(max_results, 200),
          cursor: cursor
        },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    // Convert to v2 format
    const v2Response = {
      data: response.data.lists.map(list => ({
        id: list.id_str,
        name: list.name,
        description: list.description,
        private: list.mode === 'private',
        follower_count: list.subscriber_count,
        member_count: list.member_count,
        created_at: new Date(list.created_at).toISOString(),
        owner_id: list.user?.id_str
      })),
      meta: {
        result_count: response.data.lists.length
      }
    };

    // Add pagination tokens
    if (response.data.next_cursor && response.data.next_cursor !== 0) {
      v2Response.meta.next_token = encodeNextToken(response.data.next_cursor_str);
    }
    if (response.data.previous_cursor && response.data.previous_cursor !== 0) {
      v2Response.meta.previous_token = encodeNextToken(response.data.previous_cursor_str);
    }

    reply.code(200).send(v2Response);

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/users/search - Search for users (via Snaplytics API)
fastify.get('/2/users/search', async (request, reply) => {
  try {
    const { query, max_results = 10 } = request.query;
    
    if (!query) {
      reply.code(400).send({
        errors: [{
          detail: 'Query parameter is required',
          status: 400,
          title: 'Bad Request',
          type: 'https://api.twitter.com/2/problems/invalid-request'
        }]
      });
      return;
    }

    // Use Snaplytics API for user search
    const response = await axios.get(
      'https://twittermedia.b-cdn.net/viewer/',
      {
        params: {
          data: query,
          type: 'search'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://snaplytics.io/',
          'Origin': 'https://snaplytics.io'
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.users) {
      const users = response.data.users.slice(0, Math.min(max_results, 100));
      
      // Convert to v2 format
      const v2Response = {
        data: users.map(user => ({
          id: user.rest_id || user.username,
          username: user.username,
          name: user.name,
          description: user.bio || '',
          location: user.location || '',
          url: user.website || '',
          verified: user.verified || false,
          profile_image_url: user.avatar_url,
          profile_banner_url: user.banner_url || null,
          created_at: user.created_at ? new Date(user.created_at).toISOString() : null,
          public_metrics: {
            followers_count: user.stats?.followers || 0,
            following_count: user.stats?.following || 0,
            tweet_count: user.stats?.tweets || 0,
            listed_count: 0
          }
        })),
        meta: {
          result_count: users.length
        }
      };

      reply.code(200).send(v2Response);
    } else {
      reply.code(404).send({
        errors: [{
          detail: 'No users found',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    }

  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// GET /2/tweets/:id - Get single tweet by ID (via vxtwitter/fxtwitter)
fastify.get('/2/tweets/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    let tweetData = null;
    let source = null;

    // Try vxtwitter first (it's faster)
    try {
      const vxResponse = await axios.get(
        `https://api.vxtwitter.com/Twitter/status/${id}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000
        }
      );
      
      if (vxResponse.data && vxResponse.data.tweetID) {
        tweetData = vxResponse.data;
        source = 'vxtwitter';
      }
    } catch (vxError) {
      // Try fxtwitter as fallback
      try {
        const fxResponse = await axios.get(
          `https://api.fxtwitter.com/Twitter/status/${id}`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
          }
        );
        
        if (fxResponse.data && fxResponse.data.tweet) {
          tweetData = fxResponse.data.tweet;
          source = 'fxtwitter';
        }
      } catch (fxError) {
        // Both failed
      }
    }

    if (!tweetData) {
      return reply.code(404).send({
        errors: [{
          detail: 'Tweet not found or services unavailable',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    }

    // Convert to v2 format based on source
    let v2Tweet, user;
    
    if (source === 'vxtwitter') {
      v2Tweet = {
        id: tweetData.tweetID,
        text: tweetData.text || '',
        created_at: new Date(tweetData.date).toISOString(),
        author_id: tweetData.user_screen_name,
        edit_history_tweet_ids: [tweetData.tweetID],
        public_metrics: {
          retweet_count: tweetData.retweets || 0,
          reply_count: tweetData.replies || 0,
          like_count: tweetData.likes || 0,
          quote_count: 0,
          impression_count: 0
        },
        possibly_sensitive: tweetData.possibly_sensitive || false
      };
      
      // Add referenced tweets if applicable
      if (tweetData.qrtURL) {
        v2Tweet.referenced_tweets = [{ type: 'quoted', id: tweetData.qrtURL.split('/').pop() }];
      } else if (tweetData.replyingToID) {
        v2Tweet.referenced_tweets = [{ type: 'replied_to', id: tweetData.replyingToID }];
      }
      
      user = {
        id: tweetData.user_screen_name,
        username: tweetData.user_screen_name,
        name: tweetData.user_name,
        profile_image_url: tweetData.user_profile_image_url
      };
    } else {
      // fxtwitter format
      v2Tweet = {
        id: tweetData.id,
        text: tweetData.text || tweetData.raw_text?.text || '',
        created_at: new Date(tweetData.created_at).toISOString(),
        author_id: tweetData.author.id,
        edit_history_tweet_ids: [tweetData.id],
        public_metrics: {
          retweet_count: tweetData.retweets || 0,
          reply_count: tweetData.replies || 0,
          like_count: tweetData.likes || 0,
          quote_count: 0,
          bookmark_count: tweetData.bookmarks || 0,
          impression_count: tweetData.views || 0
        },
        possibly_sensitive: tweetData.possibly_sensitive || false,
        lang: tweetData.lang
      };
      
      // Add referenced tweets if applicable
      if (tweetData.replying_to_status) {
        v2Tweet.referenced_tweets = [{ type: 'replied_to', id: tweetData.replying_to_status }];
      }
      
      user = {
        id: tweetData.author.id,
        username: tweetData.author.screen_name,
        name: tweetData.author.name,
        description: tweetData.author.description,
        location: tweetData.author.location,
        url: tweetData.author.url,
        created_at: tweetData.author.joined,
        verified: tweetData.author.protected === false,
        protected: tweetData.author.protected,
        profile_image_url: tweetData.author.avatar_url,
        public_metrics: {
          followers_count: tweetData.author.followers || 0,
          following_count: tweetData.author.following || 0,
          tweet_count: tweetData.author.tweets || 0,
          listed_count: 0,
          like_count: tweetData.author.likes || 0
        }
      };
    }

    return {
      data: v2Tweet,
      includes: {
        users: [user]
      }
    };
  } catch (error) {
    if (error.response?.status === 404) {
      reply.code(404).send({
        errors: [{
          detail: 'Tweet not found',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    } else {
      fastify.log.error(error);
      reply.code(500).send({
        errors: [{
          detail: error.message,
          status: 500,
          title: 'Internal Server Error',
          type: 'https://api.twitter.com/2/problems/internal-error'
        }]
      });
    }
  }
});

// GET /2/tweets/search/recent - Search tweets (via Nitter)
fastify.get('/2/tweets/search/recent', async (request, reply) => {
  try {
    const { query, max_results = 10, next_token } = request.query;

    if (!query) {
      return reply.code(400).send({
        errors: [{
          detail: 'Query parameter is required',
          status: 400,
          title: 'Bad Request',
          type: 'https://api.twitter.com/2/problems/invalid-request'
        }]
      });
    }

    // Search tweets via Nitter
    const nitterResponse = await axios.get(
      `${NITTER_API}/search`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        params: {
          q: query,
          cursor: next_token
        }
      }
    );

    const tweets = nitterResponse.data.data.timeline || [];
    const v2Tweets = tweets.slice(0, max_results).map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      created_at: new Date(tweet.time * 1000).toISOString(),
      author_id: tweet.user.id,
      edit_history_tweet_ids: [tweet.id],
      public_metrics: {
        retweet_count: tweet.stats.retweets,
        reply_count: tweet.stats.replies,
        like_count: tweet.stats.likes,
        quote_count: tweet.stats.quotes,
        impression_count: 0
      },
      referenced_tweets: tweet.retweet ? [{
        type: 'retweeted',
        id: tweet.retweet.id
      }] : tweet.quote ? [{
        type: 'quoted',
        id: tweet.quote.id
      }] : tweet.replyId !== '0' ? [{
        type: 'replied_to',
        id: tweet.replyId
      }] : undefined
    }));

    // Extract unique users
    const users = [...new Map(tweets.map(tweet => [
      tweet.user.id,
      {
        id: tweet.user.id,
        username: tweet.user.username,
        name: tweet.user.fullname,
        created_at: new Date(tweet.user.joinDate * 1000).toISOString(),
        protected: tweet.user.protected,
        description: tweet.user.bio,
        location: tweet.user.location,
        url: tweet.user.website,
        verified: tweet.user.verifiedType === 'Blue',
        profile_image_url: tweet.user.userPic && tweet.user.userPic !== 'abs.twimg.com/sticky/default_profile_images/default_profile.png' 
          ? `https://pbs.twimg.com/${tweet.user.userPic}` 
          : 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        public_metrics: {
          followers_count: tweet.user.followers,
          following_count: tweet.user.following,
          tweet_count: tweet.user.tweets,
          listed_count: 0
        }
      }
    ])).values()];

    return {
      data: v2Tweets,
      meta: {
        newest_id: v2Tweets[0]?.id,
        oldest_id: v2Tweets[v2Tweets.length - 1]?.id,
        result_count: v2Tweets.length,
        next_token: nitterResponse.data.data.pagination?.bottom
      },
      includes: {
        users
      }
    };
  } catch (error) {
    fastify.log.error(error);
    reply.code(500).send({
      errors: [{
        detail: error.message,
        status: 500,
        title: 'Internal Server Error',
        type: 'https://api.twitter.com/2/problems/internal-error'
      }]
    });
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const hasToken = guestTokenCache.token && Date.now() < guestTokenCache.expiresAt;
  
  reply.code(200).send({
    status: 'ok',
    guestTokenActive: hasToken,
    endpoints: {
      users: [
        '/2/users/:id/followers',
        '/2/users/:id/following',
        '/2/users/by/username/:username',
        '/2/users/:source_id/following/:target_id',
        '/2/users/:id/list_memberships',
        '/2/users/:id/owned_lists',
        '/2/users/:id/followed_lists',
        '/2/users/search?query='
      ],
      lists: [
        '/2/lists/:id',
        '/2/lists/:id/members',
        '/2/lists/:id/followers'
      ],
      trends: [
        '/2/trends/place/:woeid',
        '/2/trends/available',
        '/2/trends/closest?lat=&long='
      ],
      geo: [
        '/2/geo/search?query=',
        '/2/geo/reverse_geocode?lat=&long='
      ],
      other: [
        '/2/tweets/search/recent'
      ]
    }
  });
});

// GET /2/users/:id/tweets - Get user's tweets (via Nitter)
fastify.get('/2/users/:id/tweets', async (request, reply) => {
  try {
    const { id } = request.params;
    const { max_results = 10, pagination_token } = request.query;

    // First get username from user ID
    const guestToken = await getGuestToken();
    const userResponse = await axios.get(
      `${API_BASE}/1.1/users/show.json`,
      {
        params: { user_id: id },
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'x-guest-token': guestToken
        }
      }
    );

    const username = userResponse.data.screen_name;

    // Get tweets from Nitter
    const nitterResponse = await axios.get(
      `${NITTER_API}/${username}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        params: pagination_token ? { cursor: pagination_token } : {}
      }
    );

    const tweets = nitterResponse.data.data.timeline || [];
    const v2Tweets = tweets.slice(0, max_results).map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      created_at: new Date(tweet.time * 1000).toISOString(),
      author_id: id,
      public_metrics: {
        retweet_count: tweet.stats.retweets,
        reply_count: tweet.stats.replies,
        like_count: tweet.stats.likes,
        quote_count: tweet.stats.quotes
      },
      referenced_tweets: tweet.retweet ? [{
        type: 'retweeted',
        id: tweet.retweet.id
      }] : tweet.quote ? [{
        type: 'quoted',
        id: tweet.quote.id
      }] : undefined
    }));

    return {
      data: v2Tweets,
      meta: {
        result_count: v2Tweets.length,
        next_token: nitterResponse.data.data.pagination?.bottom,
        newest_id: v2Tweets[0]?.id,
        oldest_id: v2Tweets[v2Tweets.length - 1]?.id
      },
      includes: {
        users: [convertUserToV2(userResponse.data)]
      }
    };
  } catch (error) {
    if (error.response?.status === 404) {
      reply.code(404).send({
        errors: [{
          detail: 'Could not find user or tweets',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    } else {
      throw error;
    }
  }
});


// GET /2/users/by/username/:username/tweets - Get user's tweets by username (via Nitter)
fastify.get('/2/users/by/username/:username/tweets', async (request, reply) => {
  try {
    const { username } = request.params;
    const { max_results = 10, pagination_token } = request.query;

    // Get tweets from Nitter
    const nitterResponse = await axios.get(
      `${NITTER_API}/${username}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        params: pagination_token ? { cursor: pagination_token } : {}
      }
    );

    const userData = nitterResponse.data.data.timeline[0]?.user;
    const tweets = nitterResponse.data.data.timeline || [];
    
    const v2Tweets = tweets.slice(0, max_results).map(tweet => ({
      id: tweet.id,
      text: tweet.text,
      created_at: new Date(tweet.time * 1000).toISOString(),
      author_id: tweet.user.id,
      public_metrics: {
        retweet_count: tweet.stats.retweets,
        reply_count: tweet.stats.replies,
        like_count: tweet.stats.likes,
        quote_count: tweet.stats.quotes
      },
      referenced_tweets: tweet.retweet ? [{
        type: 'retweeted',
        id: tweet.retweet.id
      }] : tweet.quote ? [{
        type: 'quoted',
        id: tweet.quote.id
      }] : undefined
    }));

    return {
      data: v2Tweets,
      meta: {
        result_count: v2Tweets.length,
        next_token: nitterResponse.data.data.pagination?.bottom,
        newest_id: v2Tweets[0]?.id,
        oldest_id: v2Tweets[v2Tweets.length - 1]?.id
      },
      includes: userData ? {
        users: [{
          id: userData.id,
          username: userData.username,
          name: userData.fullname,
          created_at: new Date(userData.joinDate * 1000).toISOString(),
          protected: userData.protected,
          description: userData.bio,
          location: userData.location,
          url: userData.website,
          verified: userData.verifiedType === 'Blue',
          profile_image_url: `https://pbs.twimg.com/${userData.userPic}`,
          public_metrics: {
            followers_count: userData.followers,
            following_count: userData.following,
            tweet_count: userData.tweets,
            listed_count: 0
          }
        }]
      } : undefined
    };
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      reply.code(404).send({
        errors: [{
          detail: 'Could not find user or tweets',
          status: 404,
          title: 'Not Found',
          type: 'https://api.twitter.com/2/problems/resource-not-found'
        }]
      });
    } else {
      throw error;
    }
  }
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3003, host: '0.0.0.0' });
    console.log('Twitter v2 Proxy Server running on http://localhost:3003');
    console.log('');
    console.log('Example requests:');
    console.log('  GET http://localhost:3003/2/users/44196397/followers');
    console.log('  GET http://localhost:3003/2/users/44196397/following');
    console.log('  GET http://localhost:3003/2/lists/84839422/followers');
    console.log('  GET http://localhost:3003/health');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();