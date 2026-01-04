import createIntlMiddleware from "next-intl/middleware";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { config as appConfig } from "./lib/config";
import { locales, defaultLocale } from "./i18n";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always", // Always show locale: /en/... /de/...
});

const localeMatcher = `/:locale(${locales.join("|")})`;

const isPublicRoute = createRouteMatcher([
  "/",
  localeMatcher,
  "/login(.*)",
  "/signup(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  `${localeMatcher}/cars(.*)`,
  `${localeMatcher}/about`,
  `${localeMatcher}/contact`,
  `${localeMatcher}/help`,
  `${localeMatcher}/login(.*)`,
  `${localeMatcher}/signup(.*)`,
  `${localeMatcher}/sign-in(.*)`,
  `${localeMatcher}/sign-up(.*)`,
  "/api/webhooks(.*)",
  "/api/health",
]);

const isAdminRoute = createRouteMatcher([`${localeMatcher}/admin(.*)`]);

export default function middleware(req: NextRequest) {
  // Skip i18n middleware for API routes - they should not have locale prefixes
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    // API routes should not have locale prefixes
    // Let them pass through without i18n middleware
    // Individual API routes handle their own authentication (e.g., requireAdmin)
    return NextResponse.next();
  }

  // Demo mode - just apply i18n
  if (appConfig.isDemoMode) {
    return intlMiddleware(req);
  }

  // Production mode - apply Clerk auth after i18n
  // Note: Routes are now prefixed with locale, so we need to handle that
  return clerkMiddleware(async (auth, request) => {
    if (isAdminRoute(request)) {
      await auth.protect();
    }

    if (!isPublicRoute(request)) {
      await auth.protect();
    }
    return intlMiddleware(request);
  })(req, undefined as any);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
