import { PrismaClient } from "@prisma/client";
import { PrismaDocumentLifecycleRepository } from "../lib/private-documents/infrastructure/prisma-repository";

const databaseUrl = process.env.PHASE8F_DISPOSABLE_DATABASE_URL;
if (!databaseUrl) throw new Error("PHASE8F_DISPOSABLE_DATABASE_URL is required");
const parsed = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  !parsed.pathname.slice(1).startsWith("phase8f")
)
  throw new Error("Concurrency verification requires a local disposable phase8f database");

const firstClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const secondClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function decide(client: PrismaClient) {
  return new PrismaDocumentLifecycleRepository(client).recordReviewDecision({
    documentId: "p8f-document-4",
    expectedReviewRevision: 0,
    reviewerId: "p8-officer",
    decision: "APPROVED",
  });
}

async function main() {
  const results = await Promise.allSettled([
    decide(firstClient),
    decide(secondClient),
  ]);
  if (results.filter((result) => result.status === "fulfilled").length !== 1)
    throw new Error("Concurrent review did not produce exactly one winner");
  const decisions = await firstClient.customerDocumentReviewDecision.count({
    where: { customerDocumentId: "p8f-document-4" },
  });
  const [predecessor, replacement] = await Promise.all([
    firstClient.customerDocument.findUniqueOrThrow({
      where: { id: "p8f-document-2" },
    }),
    firstClient.customerDocument.findUniqueOrThrow({
      where: { id: "p8f-document-4" },
    }),
  ]);
  if (
    decisions !== 1 ||
    predecessor.isCurrent ||
    !replacement.isCurrent ||
    replacement.manualReviewStatus !== "APPROVED" ||
    replacement.uploadStatus !== "TECHNICALLY_VALID" ||
    replacement.scanStatus !== "NOT_AVAILABLE"
  )
    throw new Error("Concurrent review committed inconsistent evidence");
  console.log("Phase 8F review concurrency: one winner, atomic promotion, no scanner evidence.");
}

main()
  .finally(async () => {
    await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()]);
  });
