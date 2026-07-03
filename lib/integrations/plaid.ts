// Plaid integration — used only to cross-reference a borrower's bank
// transactions against invoices, to produce the authenticity score. We
// deliberately don't build our own bank connectivity; Plaid already solved
// that problem, and re-solving it would be wasted effort for this MVP.
//
// Setup: get sandbox credentials at https://dashboard.plaid.com, add to .env:
// PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox|development|production)

import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Plaid is optional (a borrower may only ever connect QuickBooks/Xero), so
// the client is constructed lazily on first real use rather than at module
// load — otherwise importing this file at all (e.g. transitively through
// lib/sync.ts) would require Plaid credentials even for a QuickBooks-only setup.
let _plaidClient: PlaidApi | null = null;

function getPlaidClient(): PlaidApi {
  if (_plaidClient) return _plaidClient;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV ?? "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": requireEnv("PLAID_CLIENT_ID"),
        "PLAID-SECRET": requireEnv("PLAID_SECRET"),
      },
    },
  });
  _plaidClient = new PlaidApi(configuration);
  return _plaidClient;
}

export async function createLinkToken(borrowerId: string) {
  const response = await getPlaidClient().linkTokenCreate({
    user: { client_user_id: borrowerId },
    client_name: "StealthAPI",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: process.env.PLAID_WEBHOOK_URL,
  });
  return response.data.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  const response = await getPlaidClient().itemPublicTokenExchange({
    public_token: publicToken,
  });
  return { accessToken: response.data.access_token, itemId: response.data.item_id };
}

export interface PlaidTransaction {
  transaction_id: string;
  amount: number;
  date: string;
  name: string;
  pending: boolean;
}

// Fetches recent transactions for the connected account, used to look for a
// deposit that plausibly corresponds to a given invoice being paid.
export async function fetchRecentTransactions(accessToken: string, daysBack = 180): Promise<PlaidTransaction[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const response = await getPlaidClient().transactionsGet({
    access_token: accessToken,
    start_date: startDate.toISOString().slice(0, 10),
    end_date: endDate.toISOString().slice(0, 10),
    options: { count: 500 },
  });

  return response.data.transactions;
}
