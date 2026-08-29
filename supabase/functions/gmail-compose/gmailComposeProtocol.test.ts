import {
  buildGmailProviderRequest,
  classifyGmailReceiptReplay,
  hashGmailMutationRequest,
  hasGmailComposeCapability,
  isValidGmailIdempotencyKey,
  parseGmailSuccessResponse,
} from "./gmailComposeProtocol.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("Gmail compose accepts the app's gmail.modify scope from scopes_string", () => {
  assert(
    hasGmailComposeCapability({
      scopes_string: "openid https://www.googleapis.com/auth/gmail.modify",
    }),
    "gmail.modify was rejected",
  );
  assert(
    hasGmailComposeCapability({
      scopes: ["https://www.googleapis.com/auth/gmail.compose"],
    }),
    "gmail.compose was rejected",
  );
  assert(
    !hasGmailComposeCapability({
      scopes_string: "https://www.googleapis.com/auth/gmail.metadata",
    }),
    "metadata-only scope was accepted",
  );
});

Deno.test("Gmail send-draft uses the documented collection endpoint and Draft body", () => {
  assertEquals(
    buildGmailProviderRequest({
      operation: "send_draft",
      draftId: "draft/provider-id",
    }),
    {
      url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
      method: "POST",
      body: JSON.stringify({ id: "draft/provider-id" }),
    },
    "Unexpected send-draft request",
  );
});

Deno.test("Gmail draft delete has no request or response body requirement", async () => {
  assertEquals(
    buildGmailProviderRequest({
      operation: "delete_draft",
      draftId: "draft/provider-id",
    }),
    {
      url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts/draft%2Fprovider-id",
      method: "DELETE",
    },
    "Unexpected draft-delete request",
  );

  const result = await parseGmailSuccessResponse(
    "delete_draft",
    new Response(null, { status: 204 }),
  );
  assertEquals(result, { success: true }, "Empty Gmail DELETE response was not accepted");
});

Deno.test("Gmail mutation hash binds the owned account and exact provider request", async () => {
  const providerRequest = buildGmailProviderRequest({
    operation: "send",
    message: { raw: "c2FtZS1tZXNzYWdl" },
  });
  const first = await hashGmailMutationRequest({
    accountId: "account-1",
    operation: "send",
    providerRequest,
  });
  const retry = await hashGmailMutationRequest({
    accountId: "account-1",
    operation: "send",
    providerRequest,
  });
  const otherAccount = await hashGmailMutationRequest({
    accountId: "account-2",
    operation: "send",
    providerRequest,
  });

  assertEquals(first, retry, "Identical Gmail requests did not hash identically");
  assert(first !== otherAccount, "Account ownership was not bound into the request hash");
  assert(/^[0-9a-f]{64}$/.test(first), "Mutation hash was not SHA-256 hex");
});

Deno.test("Gmail receipt replays terminal results and fails closed while pending", () => {
  const baseReceipt = {
    id: "receipt-1",
    user_id: "user-1",
    account_id: "account-1",
    idempotency_key: "gmail-v1:1234567890abcdef",
    operation: "send" as const,
    request_sha256: "a".repeat(64),
    provider_artifact_id: null,
    last_error_code: null,
    last_error_message: null,
  };
  const expected = {
    accountId: "account-1",
    operation: "send" as const,
    requestSha256: "a".repeat(64),
  };

  assertEquals(
    classifyGmailReceiptReplay({ ...baseReceipt, status: "pending", response_body: null }, expected),
    { kind: "pending" },
    "Pending receipt did not fail closed",
  );
  assertEquals(
    classifyGmailReceiptReplay({
      ...baseReceipt,
      status: "succeeded",
      response_body: { id: "provider-message-1" },
    }, expected),
    { kind: "succeeded", response: { id: "provider-message-1" } },
    "Succeeded receipt did not replay its provider result",
  );
  assertEquals(
    classifyGmailReceiptReplay({
      ...baseReceipt,
      status: "failed",
      response_body: { error: "Rejected", code: "GMAIL_PROVIDER_REJECTED" },
    }, expected),
    { kind: "failed", response: { error: "Rejected", code: "GMAIL_PROVIDER_REJECTED" } },
    "Failed receipt did not replay its terminal error",
  );
  assertEquals(
    classifyGmailReceiptReplay(
      { ...baseReceipt, status: "succeeded", response_body: { id: "provider-message-1" } },
      { ...expected, accountId: "account-2" },
    ),
    { kind: "conflict" },
    "A receipt was replayed across account ownership",
  );
});

Deno.test("Gmail idempotency keys reject missing, short, or unsafe values", () => {
  assert(isValidGmailIdempotencyKey("gmail-v1:1234567890abcdef"), "Valid key was rejected");
  assert(!isValidGmailIdempotencyKey("short"), "Short key was accepted");
  assert(!isValidGmailIdempotencyKey("gmail-v1:bad key with spaces"), "Unsafe key was accepted");
  assert(!isValidGmailIdempotencyKey(undefined), "Missing key was accepted");
});
