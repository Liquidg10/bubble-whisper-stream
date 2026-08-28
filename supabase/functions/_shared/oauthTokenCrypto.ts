const ENCRYPTION_KEY_ENV = "OAUTH_ENCRYPTION_KEY";
const ENVELOPE_PREFIX = "oauth:v1";
const AAD = new TextEncoder().encode(
  "bubble-whisper-stream/oauth-token/v1",
);
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_TOKEN_BYTES = 64 * 1024;

export const OAUTH_TOKEN_ENVELOPE_PREFIX = `${ENVELOPE_PREFIX}:`;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid OAuth token envelope encoding");
  }

  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Invalid OAuth token envelope encoding");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeConfiguredKey(configuredValue: string): Uint8Array<ArrayBuffer> {
  if (configuredValue.startsWith("base64:")) {
    return base64UrlToBytes(
      configuredValue.slice("base64:".length)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, ""),
    );
  }

  if (configuredValue.startsWith("base64url:")) {
    return base64UrlToBytes(configuredValue.slice("base64url:".length));
  }

  const encoded = new TextEncoder().encode(configuredValue);
  const owned = new Uint8Array(encoded.byteLength);
  owned.set(encoded);
  return owned;
}

export async function loadOAuthTokenEncryptionKey(
  configuredValue: string | undefined = Deno.env.get(ENCRYPTION_KEY_ENV),
): Promise<CryptoKey> {
  if (!configuredValue) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is required`);
  }

  const keyBytes = decodeConfiguredKey(configuredValue);
  if (keyBytes.byteLength !== AES_KEY_BYTES) {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} must contain exactly ${AES_KEY_BYTES} bytes`,
    );
  }

  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptOAuthToken(
  token: string,
  key?: CryptoKey,
): Promise<string> {
  const plaintext = new TextEncoder().encode(token);
  if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_TOKEN_BYTES) {
    throw new Error("OAuth token has an invalid length");
  }

  const encryptionKey = key ?? await loadOAuthTokenEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 },
      encryptionKey,
      plaintext,
    ),
  );

  return [
    ENVELOPE_PREFIX,
    bytesToBase64Url(iv),
    bytesToBase64Url(ciphertext),
  ].join(":");
}

export async function decryptOAuthToken(
  envelope: string,
  key?: CryptoKey,
): Promise<string> {
  const parts = envelope.split(":");
  if (
    parts.length !== 4 ||
    parts[0] !== "oauth" ||
    parts[1] !== "v1"
  ) {
    throw new Error("Unsupported OAuth token envelope");
  }

  const iv = base64UrlToBytes(parts[2]);
  const ciphertext = base64UrlToBytes(parts[3]);
  if (
    iv.byteLength !== GCM_IV_BYTES ||
    ciphertext.byteLength <= GCM_TAG_BYTES ||
    ciphertext.byteLength > MAX_TOKEN_BYTES + GCM_TAG_BYTES
  ) {
    throw new Error("Invalid OAuth token envelope");
  }

  const encryptionKey = key ?? await loadOAuthTokenEncryptionKey();

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 },
      encryptionKey,
      ciphertext,
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new Error("OAuth token decryption failed");
  }
}
