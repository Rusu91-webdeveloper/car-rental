# Fix Vercel Database URL Issue

## Problem
You have `CAR_DATABASE_URL` set in Vercel (from Neon), but Prisma requires `DATABASE_URL` during the build process.

## Solution (Choose One)

### Option 1: Set DATABASE_URL in Vercel (Recommended - Most Reliable)

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Find `CAR_DATABASE_URL` and copy its value
3. Add a new environment variable:
   - **Name**: `DATABASE_URL`
   - **Value**: (paste the same value from `CAR_DATABASE_URL`)
   - **Environment**: Select all (Production, Preview, Development)
4. Save
5. Redeploy your project

**Why this works**: Prisma reads `DATABASE_URL` directly from the environment during build. Having it explicitly set ensures it's always available.

---

### Option 2: Rely on Automatic Normalization (Already Implemented)

I've updated `next.config.mjs` to automatically copy `CAR_DATABASE_URL` to `DATABASE_URL` if `DATABASE_URL` is not set. This should work, but Option 1 is more reliable.

**To use this:**
1. Just redeploy your project
2. The normalization will happen automatically during build

---

## Verify It's Working

After redeploying, check:

1. **Build Logs**: Should show Prisma generating successfully
2. **Function Logs**: Should not show database connection errors
3. **Health Check**: Visit `https://your-app.vercel.app/api/health` - should return `{"status":"healthy"}`

---

## Why This Happens

- Neon provides `CAR_DATABASE_URL` 
- Prisma schema expects `DATABASE_URL`
- The app has normalization logic, but Prisma reads the env var during build before normalization runs
- Setting both ensures compatibility

---

## Quick Fix Command (If Using Vercel CLI)

```bash
# Get your CAR_DATABASE_URL value first, then:
vercel env add DATABASE_URL production
# Paste the same value as CAR_DATABASE_URL
```

