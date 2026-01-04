import Link from "@/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { getTranslations } from "next-intl/server"
import { getBusinessInfo } from "@/lib/business-info"

export default async function WiderrufPage() {
  const t = await getTranslations("widerruf")
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
            <p className="text-muted-foreground leading-relaxed mb-4">{t("intro")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("lastUpdated")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("right.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("right.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("right.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("period.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("period.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("period.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("procedure.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("procedure.intro")}</p>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-foreground">{t("procedure.recipient")}</p>
              <p className="text-muted-foreground">{businessInfo.companyName}</p>
              {businessInfo.companyAddress && <p className="text-muted-foreground">{businessInfo.companyAddress}</p>}
              {businessInfo.companyCity && (
                <p className="text-muted-foreground">
                  {businessInfo.companyCity}
                  {businessInfo.companyCountry ? `, ${businessInfo.companyCountry}` : ""}
                </p>
              )}
              <p className="text-muted-foreground mt-2">
                <span className="font-medium text-foreground">{t("procedure.email")}:</span>{" "}
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
            <h2 className="text-2xl font-semibold mb-4">{t("consequences.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("consequences.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("consequences.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("exceptions.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("exceptions.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>{t("exceptions.items.perishable")}</li>
              <li>{t("exceptions.items.custom")}</li>
              <li>{t("exceptions.items.urgent")}</li>
              <li>{t("exceptions.items.sealed")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("modelForm.title")}</h2>
            <div className="bg-muted p-4 rounded-lg space-y-4">
              <p className="text-muted-foreground leading-relaxed">{t("modelForm.intro")}</p>
              <div className="border-t border-border pt-4">
                <p className="text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">{t("modelForm.to")}</span>
                </p>
                <p className="text-muted-foreground">{businessInfo.companyName}</p>
                {businessInfo.companyAddress && (
                  <p className="text-muted-foreground">{businessInfo.companyAddress}</p>
                )}
                {businessInfo.companyCity && (
                  <p className="text-muted-foreground">
                    {businessInfo.companyCity}
                    {businessInfo.companyCountry ? `, ${businessInfo.companyCountry}` : ""}
                  </p>
                )}
                <p className="text-muted-foreground mt-2">
                  <span className="font-medium text-foreground">{t("procedure.email")}:</span>{" "}
                  <a
                    href={`mailto:${businessInfo.companyEmail}`}
                    className="hover:text-primary transition-colors"
                  >
                    {businessInfo.companyEmail}
                  </a>
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-muted-foreground mb-4">{t("modelForm.content")}</p>
                <div className="space-y-2 text-muted-foreground">
                  <p>{t("modelForm.bookingNumber")}</p>
                  <p>{t("modelForm.customerName")}</p>
                  <p>{t("modelForm.customerAddress")}</p>
                  <p>{t("modelForm.customerEmail")}</p>
                  <p>{t("modelForm.customerPhone")}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

