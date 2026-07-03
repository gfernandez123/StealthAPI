import type { QboInvoice, QboPayment } from "@/lib/integrations/quickbooks";
import type { XeroInvoice, XeroPayment } from "@/lib/integrations/xero";

export type InvoiceStatusValue = "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export interface NormalizedInvoice {
  provider: "QUICKBOOKS" | "XERO";
  sourceId: string;
  customerName: string;
  amount: number;
  amountPaid: number;
  currency: string;
  issueDate: Date;
  dueDate: Date;
  status: InvoiceStatusValue;
}

export interface NormalizedPayment {
  provider: "QUICKBOOKS" | "XERO";
  amount: number;
  paidAt: Date;
  linkedInvoiceSourceId: string | null;
}

function deriveStatus(amount: number, amountPaid: number, dueDate: Date, isVoid: boolean): InvoiceStatusValue {
  if (isVoid) return "VOID";
  if (amountPaid >= amount && amount > 0) return "PAID";
  const isPastDue = dueDate.getTime() < Date.now();
  if (amountPaid > 0) return "PARTIALLY_PAID";
  return isPastDue ? "OVERDUE" : "OPEN";
}

export function normalizeQboInvoice(raw: QboInvoice): NormalizedInvoice {
  const amount = raw.TotalAmt;
  const amountPaid = amount - raw.Balance;
  const dueDate = new Date(raw.DueDate);

  return {
    provider: "QUICKBOOKS",
    sourceId: raw.Id,
    customerName: raw.CustomerRef.name,
    amount,
    amountPaid,
    currency: raw.CurrencyRef?.value ?? "USD",
    issueDate: new Date(raw.TxnDate),
    dueDate,
    status: deriveStatus(amount, amountPaid, dueDate, false),
  };
}

export function normalizeQboPayment(raw: QboPayment): NormalizedPayment {
  const linkedInvoiceSourceId =
    raw.Line?.flatMap((line) => line.LinkedTxn ?? [])
      .find((txn) => txn.TxnType === "Invoice")?.TxnId ?? null;

  return {
    provider: "QUICKBOOKS",
    amount: raw.TotalAmt,
    paidAt: new Date(raw.TxnDate),
    linkedInvoiceSourceId,
  };
}

export function normalizeXeroInvoice(raw: XeroInvoice): NormalizedInvoice {
  const isVoid = raw.Status === "VOIDED" || raw.Status === "DELETED";
  const dueDate = new Date(raw.DueDate);

  return {
    provider: "XERO",
    sourceId: raw.InvoiceID,
    customerName: raw.Contact.Name,
    amount: raw.Total,
    amountPaid: raw.AmountPaid,
    currency: raw.CurrencyCode ?? "USD",
    issueDate: new Date(raw.Date),
    dueDate,
    status: deriveStatus(raw.Total, raw.AmountPaid, dueDate, isVoid),
  };
}

export function normalizeXeroPayment(raw: XeroPayment): NormalizedPayment {
  return {
    provider: "XERO",
    amount: raw.Amount,
    paidAt: new Date(raw.Date),
    linkedInvoiceSourceId: raw.Invoice?.InvoiceID ?? null,
  };
}
