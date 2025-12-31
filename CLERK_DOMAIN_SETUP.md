# Clerk Production Domain Setup

## ⚠️ Issue: Vercel.app Domain Not Allowed

Clerk requires a **custom domain** for production instances. The default Vercel domain (`car-rental-psi-cyan.vercel.app`) cannot be used.

## 🎯 Solutions

### Option 1: Add Custom Domain to Vercel (Recommended for Production)

**This is the proper production solution:**

1. **Get a Domain**
   - Purchase a domain from providers like:
     - [Namecheap](https://www.namecheap.com)
     - [Google Domains](https://domains.google)
     - [Cloudflare](https://www.cloudflare.com/products/registrar)
     - [GoDaddy](https://www.godaddy.com)

2. **Add Domain to Vercel**
   - Go to your Vercel project → **Settings** → **Domains**
   - Click **Add Domain**
   - Enter your domain (e.g., `yourdomain.com` or `www.yourdomain.com`)
   - Follow Vercel's DNS configuration instructions

3. **Configure DNS Records**
   - Add the DNS records Vercel provides to your domain registrar
   - Usually involves adding CNAME or A records
   - Wait for DNS propagation (can take a few minutes to 48 hours)

4. **Verify Domain in Vercel**
   - Once DNS propagates, Vercel will show domain as "Valid"
   - Your app will be accessible at `https://yourdomain.com`

5. **Update Clerk Production Instance**
   - Use `https://yourdomain.com` as your application domain
   - Update Clerk paths to use your custom domain

6. **Update Environment Variables**
   ```env
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```

---

### Option 2: Use Clerk Development Instance with Production Keys (Temporary Workaround)

**For testing/development, you can:**
1. Stay in Clerk's **Development** instance
2. Use **Production keys** (`pk_live_` and `sk_live_`) from the Development instance
3. Configure paths in Clerk dashboard
4. This allows you to test production authentication before getting a custom domain

**Limitations:**
- Not truly "production" grade
- Some Clerk production features may not be available
- You'll need to migrate to a production instance later when you get a domain

**Steps:**
1. In Clerk Dashboard, stay on **Development** instance
2. Get your keys (they may still be `pk_test_` or Clerk might provide production-like keys)
3. Configure as normal in Vercel
4. Plan to migrate to a custom domain later

---

### Option 3: Use Vercel Preview Domains for Testing

**For preview deployments only:**
- Clerk development instance might work with preview URLs
- Each Vercel preview deployment gets a unique URL
- Good for testing, but not for production

**Note:** This won't work for production as Clerk explicitly blocks `.vercel.app` domains.

---

## 🔧 Recommended Approach

### Immediate (Testing):
1. Use Clerk **Development** instance with production-like keys
2. Test authentication flow
3. Get everything working locally and on preview deployments

### Production (When Ready):
1. Purchase a custom domain
2. Add it to Vercel
3. Configure DNS
4. Create Clerk **Production** instance with custom domain
5. Migrate production keys to Vercel
6. Deploy to production

---

## 📋 Quick Checklist

### For Testing (Now):
- [ ] Use Clerk Development instance
- [ ] Get Clerk keys (may be `pk_test_` or `pk_live_` depending on instance)
- [ ] Add keys to Vercel environment variables
- [ ] Test on preview deployments
- [ ] Test locally

### For Production (Later):
- [ ] Purchase custom domain
- [ ] Add domain to Vercel project
- [ ] Configure DNS records
- [ ] Wait for DNS propagation
- [ ] Verify domain works
- [ ] Create Clerk Production instance
- [ ] Add custom domain to Clerk
- [ ] Get production keys
- [ ] Update Vercel environment variables
- [ ] Update `NEXT_PUBLIC_APP_URL` to custom domain
- [ ] Deploy

---

## 💡 Domain Suggestions

Good domain options for a car rental app:
- `rentacar.com` / `rentacar.eu`
- `mycarrental.com`
- `bookacar.com`
- `driveme.com`
- Or use a subdomain of a domain you already own

**Cost:** Typically $10-15/year for basic domains

---

## 🆘 Need Help?

If you're not ready to purchase a domain yet:
1. Continue development with Clerk Development instance
2. Test thoroughly with preview deployments
3. When ready to go live, add a custom domain
4. Migrate to Clerk Production instance

Your app code is already configured correctly - you just need the custom domain for Clerk's production requirements!

