"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const isEnglish = locale === "en";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) {
      return;
    }
    router.push(pathname, { locale: newLocale });
  };

  return (
    <button
      onClick={() => switchLocale(isEnglish ? "de" : "en")}
      className="relative inline-flex h-7 w-12 items-center rounded-full bg-muted/80 border border-border/50 transition-all duration-200 ease-in-out hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      aria-label={isEnglish ? t("switchToGerman") : t("switchToEnglish")}
      title={isEnglish ? t("switchToGerman") : t("switchToEnglish")}
      role="switch"
      aria-checked={!isEnglish}>
      {/* Sliding indicator */}
      <span
        className={`absolute h-6 w-6 rounded-full bg-background shadow-md border border-border/30 transition-all duration-200 ease-in-out ${
          isEnglish ? "translate-x-0.5" : "translate-x-[calc(100%-0.125rem)]"
        }`}
      />
      {/* Labels */}
      <span
        className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold transition-all duration-200 ${
          isEnglish
            ? "text-foreground opacity-100"
            : "text-muted-foreground opacity-0"
        }`}
        style={{ left: "25%" }}>
        EN
      </span>
      <span
        className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold transition-all duration-200 ${
          !isEnglish
            ? "text-foreground opacity-100"
            : "text-muted-foreground opacity-0"
        }`}
        style={{ left: "75%" }}>
        DE
      </span>
    </button>
  );
}
