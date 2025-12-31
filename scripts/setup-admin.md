# Admin Access Setup Guide

## Quick Setup Options

### Option 1: Enable Demo Mode (Easiest)

1. Open `.env.local` file
2. Set `NEXT_PUBLIC_DEMO_MODE=true`
3. Restart your dev server
4. Navigate to `http://localhost:3000/admin` - you'll be automatically logged in as admin!

**Note:** In demo mode, the app automatically creates/uses an admin user with email `admin@rentcar.com`

---

### Option 2: Use Clerk Authentication

1. Make sure Clerk is configured in your `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

2. Set `NEXT_PUBLIC_DEMO_MODE=false` (or remove it)

3. Sign up/Sign in at `http://localhost:3000/sign-in` with email: `admin@rentcar.com`

4. The user will automatically get ADMIN role (because it's in ADMIN_EMAILS)

5. Navigate to `http://localhost:3000/admin`

---

### Option 3: Manually Set User as Admin

#### Using Prisma Studio (GUI):
```bash
pnpm prisma studio
```
- Open User table
- Find your user
- Change `role` from `USER` to `ADMIN`
- Save

#### Using SQL:
```bash
# Connect to your database and run:
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

#### Using Prisma Client (Node.js):
```bash
pnpm tsx scripts/make-admin.ts your-email@example.com
```

---

## Current Configuration

- **Demo Mode**: `false` (disabled)
- **Admin Emails**: `admin@rentcar.com`

To change admin emails, add to `.env.local`:
```
ADMIN_EMAILS=admin@rentcar.com,another@email.com
```

