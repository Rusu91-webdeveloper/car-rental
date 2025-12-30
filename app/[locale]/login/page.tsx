import { redirect } from "@/navigation"
import { config } from "@/lib/config"
import { DemoLogin } from "./demo-login"

export default function LoginPage() {
  if (!config.isDemoMode) {
    redirect("/sign-in")
  }

  return <DemoLogin />
}
