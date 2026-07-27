import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
} from "@/lib/tokenEncryption";

const TEST_KEY = randomBytes(32).toString("base64");

describe("tokenEncryption", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips plaintext through encrypt and decrypt", () => {
    const plaintext = "ya29.a0AfB_byC-example-oauth-token";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for different plaintexts", () => {
    const first = encryptToken("access-token-one");
    const second = encryptToken("access-token-two");
    expect(first).not.toBe(second);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-token-value";
    const first = encryptToken(plaintext);
    const second = encryptToken(plaintext);
    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe(plaintext);
    expect(decryptToken(second)).toBe(plaintext);
  });

  it("fails decryption when ciphertext is tampered", () => {
    const encrypted = encryptToken("sensitive-token");
    const parts = encrypted.split(":");
    const tamperedPayload = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
    const tampered = `${parts[0]}:${parts[1]}:${tamperedPayload}`;

    expect(() => decryptToken(tampered)).toThrow(/Failed to decrypt token/);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("token")).toThrow(/Missing TOKEN_ENCRYPTION_KEY/);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is the wrong length", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptToken("token")).toThrow(/expected 32 bytes/);
  });

  it("identifies encrypted vs plaintext token shapes", () => {
    const encrypted = encryptToken("live-token");
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(isEncryptedToken("access-sandbox-abc123")).toBe(false);
  });
});
