import { ConfigurationOverview } from "@/components/business-configuration/configuration-overview";
import { getCurrentUser } from "@/lib/auth";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service";
import { ConfigurationAccessDenied } from "@/components/admin/configuration-access-denied";
import { redirect } from "@/navigation";

export default async function AdvancedConfigurationPage({ params }: { params: Promise<{ locale: string }> }) {
  const [caps, user] = await Promise.all([
    getBusinessConfigurationCapabilities(),
    getCurrentUser(),
  ]);
  if (!caps.canView) return <ConfigurationAccessDenied />;
  if (user?.role === "ADMIN") {
    const { locale } = await params;
    redirect({ href: "/admin/settings", locale });
  }
  const overview = await loadConfigurationOverview({ includeAudit: true });
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <ConfigurationOverview
        overview={overview}
        actorName={user?.name || user?.email || "Current administrator"}
        capabilities={{
          canValidate: caps.canValidate,
          canActivate: caps.canActivate,
          canViewAudit: caps.canViewAudit,
        }}
      />
    </main>
  );
}
