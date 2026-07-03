import { NextRequest } from "next/server";
import { requireOrganization, unauthorizedResponse, UnauthorizedError } from "@/lib/auth";
import { requireBorrowerForOrg, NotFoundError } from "@/lib/borrowerAccess";
import { prisma } from "@/lib/prisma";

type Bucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

function bucketFor(dueDate: Date): Bucket {
  const daysPastDue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

// A standard AR aging report: outstanding (unpaid) balance grouped into the
// buckets a lender's underwriter expects, computed from live invoice data
// rather than a static export.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization(request);
    const { id: borrowerId } = await params;
    await requireBorrowerForOrg(organization.id, borrowerId);

    const openInvoices = await prisma.invoice.findMany({
      where: { borrowerId, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
    });

    const aging: Record<Bucket, { count: number; outstandingBalance: number }> = {
      current: { count: 0, outstandingBalance: 0 },
      "1-30": { count: 0, outstandingBalance: 0 },
      "31-60": { count: 0, outstandingBalance: 0 },
      "61-90": { count: 0, outstandingBalance: 0 },
      "90+": { count: 0, outstandingBalance: 0 },
    };

    for (const invoice of openInvoices) {
      const bucket = bucketFor(invoice.dueDate);
      const outstanding = Number(invoice.amount) - Number(invoice.amountPaid);
      aging[bucket].count += 1;
      aging[bucket].outstandingBalance += outstanding;
    }

    const totalOutstanding = Object.values(aging).reduce((sum, b) => sum + b.outstandingBalance, 0);

    return Response.json({ asOf: new Date().toISOString(), totalOutstanding, aging });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
