import Link from "@/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { getTranslations } from "next-intl/server"
import { getBusinessInfo } from "@/lib/business-info"

export default async function ImpressumPage() {
  const t = await getTranslations("impressum")
  const businessInfo = await getBusinessInfo()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background px-4 py-4 border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </Link>
            <h1 className="text-xl font-bold">{t("title")}</h1>
          </div>
          <ClientOnly>
            <LanguageSwitcher />
          </ClientOnly>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("companyInfo.title")}</h2>
            <div className="space-y-2 text-muted-foreground">
              <p className="font-medium text-foreground">{businessInfo.companyName}</p>
              {businessInfo.companyAddress && <p>{businessInfo.companyAddress}</p>}
              {businessInfo.companyCity && (
                <p>
                  {businessInfo.companyCity}
                  {businessInfo.companyCountry ? `, ${businessInfo.companyCountry}` : ""}
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("contact.title")}</h2>
            <div className="space-y-2 text-muted-foreground">
              {businessInfo.companyPhone && (
                <p>
                  <span className="font-medium text-foreground">{t("contact.phone")}:</span>{" "}
                  <a href={`tel:${businessInfo.companyPhone}`} className="hover:text-primary transition-colors">
                    {businessInfo.companyPhone}
                  </a>
                </p>
              )}
              <p>
                <span className="font-medium text-foreground">{t("contact.email")}:</span>{" "}
                <a
                  href={`mailto:${businessInfo.companyEmail}`}
                  className="hover:text-primary transition-colors"
                >
                  {businessInfo.companyEmail}
                </a>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("legalInfo.title")}</h2>
            <div className="space-y-4 text-muted-foreground">
              {businessInfo.managingDirector && (
                <div>
                  <p className="font-medium text-foreground mb-2">{t("legalInfo.managingDirector")}</p>
                  <p>{businessInfo.managingDirector}</p>
                </div>
              )}
              {businessInfo.commercialRegister && (
                <div>
                  <p className="font-medium text-foreground mb-2">{t("legalInfo.register")}</p>
                  <p>{businessInfo.commercialRegister}</p>
                  {businessInfo.registerCourt && <p>{businessInfo.registerCourt}</p>}
                </div>
              )}
              {businessInfo.vatId && (
                <div>
                  <p className="font-medium text-foreground mb-2">{t("legalInfo.vatId")}</p>
                  <p>{businessInfo.vatId}</p>
                </div>
              )}
            </div>
          </section>

          {businessInfo.responsiblePerson && (
            <section>
              <h2 className="text-2xl font-semibold mb-4">{t("responsibility.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{businessInfo.responsiblePerson}</p>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("disputeResolution.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("disputeResolution.intro")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("disputeResolution.content")}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

