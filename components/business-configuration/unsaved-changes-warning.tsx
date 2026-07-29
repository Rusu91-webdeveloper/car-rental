"use client"

import { useEffect } from "react"
import { useLocale } from "next-intl"

export function UnsavedChangesWarning({ active }: { active: boolean }) {
  const de = useLocale() === "de"
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [active])
  return active ? <p className="text-xs font-medium text-amber-700">{de ? "Sie haben nicht gespeicherte Änderungen." : "You have unsaved changes."}</p> : null
}
