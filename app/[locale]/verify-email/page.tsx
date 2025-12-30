"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "@/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

function VerifyEmailContent() {
  const router = useRouter()
  const t = useTranslations()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || "john.doe@example.com"
  const [code, setCode] = useState(["", "", "", "", "", ""])
  const [timer, setTimer] = useState(30)

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [timer])

  const handleCodeChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newCode = [...code]
      newCode[index] = value
      setCode(newCode)

      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.getElementById(`code-${index + 1}`)
        nextInput?.focus()
      }
    }
  }

  const handleVerify = () => {
    const verificationCode = code.join("")
    if (verificationCode.length === 6) {
      localStorage.setItem("isLoggedIn", "true")
      router.push("/")
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => router.back()} className="p-2 -ml-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button className="text-muted-foreground text-sm font-medium">Help</button>
      </div>

      <div className="max-w-md mx-auto text-center">
        <div className="w-32 h-32 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-8 relative">
          <svg className="w-16 h-16 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <div className="absolute top-2 right-2 w-8 h-8 bg-success rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4">Verify it's you</h1>
        <p className="text-muted-foreground mb-2">
          {t.rich("verify.subtitle", {
            highlight: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
            email,
          })}
        </p>

        <div className="flex gap-2 justify-center my-8">
          {code.map((digit, index) => (
            <input
              key={index}
              id={`code-${index}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(index, e.target.value)}
              className="w-14 h-14 text-center text-2xl font-semibold bg-muted rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
            />
          ))}
        </div>

        <p className="text-muted-foreground text-sm mb-8">
          Resend code in{" "}
          <span className="text-foreground font-semibold">
            {String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")}
          </span>
        </p>

        <button
          onClick={handleVerify}
          className="w-full bg-primary text-white font-semibold py-4 rounded-xl hover:bg-primary-hover transition-colors mb-4"
        >
          Verify Account
        </button>

        <p className="text-muted-foreground text-sm mb-2">Didn't receive the email? Check your spam folder.</p>
        <button className="text-primary font-medium text-sm">Change email address</button>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
