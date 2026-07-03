import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

// OAuth access/refresh tokens are encrypted at the application layer before
// being persisted, so a DB dump alone is never enough to impersonate a
// borrower's accounting connection.
//
// TOKEN_ENCRYPTION_KEY must be a 32-byte key, base64-encoded. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return buf;
}

// Format: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// API keys are shown once at creation time; only a SHA-256 hash is stored,
// the same pattern Stripe/Plaid use for their own API keys.
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { plaintext: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const prefix = "sk_live_" + randomBytes(4).toString("hex");
  return { plaintext: `${prefix}_${secret}`, prefix };
}
