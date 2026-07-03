import { NextRequest } from "next/server";
import { requireOrganization, unauthorizedResponse, UnauthorizedError } from "@/lib/auth";
import { requireBorrowerForOrg, NotFoundError } from "@/lib/borrowerAccess";
import { prisma } from "@/lib/prisma";

// Returns the per-invoice authenticity/confidence scores plus a simple
// borrower-level average, so a lender can get a single number for a quick
// underwriting gut-check or drill into individual invoices.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization(request);
    const { id: borrowerId } = await params;
    await requireBorrowerForOrg(organization.id, borrowerId);

    const scores = await prisma.authenticityScore.findMany({
      where: { borrowerId },
      include: { invoice: { select: { sourceId: true, customerName: true, amount: true, dueDate: true } } },
      orderBy: { computedAt: "desc" },
    });

    const overallScore = scores.length
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
      : null;

    return Response.json({ overallScore, invoiceScores: scores });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
