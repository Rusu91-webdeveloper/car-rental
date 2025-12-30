# Complete i18n Migration Plan

## Current Status ✅

1. ✅ `next-intl` installed
2. ✅ Translation files created (`messages/en.json`, `messages/de.json`)
3. ✅ i18n config created (`i18n.ts`)
4. ✅ Middleware created (`middleware.ts`)

## What Needs to Happen 🔄

The migration requires restructuring the app directory. Here's the approach:

### Step 1: Update next.config.mjs
Add next-intl plugin

### Step 2: Restructure App Directory
- Move all routes from `app/` to `app/[locale]/`
- Create new layout in `app/[locale]/layout.tsx`
- Keep minimal root layout in `app/layout.tsx`

### Step 3: Update All Components
- Replace hardcoded strings with translation keys
- Use `useTranslations()` in client components
- Use `getTranslations()` in server components
- Update all `Link` components to use locale-aware routing

### Step 4: Create Language Switcher
- Add component to switch between languages
- Add to header/navigation

### Step 5: Update Middleware Integration
- Merge auth middleware with i18n middleware
- Update route matchers for locale prefixes

## Estimated Impact

- **Files to modify**: ~30+ files
- **Time required**: 2-3 hours
- **Breaking changes**: Temporary (during migration)

## Recommendation

I'll proceed with the **full migration** step by step. The app will be broken temporarily during the migration, but I'll fix everything systematically.

**Would you like me to:**
1. ✅ Proceed with full migration now (recommended)
2. Create migration scripts for you to run
3. Do it in phases (one route at a time)

Let me proceed with option 1! 🚀

