import Link from "@/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { getTranslations } from "next-intl/server"

export default async function AboutPage() {
  const t = await getTranslations()

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
            <h1 className="text-xl font-bold">{t("about.title")}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-center mb-4">{t("about.heroTitle")}</h2>
          <p className="text-muted-foreground text-center text-lg">{t("about.subtitle")}</p>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="text-xl font-semibold mb-3">{t("about.storyTitle")}</h3>
            <p className="text-muted-foreground leading-relaxed">{t("about.storyBody")}</p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-3">{t("about.missionTitle")}</h3>
            <p className="text-muted-foreground leading-relaxed">{t("about.missionBody")}</p>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">{t("about.whyTitle")}</h3>
            <div className="grid gap-4">
              <div className="flex gap-4 p-4 bg-muted rounded-xl">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t("about.feature1Title")}</h4>
                  <p className="text-sm text-muted-foreground">{t("about.feature1Body")}</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-muted rounded-xl">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t("about.feature2Title")}</h4>
                  <p className="text-sm text-muted-foreground">{t("about.feature2Body")}</p>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-muted rounded-xl">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">{t("about.feature3Title")}</h4>
                  <p className="text-sm text-muted-foreground">{t("about.feature3Body")}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="setup" className="mt-12 pt-8 border-t border-border">
            <h3 className="text-2xl font-semibold mb-4">{t("about.setupTitle")}</h3>
            <div className="bg-muted p-6 rounded-xl space-y-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                    1
                  </span>
                  {t("about.setupDemoTitle")}
                </h4>
                <p className="text-sm text-muted-foreground ml-8">
                  {t.rich("about.setupDemoBody", {
                    code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                  })}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                    2
                  </span>
                  {t("about.setupDbTitle")}
                </h4>
                <p className="text-sm text-muted-foreground ml-8 mb-2">{t("about.setupDbIntro")}</p>
                <ul className="text-sm text-muted-foreground ml-8 space-y-1 list-disc list-inside">
                  <li>
                    {t.rich("about.setupDbStep1", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                  <li>{t("about.setupDbStep2")}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                    3
                  </span>
                  {t("about.setupAuthTitle")}
                </h4>
                <p className="text-sm text-muted-foreground ml-8 mb-2">
                  {t.rich("about.setupAuthIntro", {
                    clerkLink: (chunks) => (
                      <a
                        href="https://dashboard.clerk.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
                <ul className="text-sm text-muted-foreground ml-8 space-y-1 list-disc list-inside">
                  <li>
                    {t.rich("about.setupAuthKey1", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                  <li>
                    {t.rich("about.setupAuthKey2", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                    4
                  </span>
                  {t("about.setupPaymentsTitle")}
                </h4>
                <p className="text-sm text-muted-foreground ml-8 mb-2">
                  {t.rich("about.setupPaymentsIntro", {
                    stripeLink: (chunks) => (
                      <a
                        href="https://dashboard.stripe.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
                <ul className="text-sm text-muted-foreground ml-8 space-y-1 list-disc list-inside">
                  <li>
                    {t.rich("about.setupPaymentsKey1", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                  <li>
                    {t.rich("about.setupPaymentsKey2", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                  <li>
                    {t.rich("about.setupPaymentsKey3", {
                      code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                    })}
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {t.rich("about.setupHelp", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                    helpLink: (chunks) => (
                      <Link href="/help" className="text-primary underline">
                        {chunks}
                      </Link>
                    ),
                    code: (chunks) => <code className="bg-background px-2 py-1 rounded text-xs">{chunks}</code>,
                  })}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
