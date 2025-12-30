# Car Rental App - Production Setup Guide

This app requires several integrations for full functionality. Follow these steps to set up your production environment.

## Quick Start (Demo Mode)

To test the app without setting up integrations:

1. Set `NEXT_PUBLIC_DEMO_MODE=true` in your environment variables (Vars section in sidebar)
2. Run the app - authentication and payments will use mock implementations

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

### 2. Authentication - Clerk (Required)

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new application
3. Copy your keys from API Keys page
4. Add to Vars:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...`
   - `CLERK_SECRET_KEY=sk_test_...`

**Configure Clerk:**
- Enable Email/Password authentication
- Set sign-in/sign-up URLs:
  - Sign in URL: `/sign-in`
  - Sign up URL: `/sign-up`
  - After sign in: `/`
  - After sign up: `/`

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

### 4. Email - Resend (Optional)

1. Go to [Resend](https://resend.com)
2. Get your API key
3. Add to Vars:
   - `RESEND_API_KEY=re_...`
   - `EMAIL_FROM=noreply@yourdomain.com`

### 5. App URL

Add to Vars:
- `NEXT_PUBLIC_APP_URL=http://localhost:3000` (development)
- `NEXT_PUBLIC_APP_URL=https://yourdomain.com` (production)

## Admin Access

The first user with email `admin@rentcar.com` will automatically be assigned admin role.

To make another user an admin:
1. Use Prisma Studio: `npm run db:studio`
2. Find the user in the User table
3. Change their role to "ADMIN"

## Environment Variables Summary

**Required for Demo Mode:**
- `NEXT_PUBLIC_DEMO_MODE=true`

**Required for Production:**
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe public key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `NEXT_PUBLIC_APP_URL` - Your app URL

**Optional:**
- `RESEND_API_KEY` - Email service
- `EMAIL_FROM` - Sender email address

## Testing the App

1. **Demo Mode**: Set `NEXT_PUBLIC_DEMO_MODE=true` and start testing immediately
2. **With Database**: Run `npm run db:push && npm run db:seed`
3. **With Auth**: Sign up at `/sign-up` or use seeded user credentials
4. **Test Booking**: Browse cars, select dates, and complete checkout
5. **Test Admin**: Log in as admin and manage bookings/cars at `/admin`

## Troubleshooting

**Clerk Error:**
- Make sure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in Vars section
- Key should start with `pk_test_` or `pk_live_`

**Database Error:**
- Check `DATABASE_URL` is correct
- Run `npm run db:push` to create tables

**Stripe Error:**
- Verify both publishable and secret keys are set
- Use test mode keys (start with `pk_test_` and `sk_test_`)

**Need Help?**
- Check the Vars section in the left sidebar
- All environment variables should be added there
