import { createHash, timingSafeEqual } from "node:crypto"

export function hasValidBearerSecret(request: Request, secret: string | undefined) {
  if (!secret) return false
  const authorization = request.headers.get("authorization") ?? ""
  const supplied = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!supplied) return false
  const expectedBytes = Buffer.from(secret)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
}

export function validIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key")?.trim()
  if (!value || value.length < 16 || value.length > 128) return undefined
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return undefined
  return value
}

export function manualExecutionKey(job: string, idempotencyKey: string) {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex")
  return `manual:${job}:${digest}`
}
