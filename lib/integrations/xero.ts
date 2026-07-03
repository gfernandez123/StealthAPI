// Xero integration — standard OAuth2 authorization code flow against Xero's
// REST endpoints directly, mirroring the QuickBooks client for consistency.
//
// Setup: create an app at https://developer.xero.com/app/manage, add to .env:
// XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI

const AUTH_BASE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE_URL = "https://api.xero.com/api.xro/2.0";
const SCOPE = "offline_access accounting.transactions accounting.contacts.read";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface XeroConnection {
  tenantId: string;
  tenantName: string;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireEnv("XERO_CLIENT_ID"),
    redirect_uri: requireEnv("XERO_REDIRECT_URI"),
    scope: SCOPE,
    state,
  });
  return `${AUTH_BASE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const clientId = requireEnv("XERO_CLIENT_ID");
  const clientSecret = requireEnv("XERO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("XERO_REDIRECT_URI"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Xero token exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<XeroTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Xero token refresh failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

// A Xero OAuth grant can cover multiple tenants (orgs); we take the first
// connection returned, which covers the common case of one org per borrower.
export async function fetchConnectedTenant(accessToken: string): Promise<XeroConnection> {
  const response = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Xero connections lookup failed: ${response.status} ${await response.text()}`);
  }

  const connections: XeroConnection[] = await response.json();
  if (connections.length === 0) {
    throw new Error("No Xero tenant is connected to this authorization");
  }
  return connections[0];
}

export interface XeroInvoice {
  InvoiceID: string;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  Date: string;
  DueDate: string;
  CurrencyCode?: string;
  Status: string;
  Contact: { Name: string };
}

export interface XeroPayment {
  PaymentID: string;
  Amount: number;
  Date: string;
  Invoice?: { InvoiceID: string };
}

async function apiGet<T>(accessToken: string, tenantId: string, path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Xero API request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function fetchInvoices(accessToken: string, tenantId: string): Promise<XeroInvoice[]> {
  const data = await apiGet<{ Invoices: XeroInvoice[] }>(accessToken, tenantId, "/Invoices?where=Type==\"ACCREC\"");
  return data.Invoices ?? [];
}

export async function fetchPayments(accessToken: string, tenantId: string): Promise<XeroPayment[]> {
  const data = await apiGet<{ Payments: XeroPayment[] }>(accessToken, tenantId, "/Payments");
  return data.Payments ?? [];
}
