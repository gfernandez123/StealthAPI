import { NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/integrations/quickbooks";
import { verifyState } from "@/lib/oauthState";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { syncBorrower } from "@/lib/sync";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const realmId = request.nextUrl.searchParams.get("realmId");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return Response.json({ error: `QuickBooks authorization was denied: ${error}` }, { status: 400 });
  }
  if (!code || !realmId || !state) {
    return Response.json({ error: "Missing code, realmId, or state from QuickBooks callback" }, { status: 400 });
  }

  let borrowerId: string;
  try {
    ({ borrowerId } = verifyState(state));
  } catch {
    return Response.json({ error: "Invalid state parameter" }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(code);
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const connection = await prisma.connection.upsert({
    where: { borrowerId_provider: { borrowerId, provider: "QUICKBOOKS" } },
    create: {
      borrowerId,
      provider: "QUICKBOOKS",
      status: "ACTIVE",
      realmId,
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc: encrypt(tokens.refresh_token),
      tokenExpiresAt,
    },
    update: {
      status: "ACTIVE",
      realmId,
      accessTokenEnc: encrypt(tokens.access_token),
      refreshTokenEnc: encrypt(tokens.refresh_token),
      tokenExpiresAt,
      lastError: null,
    },
  });

  // Pull an initial snapshot immediately so the lender sees data right away
  // instead of waiting for the next scheduled sync.
  await syncBorrower(borrowerId).catch(async (err) => {
    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastError: String(err) },
    });
  });

  const dashboardUrl = new URL(`/dashboard/borrowers/${borrowerId}`, request.nextUrl.origin);
  dashboardUrl.searchParams.set("connected", "quickbooks");
  return Response.redirect(dashboardUrl.toString(), 302);
}
