# IcarusFlow Vercel Deployment Guide

## 🚀 Quick Deployment

### Option 1: Use Existing Project (Recommended)
If you already have a Vercel project for IcarusFlow, use it to keep your domain and settings:

```bash
# Build the project first
npm run build

# Deploy (will ask you to link to existing project)
vercel

# For production deployment
vercel --prod
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → Your account
- **Link to existing project?** → Yes (if you have one)
- **What's your project's name?** → icarusflow (or keep existing)
- **In which directory is your code located?** → ./

### Option 2: Create New Deployment
If you want a fresh start:

```bash
# Build first
npm run build

# Deploy with new project
vercel --name icarusflow-v2

# After testing, deploy to production
vercel --prod
```

---

## ⚙️ Configuration

The deployment is configured via `vercel.json`:
- **Build**: Uses the compiled `dist/server.js`
- **Routing**: All requests go to the Express server
- **Environment**: Production mode

---

## 🔐 Environment Variables

**CRITICAL**: Set these in your Vercel dashboard after deployment:

### Required (Demo Mode)
None! The app works in demo mode without API keys.

### Optional (Production Features)

**For real LLM planning:**
```
OPENAI_API_KEY=your_key_here
LLM_MODEL=gpt-4
```

**For real MCP connectors:**
```
# Snowflake
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=your_db
SNOWFLAKE_WAREHOUSE=your_wh
SNOWFLAKE_SCHEMA=PUBLIC

# AWS S3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your_bucket

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@yourdomain.com
```

**For WeilChain (later):**
```
WEIL_CHAIN_RPC_URL=https://your-rpc-url
WEIL_PRIVATE_KEY=your_private_key
WEIL_CONTRACT_ADDRESS=0x...
WEIL_GAS_LIMIT=500000
```

To add these:
1. Go to your Vercel project dashboard
2. Settings → Environment Variables
3. Add each variable
4. Redeploy for changes to take effect

---

## 📋 Pre-Deployment Checklist

- [x] Build works locally: `npm run build`
- [x] Server runs: `npm run server`
- [x] Frontend connects to API
- [x] `vercel.json` configured
- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Run `vercel login` (if not logged in)
- [ ] Deploy!

---

## 🎯 Deployment Steps

```bash
# 1. Make sure everything builds
npm run build

# 2. Test locally one more time (optional)
npm run server

# 3. Deploy to Vercel
vercel

# 4. Test the preview URL
# Visit the URL Vercel gives you and test the app

# 5. Deploy to production
vercel --prod
```

---

## 🔍 Post-Deployment Testing

After deployment, test these:

1. **Homepage**: Should show the command center UI
2. **API Health**: Visit `/api/health` - should return JSON
3. **Execute Workflow**: Try running a workflow
4. **Check Console**: Look for any errors in browser console

---

## 🐛 Troubleshooting

**Build fails?**
- Check `npm run build` works locally
- Review build logs in Vercel dashboard

**500 errors?**
- Check Function Logs in Vercel dashboard
- Verify environment variables are set

**Frontend shows but API fails?**
- Check `/api/health` endpoint
- Review server logs in Vercel

**Best practice**: Always test on the preview URL before deploying to production!

---

## 📝 Recommendation

**Use the same Vercel project** if you already have one set up. This keeps:
- Your domain name
- Environment variables
- Analytics history
- Team settings

The new deployment will simply replace the old version with the updated UI and integrated server.
