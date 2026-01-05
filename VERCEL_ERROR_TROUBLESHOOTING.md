# Vercel Server-Side Error Troubleshooting Guide

## 🔍 Common Causes of Server-Side Errors on Vercel

### 1. **Missing Database URL (MOST LIKELY CAUSE)** ⚠️

**Problem**: The app requires `DATABASE_URL` or `CAR_DATABASE_URL` to be set. If missing, the app crashes on startup.

**Check in Vercel Dashboard:**
1. Go to your project → Settings → Environment Variables
2. Verify `DATABASE_URL` or `CAR_DATABASE_URL` is set
3. Make sure it's set for **Production** environment (and Preview if needed)

**Fix:**
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

**How to get a database:**
- Use Vercel Postgres (recommended): Project → Storage → Create Database
- Or use Neon, Supabase, Railway, etc.

---

### 2. **Missing NextAuth Configuration**

**Problem**: The app requires NextAuth authentication configuration.

**Check:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `NEXTAUTH_SECRET` - Random secret for NextAuth (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Your app URL

**Fix:**
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000  # or https://yourdomain.com for production
```

See SETUP.md for detailed Google OAuth setup instructions.

---

### 3. **Prisma Client Not Generated**

**Problem**: Prisma Client must be generated during build. The `postinstall` script should handle this, but it can fail if:
- Database URL is missing during build
- `tsx` package is not installed
- Build process is interrupted

**Check Build Logs:**
Look for errors like:
- `Cannot find module '@prisma/client'`
- `Prisma Client has not been generated yet`

**Fix:**
1. Ensure `DATABASE_URL` is set in Vercel (even if database is empty)
2. The `postinstall` script should run automatically: `tsx scripts/with-db-url.ts prisma generate`

---

### 4. **Database Connection Issues**

**Problem**: Database URL is set but connection fails.

**Common Issues:**
- SSL required but not enabled: Add `?sslmode=require` to connection string
- Wrong credentials
- Database doesn't exist
- Network restrictions (IP whitelist)

**Fix:**
1. Test connection string locally
2. Ensure SSL is enabled: `?sslmode=require`
3. Check database provider's connection requirements

---

### 5. **Middleware Errors**

**Problem**: The middleware might fail if:
- NextAuth configuration is invalid
- i18n configuration is incorrect
- Route matching fails

**Check:**
- Middleware logs in Vercel function logs
- Verify `i18n.ts` and `middleware.ts` are correct
- Check NextAuth environment variables are set correctly

---

## 🔧 Step-by-Step Fix

### Step 1: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the failed deployment
3. Check "Function Logs" or "Build Logs"
4. Look for the actual error message (not just "Application error")

### Step 2: Verify Environment Variables

**Required for Production:**
```env
DATABASE_URL=your_postgresql_connection_string
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=https://your-domain.vercel.app
```

### Step 3: Test Database Connection

1. Set up a database (Vercel Postgres, Neon, etc.)
2. Run migrations: `pnpm run db:deploy` (or push schema)
3. Verify connection string format:
   ```
   postgresql://user:password@host:port/database?sslmode=require
   ```

### Step 4: Redeploy

1. After fixing environment variables, trigger a new deployment
2. Or push a new commit to trigger automatic deployment

---

## 🐛 How to Get Detailed Error Logs

### Option 1: Vercel Function Logs
1. Vercel Dashboard → Project → Deployments
2. Click on deployment → "Functions" tab
3. Click on a function → View logs

### Option 2: Add Error Logging
Check if errors are being logged in:
- `lib/logger.ts`
- API routes (they log to console)
- Server actions (they log to console)

### Option 3: Test Locally
1. Copy environment variables from Vercel to `.env.local`
2. Run `pnpm run build`
3. Run `pnpm start`
4. Check for errors in terminal

---

## ✅ Quick Checklist

- [ ] `DATABASE_URL` is set in Vercel environment variables
- [ ] Database connection string includes `?sslmode=require` (if required)
- [ ] Database exists and is accessible
- [ ] Prisma migrations have been run (`db:deploy` or `db:push`)
- [ ] NextAuth environment variables are set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL)
- [ ] `NEXT_PUBLIC_APP_URL` is set to your Vercel domain
- [ ] Build completes successfully (check build logs)
- [ ] No TypeScript errors in build

---

## 🆘 Still Not Working?

1. **Check the exact error** in Vercel function logs
2. **Share the error message** - it will help identify the specific issue
3. **Verify build succeeds** - if build fails, fix that first
4. **Test database connection** - use a database client to verify

---

## 📝 Most Common Fix

**90% of the time, the issue is:**
1. Missing `DATABASE_URL` environment variable
2. Database URL is incorrect or missing SSL parameter

**Quick fix:**
1. Add `DATABASE_URL` to Vercel environment variables
2. Ensure it includes `?sslmode=require` at the end
3. Redeploy

