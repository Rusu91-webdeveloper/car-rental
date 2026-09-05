import Link from "@/navigation"
import { PublicLegalPage, type PublicLegalSection } from "@/components/legal/public-legal-page"
import { getBusinessInfo } from "@/lib/business-info"

export default async function WiderrufPage({ params }: { params: Promise<{ locale: string }> }) {
  const [{ locale }, info] = await Promise.all([params, getBusinessInfo()])
  const de = locale !== "en"
  const contact = info.supportEmail ?? info.companyEmail
  const sections: PublicLegalSection[] = de ? [
    { title: "Kein gesetzliches Widerrufsrecht bei termingebundener Fahrzeugmiete", paragraphs: ["Bei Verträgen zur Erbringung von Dienstleistungen im Zusammenhang mit einer Kraftfahrzeugvermietung besteht nach § 312g Abs. 2 Nr. 9 BGB kein gesetzliches Widerrufsrecht, wenn der Vertrag für die Erbringung einen spezifischen Termin oder Zeitraum vorsieht.", "Da jede Fahrzeugbuchung bei Qujo für einen konkret ausgewählten Mietzeitraum erfolgt, können Sie die Buchung nicht innerhalb von 14 Tagen ohne Grund nach den gesetzlichen Widerrufsvorschriften widerrufen."] },
    { title: "Vertragliche Stornierung bleibt möglich", paragraphs: ["Ein fehlendes gesetzliches Widerrufsrecht schließt vertraglich vereinbarte Stornierungsrechte nicht aus. Ob, bis wann und zu welchen Kosten Sie stornieren können, ergibt sich ausschließlich aus den vor dem Absenden angezeigten Buchungsbedingungen und Ihrer Buchungsbestätigung."], content: <p><Link href="/agb" className="font-medium text-foreground underline underline-offset-2">Allgemeine Mietbedingungen lesen</Link></p> },
    { title: "Kontakt", paragraphs: ["Wenn Sie eine Buchungsanfrage ändern oder stornieren möchten, kontaktieren Sie uns bitte so früh wie möglich und nennen Sie Ihre Buchungsnummer."], content: contact ? <p>E-Mail: <a className="font-medium text-foreground underline underline-offset-2" href={`mailto:${contact}`}>{contact}</a></p> : <p><Link href="/contact" className="font-medium text-foreground underline underline-offset-2">Kontaktformular öffnen</Link></p> },
  ] : [
    { title: "No statutory withdrawal right for date-specific vehicle rental", paragraphs: ["Under section 312g(2)(9) BGB, contracts for services connected with vehicle rental do not carry a statutory withdrawal right where the contract provides a specific date or period for performance.", "Because every Qujo vehicle booking is made for a specifically selected rental period, it cannot be withdrawn without reason within 14 days under the statutory withdrawal rules."] },
    { title: "Contractual cancellation may still be available", paragraphs: ["The absence of a statutory withdrawal right does not prevent contractual cancellation rights. Whether, when and at what cost cancellation is possible is governed solely by the conditions shown before submission and your booking confirmation."], content: <p><Link href="/agb" className="font-medium text-foreground underline underline-offset-2">Read the General Rental Terms</Link></p> },
    { title: "Contact", paragraphs: ["To change or cancel a booking request, contact us as early as possible and include the booking number."], content: contact ? <p>Email: <a className="font-medium text-foreground underline underline-offset-2" href={`mailto:${contact}`}>{contact}</a></p> : <p><Link href="/contact" className="font-medium text-foreground underline underline-offset-2">Open the contact form</Link></p> },
  ]
  return <PublicLegalPage title={de ? "Hinweis zum Widerrufsrecht" : "Withdrawal-right notice"} intro={de ? "Pflichtinformation für termingebundene Fahrzeugmietverträge." : "Mandatory information for date-specific vehicle rental contracts."} updated={de ? "Stand: 20. Juli 2026" : "Last updated: 20 July 2026"} sections={sections} />
}
