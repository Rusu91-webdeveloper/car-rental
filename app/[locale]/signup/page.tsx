import { redirect } from "@/navigation"
import { config } from "@/lib/config"
import { DemoSignup } from "./demo-signup"

export default function SignUpPage() {
  if (!config.isDemoMode) {
    redirect("/sign-up")
  }

  return <DemoSignup />
}
