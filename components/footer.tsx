"use client"

import Link, { usePathname } from "@/navigation"
import { useTranslations } from "next-intl"
import { Separator } from "@/components/ui/separator"
import { BrandMark } from "@/components/brand-mark"

interface BusinessInfo {
  companyName: string
  companyEmail: string | null
  companyPhone: string | null
  companyAddress: string | null
  companyCity: string | null
  companyZipCode: string | null
  companyCountry: string | null
  managingDirector: string | null
  commercialRegister: string | null
  registerCourt: string | null
  vatId: string | null
  responsiblePerson: string | null
  supportEmail: string | null
}

interface FooterProps {
  businessInfo?: BusinessInfo
}

export function Footer({ businessInfo }: FooterProps = {}) {
  const t = useTranslations("footer")
  const pathname = usePathname()

  // Hide footer on admin routes
  if (pathname?.includes("/admin")) {
    return null
  }

  return (
    <footer className="border-t border-white/5 bg-[#0f1f18] text-white [&_.text-foreground]:text-white [&_.text-muted-foreground]:text-white/55 [&_a:hover]:!text-[#cbe85d]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Company Info */}
          <div className="space-y-4">
            <BrandMark inverted />
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-white/40">
              {businessInfo?.companyName || t("companyName")}
            </p>
            <p className="text-sm text-muted-foreground">{t("tagline")}</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              {businessInfo?.companyAddress ? <p>{businessInfo.companyAddress}</p> : null}
              {businessInfo?.companyCity ? <p>{[businessInfo.companyZipCode, businessInfo.companyCity].filter(Boolean).join(" ")}{businessInfo.companyCountry ? `, ${businessInfo.companyCountry}` : ""}</p> : null}
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t("quickLinks")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.about")}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.contact")}
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.help")}
                </Link>
              </li>
              <li>
                <Link href="/cars" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.cars")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t("legal")}</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/impressum" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.impressum")}
                </Link>
              </li>
              <li>
                <Link
                  href="/datenschutz"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {t("links.datenschutz")}
                </Link>
              </li>
              <li>
                <Link href="/agb" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t("links.agb")}
                </Link>
              </li>
              <li>
                <Link
                  href="/widerruf"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {t("links.widerruf")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t("contact")}</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {businessInfo?.companyEmail ? <li className="flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <a
                  href={`mailto:${businessInfo.companyEmail}`}
                  className="hover:text-primary transition-colors"
                >
                  {businessInfo.companyEmail}
                </a>
              </li> : null}
              {businessInfo?.companyPhone && (
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  <a href={`tel:${businessInfo.companyPhone}`} className="hover:text-primary transition-colors">
                    {businessInfo.companyPhone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-white/10" />

        {/* Legal Information */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 text-sm text-muted-foreground">
          {businessInfo?.managingDirector && (
            <div className="space-y-1">
              <p>
                <span className="font-medium">{t("legalInfo.managingDirector")}:</span>{" "}
                {businessInfo.managingDirector}
              </p>
            </div>
          )}
          {businessInfo?.commercialRegister && (
            <div className="space-y-1">
              <p>
                <span className="font-medium">{t("legalInfo.register")}:</span> {businessInfo.commercialRegister}
              </p>
              {businessInfo.registerCourt && <p>{businessInfo.registerCourt}</p>}
            </div>
          )}
          {businessInfo?.vatId && (
            <div className="space-y-1">
              <p>
                <span className="font-medium">{t("legalInfo.vatId")}:</span> {businessInfo.vatId}
              </p>
            </div>
          )}
        </div>

        <Separator className="my-6 bg-white/10" />

        {/* Copyright */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {businessInfo?.companyName || t("companyName")}. {t("copyright")}
          </p>
          <Link href="/contact" className="text-sm font-medium text-white/60 transition-colors">
            {t("links.contact")} →
          </Link>
        </div>
      </div>
    </footer>
  )
}
