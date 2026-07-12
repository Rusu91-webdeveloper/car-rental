import { checkedMultiply } from "@/lib/pricing/money"
import { configurationValidationResult, type ConfigurationValidationIssue } from "@/lib/business-configuration/types"
import { validateConfigurationDomain } from "@/lib/business-configuration/validation"
import type { PricingAdminPageData, VehicleRateView } from "./types"

function rateIssue(
  code: string,
  vehicle: VehicleRateView,
  severity: "BLOCKER" | "WARNING",
  message: string,
  remediation: string,
  field?: string,
): ConfigurationValidationIssue {
  return {
    code,
    domain: "pricing-billing",
    field,
    severity,
    affectedResource: vehicle.vehicleName,
    adminMessage: message,
    remediation,
  }
}

export function validatePricingWorkspace(
  workspace: Pick<PricingAdminPageData, "draftPricing" | "draftFleet" | "vehicles" | "currency">,
) {
  const issues: ConfigurationValidationIssue[] = []
  let pricing = workspace.draftPricing?.configuration
  if (!workspace.draftPricing) {
    issues.push({
      code: "pricing.draft_missing",
      domain: "pricing-billing",
      severity: "BLOCKER",
      adminMessage: "Create a pricing and billing draft.",
      remediation: "Create a draft before editing or validating pricing.",
    })
  } else {
    pricing = workspace.draftPricing.configuration
    issues.push(...validateConfigurationDomain("pricing-billing", pricing).issues)
    if (pricing.rentalMonthDefinition === "CALENDAR_MONTH") {
      issues.push({
        code: "pricing.calendar_month_unsupported",
        domain: "pricing-billing",
        field: "rentalMonthDefinition",
        severity: "BLOCKER",
        adminMessage: "Calendar-month pricing is not supported.",
        remediation: "Choose a fixed 28-day or fixed 30-day month.",
      })
    }
    if (
      pricing.mixedDurationStrategy !== "DAILY_ONLY" &&
      !pricing.weeklyPricingEnabled &&
      !pricing.monthlyPricingEnabled
    ) {
      issues.push({
        code: "pricing.strategy_period_rate_disabled",
        domain: "pricing-billing",
        field: "mixedDurationStrategy",
        severity: "BLOCKER",
        adminMessage: "This strategy needs weekly or monthly pricing to be enabled.",
        remediation: "Enable a longer-period rate or charge every day separately.",
      })
    }
  }
  if (!workspace.draftFleet) {
    issues.push({
      code: "rates.draft_missing",
      domain: "pricing-billing",
      severity: "BLOCKER",
      adminMessage: "Create a fleet rate draft.",
      remediation: "Create a draft from live rates or legacy daily prices.",
    })
    return configurationValidationResult(issues)
  }
  if (workspace.draftFleet.currency !== workspace.currency) {
    issues.push({
      code: "rates.currency_mismatch",
      domain: "pricing-billing",
      field: "currency",
      severity: "BLOCKER",
      adminMessage: "The fleet rate currency does not match the release currency.",
      remediation: "Use one currency for all rates in the release.",
    })
  }

  const monthDays = pricing?.rentalMonthDefinition === "FIXED_28_DAYS" ? 28 : 30
  for (const vehicle of workspace.vehicles) {
    if (!vehicle.activeForBooking) {
      if (vehicle.draftRateId) {
        issues.push(rateIssue(
          "rates.inactive_vehicle_present",
          vehicle,
          "WARNING",
          "An inactive vehicle is still present in this draft.",
          "Keep it for history or remove it from the draft if it should not return.",
        ))
      }
      continue
    }
    if (!vehicle.draftRateId) {
      issues.push(rateIssue(
        "rates.active_vehicle_missing",
        vehicle,
        "BLOCKER",
        "An active vehicle is not included in the draft rate set.",
        "Copy its legacy daily price or enter an explicit rate.",
      ))
      continue
    }
    if (!vehicle.draftDailyRate || vehicle.draftDailyRate <= 0) {
      issues.push(rateIssue("rates.daily_missing", vehicle, "BLOCKER", "A positive daily price is required.", "Enter a daily price.", "dailyRate"))
    }
    if (pricing?.weeklyPricingEnabled && (!vehicle.weeklyRateEnabled || !vehicle.draftWeeklyRate)) {
      issues.push(rateIssue("rates.weekly_missing", vehicle, "BLOCKER", "Weekly pricing is enabled globally but this vehicle has no enabled weekly price.", "Enable and enter a weekly price, or turn weekly pricing off globally.", "weeklyRate"))
    }
    if (pricing?.monthlyPricingEnabled && (!vehicle.monthlyRateEnabled || !vehicle.draftMonthlyRate)) {
      issues.push(rateIssue("rates.monthly_missing", vehicle, "BLOCKER", "Monthly pricing is enabled globally but this vehicle has no enabled monthly price.", "Enable and enter a monthly price, or turn monthly pricing off globally.", "monthlyRate"))
    }
    if (vehicle.weeklyRateEnabled && vehicle.draftWeeklyRate && vehicle.draftDailyRate) {
      const dailyEquivalent = checkedMultiply(vehicle.draftDailyRate, 7, "weekly comparison")
      if (vehicle.draftWeeklyRate >= dailyEquivalent) {
        issues.push(rateIssue("rates.no_weekly_saving", vehicle, "WARNING", "The weekly price is not lower than seven daily prices.", "Confirm this intentional price structure.", "weeklyRate"))
      }
    }
    if (vehicle.monthlyRateEnabled && vehicle.draftMonthlyRate && vehicle.draftDailyRate) {
      const dailyEquivalent = checkedMultiply(vehicle.draftDailyRate, monthDays, "monthly comparison")
      const weeklyEquivalent = vehicle.weeklyRateEnabled && vehicle.draftWeeklyRate
        ? checkedMultiply(vehicle.draftWeeklyRate, Math.floor(monthDays / 7), "monthly comparison")
        : dailyEquivalent
      if (vehicle.draftMonthlyRate >= Math.min(dailyEquivalent, weeklyEquivalent)) {
        issues.push(rateIssue("rates.no_monthly_saving", vehicle, "WARNING", "The monthly price is not lower than the comparable daily or weekly price.", "Confirm this intentional price structure.", "monthlyRate"))
      }
    }
    if ((vehicle.draftDailyRate ?? 0) > 0 && (vehicle.draftDailyRate ?? 0) < 100) {
      issues.push(rateIssue("rates.unusually_low", vehicle, "WARNING", "The daily price is below one major currency unit.", "Confirm that the amount was entered in major units.", "dailyRate"))
    }
    if ((vehicle.draftDailyRate ?? 0) > 10_000_000) {
      issues.push(rateIssue("rates.unusually_high", vehicle, "WARNING", "The daily price is unusually high.", "Confirm the amount and currency.", "dailyRate"))
    }
    if (vehicle.liveDailyRate && vehicle.draftDailyRate) {
      const change = Math.abs(vehicle.draftDailyRate - vehicle.liveDailyRate)
      if (change * 2 > vehicle.liveDailyRate) {
        issues.push(rateIssue("rates.large_live_change", vehicle, "WARNING", "The daily price changes by more than 50% from live.", "Review the draft/live comparison before activation.", "dailyRate"))
      }
    }
  }
  return configurationValidationResult(issues)
}
