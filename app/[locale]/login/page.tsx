import { redirect } from "@/navigation"
import { config } from "@/lib/config"
import { DemoLogin } from "./demo-login"

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!config.isDemoMode) {
    redirect({ href: "/sign-in", locale })
  }

  return <DemoLogin />
}
