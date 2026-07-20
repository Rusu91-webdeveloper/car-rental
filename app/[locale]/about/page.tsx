import Link from "@/navigation"
import { PublicPageHeader } from "@/components/public-page-header"
import { getTranslations } from "next-intl/server"

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale })

  return (
    <div className="qujo-page">
      <PublicPageHeader title={t("about.title")} />

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="qujo-kicker mb-5">Qujo Autovermietung GmbH</p>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#13251d] text-[#cbe85d]">
            <svg className="w-10 h-10 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
            </svg>
          </div>
          <h1 className="mb-5 text-4xl font-extrabold leading-tight sm:text-5xl">{t("about.heroTitle")}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{t("about.subtitle")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="qujo-panel p-6 sm:p-8">
            <h3 className="text-xl font-semibold mb-3">{t("about.storyTitle")}</h3>
            <p className="text-muted-foreground leading-relaxed">{t("about.storyBody")}</p>
          </section>

          <section className="qujo-panel p-6 sm:p-8">
            <h3 className="text-xl font-semibold mb-3">{t("about.missionTitle")}</h3>
            <p className="text-muted-foreground leading-relaxed">{t("about.missionBody")}</p>
          </section>

          <section className="qujo-panel p-6 sm:p-8 lg:col-span-2">
            <h3 className="text-xl font-semibold mb-4">{t("about.whyTitle")}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex gap-4 rounded-xl bg-[#f3f4ed] p-5">
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

              <div className="flex gap-4 rounded-xl bg-[#f3f4ed] p-5">
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

              <div className="flex gap-4 rounded-xl bg-[#f3f4ed] p-5">
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

          <div className="flex flex-col gap-5 rounded-[1.35rem] bg-[#13251d] p-6 text-white lg:col-span-2 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#cbe85d]">{t("about.ctaKicker")}</p>
              <h2 className="mt-2 text-2xl font-bold">{t("about.ctaTitle")}</h2>
            </div>
            <Link href="/cars" className="shrink-0 rounded-xl bg-[#cbe85d] px-5 py-3 text-sm font-bold text-[#13251d]">
              {t("home.ctaPrimary")}
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
