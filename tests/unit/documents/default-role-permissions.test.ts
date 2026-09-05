import { describe, expect, it } from "vitest"

import {
  DEFAULT_DOCUMENT_ROLE_PERMISSIONS,
  defaultDocumentRolePermission,
} from "@/lib/document-configuration/default-role-permissions"

describe("default private-document role permissions", () => {
  it("keeps review, download, deletion, and legal-hold powers separated", () => {
    expect(DEFAULT_DOCUMENT_ROLE_PERMISSIONS).toEqual({
      DOCUMENT_REVIEWER: {
        mayView: true,
        mayDownload: false,
        mayDelete: false,
        mayManageLegalHold: false,
      },
      DOCUMENT_DOWNLOADER: {
        mayView: true,
        mayDownload: true,
        mayDelete: false,
        mayManageLegalHold: false,
      },
      DOCUMENT_SECURITY_ADMIN: {
        mayView: false,
        mayDownload: false,
        mayDelete: false,
        mayManageLegalHold: true,
      },
      DOCUMENT_RETENTION_OPERATOR: {
        mayView: false,
        mayDownload: false,
        mayDelete: true,
        mayManageLegalHold: false,
      },
    })
  })

  it("does not grant permissions to an unknown or compatibility role", () => {
    expect(defaultDocumentRolePermission("ADMIN_COMPAT")).toBeUndefined()
    expect(defaultDocumentRolePermission("UNKNOWN")).toBeUndefined()
  })
})
