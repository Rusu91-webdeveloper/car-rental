"use client"

import { useEffect, useState } from "react"
import Link from "@/navigation"
import { useRouter, usePathname } from "@/navigation"
import { signOut } from "next-auth/react"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "next-intl"

interface MobileMenuProps {
  user: { name: string; email: string } | null
  isAdmin: boolean
  signInUrl: string
}

function MobileMenu({ user, isAdmin, signInUrl }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleLogout = async () => {
    setIsOpen(false)
    await signOut({ callbackUrl: "/" })
  }

  return <MobileMenuContent user={user} isAdmin={isAdmin} signInUrl={signInUrl} isOpen={isOpen} setIsOpen={setIsOpen} handleLogout={handleLogout} />
}

// Shared UI component
function MobileMenuContent({
  user,
  isAdmin,
  signInUrl,
  isOpen,
  setIsOpen,
  handleLogout,
}: {
  user: { name: string; email: string } | null
  isAdmin: boolean
  signInUrl: string
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  handleLogout: () => void
}) {
  const t = useTranslations()
  const pathname = usePathname()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, setIsOpen])

  const linkClasses = (active: boolean) =>
    `group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/80"
    }`

  const iconClasses = (active: boolean) =>
    `w-5 h-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 hover:bg-muted rounded-lg transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="mobile-menu-panel"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="mobile-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="fixed left-0 top-4 bottom-4 w-[86vw] max-w-sm bg-gradient-to-b from-background via-background to-muted/30 z-50 shadow-2xl shadow-black/30 border border-border/70 rounded-2xl animate-in slide-in-from-left"
          >
            <div className="flex h-full flex-col">
              {/* Header - Compact */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-border/70">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-semibold text-base">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                    </svg>
                    <span className="text-sm">RentCar</span>
                  </div>
                  <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Navigation Links - Immediately visible at top */}
              <nav 
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-background" 
                aria-label="Primary"
                style={{ scrollbarWidth: 'thin', scrollBehavior: 'smooth' }}
              >
                <div className="space-y-1 py-3 px-3">
                  <Link
                    href="/"
                    onClick={() => setIsOpen(false)}
                    className={linkClasses(pathname === "/")}
                    aria-current={pathname === "/" ? "page" : undefined}
                  >
                  <svg className={iconClasses(pathname === "/")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  <span className="font-medium">{t("navigation.home")}</span>
                </Link>

                <Link
                  href="/cars"
                  onClick={() => setIsOpen(false)}
                  className={linkClasses(pathname === "/cars")}
                  aria-current={pathname === "/cars" ? "page" : undefined}
                >
                  <svg className={iconClasses(pathname === "/cars")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 16l-1 4a1 1 0 001 1h1m0 0h12m-12 0a2 2 0 104 0m8 0a2 2 0 104 0m-1-4l-1-4m-14 4h16M6 8h12l1 4H5l1-4z"
                    />
                  </svg>
                  <span className="font-medium">{t("navigation.cars")}</span>
                </Link>

                {user && (
                  <>
                    <Link
                      href="/bookings"
                      onClick={() => setIsOpen(false)}
                      className={linkClasses(pathname === "/bookings")}
                      aria-current={pathname === "/bookings" ? "page" : undefined}
                    >
                      <svg
                        className={iconClasses(pathname === "/bookings")}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                      <span className="font-medium">{t("bookings.title")}</span>
                    </Link>

                    <Link
                      href="/saved"
                      onClick={() => setIsOpen(false)}
                      className={linkClasses(pathname === "/saved")}
                      aria-current={pathname === "/saved" ? "page" : undefined}
                    >
                      <svg
                        className={iconClasses(pathname === "/saved")}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                      <span className="font-medium">{t("saved.title")}</span>
                    </Link>

                    <Link
                      href="/profile"
                      onClick={() => setIsOpen(false)}
                      className={linkClasses(pathname === "/profile")}
                      aria-current={pathname === "/profile" ? "page" : undefined}
                    >
                      <svg
                        className={iconClasses(pathname === "/profile")}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      <span className="font-medium">{t("navigation.profile")}</span>
                    </Link>
                  </>
                )}
                </div>

                <div className="h-px bg-border/70 my-3 mx-3" />

                <div className="space-y-1 px-3">
                  <Link
                    href="/about"
                    onClick={() => setIsOpen(false)}
                    className={linkClasses(pathname === "/about")}
                    aria-current={pathname === "/about" ? "page" : undefined}
                  >
                    <svg className={iconClasses(pathname === "/about")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="font-medium">{t("navigation.about")}</span>
                  </Link>

                  <Link
                    href="/contact"
                    onClick={() => setIsOpen(false)}
                    className={linkClasses(pathname === "/contact")}
                    aria-current={pathname === "/contact" ? "page" : undefined}
                  >
                    <svg className={iconClasses(pathname === "/contact")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="font-medium">{t("navigation.contact")}</span>
                  </Link>

                  <Link
                    href="/help"
                    onClick={() => setIsOpen(false)}
                    className={linkClasses(pathname === "/help")}
                    aria-current={pathname === "/help" ? "page" : undefined}
                  >
                    <svg className={iconClasses(pathname === "/help")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="font-medium">{t("navigation.help")}</span>
                  </Link>
                </div>

                <div className="h-px bg-border/70 my-3 mx-3" />

                <div className="px-3 pb-2">
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 shadow-sm">
                    <span className="font-medium text-sm">{t("navigation.language")}</span>
                    <div className="flex items-center gap-2">
                      <LanguageSwitcher />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="h-px bg-border/70 my-3 mx-3" />
                    <div className="px-3 pb-2">
                      <Link
                        href="/admin"
                        onClick={() => setIsOpen(false)}
                        className={`${linkClasses(pathname === "/admin")} text-primary`}
                        aria-current={pathname === "/admin" ? "page" : undefined}
                      >
                        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <span className="font-semibold">{t("admin.title")}</span>
                      </Link>
                    </div>
                  </>
                )}
              </nav>

              {/* Footer - Compact */}
              <div className="flex-shrink-0 px-3 py-3 border-t border-border">
                {user ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 p-2.5 shadow-sm">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-sm">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-error hover:bg-red-50 rounded-lg transition-colors text-sm"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      <span className="font-medium">{t("profile.logout")}</span>
                    </button>
                  </div>
                ) : (
                  <Link
                    href={signInUrl}
                    onClick={() => setIsOpen(false)}
                    className="block w-full py-2.5 px-3 bg-primary text-white text-center font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 text-sm"
                  >
                    {t("auth.signIn")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export { MobileMenu }
