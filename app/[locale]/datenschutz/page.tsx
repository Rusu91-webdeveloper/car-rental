import Link from "@/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { getTranslations } from "next-intl/server"
import { getBusinessInfo } from "@/lib/business-info"

export default async function DatenschutzPage() {
  const t = await getTranslations("datenschutz")
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
            <h2 className="text-2xl font-semibold mb-4">{t("dataController.title")}</h2>
            <div className="space-y-2 text-muted-foreground">
              <p className="font-medium text-foreground">{businessInfo.companyName}</p>
              {businessInfo.companyAddress && <p>{businessInfo.companyAddress}</p>}
              {businessInfo.companyCity && (
                <p>
                  {businessInfo.companyCity}
                  {businessInfo.companyCountry ? `, ${businessInfo.companyCountry}` : ""}
                </p>
              )}
              <p>
                <span className="font-medium text-foreground">{t("dataController.email")}:</span>{" "}
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
            <h2 className="text-2xl font-semibold mb-4">{t("dataCollection.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("dataCollection.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>{t("dataCollection.items.personal")}</li>
              <li>{t("dataCollection.items.booking")}</li>
              <li>{t("dataCollection.items.payment")}</li>
              <li>{t("dataCollection.items.usage")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataPurpose.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("dataPurpose.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>{t("dataPurpose.items.processing")}</li>
              <li>{t("dataPurpose.items.communication")}</li>
              <li>{t("dataPurpose.items.legal")}</li>
              <li>{t("dataPurpose.items.improvement")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataSharing.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("dataSharing.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataRights.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("dataRights.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>{t("dataRights.items.access")}</li>
              <li>{t("dataRights.items.rectification")}</li>
              <li>{t("dataRights.items.deletion")}</li>
              <li>{t("dataRights.items.restriction")}</li>
              <li>{t("dataRights.items.portability")}</li>
              <li>{t("dataRights.items.objection")}</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">{t("dataRights.contact")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("cookies.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("cookies.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("security.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("security.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("changes.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("changes.content")}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

