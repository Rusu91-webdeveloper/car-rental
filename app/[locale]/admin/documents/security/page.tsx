import { prisma } from "@/lib/db"
import {
  requireRecentAuthentication,
  ServerSessionRecentAuthenticationVerifier,
} from "@/lib/private-documents/authorization/recent-auth"
import { PrivateDocumentError } from "@/lib/private-documents/domain/errors"
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context"
import { ReauthenticatePanel } from "@/components/private-documents/reauthenticate-panel"
import { RestrictedRoleManager } from "./role-manager"

export const dynamic = "force-dynamic"

async function loadSecurityPage() {
  const context = await loadRestrictedDocumentActor()
  await requireRecentAuthentication(new ServerSessionRecentAuthenticationVerifier(), {
    userId: context.actor.userId,
    evidence: context.evidence,
    maximumAgeMs: 10 * 60_000,
  })
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      accessRoleAssignments: {
        select: { accessRole: { select: { key: true } } },
      },
    },
    orderBy: { email: "asc" },
  })
  return users.map((user) => ({
    id: user.id,
    label: user.name || user.email,
    roleKeys: user.accessRoleAssignments.map((assignment) => assignment.accessRole.key),
  }))
}

export default async function DocumentSecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  let state: { users: Awaited<ReturnType<typeof loadSecurityPage>> } | { reauthenticate: true } | { error: true }
  try {
    state = { users: await loadSecurityPage() }
  } catch (error) {
    state =
      error instanceof PrivateDocumentError && error.code.startsWith("RECENT_AUTH_")
        ? { reauthenticate: true }
        : { error: true }
  }
  if ("reauthenticate" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ReauthenticatePanel returnTo={`/${locale}/admin/documents/security`} />
      </main>
    )
  if ("error" in state)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Document access is unavailable</h1>
        <p className="mt-2 text-muted-foreground">Ask an owner with document access to manage these permissions.</p>
      </main>
    )
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <p className="text-sm font-medium text-primary">Documents</p>
        <h1 className="text-2xl font-semibold">Who can work with customer documents?</h1>
      </header>
      <RestrictedRoleManager users={state.users} />
    </main>
  )
}
