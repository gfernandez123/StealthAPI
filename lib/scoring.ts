import type { PlaidTransaction } from "@/lib/integrations/plaid";
import type { InvoiceStatusValue } from "@/lib/normalize";

export interface AuthenticityInput {
  amount: number;
  amountPaid: number;
  status: InvoiceStatusValue;
  dueDate: Date;
}

export interface AuthenticityResult {
  score: number; // 0-100
  reasons: string[];
}

const MATCH_WINDOW_DAYS = 10;
const AMOUNT_TOLERANCE_RATIO = 0.01; // 1%
const AMOUNT_TOLERANCE_MIN = 2; // dollars, for small invoices where 1% is negligible

function withinTolerance(a: number, b: number): boolean {
  const tolerance = Math.max(a * AMOUNT_TOLERANCE_RATIO, AMOUNT_TOLERANCE_MIN);
  return Math.abs(a - b) <= tolerance;
}

/**
 * A first-pass, deliberately simple authenticity signal: does an independent
 * bank-transaction feed corroborate that this invoice's claimed payment
 * actually happened? This is the seed of the eventual cross-lender
 * verification registry — for now it only checks against the borrower's own
 * connected bank account via Plaid.
 */
export function computeAuthenticityScore(
  invoice: AuthenticityInput,
  transactions: PlaidTransaction[] | null,
): AuthenticityResult {
  const reasons: string[] = [];

  if (transactions === null) {
    reasons.push("No bank account connected for this borrower — payment history cannot be independently corroborated.");
    return { score: 50, reasons };
  }

  if (invoice.amountPaid <= 0) {
    const isPastDue = invoice.dueDate.getTime() < Date.now();
    if (isPastDue) {
      reasons.push("Invoice is past due with no recorded payment.");
      return { score: 40, reasons };
    }
    reasons.push("Invoice is not yet due; no payment expected at this time.");
    return { score: 60, reasons };
  }

  // Plaid represents inflows (deposits) as negative amounts for depository accounts.
  const candidateDeposits = transactions.filter((txn) => !txn.pending && -txn.amount > 0);

  const match = candidateDeposits.find((txn) => {
    const txnDate = new Date(txn.date);
    const daysFromDue = Math.abs((txnDate.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return withinTolerance(invoice.amountPaid, -txn.amount) && daysFromDue <= MATCH_WINDOW_DAYS;
  });

  if (match) {
    reasons.push(
      `Matched a bank deposit of $${(-match.amount).toFixed(2)} on ${match.date} against the recorded payment of $${invoice.amountPaid.toFixed(2)}.`,
    );
    return { score: 95, reasons };
  }

  reasons.push(
    `Accounting system shows $${invoice.amountPaid.toFixed(2)} paid, but no matching bank deposit was found within ${MATCH_WINDOW_DAYS} days of the due date.`,
  );
  return { score: 20, reasons };
}
