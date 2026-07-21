import { notFound } from "next/navigation"
import Image from "next/image"
import type React from "react"
import { ArrowLeft, CalendarDays, CarFront, CheckCircle2, CircleAlert, Clock3, CreditCard, FileCheck2, FileText, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react"
import { Link } from "@/navigation"
import { prisma } from "@/lib/db"
import { formatCents } from "@/lib/money"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { CAPABILITIES } from "@/lib/authorization/capabilities"
import { requireDocumentCapability } from "@/lib/private-documents/authorization/service"
import { loadRestrictedDocumentActor } from "@/lib/private-documents/server/request-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"

export const dynamic = "force-dynamic"

const CLOSED_STATUSES = new Set(["CANCELLED", "EXPIRED", "REJECTED", "FINALIZED"])

export default async function ApplicationReviewWorkspace({
  params,
}: {
  params: Promise<{ locale: string; applicationId: string }>
}) {
  const { locale, applicationId } = await params
  const tr = (english: string, german: string) => (locale === "de" ? german : english)
  const [documentContext, capabilities] = await Promise.all([
    loadRestrictedDocumentActor(),
    getBusinessConfigurationCapabilities(),
  ])
  requireDocumentCapability(documentContext.actor, CAPABILITIES.DOCUMENTS_REVIEW)

  const application = await prisma.bookingApplication.findFirst({
    where: {
      id: applicationId,
      documentUploadSession: {
        is: { customerDocuments: { some: { isCurrent: true, deletionStatus: { not: "DELETED" } } } },
      },
    },
    select: {
      id: true,
      status: true,
      revision: true,
      locale: true,
      pickupAt: true,
      returnAt: true,
      pickupLocation: true,
      returnLocation: true,
      paymentMethod: true,
      submittedAt: true,
      updatedAt: true,
      expiresAt: true,
      terminalReason: true,
      bookingId: true,
      customer: { select: { name: true, email: true, createdAt: true } },
      car: { select: { name: true, nameDe: true, image: true, category: true, year: true } },
      pricingQuotes: {
        where: { isCurrent: true },
        select: { grandTotal: true, currency: true, baseSubtotal: true, insuranceSubtotal: true, taxTotal: true, expiresAt: true },
        take: 1,
      },
      insuranceSelection: {
        select: { selected: true, customerFacingName: true, description: true, quotedSubtotal: true, currency: true },
      },
      paymentSelection: {
        select: { configuredPaymentMode: true, quotedDepositAmount: true, currency: true },
      },
      legalAcceptances: {
        where: { accepted: true },
        select: {
          id: true,
          documentType: true,
          documentVersionNumber: true,
          locale: true,
          acceptedAt: true,
          legalDocumentTranslation: { select: { title: true } },
        },
        orderBy: { acceptedAt: "asc" },
      },
      documentUploadSession: {
        select: {
          status: true,
          expiresAt: true,
          customerDocuments: {
            where: { isCurrent: true, deletionStatus: { not: "DELETED" } },
            select: {
              id: true,
              documentTypeId: true,
              side: true,
              slotNumber: true,
              attemptNumber: true,
              originalFileName: true,
              sizeBytes: true,
              uploadStatus: true,
              scanStatus: true,
              manualReviewStatus: true,
              reviewReasonCode: true,
              safeReviewerNote: true,
              createdAt: true,
              documentType: { select: { key: true, name: true } },
            },
            orderBy: [{ documentTypeId: "asc" }, { slotNumber: "asc" }, { side: "asc" }],
          },
        },
      },
    },
  })

  if (!application) notFound()

  const driver = capabilities.canViewSensitiveCustomerData
    ? await prisma.bookingApplicationCustomerDriver.findUnique({
        where: { bookingApplicationId: application.id },
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          dateOfBirth: true,
          country: true,
          address: true,
          city: true,
          postalCode: true,
          nationality: true,
          licenceNumber: true,
          licenceIssueDate: true,
          licenceExpiryDate: true,
          licenceIssuingCountry: true,
          licenceHeldSinceDate: true,
          validationStatus: true,
          validatedAt: true,
        },
      })
    : null

  const documents = application.documentUploadSession?.customerDocuments ?? []
  const approved = documents.filter((document) => document.manualReviewStatus === "APPROVED").length
  const pending = documents.filter((document) => document.manualReviewStatus === "PENDING_REVIEW").length
  const actionRequired = documents.filter((document) => ["REJECTED", "REPLACEMENT_REQUIRED"].includes(document.manualReviewStatus)).length
  const progress = documents.length ? Math.round((approved / documents.length) * 100) : 0
  const quote = application.pricingQuotes[0]
  const carName = locale === "de" ? application.car.nameDe || application.car.name : application.car.name

  const formatDateTime = (value: Date) =>
    new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    }).format(value)
  const formatDate = (value: Date | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(value)
      : "—"

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/documents" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {tr("Review queue", "Prüfliste")}
        </Link>
        <span>/</span>
        <span className="text-foreground">{tr("Application workspace", "Antragsübersicht")}</span>
      </nav>

      <header className="overflow-hidden rounded-2xl border bg-background">
        <div className="grid gap-5 p-5 lg:grid-cols-[9rem_minmax(0,1fr)_auto] lg:items-center lg:p-6">
          <Image src={application.car.image || "/placeholder.svg"} alt={carName} width={144} height={112} className="h-28 w-full rounded-xl object-cover lg:w-36" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={application.status === "AWAITING_DOCUMENT_REVIEW" ? "destructive" : "secondary"}>{applicationStatus(application.status, locale)}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{application.id}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{carName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("Review the complete customer case before the booking is finalized.", "Prüfen Sie den vollständigen Kundenfall, bevor die Buchung abgeschlossen wird.")}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4 lg:min-w-60">
            <div className="flex items-center justify-between gap-3 text-sm"><span>{tr("Review progress", "Prüffortschritt")}</span><strong>{approved}/{documents.length}</strong></div>
            <Progress className="mt-2" value={progress} />
            <p className="mt-2 text-xs text-muted-foreground">{pending} {tr("pending", "ausstehend")} · {actionRequired} {tr("need action", "mit Handlungsbedarf")}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CarFront className="h-5 w-5 text-primary" />{tr("Rental and booking", "Miete und Buchung")}</CardTitle><CardDescription>{tr("The exact dates, location and confirmed commercial terms.", "Die genauen Daten, der Ort und die bestätigten Konditionen.")}</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info icon={<CalendarDays />} label={tr("Pick-up", "Abholung")} value={formatDateTime(application.pickupAt)} />
              <Info icon={<CalendarDays />} label={tr("Return", "Rückgabe")} value={formatDateTime(application.returnAt)} />
              <Info icon={<MapPin />} label={tr("Location", "Ort")} value={application.pickupLocation} />
              <Info icon={<CreditCard />} label={tr("Payment method", "Zahlungsart")} value={paymentMethod(application.paymentMethod, locale)} />
              <Info icon={<Clock3 />} label={tr("Submitted", "Eingereicht")} value={application.submittedAt ? formatDateTime(application.submittedAt) : "—"} />
              <Info icon={<Clock3 />} label={tr("Application expires", "Antrag läuft ab")} value={formatDateTime(application.expiresAt)} />
              {quote ? <Info icon={<CreditCard />} label={tr("Confirmed total", "Bestätigte Gesamtsumme")} value={formatCents(quote.grandTotal, quote.currency)} strong /> : null}
              {application.paymentSelection ? <Info icon={<CreditCard />} label={tr("Deposit", "Kaution/Anzahlung")} value={formatCents(application.paymentSelection.quotedDepositAmount, application.paymentSelection.currency)} /> : null}
              {application.insuranceSelection?.selected ? <Info icon={<ShieldCheck />} label={tr("Insurance", "Versicherung")} value={`${application.insuranceSelection.customerFacingName} · ${formatCents(application.insuranceSelection.quotedSubtotal, application.insuranceSelection.currency)}`} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5 text-primary" />{tr("Customer and driver", "Kunde und Fahrer")}</CardTitle><CardDescription>{tr("Contact, identity and driving-licence information supplied with this application.", "Kontakt-, Identitäts- und Führerscheininformationen aus diesem Antrag.")}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Info icon={<UserRound />} label={tr("Customer account", "Kundenkonto")} value={application.customer.name || tr("Name not provided", "Name nicht angegeben")} />
                <Info icon={<Mail />} label={tr("Account email", "Konto-E-Mail")} value={application.customer.email} />
                <Info icon={<Clock3 />} label={tr("Customer since", "Kunde seit")} value={formatDate(application.customer.createdAt)} />
              </div>
              <Separator />
              {driver ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label={tr("Driver name", "Name des Fahrers")} value={[driver.firstName, driver.lastName].filter(Boolean).join(" ") || "—"} />
                  <Info icon={<Mail />} label={tr("Driver email", "E-Mail des Fahrers")} value={driver.email || "—"} />
                  <Info icon={<Phone />} label={tr("Phone", "Telefon")} value={driver.phone || "—"} />
                  <Info label={tr("Date of birth", "Geburtsdatum")} value={formatDate(driver.dateOfBirth)} />
                  <Info label={tr("Nationality", "Staatsangehörigkeit")} value={driver.nationality || "—"} />
                  <Info label={tr("Address", "Anschrift")} value={[driver.address, driver.postalCode, driver.city, driver.country].filter(Boolean).join(", ") || "—"} />
                  <Info label={tr("Licence number", "Führerscheinnummer")} value={driver.licenceNumber || "—"} />
                  <Info label={tr("Issuing country", "Ausstellungsland")} value={driver.licenceIssuingCountry || "—"} />
                  <Info label={tr("Licence issued", "Ausgestellt am")} value={formatDate(driver.licenceIssueDate)} />
                  <Info label={tr("Licence expires", "Gültig bis")} value={formatDate(driver.licenceExpiryDate)} />
                  <Info label={tr("Licence held since", "Fahrerlaubnis seit")} value={formatDate(driver.licenceHeldSinceDate)} />
                  <Info label={tr("Validation", "Validierung")} value={validationStatus(driver.validationStatus, locale)} />
                </div>
              ) : (
                <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {tr("Sensitive driver information is not available to your current role.", "Sensible Fahrerinformationen sind für Ihre aktuelle Rolle nicht verfügbar.")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />{tr("Legal acceptances", "Rechtliche Zustimmungen")}</CardTitle><CardDescription>{tr("The exact terms accepted by the customer for this application.", "Die für diesen Antrag vom Kunden akzeptierten Fassungen.")}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {application.legalAcceptances.map((acceptance) => (
                <div key={acceptance.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-medium">{acceptance.legalDocumentTranslation.title}</p><p className="text-xs text-muted-foreground">{legalDocumentType(acceptance.documentType, locale)} · v{acceptance.documentVersionNumber} · {acceptance.locale}</p></div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(acceptance.acceptedAt)}</span>
                </div>
              ))}
              {!application.legalAcceptances.length ? <p className="text-sm text-muted-foreground">{tr("No legal acceptance records found.", "Keine rechtlichen Zustimmungen gefunden.")}</p> : null}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20"><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />{tr("Document checklist", "Dokumentencheckliste")}</CardTitle><CardDescription>{tr("Open each file, compare it with the driver details and record a decision.", "Öffnen Sie jede Datei, vergleichen Sie sie mit den Fahrerdaten und treffen Sie eine Entscheidung.")}</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-4">
              {documents.map((document) => (
                <div key={document.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{documentTypeName(document.documentType.key, document.documentType.name, locale)}</p><p className="text-xs text-muted-foreground">{documentSide(document.side, locale)} · {tr("file", "Datei")} {document.slotNumber}</p></div>
                    <DocumentStatus status={document.manualReviewStatus} locale={locale} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{Math.ceil(document.sizeBytes / 1024)} KiB · {scanStatus(document.scanStatus, locale)}</span>
                    <Button size="sm" variant={document.manualReviewStatus === "PENDING_REVIEW" ? "default" : "outline"} asChild>
                      <Link href={`/admin/documents/${document.id}`}>{document.manualReviewStatus === "PENDING_REVIEW" ? tr("Review", "Prüfen") : tr("Open", "Öffnen")}</Link>
                    </Button>
                  </div>
                </div>
              ))}
              {!documents.length ? <p className="py-5 text-center text-sm text-muted-foreground">{tr("No uploaded documents found.", "Keine hochgeladenen Dokumente gefunden.")}</p> : null}
            </CardContent>
          </Card>

          {application.status === "READY_TO_FINALIZE" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-5 w-5" /><p className="mt-2 font-semibold">{tr("Review complete", "Prüfung abgeschlossen")}</p><p className="mt-1 text-sm">{tr("The customer can now finalize this booking from My Trips.", "Der Kunde kann diese Buchung jetzt unter „Meine Fahrten“ abschließen.")}</p></div>
          ) : null}
          {CLOSED_STATUSES.has(application.status) ? (
            <div className="rounded-xl border bg-muted/30 p-4"><CircleAlert className="h-5 w-5" /><p className="mt-2 font-semibold">{applicationStatus(application.status, locale)}</p><p className="mt-1 text-sm text-muted-foreground">{application.terminalReason || tr("This application is closed.", "Dieser Antrag ist geschlossen.")}</p></div>
          ) : null}
        </aside>
      </div>
    </main>
  )
}

function Info({ icon, label, value, strong = false }: { icon?: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0 rounded-lg border bg-muted/20 p-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon ? <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}{label}</p><p className={`mt-1 break-words text-sm ${strong ? "font-bold" : "font-medium"}`}>{value}</p></div>
}

function DocumentStatus({ status, locale }: { status: string; locale: string }) {
  const approved = status === "APPROVED"
  const pending = status === "PENDING_REVIEW"
  const label = approved
    ? locale === "de" ? "Freigegeben" : "Approved"
    : pending
      ? locale === "de" ? "Ausstehend" : "Pending"
      : ({ REJECTED: locale === "de" ? "Abgelehnt" : "Rejected", REPLACEMENT_REQUIRED: locale === "de" ? "Ersatz erforderlich" : "Replacement required" } as Record<string, string>)[status] ?? status
  return <Badge variant={approved ? "default" : pending ? "secondary" : "destructive"}>{label}</Badge>
}

function documentSide(side: string, locale: string) {
  if (side === "FRONT") return locale === "de" ? "Vorderseite" : "Front"
  if (side === "BACK") return locale === "de" ? "Rückseite" : "Back"
  return locale === "de" ? "Einzeldokument" : "Single file"
}

function paymentMethod(method: string, locale: string) {
  if (method === "TRANSFER") return locale === "de" ? "Banküberweisung" : "Bank transfer"
  return locale === "de" ? "Zahlung bei Abholung" : "Pay at pickup"
}

function applicationStatus(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    DRAFT: ["Draft", "Entwurf"],
    AWAITING_DOCUMENT_UPLOAD: ["Awaiting documents", "Dokumente ausstehend"],
    AWAITING_DOCUMENT_REVIEW: ["Awaiting document review", "Dokumentenprüfung ausstehend"],
    CUSTOMER_ACTION_REQUIRED: ["Customer action required", "Kundenaktion erforderlich"],
    READY_TO_FINALIZE: ["Ready for customer finalization", "Bereit zum Kundenabschluss"],
    FINALIZING: ["Finalizing", "Wird abgeschlossen"],
    FINALIZED: ["Finalized", "Abgeschlossen"],
    EXPIRED: ["Expired", "Abgelaufen"],
    CANCELLED: ["Cancelled", "Storniert"],
    REJECTED: ["Rejected", "Abgelehnt"],
  }
  return labels[status]?.[locale === "de" ? 1 : 0] ?? status
}

function documentTypeName(typeKey: string, fallback: string, locale: string) {
  if (locale !== "de") return fallback
  return ({ IDENTITY_CARD: "Personalausweis", PASSPORT: "Reisepass", DRIVING_LICENCE: "Führerschein" } as Record<string, string>)[typeKey] ?? fallback
}

function validationStatus(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    NOT_VALIDATED: ["Not validated", "Nicht validiert"],
    VALID: ["Valid", "Gültig"],
    INVALID: ["Invalid", "Ungültig"],
  }
  return labels[status]?.[locale === "de" ? 1 : 0] ?? status
}

function legalDocumentType(type: string, locale: string) {
  if (type === "RENTAL_TERMS") return locale === "de" ? "Mietbedingungen" : "Rental terms"
  if (type === "PRIVACY_NOTICE") return locale === "de" ? "Datenschutzhinweise" : "Privacy notice"
  return type
}

function scanStatus(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    PENDING: ["Scan pending", "Scan ausstehend"],
    CLEAN: ["Clean", "Unbedenklich"],
    INFECTED: ["Unsafe", "Unsicher"],
    FAILED: ["Scan failed", "Scan fehlgeschlagen"],
    NOT_AVAILABLE: ["Scan not available", "Scan nicht verfügbar"],
  }
  return labels[status]?.[locale === "de" ? 1 : 0] ?? status
}
