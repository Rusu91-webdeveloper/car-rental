"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "@/navigation"
import { usePathname } from "@/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PRIVACY_NOTICE_STORAGE_KEY = "qujo-privacy-notice-2026-09"

export function PrivacyNoticePopup() {
  const t = useTranslations("privacyPopup")
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let shouldOpen = true
    try {
      shouldOpen = localStorage.getItem(PRIVACY_NOTICE_STORAGE_KEY) !== "acknowledged"
    } catch {}

    const timer = window.setTimeout(() => setOpen(shouldOpen), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const acknowledge = () => {
    try {
      localStorage.setItem(PRIVACY_NOTICE_STORAGE_KEY, "acknowledged")
    } catch {
      // The notice can still be dismissed when storage is unavailable.
    }
    setOpen(false)
  }

  if (pathname.startsWith("/admin")) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : acknowledge())}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="leading-6">{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="items-center sm:justify-between">
          <Link href="/datenschutz" className="text-sm font-medium underline underline-offset-4" onClick={acknowledge}>
            {t("notice")}
          </Link>
          <Button type="button" onClick={acknowledge}>{t("acknowledge")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
