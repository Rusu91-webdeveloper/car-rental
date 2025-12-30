import { SignUp } from "@clerk/nextjs"
import { config } from "@/lib/config"
import { redirect } from "@/navigation"

export default function SignUpPage() {
  // In demo mode, redirect to custom signup
  if (config.isDemoMode) {
    redirect("/signup")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <SignUp />
    </div>
  )
}
