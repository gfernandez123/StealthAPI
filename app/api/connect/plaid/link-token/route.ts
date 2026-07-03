import { NextRequest } from "next/server";
import { z } from "zod";
import { createLinkToken } from "@/lib/integrations/plaid";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ borrowerId: z.string() });

// Called by the lender's frontend to get a token for Plaid Link, which the
// borrower uses to connect their bank account for invoice cross-referencing.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const borrower = await prisma.borrower.findUnique({ where: { id: parsed.data.borrowerId } });
  if (!borrower) {
    return Response.json({ error: "Unknown borrowerId" }, { status: 404 });
  }

  const linkToken = await createLinkToken(parsed.data.borrowerId);
  return Response.json({ linkToken });
}
