import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import * as qbo from "@/lib/integrations/quickbooks";
import * as xero from "@/lib/integrations/xero";
import { fetchRecentTransactions, type PlaidTransaction } from "@/lib/integrations/plaid";
import {
  normalizeQboInvoice,
  normalizeQboPayment,
  normalizeXeroInvoice,
  normalizeXeroPayment,
  type NormalizedInvoice,
  type NormalizedPayment,
} from "@/lib/normalize";
import { computeAuthenticityScore } from "@/lib/scoring";
import type { Connection } from "@/app/generated/prisma/client";

const REFRESH_SAFETY_WINDOW_MS = 60_000;

async function getValidAccessToken(connection: Connection): Promise<string> {
  const stillValid =
    connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + REFRESH_SAFETY_WINDOW_MS;

  if (stillValid && connection.accessTokenEnc) {
    return decrypt(connection.accessTokenEnc);
  }

  if (!connection.refreshTokenEnc) {
    throw new Error(`Connection ${connection.id} has no refresh token and its access token has expired`);
  }
  const refreshToken = decrypt(connection.refreshTokenEnc);

  if (connection.provider === "QUICKBOOKS") {
    const tokens = await qbo.refreshAccessToken(refreshToken);
    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  }

  const tokens = await xero.refreshAccessToken(refreshToken);
  await prisma.connection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc: encrypt(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  return tokens.access_token;
}

async function fetchNormalizedData(
  connection: Connection,
): Promise<{ invoices: NormalizedInvoice[]; payments: NormalizedPayment[] }> {
  const accessToken = await getValidAccessToken(connection);

  if (connection.provider === "QUICKBOOKS") {
    if (!connection.realmId) throw new Error(`QuickBooks connection ${connection.id} is missing realmId`);
    const [rawInvoices, rawPayments] = await Promise.all([
      qbo.fetchInvoices(accessToken, connection.realmId),
      qbo.fetchPayments(accessToken, connection.realmId),
    ]);
    return {
      invoices: rawInvoices.map(normalizeQboInvoice),
      payments: rawPayments.map(normalizeQboPayment),
    };
  }

  if (!connection.tenantId) throw new Error(`Xero connection ${connection.id} is missing tenantId`);
  const [rawInvoices, rawPayments] = await Promise.all([
    xero.fetchInvoices(accessToken, connection.tenantId),
    xero.fetchPayments(accessToken, connection.tenantId),
  ]);
  return {
    invoices: rawInvoices.map(normalizeXeroInvoice),
    payments: rawPayments.map(normalizeXeroPayment),
  };
}

/**
 * Pulls fresh invoice/payment data for every active accounting connection on
 * a borrower, upserts it, cross-references against bank transactions (if
 * Plaid is connected), and recomputes authenticity scores. This is what runs
 * immediately after a new connection is established, and on the periodic
 * background refresh.
 */
export async function syncBorrower(borrowerId: string): Promise<void> {
  const borrower = await prisma.borrower.findUniqueOrThrow({
    where: { id: borrowerId },
    include: { connections: { where: { status: "ACTIVE" } } },
  });

  for (const connection of borrower.connections) {
    const { invoices, payments } = await fetchNormalizedData(connection);

    // sourceId -> our Invoice.id, needed to link payments and to key the
    // per-invoice authenticity score after upserting.
    const invoiceIdBySourceId = new Map<string, string>();

    for (const invoice of invoices) {
      const record = await prisma.invoice.upsert({
        where: {
          borrowerId_provider_sourceId: {
            borrowerId,
            provider: invoice.provider,
            sourceId: invoice.sourceId,
          },
        },
        create: { borrowerId, ...invoice },
        update: invoice,
      });
      invoiceIdBySourceId.set(invoice.sourceId, record.id);
    }

    for (const payment of payments) {
      const invoiceId = payment.linkedInvoiceSourceId
        ? invoiceIdBySourceId.get(payment.linkedInvoiceSourceId) ?? null
        : null;

      // Payments aren't upserted against a natural key from the source
      // system in this MVP (QuickBooks/Xero payment IDs aren't tracked yet),
      // so we just record them; duplicate re-syncs creating repeat rows is a
      // known limitation to fix before this goes beyond a design partner.
      await prisma.payment.create({
        data: {
          borrowerId,
          invoiceId,
          amount: payment.amount,
          paidAt: payment.paidAt,
          source: "accounting_system",
        },
      });
    }

    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date(), lastError: null },
    });
  }

  await rescoreAllInvoices(borrowerId);
}

async function rescoreAllInvoices(borrowerId: string): Promise<void> {
  const borrower = await prisma.borrower.findUniqueOrThrow({ where: { id: borrowerId } });

  let transactions: PlaidTransaction[] | null = null;
  if (borrower.plaidAccessTokenEnc) {
    const accessToken = decrypt(borrower.plaidAccessTokenEnc);
    transactions = await fetchRecentTransactions(accessToken);
  }

  const invoices = await prisma.invoice.findMany({ where: { borrowerId } });

  for (const invoice of invoices) {
    const { score, reasons } = computeAuthenticityScore(
      {
        amount: Number(invoice.amount),
        amountPaid: Number(invoice.amountPaid),
        status: invoice.status,
        dueDate: invoice.dueDate,
      },
      transactions,
    );

    await prisma.authenticityScore.upsert({
      where: { invoiceId: invoice.id },
      create: { invoiceId: invoice.id, borrowerId, score, reasons },
      update: { score, reasons, computedAt: new Date() },
    });
  }
}
