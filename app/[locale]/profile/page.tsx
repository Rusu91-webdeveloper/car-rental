import Link from "@/navigation"
import { redirect } from "@/navigation"
import { BottomNav } from "@/components/bottom-nav"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { config } from "@/lib/config"
import { LogoutButton } from "./logout-button"

export default async function ProfilePage() {
  const user = await getCurrentUser()
  const signInUrl = config.isDemoMode ? "/login" : "/sign-in"

  if (!user) {
    redirect(signInUrl)
  }

  const [totalBookings, completedBookings] = await Promise.all([
    prisma.booking.count({ where: { userId: user.id } }),
    prisma.booking.count({ where: { userId: user.id, status: "COMPLETED" } }),
  ])

  return (
    <div className="min-h-screen bg-muted pb-20">
      {/* Header */}
      <header className="bg-background px-4 py-6 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-bold">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.name || user.email}</h1>
            <p className="text-muted-foreground">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded">
              {user.role.toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-background rounded-xl p-4 border border-border">
            <div className="text-3xl font-bold mb-1">{totalBookings}</div>
            <div className="text-sm text-muted-foreground">Total Trips</div>
          </div>
          <div className="bg-background rounded-xl p-4 border border-border">
            <div className="text-3xl font-bold mb-1">{completedBookings}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="bg-background rounded-xl border border-border overflow-hidden">
          <Link
            href="/bookings"
            className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <span className="font-medium">My Bookings</span>
            </div>
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted transition-colors border-t border-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                </div>
                <span className="font-medium">Admin Dashboard</span>
              </div>
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {/* Logout */}
        <LogoutButton isDemoMode={config.isDemoMode} />
      </div>

      <BottomNav active="profile" />
    </div>
  )
}
