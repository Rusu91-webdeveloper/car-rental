import Link from "@/navigation"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type BrandMarkProps = {
  compact?: boolean
  inverted?: boolean
  className?: string
}

export function BrandMark({ compact = false, inverted = false, className }: BrandMarkProps) {
  const t = useTranslations("common")

  return (
    <Link
      href="/"
      aria-label={t("brandHome")}
      className={cn("group inline-flex items-center gap-3", className)}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-[0.8rem] border text-[0.92rem] font-black tracking-[-0.08em] transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.03]",
          inverted
            ? "border-white/15 bg-white text-[#13251d]"
            : "border-[#183126]/10 bg-[#13251d] text-white shadow-[0_10px_25px_-15px_rgba(19,37,29,0.85)]"
        )}
      >
        QJ
      </span>
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className={cn("block text-[1.05rem] font-extrabold tracking-[-0.045em]", inverted && "text-white")}>Qujo</span>
          <span
            className={cn(
              "mt-1 block whitespace-nowrap text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
              inverted && "text-white/58"
            )}
          >
            Autovermietung
          </span>
        </span>
      )}
    </Link>
  )
}
