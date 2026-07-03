import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createBorrowerAction, logoutAction } from "@/app/dashboard/actions";

export default async function DashboardPage() {
  const organization = await getSessionOrganization();
  if (!organization) redirect("/dashboard/login");

  const borrowers = await prisma.borrower.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    include: { connections: true },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{organization.name}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">Borrowers</p>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-black/50 underline dark:text-white/50">Sign out</button>
        </form>
      </div>

      <form action={createBorrowerAction} className="mb-8 flex gap-2">
        <input
          name="legalName"
          placeholder="New borrower's legal name"
          required
          className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
          Add borrower
        </button>
      </form>

      <ul className="divide-y divide-black/10 dark:divide-white/10">
        {borrowers.map((borrower) => (
          <li key={borrower.id}>
            <Link
              href={`/dashboard/borrowers/${borrower.id}`}
              className="flex items-center justify-between py-3 hover:opacity-70"
            >
              <span>{borrower.legalName}</span>
              <span className="text-xs text-black/50 dark:text-white/50">
                {borrower.connections.length === 0
                  ? "Not connected"
                  : borrower.connections.map((c) => c.provider).join(", ")}
              </span>
            </Link>
          </li>
        ))}
        {borrowers.length === 0 && (
          <li className="py-6 text-sm text-black/50 dark:text-white/50">No borrowers yet — add one above.</li>
        )}
      </ul>
    </main>
  );
}
