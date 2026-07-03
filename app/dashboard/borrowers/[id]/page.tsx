import { redirect, notFound } from "next/navigation";
import { getSessionOrganization } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PlaidConnectButton } from "@/app/dashboard/borrowers/[id]/PlaidConnectButton";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600 dark:text-green-500";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-500";
  return "text-red-600 dark:text-red-500";
}

export default async function BorrowerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string }>;
}) {
  const organization = await getSessionOrganization();
  if (!organization) redirect("/dashboard/login");

  const { id: borrowerId } = await params;
  const { connected } = await searchParams;

  const borrower = await prisma.borrower.findFirst({
    where: { id: borrowerId, organizationId: organization.id },
    include: { connections: true },
  });
  if (!borrower) notFound();

  const invoices = await prisma.invoice.findMany({
    where: { borrowerId },
    orderBy: { dueDate: "asc" },
    include: { authenticityScore: true },
  });

  const hasQuickBooks = borrower.connections.some((c) => c.provider === "QUICKBOOKS" && c.status === "ACTIVE");
  const hasXero = borrower.connections.some((c) => c.provider === "XERO" && c.status === "ACTIVE");
  const hasPlaid = Boolean(borrower.plaidAccessTokenEnc);

  const totalOutstanding = invoices
    .filter((inv) => inv.status !== "PAID" && inv.status !== "VOID")
    .reduce((sum, inv) => sum + (Number(inv.amount) - Number(inv.amountPaid)), 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-8">
      <a href="/dashboard" className="text-sm text-black/50 hover:underline dark:text-white/50">
        ← Borrowers
      </a>
      <h1 className="mt-2 text-lg font-semibold">{borrower.legalName}</h1>

      {connected && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          Connected {connected} successfully.
        </p>
      )}

      <section className="mt-6 flex flex-wrap gap-3">
        {!hasQuickBooks && (
          <a
            href={`/api/connect/quickbooks?borrowerId=${borrower.id}`}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          >
            Connect QuickBooks
          </a>
        )}
        {!hasXero && (
          <a
            href={`/api/connect/xero?borrowerId=${borrower.id}`}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
          >
            Connect Xero
          </a>
        )}
        <PlaidConnectButton borrowerId={borrower.id} connected={hasPlaid} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">Outstanding balance</h2>
        <p className="text-2xl font-semibold">{formatMoney(totalOutstanding, "USD")}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-black/60 dark:text-white/60">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No invoices yet — connect an accounting system above to sync data.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Authenticity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="py-2">{invoice.customerName}</td>
                  <td className="py-2">{formatMoney(Number(invoice.amount), invoice.currency)}</td>
                  <td className="py-2">{invoice.dueDate.toLocaleDateString()}</td>
                  <td className="py-2">{invoice.status}</td>
                  <td className={`py-2 font-medium ${invoice.authenticityScore ? scoreColor(invoice.authenticityScore.score) : ""}`}>
                    {invoice.authenticityScore ? `${invoice.authenticityScore.score}/100` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
