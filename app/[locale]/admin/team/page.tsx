import { UserPlus } from "lucide-react";
import Link from "@/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";

export default async function TeamPage() {
  await requireAdmin();
  const team = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
    },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AdminPageHeader
        eyebrow="Team"
        title="Who can manage the business?"
        description="See who can sign in and make business changes."
        action={
          <Button asChild>
            <Link href="/admin?section=users">
              <UserPlus className="mr-2 h-4 w-4" />
              Add or remove people
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3">
        {team.map((member) => (
          <section
            key={member.id}
            className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="font-medium">
                {member.name || "Unnamed team member"}
              </h2>
              <p className="text-sm text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={member.isActive ? "secondary" : "outline"}>
                {member.isActive ? "Can sign in" : "Access paused"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Added {member.createdAt.toLocaleDateString()}
              </span>
            </div>
          </section>
        ))}
        {team.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No one has access yet.
          </p>
        ) : null}
      </div>
    </main>
  );
}
