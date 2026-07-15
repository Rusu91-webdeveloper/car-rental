import { CONFIGURATION_DOMAIN_IDS, type ConfigurationDomainId } from "@/lib/business-configuration/types"
import type { ReleaseAggregate } from "@/lib/business-configuration/repositories"
import { validBusinessConfigurationDomains } from "./configuration-fixtures"

export function validReleaseAggregate(overrides: Partial<ReleaseAggregate> = {}): ReleaseAggregate {
  const versions = Object.fromEntries(
    CONFIGURATION_DOMAIN_IDS.map((domain) => [
      domain,
      {
        id: `${domain}-v1`,
        domain,
        versionNumber: 1,
        status: "VALIDATED",
        validationStatus: "VALID",
        revision: 1,
        changeSummary: `${domain} fixture`,
        updatedAt: "2026-07-12T00:00:00.000Z",
        authorName: "Fixture Admin",
      },
    ]),
  ) as ReleaseAggregate["versions"]
  return {
    id: "release-draft-1",
    releaseNumber: 1,
    name: "Fixture release",
    changeSummary: "Safe fixture release",
    status: "VALIDATED",
    validationStatus: "VALID",
    revision: 1,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    createdByName: "Fixture Admin",
    updatedByName: "Fixture Admin",
    versions,
    domains: validBusinessConfigurationDomains(),
    fleetRateSet: {
      id: "fleet-1",
      versionNumber: 1,
      status: "VALIDATED",
      validationStatus: "VALID",
      revision: 1,
      currency: "EUR",
      updatedAt: "2026-07-12T00:00:00.000Z",
      rates: [
        {
          id: "rate-1",
          vehicleId: "vehicle-1",
          vehicleName: "Fixture Car",
          dailyRate: 10_000,
          weeklyRateEnabled: false,
          monthlyRateEnabled: false,
        },
      ],
    },
    ...overrides,
  }
}

export function withVersion(
  release: ReleaseAggregate,
  domain: ConfigurationDomainId,
  versionNumber: number,
): ReleaseAggregate {
  return {
    ...release,
    versions: {
      ...release.versions,
      [domain]: { ...release.versions[domain], id: `${domain}-v${versionNumber}`, versionNumber },
    },
  }
}
