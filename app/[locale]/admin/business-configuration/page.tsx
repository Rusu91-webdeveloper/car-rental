import { redirect } from "@/navigation"

export default async function BusinessConfigurationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: "/admin/business-configuration/overview", locale })
}
