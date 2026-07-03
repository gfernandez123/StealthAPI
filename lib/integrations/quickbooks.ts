// QuickBooks Online integration — standard OAuth2 authorization code flow,
// implemented directly against Intuit's REST endpoints rather than through the
// `intuit-oauth` SDK, to keep the token lifecycle explicit and easy to audit.
//
// Setup: create an app at https://developer.intuit.com/app/developer/dashboard,
// add these to .env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_ENVIRONMENT (sandbox|production)

const AUTH_BASE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

function apiBaseUrl(): string {
  return process.env.QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number;
  token_type: string;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("QBO_CLIENT_ID"),
    response_type: "code",
    scope: SCOPE,
    redirect_uri: requireEnv("QBO_REDIRECT_URI"),
    state,
  });
  return `${AUTH_BASE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const clientId = requireEnv("QBO_CLIENT_ID");
  const clientSecret = requireEnv("QBO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<QboTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("QBO_REDIRECT_URI"),
    }),
  });

  if (!response.ok) {
    throw new Error(`QuickBooks token exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<QboTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`QuickBooks token refresh failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

// Raw shapes from QuickBooks' Query endpoint (subset of fields we use).
export interface QboInvoice {
  Id: string;
  TotalAmt: number;
  Balance: number;
  TxnDate: string;
  DueDate: string;
  CurrencyRef?: { value: string };
  CustomerRef: { name: string };
}

export interface QboPayment {
  Id: string;
  TotalAmt: number;
  TxnDate: string;
  Line?: Array<{ LinkedTxn?: Array<{ TxnId: string; TxnType: string }> }>;
}

async function runQuery<T>(accessToken: string, realmId: string, query: string): Promise<T[]> {
  const url = `${apiBaseUrl()}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=70`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`QuickBooks query failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const entityName = query.split(" ")[2]; // "SELECT * FROM Invoice" -> "Invoice"
  return body.QueryResponse?.[entityName] ?? [];
}

export function fetchInvoices(accessToken: string, realmId: string) {
  return runQuery<QboInvoice>(accessToken, realmId, "SELECT * FROM Invoice MAXRESULTS 1000");
}

export function fetchPayments(accessToken: string, realmId: string) {
  return runQuery<QboPayment>(accessToken, realmId, "SELECT * FROM Payment MAXRESULTS 1000");
}
