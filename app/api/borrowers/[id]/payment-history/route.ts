import { NextRequest } from "next/server";
import { requireOrganization, unauthorizedResponse, UnauthorizedError } from "@/lib/auth";
import { requireBorrowerForOrg, NotFoundError } from "@/lib/borrowerAccess";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization(request);
    const { id: borrowerId } = await params;
    await requireBorrowerForOrg(organization.id, borrowerId);

    const payments = await prisma.payment.findMany({
      where: { borrowerId },
      orderBy: { paidAt: "desc" },
      include: { invoice: { select: { sourceId: true, customerName: true, amount: true } } },
    });

    return Response.json({ payments });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
