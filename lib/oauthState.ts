import { createHmac, randomBytes } from "node:crypto";

// The OAuth `state` parameter carries which borrower is connecting and is
// HMAC-signed so a callback can't be replayed for a different borrower than
// the one that initiated the flow.

interface StatePayload {
  borrowerId: string;
  nonce: string;
}

function getSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("Missing required env var: OAUTH_STATE_SECRET");
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createState(borrowerId: string): string {
  const payload: StatePayload = { borrowerId, nonce: randomBytes(8).toString("hex") };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(data);
  return `${data}.${signature}`;
}

export function verifyState(state: string): StatePayload {
  const [data, signature] = state.split(".");
  if (!data || !signature || sign(data) !== signature) {
    throw new Error("Invalid or tampered OAuth state parameter");
  }
  return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
}
