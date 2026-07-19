import Link from "@/navigation"

export function ConfigurationAccessDenied() {
  return <main className="mx-auto max-w-xl p-6"><div className="rounded-xl border bg-background p-8 text-center"><h1 className="text-xl font-semibold">Access denied</h1><p className="mt-2 text-sm text-muted-foreground">You do not have permission to view this business settings section.</p><Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Return to the customer site</Link></div></main>
}
