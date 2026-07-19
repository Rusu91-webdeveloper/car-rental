"use client";

import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import {
  CalendarDays,
  Car,
  CircleGauge,
  FileCheck2,
  LayoutDashboard,
  LoaderCircle,
  Settings2,
  Users,
  WalletCards,
} from "lucide-react";
import Link, { usePathname } from "@/navigation";
import { useLinkStatus } from "next/link";

interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ownerItems: NavigationItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Bookings", href: "/admin?section=bookings", icon: CalendarDays },
  { label: "Cars", href: "/admin?section=cars", icon: Car },
  { label: "Customers", href: "/admin?section=users", icon: Users },
  { label: "Settings", href: "/admin/settings", icon: Settings2 },
];

const configurationItems: NavigationItem[] = [
  {
    label: "Booking Settings",
    href: "/admin/bookings/settings",
    icon: CalendarDays,
  },
  { label: "Car Pricing", href: "/admin/cars/pricing", icon: Car },
  {
    label: "Customer Information",
    href: "/admin/customers/settings",
    icon: Users,
  },
  { label: "Payments", href: "/admin/payments", icon: WalletCards },
  {
    label: "Publish Changes",
    href: "/admin/advanced/configuration",
    icon: CircleGauge,
  },
];

function NavigationLinkContent({ item }: { item: NavigationItem }) {
  const { pending } = useLinkStatus();
  const Icon = item.icon;

  return (
    <>
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
      {pending ? (
        <LoaderCircle
          className="ml-auto h-3.5 w-3.5 motion-safe:animate-spin"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function dashboardSection(href: string) {
  if (href === "/admin") return "overview";
  if (!href.startsWith("/admin?")) return null;
  return new URLSearchParams(href.slice(href.indexOf("?") + 1)).get("section");
}

function openDashboardSection(
  event: MouseEvent<HTMLAnchorElement>,
  pathname: string,
  section: string,
) {
  if (
    pathname !== "/admin" ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  const destination = new URL(event.currentTarget.href);
  window.history.pushState(null, "", `${destination.pathname}${destination.search}`);
  window.dispatchEvent(
    new CustomEvent("admin:section-change", { detail: { section } }),
  );
}

function NavigationLinks({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();

  return items.map((item) => {
    const section = dashboardSection(item.href);

    return (
      <Link
        key={item.label}
        href={item.href}
        data-admin-instant-section={section && pathname === "/admin" ? "true" : undefined}
        onClick={(event) => {
          if (section) openDashboardSection(event, pathname, section);
        }}
        className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <NavigationLinkContent item={item} />
      </Link>
    );
  });
}

export function AdminNavigation({
  canViewDocuments,
  canViewConfiguration,
  isAdmin,
  userName,
}: {
  canViewDocuments: boolean;
  canViewConfiguration: boolean;
  isAdmin: boolean;
  userName: string;
}) {
  const pathname = usePathname();
  const roleItems = isAdmin
    ? ownerItems
    : canViewConfiguration
      ? configurationItems
      : [];
  const items = !isAdmin && canViewDocuments
    ? [
        ...roleItems,
        { label: "Documents", href: "/admin/documents", icon: FileCheck2 },
      ]
    : roleItems;
  const showAdvancedConfiguration = !isAdmin && canViewConfiguration;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-background lg:flex">
        <div className="border-b px-5 py-5">
          <Link
            href="/admin"
            data-admin-instant-section={pathname === "/admin" ? "true" : undefined}
            onClick={(event) => openDashboardSection(event, pathname, "overview")}
            className="flex items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Car className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold">RentCar</span>
              <span className="block text-xs text-muted-foreground">
                Owner control center
              </span>
            </span>
          </Link>
        </div>
        <nav
          aria-label="Admin navigation"
          className="flex-1 space-y-1 overflow-y-auto p-3"
        >
          <NavigationLinks items={items} />
        </nav>
        <div className="border-t p-3">
          {showAdvancedConfiguration ? (
            <Link
              href="/admin/advanced/configuration"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CircleGauge className="h-4 w-4" /> More
            </Link>
          ) : null}
          <div className="mt-2 px-3 py-2">
            <p className="truncate text-sm font-medium">{userName}</p>
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View customer site
            </Link>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href="/admin"
            data-admin-instant-section={pathname === "/admin" ? "true" : undefined}
            onClick={(event) => openDashboardSection(event, pathname, "overview")}
            className="flex items-center gap-2 font-semibold"
          >
            <Car className="h-5 w-5 text-primary" /> RentCar Admin
          </Link>
          <Link href="/" className="text-xs text-muted-foreground">
            Customer site
          </Link>
        </div>
        <nav
          aria-label="Admin navigation"
          className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none]"
        >
          <NavigationLinks items={items} />
          {showAdvancedConfiguration ? (
            <Link
              href="/admin/advanced/configuration"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground"
            >
              <CircleGauge className="h-4 w-4" /> More
            </Link>
          ) : null}
        </nav>
      </header>
    </>
  );
}
