const MAX_CAR_SLUG_BASE_LENGTH = 80

export function createCarSlugBase(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CAR_SLUG_BASE_LENGTH)
    .replace(/-+$/g, "")

  return slug || "car"
}

export function getNextCarSlug(baseSlug: string, existingSlugs: Iterable<string>) {
  const reservedSlugs = new Set(existingSlugs)

  if (!reservedSlugs.has(baseSlug)) {
    return baseSlug
  }

  let suffix = 2
  while (reservedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }

  return `${baseSlug}-${suffix}`
}

export function isSlugUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }

  const candidate = error as { code?: unknown; meta?: { target?: unknown } }
  if (candidate.code !== "P2002") {
    return false
  }

  const target = candidate.meta?.target
  if (Array.isArray(target)) {
    return target.includes("slug")
  }

  return typeof target === "string" && target.includes("slug")
}
