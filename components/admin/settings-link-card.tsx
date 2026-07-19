import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"
import Link from "@/navigation"

export function SettingsLinkCard({
  title,
  description,
  href,
  icon: Icon,
  badge,
}: {
  title: string
  description: string
  href: string
  icon: LucideIcon
  badge?: string
}) {
  return (
    <Link href={href} className="group rounded-xl border bg-background p-5 transition hover:border-primary/35 hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        {badge ? <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{badge}</span> : null}
      </div>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span className="mt-4 flex items-center text-sm font-medium text-primary">
        Open <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
