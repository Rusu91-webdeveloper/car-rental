import { prisma } from "../../lib/db";

const capabilities = [
  ["capability-documents-review", "documents.review", "Make an authorized manual private-document review decision."],
  ["capability-documents-request-replacement", "documents.request-replacement", "Request an authorized private-document replacement."],
  ["capability-documents-security-manage", "documents.security.manage", "Manage restricted private-document role assignments."],
  ["capability-documents-incident-view", "documents.incident.view", "View sanitized private-document security incidents."],
] as const;

const roles = [
  ["access-role-document-reviewer", "DOCUMENT_REVIEWER", "Document reviewer"],
  ["access-role-document-downloader", "DOCUMENT_DOWNLOADER", "Document downloader"],
  ["access-role-document-security-admin", "DOCUMENT_SECURITY_ADMIN", "Document security administrator"],
  ["access-role-document-retention-operator", "DOCUMENT_RETENTION_OPERATOR", "Document retention operator"],
  ["access-role-document-incident-reviewer", "DOCUMENT_INCIDENT_REVIEWER", "Document incident reviewer"],
] as const;

const mappings: Record<string, string[]> = {
  DOCUMENT_REVIEWER: [
    "documents.view",
    "documents.review",
    "documents.request-replacement",
  ],
  DOCUMENT_DOWNLOADER: ["documents.view", "documents.download"],
  DOCUMENT_SECURITY_ADMIN: ["documents.security.manage", "documents.legal-hold.manage"],
  DOCUMENT_RETENTION_OPERATOR: ["documents.delete"],
  DOCUMENT_INCIDENT_REVIEWER: ["documents.incident.view", "security.audit.view"],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const [id, key, description] of capabilities)
      await tx.capability.upsert({
        where: { key },
        create: { id, key, description },
        update: { description },
      });
    for (const [id, key, name] of roles)
      await tx.accessRole.upsert({
        where: { key },
        create: {
          id,
          key,
          name,
          description: `${name}; assignment is explicit, revocable, and audited.`,
          status: "ACTIVE",
          isSystem: true,
        },
        update: { name, status: "ACTIVE", isSystem: true },
      });
    for (const [roleKey, capabilityKeys] of Object.entries(mappings)) {
      const role = await tx.accessRole.findUniqueOrThrow({
        where: { key: roleKey },
      });
      const assigned = await tx.capability.findMany({
        where: { key: { in: capabilityKeys } },
      });
      if (assigned.length !== capabilityKeys.length)
        throw new Error(`Missing capability vocabulary for ${roleKey}`);
      for (const capability of assigned)
        await tx.roleCapability.upsert({
          where: {
            accessRoleId_capabilityId: {
              accessRoleId: role.id,
              capabilityId: capability.id,
            },
          },
          create: { accessRoleId: role.id, capabilityId: capability.id },
          update: {},
        });
    }
    const compatibilityMappings = await tx.roleCapability.count({
      where: {
        accessRole: { key: "ADMIN_COMPAT" },
        capability: {
          key: {
            in: [
              "documents.review",
              "documents.request-replacement",
              "documents.security.manage",
              "documents.incident.view",
            ],
          },
        },
      },
    });
    if (compatibilityMappings)
      throw new Error("ADMIN_COMPAT has restricted document capabilities");
  });
  console.log("Restricted document role vocabulary is ready; no users were assigned.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
