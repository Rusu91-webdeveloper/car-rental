import { SignUp } from "@clerk/nextjs"
import { config } from "@/lib/config"
import { redirect } from "@/navigation"

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // In demo mode, redirect to custom signup
  if (config.isDemoMode) {
    redirect({ href: "/signup", locale })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <SignUp />
    </div>
  )
}
