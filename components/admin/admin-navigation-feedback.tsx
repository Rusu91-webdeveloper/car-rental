"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const NAVIGATION_TIMEOUT_MS = 30_000

export function AdminNavigationFeedback() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  return <NavigationFeedbackController key={routeKey} />
}

function NavigationFeedbackController() {
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest("a")
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.dataset.adminInstantSection === "true"
      ) {
        return
      }

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return

      const current = new URL(window.location.href)
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash
      ) {
        return
      }

      setPending(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setPending(false), NAVIGATION_TIMEOUT_MS)
    }

    // Capture before Next.js prevents the native anchor event for client-side routing.
    document.addEventListener("click", handleClick, true)
    return () => {
      document.removeEventListener("click", handleClick, true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!pending) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100]" role="status" aria-live="polite">
      <div className="h-1 overflow-hidden bg-primary/15">
        <div className="h-full w-1/2 animate-pulse rounded-r-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
      </div>
      <span className="sr-only">Opening page…</span>
    </div>
  )
}
