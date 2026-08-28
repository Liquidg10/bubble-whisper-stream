import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
  OAUTH_TOKEN_ENVELOPE_PREFIX,
} from "./oauthTokenCrypto.ts";

const TEST_KEY = "0123456789abcdef0123456789abcdef";
const OTHER_TEST_KEY = "abcdef0123456789abcdef0123456789";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(
  operation: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error rejection");
    assert(
      error.message.includes(expectedMessage),
      `Expected error containing "${expectedMessage}", got "${error.message}"`,
    );
    return;
  }

  throw new Error("Expected operation to reject");
}

Deno.test("OAuth token envelope round-trips without exposing plaintext", async () => {
  const key = await loadOAuthTokenEncryptionKey(TEST_KEY);
  const token = "ya29.a-sensitive-provider-token";
  const envelope = await encryptOAuthToken(token, key);

  assert(
    envelope.startsWith(OAUTH_TOKEN_ENVELOPE_PREFIX),
    "Expected a versioned OAuth token envelope",
  );
  assert(!envelope.includes(token), "Envelope must not contain plaintext");
  assert(
    await decryptOAuthToken(envelope, key) === token,
    "Decrypted token did not match the source token",
  );
});

Deno.test("OAuth token encryption uses a fresh IV for every envelope", async () => {
  const key = await loadOAuthTokenEncryptionKey(TEST_KEY);
  const first = await encryptOAuthToken("same-token", key);
  const second = await encryptOAuthToken("same-token", key);

  assert(first !== second, "Two envelopes unexpectedly reused an IV");
});

Deno.test("OAuth token envelope rejects the wrong key and tampering", async () => {
  const key = await loadOAuthTokenEncryptionKey(TEST_KEY);
  const wrongKey = await loadOAuthTokenEncryptionKey(OTHER_TEST_KEY);
  const envelope = await encryptOAuthToken("refresh-token", key);
  const replacement = envelope.endsWith("A") ? "B" : "A";
  const tampered = `${envelope.slice(0, -1)}${replacement}`;

  await assertRejects(
    () => decryptOAuthToken(envelope, wrongKey),
    "decryption failed",
  );
  await assertRejects(
    () => decryptOAuthToken(tampered, key),
    "decryption failed",
  );
});

Deno.test("OAuth token crypto requires an exact 256-bit key", async () => {
  await assertRejects(
    () => loadOAuthTokenEncryptionKey(""),
    "OAUTH_ENCRYPTION_KEY is required",
  );
  await assertRejects(
    () => loadOAuthTokenEncryptionKey("too-short"),
    "exactly 32 bytes",
  );
});
