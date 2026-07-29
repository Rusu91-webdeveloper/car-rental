import { getCompanySettings } from "@/app/actions/settings";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BusinessProfileForm } from "@/components/admin/business-profile-form";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function BusinessProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<OwnerSettingsPageSearchParams>;
}) {
  const de = (await params).locale === "de";
  await requireAdmin();
  const { editing, nextHref } = await ownerSettingsPageMode(
    searchParams,
    "/admin/bookings/settings/duration",
  );
  const result = await getCompanySettings();
  if (!("settings" in result) || !result.settings)
    throw new Error(result.error ?? (de ? "Die Unternehmenseinstellungen sind nicht verfügbar." : "Business settings are unavailable."));
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? (de ? "Einstellungen bearbeiten" : "Edit settings") : (de ? "Unternehmenseinrichtung" : "Business setup")}
        title={de ? "Welche Unternehmensdaten sollen Kunden sehen?" : "What business details should customers see?"}
        description={de ? "Halten Sie Unternehmensname, Kontaktdaten, Anschrift und Währung aktuell." : "Keep your company name, contact details, address, and currency accurate."}
      />
      <BusinessProfileForm value={result.settings} nextHref={nextHref} />
    </main>
  );
}
