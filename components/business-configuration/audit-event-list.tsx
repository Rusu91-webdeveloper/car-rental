import type { ConfigurationAuditRecord } from "@/lib/business-configuration/repositories"

export function AuditEventList({ events }: { events: readonly ConfigurationAuditRecord[] }) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="font-semibold">Recent configuration activity</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No configuration activity has been recorded.</p>
      ) : (
        <ul className="mt-4 divide-y">
          {events.map((event) => (
            <li key={event.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{event.action.replaceAll(".", " ")}</span>
                <time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">By {event.actorName}{event.summary ? ` · ${event.summary}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
