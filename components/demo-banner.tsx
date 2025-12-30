"use client"

import { AlertCircle, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import Link from "@/navigation"

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false)

  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true"

  if (!isDemoMode || dismissed) return null

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 dark:bg-amber-950/20">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        Demo Mode Active
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} className="h-6 w-6 p-0">
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription>
        You're using demo mode with mock data. To enable full functionality, set up your integrations in the Vars
        section.{" "}
        <Link href="/about#setup" className="underline">
          Setup Guide
        </Link>
      </AlertDescription>
    </Alert>
  )
}
