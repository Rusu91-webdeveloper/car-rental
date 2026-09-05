import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { PrismaClient } from "@prisma/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({
  getServerVerifiedGoogleAuthenticationEvidence: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { isMaintenanceDeveloperEmail } from "@/lib/developer-maintenance/authorization"
import {
  DEVELOPER_MAINTENANCE_POLICY,
  getDeveloperMaintenancePreview,
} from "@/lib/developer-maintenance/service"

describe("developer-only maintenance", () => {
  it("grants access only to an exact email in the dedicated allowlist", () => {
    const env = {
      MAINTENANCE_DEVELOPER_EMAILS: " developer@example.com,SECOND@example.com ",
    } as unknown as NodeJS.ProcessEnv

    expect(isMaintenanceDeveloperEmail("Developer@Example.com", env)).toBe(true)
    expect(isMaintenanceDeveloperEmail("second@example.com", env)).toBe(true)
    expect(isMaintenanceDeveloperEmail("owner@example.com", env)).toBe(false)
    expect(isMaintenanceDeveloperEmail("developer@example.com.attacker.test", env)).toBe(false)
    expect(isMaintenanceDeveloperEmail(undefined, env)).toBe(false)
  })

  it("previews only due, non-held documents and logs beyond fixed retention", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z")
    const customerDocumentCount = vi.fn(async () => 4)
    const customerDocumentAggregate = vi.fn(async () => ({
      _sum: { sizeBytes: 1_024 },
    }))
    const uploadSessionCount = vi.fn(async () => 2)
    const auditEventCount = vi.fn(async () => 11)
    const adminAuditLogCount = vi.fn(async () => 7)
    const workerExecutionCount = vi.fn(async () => 5)
    const db = {
      customerDocument: {
        count: customerDocumentCount,
        aggregate: customerDocumentAggregate,
      },
      documentUploadSession: { count: uploadSessionCount },
      auditEvent: { count: auditEventCount },
      adminAuditLog: { count: adminAuditLogCount },
      workerExecution: { count: workerExecutionCount },
    } as unknown as PrismaClient

    const preview = await getDeveloperMaintenancePreview(db, now)

    expect(preview).toMatchObject({
      dueDocuments: 4,
      dueDocumentBytes: 1_024,
      expiredUploadSessions: 2,
      oldAuditEvents: 11,
      oldAdminAuditLogs: 7,
      oldWorkerExecutions: 5,
    })
    expect(customerDocumentCount).toHaveBeenCalledWith({
      where: {
        deletionStatus: { in: ["RETAINED", "SCHEDULED", "FAILED"] },
        legalHold: false,
        deletionEligibleAt: { lte: now },
      },
    })
    expect(auditEventCount).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date(
            now.getTime() -
              DEVELOPER_MAINTENANCE_POLICY.auditEventRetentionDays * 86_400_000,
          ),
        },
        OR: [
          { customerDocumentId: null },
          { customerDocument: { legalHold: false } },
        ],
      },
    })
    expect(adminAuditLogCount).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date(
            now.getTime() -
              DEVELOPER_MAINTENANCE_POLICY.adminAuditLogRetentionDays * 86_400_000,
          ),
        },
      },
    })
    expect(workerExecutionCount).toHaveBeenCalledWith({
      where: {
        startedAt: {
          lt: new Date(
            now.getTime() -
              DEVELOPER_MAINTENANCE_POLICY.workerExecutionRetentionDays * 86_400_000,
          ),
        },
      },
    })
  })

  it("keeps the console and destructive endpoint behind layered controls", async () => {
    const root = resolve(process.cwd())
    const [page, layout, navigation, route, service, exampleEnvironment] = await Promise.all([
      readFile(resolve(root, "app/[locale]/admin/health/page.tsx"), "utf8"),
      readFile(resolve(root, "app/[locale]/admin/layout.tsx"), "utf8"),
      readFile(resolve(root, "components/admin/admin-navigation.tsx"), "utf8"),
      readFile(resolve(root, "app/api/internal/developer-maintenance/route.ts"), "utf8"),
      readFile(resolve(root, "lib/developer-maintenance/service.ts"), "utf8"),
      readFile(resolve(root, ".env.local.example"), "utf8"),
    ])

    expect(page).toContain("isMaintenanceDeveloperEmail(admin.email)")
    expect(layout).toContain('user!.role === "ADMIN" && isMaintenanceDeveloperEmail(user!.email)')
    expect(navigation).toContain('href: "/admin/health"')
    expect(navigation).toContain("isMaintenanceDeveloper")
    expect(route).toContain("requireRecentMaintenanceDeveloper")
    expect(route).toContain('z.literal("DELETE ELIGIBLE DATA")')
    expect(route).toContain('origin !== new URL(request.url).origin')
    expect(route).toContain('"developer-maintenance"')
    expect(service).toContain("legalHold: false")
    expect(service).toContain("DocumentDeletionService")
    expect(service).toContain("MAINTENANCE_CLEANUP")
    expect(exampleEnvironment).toContain("MAINTENANCE_DEVELOPER_EMAILS=")
  })
})
