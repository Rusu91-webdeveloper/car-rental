# Car Rental App - Production Setup Guide

This app requires several integrations for full functionality. Follow these steps to set up your production environment.

## Production Setup

### 1. Database (Required)

**Option A: Neon (Recommended)**
1. Go to [Neon Console](https://console.neon.tech)
2. Create a new project
3. Copy the connection string
4. Add to Vars: `DATABASE_URL=postgresql://...`

**Option B: Other PostgreSQL**
- Use any PostgreSQL database (Supabase, Railway, etc.)
- Add connection string to `DATABASE_URL`

**Setup Database:**
```bash
npm run db:push    # Create tables
npm run db:seed    # Add sample data
```

### 2. Authentication - Google OAuth (Required)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - For development: `http://localhost:3000/api/auth/callback/google`
     - For production: `https://yourdomain.com/api/auth/callback/google`
   - Copy the Client ID and Client Secret
5. Add to Vars:
   - `GOOGLE_CLIENT_ID=your-google-client-id`
   - `GOOGLE_CLIENT_SECRET=your-google-client-secret`
   - `NEXTAUTH_SECRET=your-random-secret` (generate a random string, e.g., `openssl rand -base64 32`)
   - `NEXTAUTH_URL=http://localhost:3000` (development) or `https://yourdomain.com` (production)

### 3. Payments - Stripe (Required for bookings)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your API keys (use test mode initially)
3. Add to Vars:
   - `STRIPE_SECRET_KEY=sk_test_...`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`

**Setup Webhook:**
1. Install Stripe CLI: `stripe login`
2. Forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Copy webhook secret to: `STRIPE_WEBHOOK_SECRET=whsec_...`

### 4. Email - Gmail SMTP

1. Use a dedicated Gmail or Google Workspace mailbox.
2. Enable Google 2-Step Verification and create a 16-character App Password.
3. Add to Vars:
   - `GMAIL_SMTP_USER=bookings@example.com`
   - `GMAIL_SMTP_APP_PASSWORD=<16-character-app-password>`
   - `EMAIL_FROM="Qujo Autovermietung GmbH <bookings@example.com>"`

### 5. App URL

Add to Vars:
- `NEXTAUTH_URL=http://localhost:3000` (development)
- `NEXTAUTH_URL=https://yourdomain.com` (production)
- `NEXT_PUBLIC_APP_URL` can also be set (falls back to NEXTAUTH_URL)

## Admin Access

Users with emails listed in `ADMIN_EMAILS` environment variable will automatically be assigned the admin role on first sign-in.

To set admin emails:
- Add to Vars: `ADMIN_EMAILS=admin1@example.com,admin2@example.com`
- Default: `admin@rentcar.com`

To manually make a user an admin:
1. Use Prisma Studio: `npm run db:studio`
2. Find the user in the User table
3. Change their role to "ADMIN"

## Environment Variables Summary

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `NEXTAUTH_SECRET` - Random secret for NextAuth (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Your app URL (http://localhost:3000 for dev, https://yourdomain.com for prod)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe public key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

**Required for transactional email:**
- `GMAIL_SMTP_USER` - Dedicated Gmail or Google Workspace mailbox
- `GMAIL_SMTP_APP_PASSWORD` - Google App Password, never the normal account password
- `EMAIL_FROM` - Sender name and authenticated mailbox

**Optional:**
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses
- `NEXT_PUBLIC_APP_URL` - Alternative app URL (falls back to NEXTAUTH_URL)

## Testing the App

1. **Setup Database**: Run `npm run db:push && npm run db:seed`
2. **Setup Google OAuth**: Follow steps above to get Google OAuth credentials
3. **Sign In**: Visit `/sign-in` and sign in with your Google account
4. **Test Booking**: Browse cars, select dates, and complete checkout
5. **Test Admin**: Sign in with an admin email and manage bookings/cars at `/admin`

## Troubleshooting

**Authentication Error:**
- Make sure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET` are set
- Verify `NEXTAUTH_URL` matches your current URL (http://localhost:3000 for dev)
- Check that redirect URI in Google Console matches: `[NEXTAUTH_URL]/api/auth/callback/google`

**Database Error:**
- Check `DATABASE_URL` is correct
- Run `npm run db:push` to create tables

**Stripe Error:**
- Verify both publishable and secret keys are set
- Use test mode keys (start with `pk_test_` and `sk_test_`)

**Need Help?**
- Check the Vars section in the left sidebar
- All environment variables should be added there
