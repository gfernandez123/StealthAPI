import { NextRequest } from "next/server";
import { getAuthorizationUrl } from "@/lib/integrations/quickbooks";
import { createState } from "@/lib/oauthState";
import { prisma } from "@/lib/prisma";

// Starts the QuickBooks connect flow for a borrower. A lender embeds a link
// to this endpoint (`/api/connect/quickbooks?borrowerId=...`) in their own
// borrower onboarding flow.
export async function GET(request: NextRequest) {
  const borrowerId = request.nextUrl.searchParams.get("borrowerId");
  if (!borrowerId) {
    return Response.json({ error: "borrowerId query param is required" }, { status: 400 });
  }

  const borrower = await prisma.borrower.findUnique({ where: { id: borrowerId } });
  if (!borrower) {
    return Response.json({ error: "Unknown borrowerId" }, { status: 404 });
  }

  const state = createState(borrowerId);
  const authUrl = getAuthorizationUrl(state);

  return Response.redirect(authUrl, 302);
}
