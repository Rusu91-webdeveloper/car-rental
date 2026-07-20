"use client"

import { useState } from "react"
import Link from "@/navigation"
import { useRouter, usePathname } from "@/navigation"
import { locales } from "@/i18n"
import { signOut } from "next-auth/react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NavigationMenuProps {
  user: { name: string; email: string } | null
  isAdmin: boolean
  signInUrl: string
}

function NavigationIcon({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors duration-200",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-muted-foreground group-hover:border-border group-hover:text-foreground",
      )}
    >
      {children}
    </span>
  )
}

function NavigationMenu({ user, isAdmin, signInUrl }: NavigationMenuProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
  }

  return <NavigationMenuContent user={user} isAdmin={isAdmin} signInUrl={signInUrl} handleLogout={handleLogout} />
}

// Shared UI component
function NavigationMenuContent({
  user,
  isAdmin,
  signInUrl,
  handleLogout,
}: {
  user: { name: string; email: string } | null
  isAdmin: boolean
  signInUrl: string
  handleLogout: () => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const localeNames: Record<string, string> = {
    en: "English",
    de: "Deutsch",
  }

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) {
      return
    }
    router.push(pathname, { locale: newLocale })
  }

  const isActive = (path: string) => pathname === path

  const menuItemClasses = (active: boolean, tone: "default" | "admin" = "default") =>
    cn(
      "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-[15px] font-medium transition-all duration-200",
      active
        ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(37,99,235,0.18)]"
        : "text-foreground/90 hover:bg-muted/80 hover:text-foreground",
      tone === "admin" && "font-semibold text-primary"
    )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "relative grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-background/90 shadow-sm backdrop-blur transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
            "hover:bg-background hover:shadow-md",
            open && "border-primary/35 bg-primary/5 shadow-primary/20"
          )}
          aria-label="Open navigation menu"
          aria-expanded={open}
        >
          <span className="relative block h-4 w-5" aria-hidden="true">
            <span
              className={cn(
                "absolute left-0 top-0 h-[2px] w-5 rounded-full bg-foreground transition-all duration-300",
                open && "translate-y-[7px] rotate-45"
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[7px] h-[2px] w-5 rounded-full bg-foreground transition-all duration-300",
                open && "scale-x-0 opacity-0"
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[14px] h-[2px] w-5 rounded-full bg-foreground transition-all duration-300",
                open && "-translate-y-[7px] -rotate-45"
              )}
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[21rem] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-border/60 bg-background/95 p-2 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.65)] backdrop-blur-2xl"
      >
        {/* Main Navigation */}
        <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className={menuItemClasses(isActive("/"))}
          >
            <NavigationIcon active={isActive("/")}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </NavigationIcon>
            <span className="font-medium">{t("navigation.home")}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
          <Link
            href="/cars"
            onClick={() => setOpen(false)}
            className={menuItemClasses(isActive("/cars"))}
          >
            <NavigationIcon active={isActive("/cars")}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 16l-1 4a1 1 0 001 1h1m0 0h12m-12 0a2 2 0 104 0m8 0a2 2 0 104 0m-1-4l-1-4m-14 4h16M6 8h12l1 4H5l1-4z"
                />
              </svg>
            </NavigationIcon>
            <span className="font-medium">{t("navigation.cars")}</span>
          </Link>
        </DropdownMenuItem>

        {/* User Section */}
        {user && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
              <Link
                href="/bookings"
                onClick={() => setOpen(false)}
                className={menuItemClasses(isActive("/bookings"))}
              >
                <NavigationIcon active={isActive("/bookings")}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </NavigationIcon>
                <span className="font-medium">{t("bookings.title")}</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
              <Link
                href="/saved"
                onClick={() => setOpen(false)}
                className={menuItemClasses(isActive("/saved"))}
              >
                <NavigationIcon active={isActive("/saved")}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                </NavigationIcon>
                <span className="font-medium">{t("saved.title")}</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className={menuItemClasses(isActive("/profile"))}
              >
                <NavigationIcon active={isActive("/profile")}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </NavigationIcon>
                <span className="font-medium">{t("navigation.profile")}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {/* Information Section */}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
          <Link
            href="/about"
            onClick={() => setOpen(false)}
            className={menuItemClasses(isActive("/about"))}
          >
            <NavigationIcon active={isActive("/about")}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </NavigationIcon>
            <span className="font-medium">{t("navigation.about")}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
          <Link
            href="/contact"
            onClick={() => setOpen(false)}
            className={menuItemClasses(isActive("/contact"))}
          >
            <NavigationIcon active={isActive("/contact")}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </NavigationIcon>
            <span className="font-medium">{t("navigation.contact")}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className={menuItemClasses(isActive("/help"))}
          >
            <NavigationIcon active={isActive("/help")}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </NavigationIcon>
            <span className="font-medium">{t("navigation.help")}</span>
          </Link>
        </DropdownMenuItem>

        {/* Admin Section */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={menuItemClasses(isActive("/admin"), "admin")}
              >
                <NavigationIcon active={isActive("/admin")}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </NavigationIcon>
                <span className="font-semibold">{t("admin.title")}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {/* Language Switcher */}
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("navigation.language")}</span>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/35 p-1">
              {locales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => {
                    switchLocale(loc)
                    setOpen(false)
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    locale === loc
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/80"
                  }`}
                >
                  {localeNames[loc] || loc}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Info / Sign In */}
        {user ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/80 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  handleLogout()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-destructive/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>{t("profile.logout")}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <Link
                href={signInUrl}
                onClick={() => setOpen(false)}
                className="block w-full rounded-xl bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition-colors hover:bg-primary/90"
              >
                {t("auth.signIn")}
              </Link>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { NavigationMenu }
