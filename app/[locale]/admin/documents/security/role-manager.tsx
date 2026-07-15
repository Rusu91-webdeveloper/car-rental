"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"

const ROLES = ["DOCUMENT_REVIEWER", "DOCUMENT_DOWNLOADER", "DOCUMENT_SECURITY_ADMIN", "DOCUMENT_RETENTION_OPERATOR", "DOCUMENT_INCIDENT_REVIEWER"] as const

export function RestrictedRoleManager({ users }: { users: Array<{ id: string; label: string; roleKeys: string[] }> }) {
  const [targetUserId, setTargetUserId] = useState(users[0]?.id ?? "")
  const [roleKey, setRoleKey] = useState<(typeof ROLES)[number]>("DOCUMENT_REVIEWER")
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()
  const mutate = (action: "ASSIGN" | "REVOKE") => startTransition(async () => {
    const response = await fetch("/api/private-documents/restricted-roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, targetUserId, roleKey }) })
    const result = (await response.json()) as { code?: string }
    if (response.status === 401) window.location.reload()
    setMessage(response.ok ? `${roleKey} ${action === "ASSIGN" ? "assigned" : "revoked"}.` : result.code ?? "Role change failed.")
  })
  return <section className="space-y-4 rounded-xl border bg-background p-5"><p className="text-sm text-muted-foreground">Self-assignment is denied. Every change requires fresh Google authentication and is audited.</p><label className="block text-sm font-medium">Active user<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.label} · {user.roleKeys.filter((key) => key.startsWith("DOCUMENT_")).join(", ") || "no document role"}</option>)}</select></label><label className="block text-sm font-medium">Restricted role<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={roleKey} onChange={(event) => setRoleKey(event.target.value as typeof roleKey)}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>{message ? <p className="text-sm" role="status">{message}</p> : null}<div className="flex gap-3"><Button disabled={isPending || !targetUserId} onClick={() => mutate("ASSIGN")}>Assign</Button><Button variant="outline" disabled={isPending || !targetUserId} onClick={() => mutate("REVOKE")}>Revoke</Button></div></section>
}
