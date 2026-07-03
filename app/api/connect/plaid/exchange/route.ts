import { NextRequest } from "next/server";
import { z } from "zod";
import { exchangePublicToken } from "@/lib/integrations/plaid";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { syncBorrower } from "@/lib/sync";

const bodySchema = z.object({ borrowerId: z.string(), publicToken: z.string() });

// Called by the lender's frontend once the borrower completes the Plaid Link
// flow client-side; exchanges the short-lived public token for a permanent
// access token and stores it against the borrower.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { borrowerId, publicToken } = parsed.data;

  const borrower = await prisma.borrower.findUnique({ where: { id: borrowerId } });
  if (!borrower) {
    return Response.json({ error: "Unknown borrowerId" }, { status: 404 });
  }

  const { accessToken, itemId } = await exchangePublicToken(publicToken);

  await prisma.borrower.update({
    where: { id: borrowerId },
    data: {
      plaidItemId: itemId,
      plaidAccessTokenEnc: encrypt(accessToken),
    },
  });

  // Re-run the sync so invoices already on file get (re-)matched against bank
  // transactions now that we have them.
  await syncBorrower(borrowerId).catch(() => {
    // A failed re-score here isn't fatal to the connection itself; the next
    // scheduled sync will retry.
  });

  return Response.json({ ok: true });
}
