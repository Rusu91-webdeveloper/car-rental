# Clerk Production Quick Start 🚀

**Quick checklist to get Clerk working in production on Vercel**

## ✅ Essential Steps

### 1. Get Production Keys from Clerk
- Go to [Clerk Dashboard](https://dashboard.clerk.com)
- Switch to **Production** instance
- Copy keys (must start with `pk_live_` and `sk_live_`, NOT `pk_test_`)

### 2. Add to Vercel Environment Variables
In Vercel → Settings → Environment Variables → Production:

```env
# Remove demo mode
NEXT_PUBLIC_DEMO_MODE=false

# Add production Clerk keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxx

# Set your production URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3. Configure Clerk Dashboard URLs
In Clerk Dashboard → Configure → Paths:

- **Sign-in URL**: `/en/sign-in` 
- **Sign-up URL**: `/en/sign-up`
- **After sign-in**: `/en`
- **After sign-up**: `/en`

**Note:** Your app supports both `/en` (English) and `/de` (German). Clerk will automatically handle locale-based redirects. If you primarily use English, set `/en/*` as above. The middleware will ensure `/de/sign-in` and `/de/sign-up` also work correctly.

### 4. Redeploy
- Redeploy your Vercel app after setting environment variables

---

## 🔍 Verify It's Working (Test Both Languages)

1. Visit: `https://your-app.vercel.app/en/sign-up` (English)
2. Visit: `https://your-app.vercel.app/de/sign-up` (German)
3. Try creating an account in both locales
4. Check browser console for errors
5. Verify protected routes require login in both languages
6. Test language switching while signed in

---

## ❌ Common Mistakes

- ❌ Using `pk_test_` keys (development) instead of `pk_live_` (production)
- ❌ Forgetting to set `NEXT_PUBLIC_APP_URL`
- ❌ Setting `NEXT_PUBLIC_DEMO_MODE=true` in production
- ❌ Not redeploying after setting environment variables
- ❌ Wrong URLs in Clerk dashboard (missing locale prefix)

---

## 📖 Full Guide

See `CLERK_PRODUCTION_SETUP.md` for detailed instructions and troubleshooting.

