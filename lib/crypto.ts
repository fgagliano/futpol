import crypto from "crypto";

const keyB64 = process.env.PICKS_ENCRYPTION_KEY;

if (!keyB64) {
  throw new Error("PICKS_ENCRYPTION_KEY is not defined");
}

const KEY = Buffer.from(keyB64, "base64");

if (KEY.length !== 32) {
  throw new Error("PICKS_ENCRYPTION_KEY must decode to 32 bytes");
}

export function encryptChoice(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptChoice(payload: string): string {
  const buf = Buffer.from(payload, "base64");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
