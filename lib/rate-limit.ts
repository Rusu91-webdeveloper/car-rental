export interface RateLimitPolicy {
  limit: number
  windowMs: number
}

type Entry = { count: number; resetAt: number }
const entries = new Map<string, Entry>()
const MAX_KEYS = 5_000

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again later.")
    this.name = "RateLimitExceededError"
  }
}

/**
 * A deliberately bounded non-production limiter. Production enablement must
 * replace this process-local store with a shared atomic backend.
 */
export function enforceRateLimit(
  scope: string,
  subject: string,
  policy: RateLimitPolicy,
  now = Date.now(),
) {
  if (entries.size >= MAX_KEYS)
    for (const [key, value] of entries) {
      if (value.resetAt <= now || entries.size >= MAX_KEYS) entries.delete(key)
      if (entries.size < MAX_KEYS) break
    }
  const key = `${scope}:${subject}`
  const current = entries.get(key)
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + policy.windowMs })
    return
  }
  if (current.count >= policy.limit)
    throw new RateLimitExceededError(
      Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    )
  current.count += 1
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
