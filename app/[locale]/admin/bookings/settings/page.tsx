import {
  CalendarClock,
  ClipboardList,
  Contact,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SettingsLinkCard } from "@/components/admin/settings-link-card";

export default function BookingSettingsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Business setup"
        title="Review the booking experience"
        description="The essential price rules come first. The remaining pages only change what customers see and what information they provide."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsLinkCard
          title="Minimum days and tax"
          description="Set the two rules that apply automatically to every car."
          href="/admin/bookings/settings/duration"
          icon={CalendarClock}
          badge="Start here"
        />
        <SettingsLinkCard
          title="Insurance"
          description="Turn insurance on or off and set one daily price."
          href="/admin/bookings/settings/insurance"
          icon={ShieldCheck}
          badge="Essential"
        />
        <SettingsLinkCard
          title="Customer booking steps"
          description="Show or hide optional steps in the booking journey."
          href="/admin/bookings/settings/flow"
          icon={ClipboardList}
        />
        <SettingsLinkCard
          title="Driver rules"
          description="Set minimum age and licence requirements."
          href="/admin/bookings/driver-rules"
          icon={UserRoundCheck}
        />
        <SettingsLinkCard
          title="Customer information"
          description="Choose which contact and driver details are required."
          href="/admin/customers/settings"
          icon={Contact}
        />
      </div>
    </main>
  );
}
