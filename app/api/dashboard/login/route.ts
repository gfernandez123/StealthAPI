import { NextRequest } from "next/server";
import { z } from "zod";
import { getOrganizationByApiKey } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

const bodySchema = z.object({ apiKey: z.string().min(1) });

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  const organization = await getOrganizationByApiKey(parsed.data.apiKey);
  if (!organization) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${parsed.data.apiKey}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      process.env.NODE_ENV === "production" ? "Secure" : "",
      `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
    ]
      .filter(Boolean)
      .join("; "),
  );
  return response;
}
