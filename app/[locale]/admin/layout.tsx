import type { ReactNode } from "react";
import { redirect } from "@/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBusinessConfigurationCapabilities } from "@/lib/authorization/server";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [user, capabilities] = await Promise.all([
    getCurrentUser(),
    getBusinessConfigurationCapabilities(),
  ]);

  if (!user) redirect({ href: "/sign-in?redirect_url=/admin", locale });
  if (
    user!.role !== "ADMIN" &&
    !capabilities.canView &&
    !capabilities.canViewDocuments
  ) {
    redirect({ href: "/", locale });
  }

  return (
    <div className="min-h-screen bg-muted/25">
      <AdminNavigation
        canViewDocuments={capabilities.canViewDocuments}
        canViewConfiguration={capabilities.canView}
        isAdmin={user!.role === "ADMIN"}
        userName={user!.name || user!.email}
      />
      <div className="lg:pl-64">{children}</div>
    </div>
  );
}
