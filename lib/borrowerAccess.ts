import { prisma } from "@/lib/prisma";

export class NotFoundError extends Error {}

/**
 * Every borrower-scoped endpoint must confirm the borrower actually belongs
 * to the requesting lender's organization — without this check, one lender
 * could read another lender's borrower data just by guessing/enumerating IDs.
 */
export async function requireBorrowerForOrg(organizationId: string, borrowerId: string) {
  const borrower = await prisma.borrower.findFirst({
    where: { id: borrowerId, organizationId },
  });
  if (!borrower) {
    throw new NotFoundError("Borrower not found for this organization");
  }
  return borrower;
}
