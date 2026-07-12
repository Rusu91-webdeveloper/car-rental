import { Badge } from "@/components/ui/badge"

const styles: Record<string, string> = {
  Ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Action required": "border-red-200 bg-red-50 text-red-700",
  Warning: "border-amber-200 bg-amber-50 text-amber-700",
  "Draft changes": "border-blue-200 bg-blue-50 text-blue-700",
  "Not configured": "border-slate-200 bg-slate-50 text-slate-600",
  VALID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-700",
  BLOCKED: "border-red-200 bg-red-50 text-red-700",
  NOT_VALIDATED: "border-slate-200 bg-slate-50 text-slate-600",
}

const labels: Record<string, string> = {
  VALID: "Validated",
  WARNING: "Validated with warnings",
  BLOCKED: "Blocked",
  NOT_VALIDATED: "Not validated",
}

export function ConfigurationStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={styles[status] ?? styles["Not configured"]}>
      {labels[status] ?? status}
    </Badge>
  )
}
