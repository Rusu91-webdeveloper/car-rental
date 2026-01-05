import { redirect } from "@/navigation"

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: "/sign-up", locale })
}
