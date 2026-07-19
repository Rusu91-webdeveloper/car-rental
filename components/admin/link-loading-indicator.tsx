"use client"

import { useLinkStatus } from "next/link"
import { LoaderCircle } from "lucide-react"

export function LinkLoadingIndicator() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span className="inline-flex items-center" role="status" aria-label="Opening page">
      <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
    </span>
  )
}
