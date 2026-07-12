import type { ReactNode } from "react"
export function Phase6PageHeader({
  title,
  description,
  live,
  draft,
  children,
}: {
  title: string
  description: string
  live?: number
  draft?: number
  children?: ReactNode
}) {
  return (
    <header className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded border bg-background px-3 py-2">
          Live: {live ? `Version ${live}` : "Not configured"}
        </span>
        <span className="rounded border bg-background px-3 py-2">Draft: {draft ? `Version ${draft}` : "None"}</span>
      </div>
      {children}
    </header>
  )
}
