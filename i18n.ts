import { getRequestConfig } from 'next-intl/server';

// Can be imported from a shared config
export const locales = ['en', 'de'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale = 'en' as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const resolvedLocale = requested && locales.includes(requested as (typeof locales)[number])
    ? requested
    : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default
  };
});
