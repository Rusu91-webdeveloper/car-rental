import "server-only"

import { createHmac } from "node:crypto"
import { prisma } from "@/lib/db"

export interface RateLimitPolicy {
  limit: number
  windowMs: number
}

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again later.")
    this.name = "RateLimitExceededError"
  }
}

function subjectHash(subject: string) {
  const secret = process.env.RATE_LIMIT_HASH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret && process.env.NODE_ENV === "production")
    throw new Error("RATE_LIMIT_HASH_SECRET is required in production.")
  return createHmac("sha256", secret ?? "nonproduction-rate-limit-key")
    .update(subject)
    .digest("hex")
}

/**
 * Shared PostgreSQL fixed-window limiter. The compound unique key and atomic
 * increment make decisions deterministic across functions, regions, and
 * retries without adding another production service.
 */
export async function enforceRateLimit(
  scope: string,
  subject: string,
  policy: RateLimitPolicy,
  now = new Date(),
) {
  if (!/^[a-z0-9:-]{1,64}$/i.test(scope))
    throw new Error("Invalid rate-limit scope.")
  if (
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1
  )
    throw new Error("Invalid rate-limit policy.")

  const windowStartedAt = new Date(
    Math.floor(now.getTime() / policy.windowMs) * policy.windowMs,
  )
  const resetAt = new Date(windowStartedAt.getTime() + policy.windowMs)
  const hash = subjectHash(subject)
  const bucket = await prisma.rateLimitBucket.upsert({
    where: {
      scope_subjectHash_windowStartedAt: {
        scope,
        subjectHash: hash,
        windowStartedAt,
      },
    },
    create: { scope, subjectHash: hash, windowStartedAt, resetAt },
    update: { count: { increment: 1 }, resetAt },
    select: { count: true },
  })

  // Bounded housekeeping is safe on every call because resetAt is indexed.
  await prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
  })

  if (bucket.count > policy.limit)
    throw new RateLimitExceededError(
      Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1_000)),
    )
}

export const PHASE8FB_RATE_LIMITS = {
  applicationCreate: { limit: 5, windowMs: 60_000 },
  applicationUpdate: { limit: 30, windowMs: 60_000 },
  uploadIntent: { limit: 20, windowMs: 60_000 },
  uploadComplete: { limit: 20, windowMs: 60_000 },
  invalidUpload: { limit: 8, windowMs: 10 * 60_000 },
  documentAccess: { limit: 30, windowMs: 60_000 },
  reviewDecision: { limit: 30, windowMs: 60_000 },
  finalization: { limit: 5, windowMs: 60_000 },
  worker: { limit: 10, windowMs: 60_000 },
} as const
