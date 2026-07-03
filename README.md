# StealthAPI

Receivables verification infrastructure for trade finance lenders. A borrower connects
their QuickBooks or Xero account; a lender gets real-time AR aging, invoice-level
detail, and an authenticity score (cross-referenced against the borrower's bank
transactions via Plaid) instead of manually reviewing PDFs for weeks.

## Stack

Next.js (App Router, API routes as the backend), Prisma 7 + PostgreSQL, Plaid for bank
data, direct OAuth2 integrations with QuickBooks Online and Xero.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Database** — either run one locally or use a hosted Postgres (Neon, Supabase, etc.):
   ```bash
   npx prisma dev
   ```

3. **Copy the env template and fill in credentials**
   ```bash
   cp .env.example .env
   ```
   - `DATABASE_URL`: from step 2
   - `TOKEN_ENCRYPTION_KEY` / `OAUTH_STATE_SECRET`: generate with the commands in `.env.example`
   - `QBO_*`: create a sandbox app at https://developer.intuit.com/app/developer/dashboard
   - `XERO_*`: create an app at https://developer.xero.com/app/manage
   - `PLAID_*`: get sandbox credentials at https://dashboard.plaid.com

4. **Apply the schema**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Create your first lender (organization + API key)** — there's no self-serve
   signup yet; this is an MVP for manually onboarded design partners:
   ```bash
   npx tsx prisma/seed.ts "Your Lender Name"
   ```
   Copy the printed API key — it's shown once.

6. **Run the app**
   ```bash
   npm run dev
   ```
   Go to http://localhost:3000/dashboard/login and sign in with the API key from step 5.

## Using the dashboard

From `/dashboard`, add a borrower, then use the "Connect QuickBooks" / "Connect Xero"
links and the "Connect bank account (Plaid)" button on the borrower's page. Once
connected, invoices, AR aging, and authenticity scores populate automatically.

## API (for lenders integrating directly)

All endpoints require `Authorization: Bearer <api-key>`.

```
POST /api/borrowers                          create a borrower
GET  /api/borrowers                          list your borrowers
GET  /api/borrowers/{id}/invoices             normalized invoices
GET  /api/borrowers/{id}/ar-aging             AR aging buckets (current, 1-30, 31-60, 61-90, 90+)
GET  /api/borrowers/{id}/payment-history      normalized payment records
GET  /api/borrowers/{id}/authenticity-score   per-invoice + overall confidence score
```

A borrower connects their accounting system by visiting (as a redirect, e.g. embedded
in your own onboarding flow):

```
/api/connect/quickbooks?borrowerId={id}
/api/connect/xero?borrowerId={id}
```

Bank connection for authenticity scoring uses Plaid Link client-side:
`POST /api/connect/plaid/link-token` to get a token, then
`POST /api/connect/plaid/exchange` with the resulting public token.

## Deliberately not in this MVP

- The cross-lender invoice-verification/anti-fraud registry — needs multiple lender
  customers before it has any network-effect value. Everything here is scoped to a
  single lender's own view of a single borrower.
- Support for accounting systems beyond QuickBooks and Xero.
- Self-serve signup — lenders are onboarded via `prisma/seed.ts`.
- SOC 2 / formal compliance certification.
- Payment records aren't deduplicated against the source system's own payment ID yet —
  re-syncing repeatedly will create duplicate `Payment` rows. Fine for a demo, not for
  a real pilot.
