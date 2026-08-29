import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  buildGmailProviderRequest,
  classifyGmailReceiptReplay,
  hashGmailMutationRequest,
  hasGmailComposeCapability,
  isGmailComposeOperation,
  isGmailMutationOperation,
  isValidGmailIdempotencyKey,
  parseGmailSuccessResponse,
  type GmailComposeOperation,
  type GmailComposeReceipt,
  type GmailMutationOperation,
  type GmailProviderRequest,
} from "./gmailComposeProtocol.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GmailComposeRequest {
  accountId?: unknown;
  operation?: unknown;
  draft?: unknown;
  message?: unknown;
  draftId?: unknown;
  idempotencyKey?: unknown;
}

type SupabaseAdminClient = SupabaseClient<any, "public", any>;

interface ReceiptEnvelope {
  key: string;
  status: "pending" | "succeeded" | "failed";
  replayed: boolean;
}

type ProviderAttempt =
  | { kind: "response"; response: Response }
  | { kind: "definite_failure"; code: string; message: string }
  | { kind: "ambiguous"; code: string; message: string };

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function receiptEnvelope(
  key: string,
  status: ReceiptEnvelope["status"],
  replayed: boolean,
): ReceiptEnvelope {
  return { key, status, replayed };
}

function pendingReceiptResponse(key: string, replayed: boolean): Response {
  return jsonResponse({
    error: "This Gmail action has an in-progress or ambiguous provider receipt. It was not sent again.",
    code: "IDEMPOTENCY_IN_PROGRESS",
    idempotency: receiptEnvelope(key, "pending", replayed),
  });
}

function terminalReceiptResponse(
  body: Record<string, unknown>,
  key: string,
  status: "succeeded" | "failed",
  replayed: boolean,
): Response {
  return jsonResponse({
    ...body,
    idempotency: receiptEnvelope(key, status, replayed),
  });
}

async function fetchWithRefresh(input: {
  supabase: SupabaseAdminClient;
  oauthAccount: Record<string, unknown>;
  userId: string;
  accountId: string;
  providerRequest: GmailProviderRequest;
}): Promise<ProviderAttempt> {
  const makeProviderRequest = async (accessToken: string): Promise<Response> =>
    fetch(input.providerRequest.url, {
      method: input.providerRequest.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: input.providerRequest.body,
    });

  let response: Response;
  try {
    response = await makeProviderRequest(String(input.oauthAccount.access_token ?? ""));
  } catch (error) {
    return {
      kind: "ambiguous",
      code: "GMAIL_NETWORK_AMBIGUOUS",
      message: error instanceof Error ? error.message : "Gmail network response was ambiguous",
    };
  }

  if (response.status !== 401) return { kind: "response", response };

  // Gmail rejected the first request before applying it. Refreshing and
  // retrying inside this one receipt is safe; a network failure on the second
  // request is still ambiguous and leaves the receipt pending.
  const refreshToken = String(input.oauthAccount.refresh_token ?? "");
  if (!refreshToken) {
    return {
      kind: "definite_failure",
      code: "GMAIL_REFRESH_TOKEN_MISSING",
      message: "Gmail access expired and no refresh token is available",
    };
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      }),
    });
  } catch (error) {
    return {
      kind: "definite_failure",
      code: "GMAIL_TOKEN_REFRESH_FAILED",
      message: error instanceof Error ? error.message : "Gmail token refresh failed",
    };
  }

  if (!refreshResponse.ok) {
    return {
      kind: "definite_failure",
      code: "GMAIL_TOKEN_REFRESH_REJECTED",
      message: `Gmail token refresh failed with status ${refreshResponse.status}`,
    };
  }

  const refreshData = await refreshResponse.json();
  if (typeof refreshData?.access_token !== "string") {
    return {
      kind: "definite_failure",
      code: "GMAIL_TOKEN_REFRESH_INVALID",
      message: "Gmail token refresh returned no access token",
    };
  }

  const { error: tokenUpdateError } = await input.supabase
    .from("oauth_accounts")
    .update({
      access_token: refreshData.access_token,
      expires_at: new Date(Date.now() + Number(refreshData.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.accountId)
    .eq("user_id", input.userId);

  if (tokenUpdateError) {
    return {
      kind: "definite_failure",
      code: "GMAIL_TOKEN_PERSISTENCE_FAILED",
      message: "Refreshed Gmail credentials could not be saved",
    };
  }

  try {
    return {
      kind: "response",
      response: await makeProviderRequest(refreshData.access_token),
    };
  } catch (error) {
    return {
      kind: "ambiguous",
      code: "GMAIL_RETRY_AMBIGUOUS",
      message: error instanceof Error ? error.message : "Gmail retry response was ambiguous",
    };
  }
}

async function notePendingReceipt(
  supabase: SupabaseAdminClient,
  receipt: GmailComposeReceipt,
  code: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("gmail_compose_receipts")
    .update({
      last_error_code: code,
      last_error_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", receipt.id)
    .eq("user_id", receipt.user_id)
    .eq("status", "pending");
  if (error) console.error("Failed to annotate pending Gmail receipt:", error);
}

async function completeReceipt(input: {
  supabase: SupabaseAdminClient;
  receipt: GmailComposeReceipt;
  status: "succeeded" | "failed";
  responseBody: Record<string, unknown>;
  providerArtifactId?: string;
  errorCode?: string;
  errorMessage?: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("gmail_compose_receipts")
    .update({
      status: input.status,
      response_body: input.responseBody,
      provider_artifact_id: input.providerArtifactId ?? null,
      last_error_code: input.errorCode ?? null,
      last_error_message: input.errorMessage?.slice(0, 2000) ?? null,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", input.receipt.id)
    .eq("user_id", input.receipt.user_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Failed to finalize Gmail receipt:", error ?? "receipt was not pending");
    return false;
  }
  return true;
}

async function reserveReceipt(input: {
  supabase: SupabaseAdminClient;
  userId: string;
  accountId: string;
  operation: GmailMutationOperation;
  idempotencyKey: string;
  requestSha256: string;
}): Promise<{ receipt?: GmailComposeReceipt; replay?: Response }> {
  const { data, error } = await input.supabase
    .from("gmail_compose_receipts")
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      operation: input.operation,
      idempotency_key: input.idempotencyKey,
      request_sha256: input.requestSha256,
      status: "pending",
      provider_call_started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (!error && data) return { receipt: data as GmailComposeReceipt };
  if (error?.code !== "23505") {
    throw new HttpError(
      "Gmail action blocked: durable receipt could not be reserved",
      503,
      "IDEMPOTENCY_RECEIPT_UNAVAILABLE",
    );
  }

  const { data: existing, error: existingError } = await input.supabase
    .from("gmail_compose_receipts")
    .select("*")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .single();

  if (existingError || !existing) {
    throw new HttpError(
      "Gmail action blocked: existing durable receipt could not be read",
      503,
      "IDEMPOTENCY_RECEIPT_UNAVAILABLE",
    );
  }

  const decision = classifyGmailReceiptReplay(existing as GmailComposeReceipt, {
    accountId: input.accountId,
    operation: input.operation,
    requestSha256: input.requestSha256,
  });

  if (decision.kind === "conflict") {
    throw new HttpError(
      "Idempotency key is already bound to a different Gmail request",
      409,
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
  if (decision.kind === "pending") {
    return { replay: pendingReceiptResponse(input.idempotencyKey, true) };
  }
  return {
    replay: terminalReceiptResponse(
      decision.response,
      input.idempotencyKey,
      decision.kind,
      true,
    ),
  };
}

function isAmbiguousProviderStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function logSuccessfulOperation(input: {
  supabase: SupabaseAdminClient;
  userId: string;
  accountId: string;
  operation: GmailComposeOperation;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await input.supabase.from("sync_logs").insert({
    user_id: input.userId,
    provider: "google",
    service_type: "gmail",
    operation: input.operation,
    status: "success",
    account_id: input.accountId,
    items_processed: 1,
    started_at: now,
    completed_at: now,
  });
  if (error) console.error("Failed to log successful Gmail operation:", error);
}

async function executeMutation(input: {
  supabase: SupabaseAdminClient;
  oauthAccount: Record<string, unknown>;
  userId: string;
  accountId: string;
  operation: GmailMutationOperation;
  idempotencyKey: string;
  providerRequest: GmailProviderRequest;
}): Promise<Response> {
  const requestSha256 = await hashGmailMutationRequest({
    accountId: input.accountId,
    operation: input.operation,
    providerRequest: input.providerRequest,
  });
  const reservation = await reserveReceipt({
    supabase: input.supabase,
    userId: input.userId,
    accountId: input.accountId,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    requestSha256,
  });
  if (reservation.replay) return reservation.replay;
  const receipt = reservation.receipt!;

  const attempt = await fetchWithRefresh({
    supabase: input.supabase,
    oauthAccount: input.oauthAccount,
    userId: input.userId,
    accountId: input.accountId,
    providerRequest: input.providerRequest,
  });

  if (attempt.kind === "ambiguous") {
    await notePendingReceipt(input.supabase, receipt, attempt.code, attempt.message);
    return pendingReceiptResponse(input.idempotencyKey, false);
  }

  if (attempt.kind === "definite_failure") {
    const body = { error: attempt.message, code: attempt.code };
    const finalized = await completeReceipt({
      supabase: input.supabase,
      receipt,
      status: "failed",
      responseBody: body,
      errorCode: attempt.code,
      errorMessage: attempt.message,
    });
    return finalized
      ? terminalReceiptResponse(body, input.idempotencyKey, "failed", false)
      : pendingReceiptResponse(input.idempotencyKey, false);
  }

  if (!attempt.response.ok) {
    const providerError = (await attempt.response.text()).slice(0, 2000);
    const message = `Gmail API error: ${attempt.response.status} ${providerError}`;
    if (isAmbiguousProviderStatus(attempt.response.status)) {
      await notePendingReceipt(input.supabase, receipt, "GMAIL_PROVIDER_AMBIGUOUS", message);
      return pendingReceiptResponse(input.idempotencyKey, false);
    }

    const body = { error: message, code: "GMAIL_PROVIDER_REJECTED" };
    const finalized = await completeReceipt({
      supabase: input.supabase,
      receipt,
      status: "failed",
      responseBody: body,
      errorCode: "GMAIL_PROVIDER_REJECTED",
      errorMessage: message,
    });
    return finalized
      ? terminalReceiptResponse(body, input.idempotencyKey, "failed", false)
      : pendingReceiptResponse(input.idempotencyKey, false);
  }

  let providerData: unknown;
  try {
    providerData = await parseGmailSuccessResponse(input.operation, attempt.response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail success response could not be parsed";
    await notePendingReceipt(input.supabase, receipt, "GMAIL_RESPONSE_AMBIGUOUS", message);
    return pendingReceiptResponse(input.idempotencyKey, false);
  }

  if (
    !providerData ||
    typeof providerData !== "object" ||
    typeof (providerData as { id?: unknown }).id !== "string"
  ) {
    await notePendingReceipt(
      input.supabase,
      receipt,
      "GMAIL_ARTIFACT_ID_MISSING",
      "Gmail accepted the mutation but returned no provider artifact ID",
    );
    return pendingReceiptResponse(input.idempotencyKey, false);
  }

  const responseBody = providerData as Record<string, unknown>;
  const providerArtifactId = (providerData as { id: string }).id;
  const finalized = await completeReceipt({
    supabase: input.supabase,
    receipt,
    status: "succeeded",
    responseBody,
    providerArtifactId,
  });
  if (!finalized) return pendingReceiptResponse(input.idempotencyKey, false);

  await logSuccessfulOperation({
    supabase: input.supabase,
    userId: input.userId,
    accountId: input.accountId,
    operation: input.operation,
  });
  return terminalReceiptResponse(responseBody, input.idempotencyKey, "succeeded", false);
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpError("No valid authorization header", 401, "UNAUTHORIZED");
    }

    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new HttpError("Unauthorized", 401, "UNAUTHORIZED");

    let body: GmailComposeRequest;
    try {
      body = await req.json();
    } catch {
      throw new HttpError("Invalid JSON body", 400, "INVALID_REQUEST");
    }

    if (typeof body.accountId !== "string" || !body.accountId) {
      throw new HttpError("Account ID required", 400, "INVALID_REQUEST");
    }
    if (!isGmailComposeOperation(body.operation)) {
      throw new HttpError("Unsupported Gmail operation", 400, "INVALID_REQUEST");
    }
    if (body.draftId !== undefined && typeof body.draftId !== "string") {
      throw new HttpError("Draft ID must be a string", 400, "INVALID_REQUEST");
    }

    const accountId = body.accountId;
    const operation = body.operation;
    const { data: oauthAccount, error: accountError } = await supabase
      .from("oauth_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .eq("provider", "google")
      .single();

    if (accountError || !oauthAccount) {
      throw new HttpError("OAuth account not found", 404, "OAUTH_ACCOUNT_NOT_FOUND");
    }
    if (!hasGmailComposeCapability(oauthAccount)) {
      throw new HttpError(
        "Gmail compose-capable scope not granted",
        403,
        "GMAIL_SCOPE_REQUIRED",
      );
    }

    const providerRequest = buildGmailProviderRequest({
      operation,
      draft: body.draft,
      message: body.message,
      draftId: body.draftId,
    });

    if (isGmailMutationOperation(operation)) {
      if (!isValidGmailIdempotencyKey(body.idempotencyKey)) {
        throw new HttpError(
          "A valid idempotency key is required for Gmail writes",
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
        );
      }
      return executeMutation({
        supabase,
        oauthAccount,
        userId: user.id,
        accountId,
        operation,
        idempotencyKey: body.idempotencyKey,
        providerRequest,
      });
    }

    const attempt = await fetchWithRefresh({
      supabase,
      oauthAccount,
      userId: user.id,
      accountId,
      providerRequest,
    });
    if (attempt.kind !== "response") {
      throw new HttpError(attempt.message, 502, attempt.code);
    }
    if (!attempt.response.ok) {
      const errorText = (await attempt.response.text()).slice(0, 2000);
      throw new HttpError(
        `Gmail API error: ${attempt.response.status} ${errorText}`,
        502,
        "GMAIL_PROVIDER_REJECTED",
      );
    }

    const data = await parseGmailSuccessResponse(operation, attempt.response);
    await logSuccessfulOperation({ supabase, userId: user.id, accountId, operation });
    return jsonResponse(data as Record<string, unknown>);
  } catch (error) {
    console.error("Gmail compose error:", error);
    const httpError = error instanceof HttpError
      ? error
      : new HttpError(
        error instanceof Error ? error.message : "Unknown Gmail compose error",
        500,
        "GMAIL_COMPOSE_FAILED",
      );
    return jsonResponse({ error: httpError.message, code: httpError.code }, httpError.status);
  }
};

serve(handler);
