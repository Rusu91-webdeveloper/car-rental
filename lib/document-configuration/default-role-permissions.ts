export const DEFAULT_DOCUMENT_ROLE_PERMISSIONS = {
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
} as const

export type DefaultDocumentRoleKey =
  keyof typeof DEFAULT_DOCUMENT_ROLE_PERMISSIONS

export function defaultDocumentRolePermission(roleKey: string) {
  if (!(roleKey in DEFAULT_DOCUMENT_ROLE_PERMISSIONS)) return undefined
  return DEFAULT_DOCUMENT_ROLE_PERMISSIONS[
    roleKey as DefaultDocumentRoleKey
  ]
}
