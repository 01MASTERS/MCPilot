/**
 * AES-256-GCM Cryptographic Vault for Credentials at Rest (SEC-04)
 *
 * Provides authenticated encryption for upstream server credentials and sensitive tokens.
 * Ciphertexts are stored using envelope format:
 *   enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *
 * Ensures:
 * - Credentials in MariaDB dumps or compromised volumes are indecipherable.
 * - Authenticated data integrity check via AES-GCM 128-bit authentication tag.
 * - Transparent backward-compatible migration for pre-existing plaintext tokens.
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_PREFIX = "enc:v1:";
const IV_LENGTH_BYTES = 12; // 96-bit standard IV for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit auth tag

// Derive 32-byte (256-bit) key from environment or fallback cluster secret
function getEncryptionKey(): Buffer {
  const rawKey =
    process.env.GATEWAY_ENCRYPTION_KEY ||
    "mcpilot-master-cluster-vault-encryption-key-32b!";
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Checks whether a value is already encrypted with the AES-256-GCM envelope.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  return value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypts a plaintext string into an AES-256-GCM envelope.
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext || typeof plaintext !== "string") {
    return plaintext;
  }

  // If already encrypted, do not re-encrypt
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${ENVELOPE_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM envelope back to plaintext.
 * If the value is legacy plaintext, returns it unchanged.
 */
export function decryptCredential(ciphertextOrPlain: string | null | undefined): string | null {
  if (!ciphertextOrPlain || typeof ciphertextOrPlain !== "string") {
    return ciphertextOrPlain || null;
  }

  // Legacy plaintext fallback
  if (!isEncrypted(ciphertextOrPlain)) {
    return ciphertextOrPlain;
  }

  try {
    const rawEnvelope = ciphertextOrPlain.slice(ENVELOPE_PREFIX.length);
    const parts = rawEnvelope.split(":");
    if (parts.length !== 3) {
      console.warn("[mcpilot-gateway] Malformed encrypted credential envelope; returning raw");
      return ciphertextOrPlain;
    }

    const [ivHex, tagHex, cipherHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(cipherHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err: any) {
    console.error("[mcpilot-gateway] Decryption failed for credential envelope:", err.message);
    throw new Error(`Credential decryption failed: ${err.message}`);
  }
}
