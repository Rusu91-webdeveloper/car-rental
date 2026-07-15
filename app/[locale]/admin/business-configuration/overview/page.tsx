import { ConfigurationOverview } from "@/components/business-configuration/configuration-overview"
import { getCurrentUser } from "@/lib/auth"
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server"
import { loadConfigurationOverview } from "@/lib/business-configuration/workflow-service"

export const dynamic = "force-dynamic"

export default async function BusinessConfigurationOverviewPage() {
  const [capabilities, user] = await Promise.all([getBusinessConfigurationCapabilities(), getCurrentUser()])
  const overview = await loadConfigurationOverview({ includeAudit: capabilities.canViewAudit })
  return (
    <ConfigurationOverview
      overview={overview}
      actorName={user?.name || user?.email || "Current administrator"}
      capabilities={{
        canValidate: capabilities.canValidate,
        canActivate: capabilities.canActivate,
        canViewAudit: capabilities.canViewAudit,
      }}
    />
  )
}
