# Twitter v2 Proxy (guest-only)

Free, read-only mimic of the Twitter/X v2 API built on guest tokens, Rettiwt, and Nitter/VX/FX fallbacks. It serves the core unauthenticated read surface (users, tweets, lists, geo) and explicitly returns `403` for official endpoints that require OAuth (counts/full-archive, bookmarks/likes, etc.).

## What it covers (read-only)
- Users: `GET /2/users/:id`, `GET /2/users?ids`, `GET /2/users/by/username/:username`, `GET /2/users/by?usernames`, `GET /2/users/search`, `GET /2/users/:id/followers`, `GET /2/users/:id/following`, `GET /2/users/:source_id/following/:target_id`, `GET /2/users/:id/list_memberships`, `GET /2/users/:id/owned_lists`, `GET /2/users/:id/followed_lists`, `GET /2/users/:id/tweets`, `GET /2/users/by/username/:username/tweets`, `GET /2/users/:id/mentions`
- Tweets: `GET /2/tweets/:id`, `GET /2/tweets?ids`, `GET /2/tweets/:id/liking_users`, `GET /2/tweets/:id/retweeted_by`, `GET /2/tweets/:id/quote_tweets`, `GET /2/tweets/search/recent`
- Lists: `GET /2/lists/:id`, `GET /2/lists/:id/members`, `GET /2/lists/:id/followers`, `GET /2/lists/:id/tweets`
- Geo/System: `GET /2/geo/search`, `GET /2/system/init-tokens`, `/health`, `/`

## What it does **not** serve (returns 403)
- Tweet counts: `GET /2/tweets/counts/recent|all`
- Full-archive search: `GET /2/tweets/search/all`
- Any other OAuth-only endpoints (likes/bookmarks/blocks/mutes/write surfaces) remain unsupported.

## Data sources
- **Rettiwt**: primary for users, timelines, tweet details, likers/retweeters, lists.
- **Nitter**: fallback for profiles, timelines, user search, and date-filtered recent search.
- **VX/FX Twitter**: fallback for tweet details when Rettiwt/Nitter miss.
- **Guest tokens**: pooled to stay within v1.1 guest limits where needed.

## Environment
- `BEARER_TOKEN`: v1.1 bearer for guest activation (default baked in).
- `RETTIWT_API_KEY`: API key for Rettiwt (default baked in).
- `NITTER_API`: Nitter JSON endpoint (default: `https://nitter.r2d2.to/api`).
- `SNAPLYTICS_API`: Media helper base (default: `https://twittermedia.b-cdn.net/viewer/`).

## Run locally
```sh
npm install
npm run dev   # fastify server on PORT (default 3003)
```
The Fastify adapter proxies everything to `api/index.js` so local and Vercel behave the same.

## Deploy (Vercel)
- The repo is wired with `vercel.json`; production deploy: `npm run deploy` or `vercel --prod`.
- Routes: `/` and `/2/*` (plus `/health`) map to `api/index.js`.

## Usage examples
```sh
# User by username
curl "https://twitter-v2-proxy.vercel.app/2/users/by/username/elonmusk?user.fields=public_metrics"

# Single tweet with author/media expansions
curl "https://twitter-v2-proxy.vercel.app/2/tweets/1848812205222023367?expansions=author_id,attachments.media_keys&media.fields=type,url"

# Recent search
curl "https://twitter-v2-proxy.vercel.app/2/tweets/search/recent?query=OpenAI&max_results=5&tweet.fields=public_metrics"

# Counts/full-archive (returns 403 by design)
curl -i "https://twitter-v2-proxy.vercel.app/2/tweets/counts/recent?query=OpenAI"
```

## Caveats
- Guest-only: write surfaces and protected content are not available.
- Counts/full-archive need real OAuth (elevated/academic); we return 403 to mirror the official API.
- Upstream fallbacks (Nitter/VX/FX) can occasionally miss media/entities; retries may help.
