import { getCompanySettings } from "@/app/actions/settings";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { BusinessProfileForm } from "@/components/admin/business-profile-form";
import { requireAdmin } from "@/lib/auth";
import {
  ownerSettingsPageMode,
  type OwnerSettingsPageSearchParams,
} from "@/lib/admin/owner-settings-edit";

export default async function BusinessProfilePage({
  searchParams,
}: {
  searchParams: Promise<OwnerSettingsPageSearchParams>;
}) {
  await requireAdmin();
  const { editing, nextHref } = await ownerSettingsPageMode(
    searchParams,
    "/admin/bookings/settings/duration",
  );
  const result = await getCompanySettings();
  if (!("settings" in result) || !result.settings)
    throw new Error(result.error ?? "Business settings are unavailable.");
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow={editing ? "Edit settings" : "Business setup"}
        title="What business details should customers see?"
        description="Keep your company name, contact details, address, and currency accurate."
      />
      <BusinessProfileForm value={result.settings} nextHref={nextHref} />
    </main>
  );
}
