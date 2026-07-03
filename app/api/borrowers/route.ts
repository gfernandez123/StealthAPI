import { NextRequest } from "next/server";
import { z } from "zod";
import { requireOrganization, unauthorizedResponse, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createBorrowerSchema = z.object({
  legalName: z.string().min(1),
  externalRef: z.string().optional(),
});

// A lender registers a borrower here first, then sends the borrower a link
// to /api/connect/quickbooks?borrowerId=... or /api/connect/xero?borrowerId=...
export async function POST(request: NextRequest) {
  try {
    const organization = await requireOrganization(request);
    const parsed = createBorrowerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const borrower = await prisma.borrower.create({
      data: { organizationId: organization.id, ...parsed.data },
    });

    return Response.json({ borrower }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    throw err;
  }
}

export async function GET(request: NextRequest) {
  try {
    const organization = await requireOrganization(request);
    const borrowers = await prisma.borrower.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      include: { connections: true },
    });
    return Response.json({ borrowers });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse(err.message);
    throw err;
  }
}
