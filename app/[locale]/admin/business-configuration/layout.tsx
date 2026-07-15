import type { ReactNode } from "react"
import Link, { redirect } from "@/navigation"
import { checkCapability, type Capability } from "@/lib/authorization/capabilities"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { BUSINESS_CONFIGURATION_NAVIGATION } from "@/lib/business-configuration/domain-metadata"

export const dynamic = "force-dynamic"

export default async function BusinessConfigurationLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const capabilities = await getBusinessConfigurationCapabilities()
  if (!capabilities.principal.authenticated) {
    redirect({ href: "/sign-in?redirect_url=/admin/business-configuration", locale })
  }
  if (!capabilities.canView) {
    return (
      <main className="min-h-screen bg-muted/30 p-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-background p-8 text-center">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">You do not have permission to view Business Configuration.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Return home</Link>
        </div>
      </main>
    )
  }

  const navigation = BUSINESS_CONFIGURATION_NAVIGATION.filter(({ capability }) =>
    checkCapability(capabilities.principal, capability as Capability).allowed,
  )
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div><p className="text-sm font-semibold">RentCar Admin</p><p className="text-xs text-muted-foreground">Business Configuration</p></div>
          <div className="flex gap-4 text-sm"><Link href="/admin" className="text-muted-foreground hover:text-foreground">Admin dashboard</Link><Link href="/" className="text-muted-foreground hover:text-foreground">Customer site</Link></div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside><nav className="flex gap-2 overflow-x-auto lg:sticky lg:top-6 lg:flex-col">{navigation.map((item) => <Link key={item.segment} href={`/admin/business-configuration/${item.segment}`} className="whitespace-nowrap rounded-lg border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">{item.label}</Link>)}</nav></aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
