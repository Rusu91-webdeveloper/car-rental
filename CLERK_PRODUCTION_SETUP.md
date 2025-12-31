# Clerk Production Setup Guide for Vercel

This guide will help you configure Clerk authentication for production deployment on Vercel.

## 🔑 Step 1: Get Production Clerk Keys

1. **Go to Clerk Dashboard**
   - Visit [https://dashboard.clerk.com](https://dashboard.clerk.com)
   - Select your application (or create a new one for production)

2. **Switch to Production Instance**
   - In the Clerk dashboard, look for the environment switcher (usually top-right)
   - Switch from "Development" to "Production"
   - Or create a new production instance if you don't have one

3. **Get Production API Keys**
   - Navigate to **API Keys** in the sidebar
   - Copy the following keys:
     - **Publishable Key** (starts with `pk_live_...`)
     - **Secret Key** (starts with `sk_live_...`)

   ⚠️ **Important**: Make sure you're copying **PRODUCTION** keys (with `live`), NOT development keys (with `test`)

---

## 🌐 Step 2: Configure Clerk URLs for Production

1. **Go to Clerk Dashboard → Configure → Paths**
   - Set the following paths (your app supports both `/en` and `/de` locales):
     - **Sign-in URL**: `/en/sign-in` (Clerk will handle locale prefix automatically)
     - **Sign-up URL**: `/en/sign-up`
     - **After sign-in URL**: `/en` (or set to `/:locale` if Clerk supports wildcards)
     - **After sign-up URL**: `/en`
   
   **Note for Multi-Locale Setup:**
   - Your app supports both English (`/en`) and German (`/de`)
   - Clerk will automatically redirect to the correct locale based on the current page
   - If Clerk doesn't support wildcards, set both:
     - Primary: `/en/sign-in` and `/en/sign-up`
     - Alternative: Also ensure `/de/sign-in` and `/de/sign-up` work (Clerk may handle this automatically)

2. **Configure Allowed Origins**
   - Go to **Configure → CORS**
   - Add your production domain(s):
     - `https://your-app.vercel.app`
     - `https://your-custom-domain.com` (if applicable)

3. **Configure Webhooks (Optional but Recommended)**
   - Go to **Webhooks** in the sidebar
   - Click **Add Endpoint**
   - URL: `https://your-app.vercel.app/api/webhooks/clerk`
   - Select events you want to listen to:
     - `user.created`
     - `user.updated`
     - `user.deleted`
   - Copy the **Signing Secret** (starts with `whsec_...`)

---

## ⚙️ Step 3: Set Environment Variables in Vercel

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Go to **Settings** → **Environment Variables**

2. **Add/Update the following variables for Production:**

   ```env
   # Remove or set to false for production
   NEXT_PUBLIC_DEMO_MODE=false

   # Clerk Production Keys (REQUIRED)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
   CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx

   # Production App URL (REQUIRED)
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

   # Clerk Webhook Secret (if using webhooks)
   CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
   ```

3. **Important Settings:**
   - Make sure these variables are set for **Production** environment
   - Optionally set for **Preview** if you want auth on preview deployments
   - **DO NOT** set `NEXT_PUBLIC_DEMO_MODE=true` in production

---

## 🔄 Step 4: Update Vercel Deployment

1. **Redeploy Your Application**
   - After setting environment variables, go to **Deployments**
   - Click **Redeploy** on your latest deployment
   - Or push a new commit to trigger a deployment

2. **Verify Deployment**
   - Check build logs to ensure no errors
   - Visit your production URL
   - Try signing up/in to verify Clerk is working

---

## ✅ Step 5: Verify Production Setup

1. **Check Environment Variables**
   - In Vercel: Settings → Environment Variables
   - Verify all keys are set for Production
   - Keys should start with `pk_live_` and `sk_live_` (NOT `pk_test_` or `sk_test_`)

2. **Test Authentication Flow (Test Both Locales)**
   - Visit: `https://your-app.vercel.app/en/sign-up` (English)
   - Visit: `https://your-app.vercel.app/de/sign-up` (German)
   - Create a test account in both locales
   - Verify you can sign in/sign out
   - Check that protected routes work correctly in both languages
   - Test language switching while authenticated

3. **Check Console for Errors**
   - Open browser DevTools
   - Check Console and Network tabs
   - Look for any Clerk-related errors

---

## 🚨 Troubleshooting

### Issue: "Invalid API key" or "Clerk error"

**Solution:**
- Verify you're using **production keys** (`pk_live_` and `sk_live_`)
- Make sure keys are set in Vercel for the **Production** environment
- Redeploy after setting environment variables

### Issue: Redirect loops or authentication not working

**Solution:**
- Check Clerk dashboard → Paths configuration
- Verify `NEXT_PUBLIC_APP_URL` matches your actual domain
- Ensure paths include locale prefix: `/en/sign-in` not just `/sign-in`
- Test both locales (`/en/sign-in` and `/de/sign-in`) to ensure both work
- If one locale works but the other doesn't, check Clerk's path configuration supports multiple locales

### Issue: "ClerkProvider can only be used within..."

**Solution:**
- This means `NEXT_PUBLIC_DEMO_MODE` is set incorrectly
- Remove `NEXT_PUBLIC_DEMO_MODE` or set it to `false` in production
- Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set

### Issue: Webhooks not working

**Solution:**
- Verify webhook URL in Clerk dashboard matches your production URL
- Check `CLERK_WEBHOOK_SECRET` is set in Vercel
- Verify webhook endpoint exists: `/api/webhooks/clerk`

---

## 📋 Checklist

Before going live, verify:

- [ ] Production Clerk keys obtained (`pk_live_` and `sk_live_`)
- [ ] Clerk dashboard configured with production URLs
- [ ] Environment variables set in Vercel for Production
- [ ] `NEXT_PUBLIC_DEMO_MODE` is NOT set to `true` (or set to `false`)
- [ ] `NEXT_PUBLIC_APP_URL` matches your production domain
- [ ] Application redeployed after setting environment variables
- [ ] Test sign-up/sign-in flow works
- [ ] Protected routes require authentication
- [ ] Admin routes require authentication
- [ ] No Clerk errors in browser console

---

## 🔐 Security Best Practices

1. **Never commit Clerk keys to git**
   - Keys should only be in Vercel environment variables
   - Use `.env.local` for local development (not committed)

2. **Use different Clerk instances for dev/prod**
   - Development: Use keys with `pk_test_` and `sk_test_`
   - Production: Use keys with `pk_live_` and `sk_live_`

3. **Enable Webhooks**
   - Helps keep user data in sync
   - Enables real-time user updates

4. **Configure CORS properly**
   - Only allow your production domains
   - Don't use wildcards in production

---

## 📚 Additional Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Next.js Guide](https://clerk.com/docs/quickstarts/nextjs)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

## 🌍 Multi-Locale Support (English + German)

Your app supports both **English** (`/en`) and **German** (`/de`) locales. See `CLERK_MULTI_LOCALE_SETUP.md` for detailed multi-locale configuration guide.

**Quick Note:**
- Set Clerk paths to `/en/sign-in` and `/en/sign-up` as defaults
- The middleware automatically handles both `/en/*` and `/de/*` routes
- Test both locales after deployment to ensure everything works

---

## 🆘 Need Help?

If you encounter issues:

1. Check Vercel build logs for errors
2. Check browser console for client-side errors
3. Verify all environment variables are set correctly
4. Ensure you're using production keys, not development keys
5. Make sure Clerk dashboard URLs match your app structure

