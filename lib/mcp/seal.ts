import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Offload's MCP connector keeps no database. Everything it needs to remember between requests
 * (registered clients, sign-in progress, authorization codes, access and refresh tokens) is sealed
 * with AES-256-GCM under MCP_TOKEN_SECRET and handed to the client, which sends it back.
 * Only this server can open or forge a sealed value.
 */

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.MCP_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MCP_TOKEN_SECRET is not set (use at least 32 random characters).");
  }
  cachedKey = createHash("sha256").update(secret).digest();
  return cachedKey;
}

/** Seals `payload` as kind `t`. `ttlSeconds` adds an expiry that open() enforces. */
export function seal(t: string, payload: object, ttlSeconds?: number): string {
  const body: Record<string, unknown> = { ...payload, t };
  if (ttlSeconds) body.exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/** Opens a sealed value of kind `t`. Returns null if it's forged, of another kind, or expired. */
export function open<T>(t: string, sealed: string | null | undefined): T | null {
  if (!sealed || typeof sealed !== "string") return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const body = JSON.parse(json);
    if (body.t !== t) return null;
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body as T;
  } catch {
    return null;
  }
}
