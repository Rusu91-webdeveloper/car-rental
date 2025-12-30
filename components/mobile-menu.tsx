"use client"

import { useState } from "react"
import Link from "@/navigation"
import { useRouter, usePathname } from "@/navigation"
import { useSearchParams } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import { LanguageSwitcher } from "@/components/language-switcher"
import { DateFilter } from "@/components/date-filter"
import { useTranslations } from "next-intl"

interface MobileMenuProps {
  user: { name: string; email: string } | null
  isAdmin: boolean
  signInUrl: string
  isDemoMode?: boolean
}

// Demo version without Clerk
function MobileMenuDemo({ user, isAdmin, signInUrl }: Omit<MobileMenuProps, "isDemoMode">) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const handleLogout = () => {
    setIsOpen(false)
    router.push("/")
  }

  return <MobileMenuContent user={user} isAdmin={isAdmin} signInUrl={signInUrl} isOpen={isOpen} setIsOpen={setIsOpen} handleLogout={handleLogout} />
}

// Production version with Clerk
function MobileMenuProd({ user, isAdmin, signInUrl }: Omit<MobileMenuProps, "isDemoMode">) {
  const [isOpen, setIsOpen] = useState(false)
  const { signOut } = useClerk()

  const handleLogout = () => {
    setIsOpen(false)
    signOut({ redirectUrl: "/" })
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const pickupDate = searchParams.get("pickupDate")
  const dropoffDate = searchParams.get("dropoffDate")

  const updateDateParams = (pickup: string | null, dropoff: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (pickup) {
      params.set("pickupDate", pickup)
    } else {
      params.delete("pickupDate")
    }
    if (dropoff) {
      params.set("dropoffDate", dropoff)
    } else {
      params.delete("dropoffDate")
    }
    const queryString = params.toString()
    router.push(queryString ? `${pathname}?${queryString}` : pathname)
  }

  const handlePickupDateChange = (date: string | null) => {
    updateDateParams(date, dropoffDate)
  }

  const handleDropoffDateChange = (date: string | null) => {
    updateDateParams(pickupDate, date)
  }

  const handleClearDates = () => {
    updateDateParams(null, null)
  }

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="p-2 hover:bg-muted rounded-lg transition-colors">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 animate-in fade-in" onClick={() => setIsOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-80 bg-background z-50 animate-in slide-in-from-left">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
                    </svg>
                    RentCar
                  </div>
                  <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {user ? (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={signInUrl}
                    onClick={() => setIsOpen(false)}
                    className="block w-full py-3 px-4 bg-primary text-white text-center font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    {t("auth.signIn")}
                  </Link>
                )}
              </div>

              {/* Date Filter */}
              <div className="px-6 py-4 border-b border-border">
                <DateFilter
                  pickupDate={pickupDate}
                  dropoffDate={dropoffDate}
                  onPickupDateChange={handlePickupDateChange}
                  onDropoffDateChange={handleDropoffDateChange}
                  onClear={handleClearDates}
                  compact={true}
                />
              </div>

              {/* Navigation Links */}
              <nav className="flex-1 overflow-y-auto py-4">
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  <span className="font-medium">{t("navigation.home")}</span>
                </Link>

                {user && (
                  <>
                    <Link
                      href="/bookings"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                    >
                      <svg
                        className="w-5 h-5 text-muted-foreground"
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
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                    >
                      <svg
                        className="w-5 h-5 text-muted-foreground"
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
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                    >
                      <svg
                        className="w-5 h-5 text-muted-foreground"
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

                <div className="h-px bg-border my-2 mx-6" />

                <Link
                  href="/about"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-medium">{t("navigation.help")}</span>
                </Link>

                <div className="h-px bg-border my-2 mx-6" />

                <div className="px-6 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t("navigation.language")}</span>
                    <div className="flex items-center gap-2">
                      <LanguageSwitcher />
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <>
                    <div className="h-px bg-border my-2 mx-6" />
                    <Link
                      href="/admin"
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-muted transition-colors text-primary"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  </>
                )}
              </nav>

              {/* Footer */}
              {user && (
                <div className="p-4 border-t border-border">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 text-error hover:bg-red-50 rounded-xl transition-colors"
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
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Main export - switches between demo and prod versions
export function MobileMenu(props: MobileMenuProps) {
  if (props.isDemoMode) {
    return <MobileMenuDemo {...props} />
  }
  return <MobileMenuProd {...props} />
}
