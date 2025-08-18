# Deploy Twitter v2 API Proxy to Vercel

## 🚀 Quick Deploy

### 1. Prerequisites
- Vercel account (free at vercel.com)
- Node.js installed locally
- Git installed

### 2. One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/twitter-v2-proxy)

### 3. Manual Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Clone the repository
git clone [your-repo-url]
cd twitter-v2-proxy

# Deploy to Vercel
vercel

# Follow the prompts:
# - Link to existing project? No
# - What's your project name? twitter-v2-proxy
# - In which directory is your code? ./
# - Want to override settings? No
```

### 4. Environment Variables

After deployment, add these environment variables in Vercel Dashboard:

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Environment Variables
3. Add the following:

```
BEARER_TOKEN = AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA
NITTER_API = https://nitter.r2d2.to/api
SNAPLYTICS_API = https://twittermedia.b-cdn.net/viewer/
```

### 5. Test Your Deployment

Once deployed, test your endpoints:

```bash
# Replace YOUR_DOMAIN with your Vercel domain
curl https://YOUR_DOMAIN.vercel.app/

# Test user endpoint
curl https://YOUR_DOMAIN.vercel.app/2/users/by/username/elonmusk

# Test followers endpoint
curl https://YOUR_DOMAIN.vercel.app/2/users/44196397/followers

# Test search endpoint
curl https://YOUR_DOMAIN.vercel.app/2/tweets/search/recent?query=javascript
```

## 📁 Project Structure for Vercel

```
twitter-v2-proxy/
├── api/
│   └── index.js        # Main serverless function
├── vercel.json         # Vercel configuration
├── package.json        # Dependencies
├── .env.example        # Environment variables template
└── README_VERCEL.md    # This file
```

## 🔧 Configuration

### vercel.json
- Routes all `/2/*` requests to the serverless function
- Configures environment variables
- Sets up builds with Node.js runtime

### api/index.js
- Single serverless function handling all endpoints
- Stateless design perfect for serverless
- Automatic scaling with Vercel

## 📊 Available Endpoints

All endpoints are accessible at `https://YOUR_DOMAIN.vercel.app/2/...`

### User Endpoints
- `GET /2/users/by/username/:username`
- `GET /2/users/:id/followers`
- `GET /2/users/:id/following`
- `GET /2/users/search?query=term`

### Tweet Endpoints
- `GET /2/tweets/:id`
- `GET /2/tweets/search/recent?query=term`
- `GET /2/users/:id/tweets`

### Trending Topics
- `GET /2/trends/place/:woeid`
- `GET /2/trends/available`
- `GET /2/trends/closest`

### Geo Endpoints
- `GET /2/geo/search?query=location`
- `GET /2/geo/reverse_geocode?lat=37.7&long=-122.4`

## 🚨 Important Notes

### Rate Limits
- Vercel has a 10-second timeout for serverless functions (Free tier)
- 100GB bandwidth per month (Free tier)
- Guest tokens have 15 requests per 15 minutes limit
- Consider implementing caching for production use

### Security
- The Bearer token is public (from Android APK)
- Don't expose any private keys or credentials
- Enable CORS as needed in the code

### Monitoring
- Check Vercel Dashboard for:
  - Function logs
  - Error rates
  - Execution duration
  - Bandwidth usage

## 🔄 Updates and Maintenance

### To update your deployment:

```bash
# Make changes locally
git add .
git commit -m "Update proxy"

# Deploy updates
vercel --prod
```

### To check logs:

```bash
vercel logs
```

### To manage environment variables:

```bash
vercel env ls
vercel env add VARIABLE_NAME
```

## 💰 Cost

**Vercel Free Tier includes:**
- Unlimited deployments
- 100GB bandwidth/month
- Serverless function execution
- Custom domains
- HTTPS by default

This should be sufficient for most use cases. The proxy is lightweight and efficient.

## 🐛 Troubleshooting

### Common Issues:

1. **"Function timeout"**
   - Reduce timeout in axios calls
   - Optimize slow endpoints
   - Consider Vercel Pro for 60-second timeout

2. **"Rate limit exceeded"**
   - Implement token rotation
   - Add caching layer
   - Use Redis for token management

3. **"CORS errors"**
   - Check CORS headers in api/index.js
   - Ensure OPTIONS requests are handled

4. **"Guest token expired"**
   - Token cache is per-instance
   - Consider external token storage for production

## 📝 License

This proxy demonstrates API security vulnerabilities for educational purposes. Use responsibly and comply with Twitter's Terms of Service.

## 🔗 Links

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI](https://vercel.com/cli)
- [Project Dashboard](https://vercel.com/dashboard)