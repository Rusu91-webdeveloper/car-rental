"use client"

import { SignOutButton } from "@clerk/nextjs"
import { useRouter } from "@/navigation"
import { Button } from "@/components/ui/button"

// Demo mode logout button
function LogoutButtonDemo() {
  const router = useRouter()

  const handleLogout = () => {
    router.push("/")
  }

  return (
    <Button variant="destructive" className="w-full h-12" onClick={handleLogout}>
      Log Out
    </Button>
  )
}

// Production mode logout button with Clerk
function LogoutButtonProd() {
  return (
    <SignOutButton redirectUrl="/">
      <Button variant="destructive" className="w-full h-12">
        Log Out
      </Button>
    </SignOutButton>
  )
}

// Main export - switches between demo and prod versions
export function LogoutButton({ isDemoMode = false }: { isDemoMode?: boolean }) {
  if (isDemoMode) {
    return <LogoutButtonDemo />
  }
  return <LogoutButtonProd />
}
