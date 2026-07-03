import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/crypto";
import type { NextRequest } from "next/server";

export class UnauthorizedError extends Error {}

/**
 * Shared by both the Bearer-token API auth below and the dashboard's
 * cookie-based session (lib/session.ts) — one code path resolves an API key
 * to its Organization regardless of where the key came from.
 */
export async function getOrganizationByApiKey(key: string) {
  const hashedKey = hashApiKey(key);
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: { organization: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    return null;
  }
  return apiKey.organization;
}

/**
 * Every lender-facing endpoint requires `Authorization: Bearer sk_live_...`.
 * Returns the Organization the key belongs to, or throws UnauthorizedError.
 */
export async function requireOrganization(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const organization = await getOrganizationByApiKey(token);
  if (!organization) {
    throw new UnauthorizedError("Invalid or revoked API key");
  }

  return organization;
}

export function unauthorizedResponse(message: string) {
  return Response.json({ error: message }, { status: 401 });
}
