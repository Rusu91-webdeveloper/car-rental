"use client"

import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
  }

  return (
    <Button variant="destructive" className="w-full h-12" onClick={handleLogout}>
      Log Out
    </Button>
  )
}
