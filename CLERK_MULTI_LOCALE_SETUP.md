# Clerk Multi-Locale Setup Guide (English + German)

Your car rental app supports both **English** (`/en`) and **German** (`/de`) locales. Here's how to configure Clerk for this multi-locale setup.

## 🌍 Understanding Your Locale Setup

- **English**: Routes prefixed with `/en` (e.g., `/en/sign-in`, `/en/cars`)
- **German**: Routes prefixed with `/de` (e.g., `/de/sign-in`, `/de/cars`)
- **Default Locale**: English (`/en`)
- **Supported Locales**: `en`, `de`

## ⚙️ Clerk Dashboard Configuration

### Path Configuration

In **Clerk Dashboard → Configure → Paths**, set:

- **Sign-in URL**: `/en/sign-in`
- **Sign-up URL**: `/en/sign-up`
- **After sign-in URL**: `/en`
- **After sign-up URL**: `/en`

**Why `/en` only?**
- Clerk uses these as base/default paths
- Your middleware (`middleware.ts`) automatically handles locale prefixes
- When a user visits `/de/sign-in`, the middleware processes it correctly
- Clerk will redirect back to the same locale the user started from

### Alternative: Multiple Path Entries (If Needed)

Some Clerk configurations allow multiple path entries. If you see this option:

1. **Primary Entry**:
   - Sign-in: `/en/sign-in`
   - Sign-up: `/en/sign-up`
   - After sign-in: `/en`
   - After sign-up: `/en`

2. **Secondary Entry** (if supported):
   - Sign-in: `/de/sign-in`
   - Sign-up: `/de/sign-up`
   - After sign-in: `/de`
   - After sign-up: `/de`

**Note**: Usually, Clerk's middleware will handle locale redirects automatically, so the first option should be sufficient.

## 🔄 How It Works

1. **User visits `/de/sign-in`** (German locale)
   - Middleware processes the locale (`/de`)
   - Clerk handles authentication
   - After sign-in, Clerk redirects to `/de` (maintaining the locale)

2. **User visits `/en/sign-in`** (English locale)
   - Middleware processes the locale (`/en`)
   - Clerk handles authentication
   - After sign-in, Clerk redirects to `/en` (maintaining the locale)

3. **Protected Route Access**
   - If user is on `/de/cars` and not authenticated
   - Middleware redirects to `/de/sign-in` (preserves locale)
   - After sign-in, redirects back to `/de/cars`

## ✅ Testing Checklist

Test both locales to ensure everything works:

### English Locale (`/en`)
- [ ] `/en/sign-up` - Can create account
- [ ] `/en/sign-in` - Can sign in
- [ ] After sign-in, redirects to `/en` (home page)
- [ ] Protected routes like `/en/profile` require authentication
- [ ] Can sign out from `/en` locale

### German Locale (`/de`)
- [ ] `/de/sign-up` - Can create account (account creation form may be in English, but URL stays `/de`)
- [ ] `/de/sign-in` - Can sign in
- [ ] After sign-in, redirects to `/de` (home page)
- [ ] Protected routes like `/de/profile` require authentication
- [ ] Can sign out from `/de` locale

### Cross-Locale Navigation
- [ ] Can switch from `/en` to `/de` while signed in
- [ ] Authentication persists across locale switches
- [ ] Can access `/de/profile` after signing in via `/en/sign-in` (session persists)

## 🐛 Troubleshooting Multi-Locale Issues

### Issue: Sign-in always redirects to `/en` even when starting from `/de`

**Solution:**
- Check middleware is correctly preserving locale in redirects
- Verify `next-intl` navigation helpers are used for redirects
- Ensure Clerk's `forceRedirectUrl` in sign-in page respects locale

### Issue: After sign-in, user loses their locale (redirects to `/en`)

**Solution:**
- Update Clerk dashboard "After sign-in URL" to use locale-aware path
- Or configure it dynamically in code (your current setup should handle this)

### Issue: One locale works but the other doesn't

**Solution:**
- Verify middleware routes include both locales: `/:locale(${locales.join("|")})`
- Check that both `/en/sign-in` and `/de/sign-in` are in public routes matcher
- Ensure `next-intl` middleware runs before Clerk middleware

## 📝 Code Configuration

Your current setup in `middleware.ts` already handles this correctly:

```typescript
const localeMatcher = `/:locale(${locales.join("|")})` // Matches /en or /de

const isPublicRoute = createRouteMatcher([
  `${localeMatcher}/sign-in(.*)`,  // Matches /en/sign-in and /de/sign-in
  `${localeMatcher}/sign-up(.*)`,  // Matches /en/sign-up and /de/sign-up
  // ... other routes
])
```

The middleware processes locales first, then applies Clerk authentication, ensuring locale is preserved throughout the auth flow.

## 🎯 Best Practices

1. **Always test both locales** when deploying Clerk changes
2. **Use locale-aware redirects** in your code (via `navigation.ts` helpers)
3. **Preserve locale** when redirecting for authentication
4. **Set default to `/en`** but ensure `/de` works equally well
5. **Test language switching** while authenticated to ensure session persists

---

## 🚀 Quick Setup Reminder

1. **Clerk Dashboard**: Set paths to `/en/sign-in`, `/en/sign-up`, etc.
2. **Vercel Environment**: Set production Clerk keys
3. **Test**: Verify both `/en/sign-in` and `/de/sign-in` work
4. **Deploy**: Redeploy after configuration changes

Your app is already configured correctly in code - just ensure Clerk dashboard paths are set and test both locales!

