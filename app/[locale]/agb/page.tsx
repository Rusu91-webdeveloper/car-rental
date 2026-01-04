import Link from "@/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ClientOnly } from "@/components/client-only"
import { getTranslations } from "next-intl/server"

export default async function AGBPage() {
  const t = await getTranslations("agb")

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
            <h2 className="text-2xl font-semibold mb-4">{t("scope.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("scope.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("scope.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("contract.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("contract.intro")}</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
              <li>{t("contract.steps.booking")}</li>
              <li>{t("contract.steps.confirmation")}</li>
              <li>{t("contract.steps.payment")}</li>
              <li>{t("contract.steps.contract")}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("prices.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("prices.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("prices.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("payment.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("payment.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("payment.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("pickup.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("pickup.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("pickup.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("return.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("return.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("return.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("liability.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("liability.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("liability.content2")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("cancellation.title")}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{t("cancellation.content1")}</p>
            <p className="text-muted-foreground leading-relaxed">{t("cancellation.content2")}</p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <Link href="/widerruf" className="text-primary hover:underline">
                {t("cancellation.link")}
              </Link>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("applicableLaw.title")}</h2>
            <p className="text-muted-foreground leading-relaxed">{t("applicableLaw.content")}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

