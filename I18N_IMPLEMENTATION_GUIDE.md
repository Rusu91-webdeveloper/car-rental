# Internationalization (i18n) Implementation Guide

## 📋 Overview

This guide explains how to add German and English language support to your Next.js car rental app using `next-intl`.

## ✅ What's Been Set Up

1. ✅ Installed `next-intl` package
2. ✅ Created translation files (`messages/en.json`, `messages/de.json`)
3. ✅ Created i18n configuration (`i18n.ts`)
4. ✅ Set up middleware for locale routing

## 🔄 Next Steps Required

Due to the scope of this change, you'll need to restructure your `app` directory. Here's the recommended approach:

### Option 1: Gradual Migration (Recommended)

1. **Create `app/[locale]` directory structure**
2. Move existing routes into `[locale]` group
3. Update all components to use translations
4. Create language switcher component

### Option 2: Automated Migration Script

I can create a script to help migrate your existing routes.

## 📁 New Directory Structure

```
app/
  [locale]/          ← New locale route group
    layout.tsx       ← Wrap with NextIntlClientProvider
    page.tsx         ← Homepage
    cars/
      page.tsx
      [id]/
        page.tsx
    checkout/
      [id]/
        page.tsx
    profile/
      page.tsx
    ... (all other routes)
```

## 🛠️ How Translations Work

### Using Translations in Server Components

```typescript
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('home');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
    </div>
  );
}
```

### Using Translations in Client Components

```typescript
'use client';
import { useTranslations } from 'next-intl';

export function Component() {
  const t = useTranslations('home');
  
  return <h1>{t('title')}</h1>;
}
```

## 🔀 URL Structure

- English: `/en/`, `/en/cars`, `/en/profile`
- German: `/de/`, `/de/cars`, `/de/profile`
- Default (en): `/` redirects to `/en/`

## ⚠️ Important Notes

1. **proxy.ts vs middleware.ts**: Next.js only recognizes `middleware.ts`. The existing `proxy.ts` auth logic needs to be migrated or handled differently.

2. **All routes need locale prefix**: After migration, all routes will be under `/[locale]/...`

3. **Links need locale**: Use `next-intl`'s `Link` component or `usePathname`/`useRouter` from `next-intl/navigation`

## 🚀 Would you like me to:

A) **Do the full migration now** (restructure app directory, update all components)
B) **Create a step-by-step migration guide** for you to follow
C) **Start with a smaller scope** (just homepage + navigation first)

Which approach would you prefer?

