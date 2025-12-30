import { SignIn } from "@clerk/nextjs"
import { config } from "@/lib/config"
import { redirect } from "@/navigation"

export default function SignInPage() {
  // In demo mode, redirect to custom login
  if (config.isDemoMode) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <SignIn />
    </div>
  )
}
