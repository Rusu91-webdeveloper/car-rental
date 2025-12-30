"use client"

import type React from "react"

import { useRouter } from "@/navigation"
import { useTransition } from "react"
import { toggleSavedCar } from "@/app/actions/saved"

export function SaveCarButton({
  carId,
  isSaved,
  isSignedIn,
  signInUrl,
  className,
  iconClassName,
}: {
  carId: string
  isSaved: boolean
  isSignedIn: boolean
  signInUrl: string
  className?: string
  iconClassName?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isSignedIn) {
      router.push(signInUrl)
      return
    }

    startTransition(async () => {
      try {
        await toggleSavedCar(carId)
        router.refresh()
      } catch (error) {
        console.error("[SAVE_CAR_ERROR]", error)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={className}
      aria-pressed={isSaved}
    >
      <svg
        className={iconClassName || `w-5 h-5 ${isSaved ? "fill-red-500 stroke-red-500" : "fill-none stroke-gray-600"}`}
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
    </button>
  )
}
