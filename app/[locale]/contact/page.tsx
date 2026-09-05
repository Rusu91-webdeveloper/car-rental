import { Mail, MapPin, Phone } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { ContactForm } from "@/components/contact-form"
import { PublicPageHeader } from "@/components/public-page-header"
import { getBusinessInfo } from "@/lib/business-info"

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [t, businessInfo] = await Promise.all([getTranslations({ locale, namespace: "contact" }), getBusinessInfo()])
  const contactEmail = businessInfo.supportEmail ?? businessInfo.companyEmail
  const location = [businessInfo.companyAddress, [businessInfo.companyZipCode, businessInfo.companyCity].filter(Boolean).join(" "), businessInfo.companyCountry].filter(Boolean).join(", ")

  return (
    <div className="qujo-page">
      <PublicPageHeader title={t("title")} />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-10 max-w-2xl">
          <p className="qujo-kicker mb-3">{t("kicker")}</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">{t("title")}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="qujo-panel h-fit space-y-7 p-6 sm:p-8">
            {contactEmail ? <ContactItem icon={<Mail className="h-5 w-5" />} title={t("info.emailTitle")}><a href={`mailto:${contactEmail}`}>{contactEmail}</a></ContactItem> : null}
            {businessInfo.companyPhone ? <ContactItem icon={<Phone className="h-5 w-5" />} title={t("info.phoneTitle")}><a href={`tel:${businessInfo.companyPhone}`}>{businessInfo.companyPhone}</a></ContactItem> : null}
            {location ? <ContactItem icon={<MapPin className="h-5 w-5" />} title={t("info.addressTitle")}><p>{location}</p></ContactItem> : null}
            {!contactEmail && !businessInfo.companyPhone && !location ? <p className="text-sm leading-relaxed text-muted-foreground">{t("info.formOnly")}</p> : null}
          </aside>
          <ContactForm />
        </div>
      </div>
    </div>
  )
}

function ContactItem({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="flex gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div><div><h2 className="mb-1 font-semibold">{title}</h2><div className="text-sm text-muted-foreground transition-colors [&_a:hover]:text-foreground">{children}</div></div></div>
}
