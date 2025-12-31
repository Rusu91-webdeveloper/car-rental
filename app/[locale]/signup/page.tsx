import { redirect } from "@/navigation"
import { config } from "@/lib/config"
import { DemoSignup } from "./demo-signup"

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!config.isDemoMode) {
    redirect({ href: "/sign-up", locale })
  }

  return <DemoSignup />
}
