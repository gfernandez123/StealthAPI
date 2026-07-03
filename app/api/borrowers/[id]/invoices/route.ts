import { NextRequest } from "next/server";
import { requireOrganization, unauthorizedResponse, UnauthorizedError } from "@/lib/auth";
import { requireBorrowerForOrg, NotFoundError } from "@/lib/borrowerAccess";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const organization = await requireOrganization(request);
    const { id: borrowerId } = await params;
    await requireBorrowerForOrg(organization.id, borrowerId);

    const invoices = await prisma.invoice.findMany({
      where: { borrowerId },
      orderBy: { dueDate: "asc" },
      include: { authenticityScore: true },
    });

    return Response.json({ invoices });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
