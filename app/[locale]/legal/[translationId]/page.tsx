import { notFound } from "next/navigation"
import { LegalContent } from "@/components/legal/legal-content"
import { prisma } from "@/lib/db"
import { legalContentHash } from "@/lib/legal/content"

export const dynamic = "force-dynamic"

export default async function PublishedLegalDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; translationId: string }>
}) {
  const { locale, translationId } = await params
  const translation = await prisma.legalDocumentTranslation.findFirst({
    where: {
      id: translationId,
      locale,
      legalDocumentVersion: { status: { in: ["PUBLISHED", "ARCHIVED"] } },
    },
    include: { legalDocumentVersion: true },
  })
  if (!translation || translation.contentHash !== legalContentHash(translation.canonicalContent)) notFound()
  const document = translation.legalDocumentVersion
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      <article className="rounded-xl border bg-background p-6 shadow-sm sm:p-10">
        <p className="text-sm font-medium text-muted-foreground">
          {document.type === "RENTAL_TERMS" ? "Rental Terms" : "Privacy Notice"} · Version {document.versionLabel}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{translation.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Published {document.publishedAt?.toLocaleDateString(locale === "de" ? "de-DE" : "en-US") ?? "historically"} · Language {translation.locale}
        </p>
        <div className="mt-8 border-t pt-8">
          <LegalContent content={translation.canonicalContent} />
        </div>
      </article>
    </main>
  )
}
