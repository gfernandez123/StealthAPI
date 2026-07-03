import { cookies } from "next/headers";
import { getOrganizationByApiKey } from "@/lib/auth";

export const SESSION_COOKIE = "stealthapi_session";

/**
 * The dashboard is an internal tool for design-partner lenders, not a
 * public product yet — rather than building a full user/password system, a
 * lender's own API key doubles as their dashboard session, stored in an
 * httpOnly cookie after they paste it in on /dashboard/login.
 */
export async function getSessionOrganization() {
  const cookieStore = await cookies();
  const key = cookieStore.get(SESSION_COOKIE)?.value;
  if (!key) return null;
  return getOrganizationByApiKey(key);
}
