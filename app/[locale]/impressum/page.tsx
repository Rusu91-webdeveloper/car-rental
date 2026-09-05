import { PublicLegalPage, type PublicLegalSection } from "@/components/legal/public-legal-page"
import { getBusinessInfo } from "@/lib/business-info"

export default async function ImpressumPage({ params }: { params: Promise<{ locale: string }> }) {
  const [{ locale }, info] = await Promise.all([params, getBusinessInfo()])
  const de = locale !== "en"
  const address = [info.companyAddress, [info.companyZipCode, info.companyCity].filter(Boolean).join(" "), info.companyCountry].filter(Boolean)
  const sections: PublicLegalSection[] = [
    {
      title: de ? "Anbieter gemäß § 5 DDG" : "Service provider under section 5 DDG",
      content: <div className="space-y-1"><p className="font-semibold text-foreground">{info.companyName}</p>{address.map((line) => <p key={line}>{line}</p>)}</div>,
    },
    {
      title: de ? "Kontakt" : "Contact",
      content: <div className="space-y-1">{info.companyPhone ? <p>{de ? "Telefon" : "Phone"}: <a className="text-foreground underline underline-offset-2" href={`tel:${info.companyPhone}`}>{info.companyPhone}</a></p> : null}{info.companyEmail ? <p>E-Mail: <a className="text-foreground underline underline-offset-2" href={`mailto:${info.companyEmail}`}>{info.companyEmail}</a></p> : null}</div>,
    },
    ...(info.managingDirector ? [{ title: de ? "Vertretungsberechtigte Person" : "Authorised representative", paragraphs: [info.managingDirector] }] : []),
    ...(info.commercialRegister || info.registerCourt ? [{ title: de ? "Registereintrag" : "Commercial register", paragraphs: [[info.registerCourt, info.commercialRegister].filter(Boolean).join(" · ")] }] : []),
    ...(info.vatId ? [{ title: de ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG" : "VAT identification number under section 27a UStG", paragraphs: [info.vatId] }] : []),
    ...(info.responsiblePerson ? [{ title: de ? "Verantwortlich für journalistisch-redaktionelle Inhalte gemäß § 18 Abs. 2 MStV" : "Responsible for journalistic-editorial content under section 18(2) MStV", paragraphs: [info.responsiblePerson] }] : []),
    {
      title: de ? "Verbraucherstreitbeilegung" : "Consumer dispute resolution",
      paragraphs: [de
        ? "Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Die frühere EU-Plattform zur Online-Streitbeilegung wurde zum 20. Juli 2025 eingestellt."
        : "We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board. The former EU online dispute resolution platform was discontinued on 20 July 2025."],
    },
  ]

  return <PublicLegalPage title={de ? "Impressum" : "Legal notice"} intro={de ? "Gesetzliche Anbieterkennzeichnung der Qujo Autovermietung GmbH." : "Statutory provider information for Qujo Autovermietung GmbH."} updated={de ? "Stand: 20. Juli 2026" : "Last updated: 20 July 2026"} sections={sections} />
}
