export type GmailComposeOperation =
  | "create_draft"
  | "send"
  | "send_draft"
  | "delete_draft"
  | "list_drafts"
  | "get_draft";

export type GmailMutationOperation = "create_draft" | "send" | "send_draft";
export type GmailComposeReceiptStatus = "pending" | "succeeded" | "failed";

export interface GmailComposeReceipt {
  id: string;
  user_id: string;
  account_id: string;
  idempotency_key: string;
  operation: GmailMutationOperation;
  request_sha256: string;
  status: GmailComposeReceiptStatus;
  provider_artifact_id?: string | null;
  response_body?: Record<string, unknown> | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
}

export type GmailReceiptReplayDecision =
  | { kind: "conflict" }
  | { kind: "pending" }
  | { kind: "succeeded"; response: Record<string, unknown> }
  | { kind: "failed"; response: Record<string, unknown> };

export interface GmailProviderRequest {
  url: string;
  method: "GET" | "POST" | "DELETE";
  body?: string;
}

const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,200}$/;

export function isGmailComposeOperation(value: unknown): value is GmailComposeOperation {
  return value === "create_draft" || value === "send" || value === "send_draft" ||
    value === "delete_draft" || value === "list_drafts" || value === "get_draft";
}

export function isGmailMutationOperation(
  operation: GmailComposeOperation,
): operation is GmailMutationOperation {
  return operation === "create_draft" || operation === "send" || operation === "send_draft";
}

export function isValidGmailIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

export const GMAIL_COMPOSE_CAPABLE_SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

function scopeValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string");
  }
  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }
  return [];
}

export function getGrantedGmailScopes(account: {
  scopes?: unknown;
  scopes_string?: unknown;
}): Set<string> {
  return new Set([
    ...scopeValues(account.scopes),
    ...scopeValues(account.scopes_string),
  ]);
}

export function hasGmailComposeCapability(account: {
  scopes?: unknown;
  scopes_string?: unknown;
}): boolean {
  const grantedScopes = getGrantedGmailScopes(account);
  return GMAIL_COMPOSE_CAPABLE_SCOPES.some((scope) => grantedScopes.has(scope));
}

export function buildGmailProviderRequest(input: {
  operation: GmailComposeOperation;
  draft?: unknown;
  message?: unknown;
  draftId?: string;
}): GmailProviderRequest {
  switch (input.operation) {
    case "create_draft":
      if (!input.draft) throw new Error("Draft payload required");
      return {
        url: `${GMAIL_BASE_URL}/users/me/drafts`,
        method: "POST",
        body: JSON.stringify({ message: input.draft }),
      };

    case "send":
      if (!input.message) throw new Error("Message payload required");
      return {
        url: `${GMAIL_BASE_URL}/users/me/messages/send`,
        method: "POST",
        body: JSON.stringify(input.message),
      };

    case "send_draft":
      if (!input.draftId) throw new Error("Draft ID required");
      return {
        url: `${GMAIL_BASE_URL}/users/me/drafts/send`,
        method: "POST",
        body: JSON.stringify({ id: input.draftId }),
      };

    case "delete_draft":
      if (!input.draftId) throw new Error("Draft ID required");
      return {
        url: `${GMAIL_BASE_URL}/users/me/drafts/${encodeURIComponent(input.draftId)}`,
        method: "DELETE",
      };

    case "list_drafts":
      return {
        url: `${GMAIL_BASE_URL}/users/me/drafts`,
        method: "GET",
      };

    case "get_draft":
      if (!input.draftId) throw new Error("Draft ID required");
      return {
        url: `${GMAIL_BASE_URL}/users/me/drafts/${encodeURIComponent(input.draftId)}`,
        method: "GET",
      };
  }
}

export async function hashGmailMutationRequest(input: {
  accountId: string;
  operation: GmailMutationOperation;
  providerRequest: GmailProviderRequest;
}): Promise<string> {
  const canonicalRequest = JSON.stringify({
    version: 1,
    accountId: input.accountId,
    operation: input.operation,
    url: input.providerRequest.url,
    method: input.providerRequest.method,
    body: input.providerRequest.body ?? null,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRequest),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function classifyGmailReceiptReplay(
  receipt: GmailComposeReceipt,
  expected: {
    accountId: string;
    operation: GmailMutationOperation;
    requestSha256: string;
  },
): GmailReceiptReplayDecision {
  if (
    receipt.account_id !== expected.accountId ||
    receipt.operation !== expected.operation ||
    receipt.request_sha256 !== expected.requestSha256
  ) {
    return { kind: "conflict" };
  }

  if (receipt.status === "pending") return { kind: "pending" };

  const response = receipt.response_body ?? {
    error: receipt.last_error_message ?? "Stored Gmail operation has no response body",
    code: receipt.last_error_code ?? "IDEMPOTENCY_RECEIPT_INCOMPLETE",
  };
  return receipt.status === "succeeded"
    ? { kind: "succeeded", response }
    : { kind: "failed", response };
}

export async function parseGmailSuccessResponse(
  operation: GmailComposeOperation,
  response: Response,
): Promise<unknown> {
  if (operation === "delete_draft") return { success: true };
  return response.json();
}
