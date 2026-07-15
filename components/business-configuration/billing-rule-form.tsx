"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updatePricingRulesAction } from "@/app/actions/pricing-configuration";
import type { PricingBillingConfiguration } from "@/lib/business-configuration/domains";
import type { PricingAdminPageData } from "@/lib/pricing-admin/types";
import { PricingStrategySelector } from "./pricing-strategy-selector";
import { UnsavedChangesWarning } from "./unsaved-changes-warning";

export function BillingRuleForm({
  data,
  canManage,
}: {
  data: PricingAdminPageData;
  canManage: boolean;
}) {
  const router = useRouter();
  const draft = data.draftPricing;
  const [configuration, setConfiguration] = useState<
    PricingBillingConfiguration | undefined
  >(draft?.configuration);
  const [timeZone, setTimeZone] = useState(data.businessTimeZone);
  const [changeSummary, setChangeSummary] = useState(
    draft?.changeSummary ?? "Pricing and billing rules update",
  );
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!draft || !configuration)
    return (
      <section className="rounded-xl border bg-background p-6">
        <h2 className="font-semibold">Create a pricing draft first</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Billing rules are versioned with pricing policy and cannot be edited
          without a draft.
        </p>
      </section>
    );
  const set = <K extends keyof PricingBillingConfiguration>(
    field: K,
    value: PricingBillingConfiguration[K],
  ) =>
    setConfiguration((current) =>
      current ? { ...current, [field]: value } : current,
    );
  const dirty =
    JSON.stringify(configuration) !== JSON.stringify(draft.configuration) ||
    timeZone !== data.businessTimeZone ||
    changeSummary !== draft.changeSummary;
  const save = () =>
    startTransition(async () => {
      const result = await updatePricingRulesAction({
        pricingVersionId: draft.id,
        expectedRevision: draft.revision,
        configuration,
        changeSummary,
        businessTimeZone: timeZone,
      });
      setMessage(
        "error" in result
          ? result.error
          : "Billing rules saved to the draft. Nothing was activated.",
      );
      if (!("error" in result)) router.refresh();
    });
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-background p-5">
        <PricingStrategySelector
          value={configuration.mixedDurationStrategy}
          onChange={(value) => set("mixedDurationStrategy", value)}
          disabled={!canManage || pending}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Toggle
            label="Weekly pricing available"
            description="Vehicles still need an enabled weekly amount."
            checked={configuration.weeklyPricingEnabled}
            onChange={(value) => set("weeklyPricingEnabled", value)}
            disabled={!canManage || pending}
            live={data.livePricing?.configuration.weeklyPricingEnabled}
          />
          <Toggle
            label="Monthly pricing available"
            description="Only fixed 28-day or 30-day months are supported."
            checked={configuration.monthlyPricingEnabled}
            onChange={(value) => set("monthlyPricingEnabled", value)}
            disabled={!canManage || pending}
            live={data.livePricing?.configuration.monthlyPricingEnabled}
          />
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Billable duration</h2>
        {!data.draftRelease ? (
          <p className="mt-2 text-sm text-amber-700">
            Attach the pricing drafts to a release before changing its timezone.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Business timezone"
            explanation="Pickup and return timestamps are interpreted in this IANA timezone."
            example="Europe/Bucharest"
            live={data.liveBusinessTimeZone}
          >
            <Input
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              disabled={!canManage || !data.draftRelease || pending}
            />
          </Field>
          <Field
            label="Billable-day method"
            explanation="Choose only a duration rule implemented by the pricing engine."
            example="Started 24-hour periods preserves legacy elapsed-time behavior."
            live={display(data.livePricing?.configuration.billableDayRule)}
          >
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={configuration.billableDayRule}
              onChange={(event) =>
                set(
                  "billableDayRule",
                  event.target
                    .value as PricingBillingConfiguration["billableDayRule"],
                )
              }
              disabled={!canManage || pending}
            >
              <option value="STARTED_24_HOUR_PERIODS">
                Started 24-hour periods
              </option>
              <option value="CALENDAR_DAYS">Calendar days</option>
              <option value="PICKUP_TIME_BOUNDARY">
                Pickup-time boundaries
              </option>
            </select>
          </Field>
          <Field
            label="Minimum rental duration (minutes)"
            explanation="Shorter requests are rejected before pricing."
            example="60 means at least one hour."
            live={display(data.livePricing?.configuration.minimumRentalMinutes)}
          >
            <Input
              type="number"
              min={1}
              max={525600}
              value={configuration.minimumRentalMinutes}
              onChange={(event) =>
                set("minimumRentalMinutes", Number(event.target.value))
              }
              disabled={!canManage || pending}
            />
          </Field>
          <Field
            label="Minimum charge (days)"
            explanation="The quote cannot charge fewer than this many days."
            example="2 means even a short valid rental charges at least two days."
            live={display(data.livePricing?.configuration.minimumChargeDays)}
          >
            <Input
              type="number"
              min={1}
              max={365}
              value={configuration.minimumChargeDays}
              onChange={(event) =>
                set("minimumChargeDays", Number(event.target.value))
              }
              disabled={!canManage || pending}
            />
          </Field>
          <Field
            label="Grace period (minutes)"
            explanation="Supported duration methods subtract or tolerate this amount at a boundary."
            example="30 avoids another day for a return within 30 minutes."
            live={display(data.livePricing?.configuration.gracePeriodMinutes)}
          >
            <Input
              type="number"
              min={0}
              max={720}
              value={configuration.gracePeriodMinutes}
              onChange={(event) =>
                set("gracePeriodMinutes", Number(event.target.value))
              }
              disabled={!canManage || pending}
            />
          </Field>
          <Field
            label="Fixed-day month length"
            explanation="Calendar-month arithmetic remains unsupported and cannot be selected."
            example="35 days becomes one 30-day month plus five days with the ordered strategy."
            live={display(
              data.livePricing?.configuration.rentalMonthDefinition,
            )}
          >
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={configuration.rentalMonthDefinition}
              onChange={(event) =>
                set(
                  "rentalMonthDefinition",
                  event.target.value as "FIXED_28_DAYS" | "FIXED_30_DAYS",
                )
              }
              disabled={!canManage || pending}
            >
              <option value="FIXED_28_DAYS">Fixed 28-day month</option>
              <option value="FIXED_30_DAYS">Fixed 30-day month</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm">
          <p className="font-medium">Date-only compatibility</p>
          <p className="mt-1 text-muted-foreground">
            Date-only values use calendar-day semantics in the configured
            business timezone. Timestamp bookings continue through the selected
            rule above.
          </p>
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-semibold">Compatibility tax settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Phase 5 exposes only the approved stored fields; it does not add new
          tax behavior.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Toggle
            label="Displayed prices include tax"
            description="When enabled, no separate tax subtotal is added."
            checked={configuration.pricesIncludeTax}
            onChange={(value) => set("pricesIncludeTax", value)}
            disabled={!canManage || pending}
            live={data.livePricing?.configuration.pricesIncludeTax}
          />
          <Field
            label="Tax rate (basis points)"
            explanation="100 basis points = 1%."
            example="1900 means 19%."
            live={display(data.livePricing?.configuration.taxRateBps)}
          >
            <Input
              type="number"
              min={0}
              max={10000}
              value={configuration.taxRateBps}
              onChange={(event) =>
                set("taxRateBps", Number(event.target.value))
              }
              disabled={!canManage || pending}
            />
          </Field>
        </div>
      </section>
      <section className="rounded-xl border bg-background p-5">
        <label className="text-sm font-medium">
          Change summary
          <Input
            className="mt-1"
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            disabled={!canManage || pending}
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          {canManage ? (
            <Button onClick={save} disabled={!dirty || pending}>
              Save billing draft
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Read-only access
            </span>
          )}
          <UnsavedChangesWarning active={dirty} />
        </div>
        {message ? (
          <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{message}</p>
        ) : null}
      </section>
    </div>
  );
}

function display(value: unknown) {
  return value === undefined
    ? "Not configured"
    : String(value).replaceAll("_", " ").toLowerCase();
}
function Field({
  label,
  explanation,
  example,
  live,
  children,
}: {
  label: string;
  explanation: string;
  example: string;
  live?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="rounded-lg border p-4 text-sm">
      <span className="font-medium">{label}</span>
      <span className="mt-1 block text-muted-foreground">{explanation}</span>
      <span className="mt-2 block text-xs text-muted-foreground">
        Example: {example}
      </span>
      <span className="my-2 block text-xs">
        Live: {live ?? "Not configured"}
      </span>
      {children}
    </label>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  live,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  live?: boolean;
}) {
  return (
    <label className="flex gap-3 rounded-lg border p-4">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
        <span className="mt-2 block text-xs">
          Live:{" "}
          {live === undefined
            ? "Not configured"
            : live
              ? "Enabled"
              : "Disabled"}
        </span>
      </span>
    </label>
  );
}
