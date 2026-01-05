import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth } from "@/lib/auth-edge";
import { config as appConfig } from "@/lib/config";
import { locales, defaultLocale } from "./i18n";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always", // Always show locale: /en/... /de/...
});

const isPublicRoute = (pathname: string) => {
  // Check if pathname matches any public route pattern
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/webhooks")) return true;
  if (pathname === "/api/health") return true;
  if (pathname === "/") return true;
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup")
  ) {
    return true;
  }

  // Check locale routes
  for (const locale of locales) {
    const localePrefix = `/${locale}`;
    if (pathname === localePrefix || pathname.startsWith(`${localePrefix}/`)) {
      const pathWithoutLocale = pathname.slice(localePrefix.length) || "/";

      // Public routes with locale
      if (
        pathWithoutLocale === "/" ||
        pathWithoutLocale.startsWith("/cars") ||
        pathWithoutLocale === "/about" ||
        pathWithoutLocale === "/contact" ||
        pathWithoutLocale === "/help" ||
        pathWithoutLocale.startsWith("/login") ||
        pathWithoutLocale.startsWith("/signup") ||
        pathWithoutLocale.startsWith("/sign-in") ||
        pathWithoutLocale.startsWith("/sign-up")
      ) {
        return true;
      }
    }
  }

  return false;
};

const getLocaleFromPathname = (pathname: string) => {
  for (const locale of locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale;
    }
  }
  return defaultLocale;
};

const isAdminRoute = (pathname: string) => {
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/admin`)) {
      return true;
    }
  }
  return false;
};

export default auth((req: NextAuthRequest) => {
  // Skip auth middleware for API routes - they handle their own auth
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Apply i18n middleware first
  const intlResponse = intlMiddleware(req);

  if (!appConfig.features.authEnabled) {
    return intlResponse;
  }

  // Check authentication for protected routes
  if (!isPublicRoute(pathname)) {
    const session = req.auth;

    if (!session) {
      // Redirect to sign-in with the current path as callback
      const locale = getLocaleFromPathname(pathname);
      const signInUrl = new URL(`/${locale}/sign-in`, req.url);
      signInUrl.searchParams.set("callbackUrl", `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(signInUrl);
    }

    // Check admin routes
    if (isAdminRoute(pathname)) {
      // Verify user has admin role
      // This is a basic check - the actual role check happens in the page/route handler
      // We just ensure they're authenticated here
    }
  }

  return intlResponse;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
