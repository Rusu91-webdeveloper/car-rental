# Clerk Production Quick Start 🚀

**Quick checklist to get Clerk working in production on Vercel**

## ⚠️ IMPORTANT: Domain Requirement

**Clerk requires a custom domain for production instances.** The default Vercel URL (`*.vercel.app`) cannot be used.

**Options:**
1. **Add a custom domain** to your Vercel project (recommended for production)
2. **Use Clerk Development instance** with production keys (workaround for testing)

See `CLERK_DOMAIN_SETUP.md` for detailed domain setup instructions.

---

## ✅ Essential Steps

### 1. Get Production Keys from Clerk

**Option A: With Custom Domain (Production)**
- Go to [Clerk Dashboard](https://dashboard.clerk.com)
- Create/select **Production** instance
- Enter your custom domain (e.g., `https://yourdomain.com`)
- Copy keys (must start with `pk_live_` and `sk_live_`)

**Option B: Development Instance (Testing)**
- Stay in Clerk **Development** instance
- Get keys (may be `pk_test_` or production-like keys)
- Use these for testing until you get a custom domain

### 2. Add to Vercel Environment Variables
In Vercel → Settings → Environment Variables → Production:

```env
# Remove demo mode
NEXT_PUBLIC_DEMO_MODE=false

# Add production Clerk keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxx

# Set your production URL
# Use custom domain if available, otherwise use vercel.app for testing
NEXT_PUBLIC_APP_URL=https://yourdomain.com
# OR for testing without custom domain:
# NEXT_PUBLIC_APP_URL=https://car-rental-psi-cyan.vercel.app
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

## 📖 Full Guides

- `CLERK_PRODUCTION_SETUP.md` - Detailed production setup instructions
- `CLERK_DOMAIN_SETUP.md` - **Custom domain setup guide** (IMPORTANT!)
- `CLERK_MULTI_LOCALE_SETUP.md` - Multi-locale (en/de) configuration

