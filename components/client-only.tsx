"use client"

import type { ReactNode } from "react"
import { useSyncExternalStore } from "react"

const subscribe = () => () => undefined

export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)

  if (!mounted) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
