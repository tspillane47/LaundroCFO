import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV — recommended for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_BYTE_LENGTH = 32;
const KEY_ENV_VAR = "TOKEN_ENCRYPTION_KEY";
const FORMAT_SEPARATOR = ":";

const KEY_GENERATION_HINT =
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"';

function parseEncryptionKey(): Buffer {
  const raw = process.env[KEY_ENV_VAR];
  if (!raw?.trim()) {
    throw new Error(
      `Missing ${KEY_ENV_VAR}. Generate a 32-byte key with: ${KEY_GENERATION_HINT}`
    );
  }

  const trimmed = raw.trim();
  let key: Buffer;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    try {
      key = Buffer.from(trimmed, "base64");
    } catch {
      throw new Error(
        `${KEY_ENV_VAR} must be a 32-byte key encoded as base64 or hex. Generate one with: ${KEY_GENERATION_HINT}`
      );
    }
  }

  if (key.length !== KEY_BYTE_LENGTH) {
    throw new Error(
      `${KEY_ENV_VAR} decoded to ${key.length} bytes; expected ${KEY_BYTE_LENGTH} bytes for AES-256. Generate a new key with: ${KEY_GENERATION_HINT}`
    );
  }

  return key;
}

/** True when value looks like iv:authTag:ciphertext (all base64). Used to skip already-encrypted rows. */
export function isEncryptedToken(value: string): boolean {
  const parts = value.split(FORMAT_SEPARATOR);
  if (parts.length !== 3) {
    return false;
  }

  try {
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");
    return (
      iv.length === IV_LENGTH &&
      authTag.length === AUTH_TAG_LENGTH &&
      ciphertext.length > 0
    );
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const key = parseEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(FORMAT_SEPARATOR);
}

/** Decrypt when stored encrypted; return legacy plaintext unchanged until migration runs. */
export function decryptTokenIfEncrypted(stored: string): string {
  if (isEncryptedToken(stored)) {
    return decryptToken(stored);
  }
  return stored;
}

export function decryptToken(ciphertext: string): string {
  const key = parseEncryptionKey();
  const parts = ciphertext.split(FORMAT_SEPARATOR);

  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted token format: expected iv:authTag:ciphertext (base64 segments)"
    );
  }

  const [ivB64, authTagB64, dataB64] = parts;
  let iv: Buffer;
  let authTag: Buffer;
  let encrypted: Buffer;

  try {
    iv = Buffer.from(ivB64, "base64");
    authTag = Buffer.from(authTagB64, "base64");
    encrypted = Buffer.from(dataB64, "base64");
  } catch {
    throw new Error(
      "Invalid encrypted token format: iv, authTag, and ciphertext must be valid base64"
    );
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(
      `Invalid encrypted token: IV must be ${IV_LENGTH} bytes after base64 decode`
    );
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid encrypted token: auth tag must be ${AUTH_TAG_LENGTH} bytes after base64 decode`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt token: ciphertext may be tampered, corrupted, or encrypted with a different key"
    );
  }
}
