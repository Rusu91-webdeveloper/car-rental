"use client"

import { useEffect } from "react"

export function UnsavedChangesWarning({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [active])
  return active ? <p className="text-xs font-medium text-amber-700">You have unsaved changes.</p> : null
}
