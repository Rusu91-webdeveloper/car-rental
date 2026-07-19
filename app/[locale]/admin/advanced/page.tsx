import { redirect } from "@/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function AdvancedPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdmin();
  const { locale } = await params;
  redirect({ href: "/admin/settings", locale });
}
