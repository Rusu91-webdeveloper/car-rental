import { redirect } from "@/navigation"

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: "/sign-in", locale })
}
