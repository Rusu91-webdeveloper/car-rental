export function currentLocalizedPath(
  pathname: string,
  location?: { search: string; hash: string },
) {
  if (!location) return pathname
  return `${pathname}${location.search}${location.hash}`
}
