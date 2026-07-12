import type { Phase6Version } from "@/lib/phase6-admin/types"

function changedFields<T extends object>(live: Phase6Version<T> | undefined, draft: Phase6Version<T> | undefined) {
  if (!draft) return []
  if (!live) return Object.keys(draft.configuration)
  return Object.keys(draft.configuration).filter(
    (key) => JSON.stringify(draft.configuration[key as keyof T]) !== JSON.stringify(live.configuration[key as keyof T]),
  )
}

export function Phase6DraftLiveComparison<T extends object>({
  live,
  draft,
  impact,
}: {
  live?: Phase6Version<T>
  draft?: Phase6Version<T>
  impact: string
}) {
  const changed = changedFields(live, draft)
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Draft and live comparison</h2>
      {!draft ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Create a draft to compare proposed behavior with live bookings.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="font-medium">Live:</span> {live ? `Version ${live.versionNumber}` : "Not active"}
          </p>
          <p>
            <span className="font-medium">Draft:</span> Version {draft.versionNumber}
          </p>
          <p>
            <span className="font-medium">Changed fields:</span> {changed.length ? changed.join(", ") : "None"}
          </p>
          <p className="text-muted-foreground">{impact}</p>
          <p className="text-xs text-muted-foreground">
            Draft changes affect future bookings only after validation and explicit release activation.
          </p>
        </div>
      )}
    </section>
  )
}
