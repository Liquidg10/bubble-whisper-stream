import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type {
  Database,
  Json,
} from "../../../src/integrations/supabase/types.ts";
import { isExactServiceRoleBearer } from "../_shared/calendarWatchSecurity.ts";
import {
  decryptOAuthToken,
  encryptOAuthToken,
  loadOAuthTokenEncryptionKey,
} from "../_shared/oauthTokenCrypto.ts";
import {
  buildGmailWatchRequest,
  classifyHistoryCursor,
  compareHistoryIds,
  containsAsciiControlCharacters,
  type GmailPubSubNotification,
  GmailWatchProtocolError,
  hasGmailWatchCapability,
  isPubSubEnvelopeCandidate,
  normalizeEmailAddress,
  normalizeGmailWatchAction,
  normalizeHistoryId,
  normalizeOAuthAccountId,
  parseGmailPubSubEnvelope,
  requireGmailPubSubTopic,
} from "./gmailWatchProtocol.ts";
import {
  extractOidcBearerToken,
  GoogleOidcVerificationError,
  verifyGooglePubSubOidcJwt,
} from "./googleOidcJwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "X-Gmail-Watch-Contract": "pubsub-oidc-v1",
};

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_HISTORY_PAGES = 20;
const HISTORY_PAGE_SIZE = 500;
const HEALTHY_WATCH_REUSE_MS = 24 * 60 * 60 * 1000;

type AdminClient = SupabaseClient<Database>;

interface ControlBody {
  accountId?: unknown;
  action?: unknown;
  operation?: unknown;
}

interface OAuthAccountRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  provider: string;
  account_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[] | null;
  scopes_string: string | null;
}

interface GmailWatchRow {
  id: string;
  user_id: string;
  oauth_account_id: string;
  account_email: string;
  topic_name: string;
  subscription_name: string;
  status: "inactive" | "active" | "error" | "resync_required";
  history_id: string | null;
  watch_expires_at: string | null;
  watch_generation: number;
}

interface GmailHistoryMessage {
  id?: unknown;
  threadId?: unknown;
}

interface GmailHistoryRecord {
  id?: unknown;
  messagesAdded?: Array<{ message?: GmailHistoryMessage }>;
  messagesDeleted?: Array<{ message?: GmailHistoryMessage }>;
  labelsAdded?: Array<{ message?: GmailHistoryMessage; labelIds?: unknown }>;
  labelsRemoved?: Array<{ message?: GmailHistoryMessage; labelIds?: unknown }>;
}

interface GmailHistoryPage {
  history?: GmailHistoryRecord[];
  historyId?: unknown;
  nextPageToken?: unknown;
}

interface GmailHistoryEvent {
  user_id: string;
  watch_id: string;
  oauth_account_id: string;
  receipt_id: string;
  history_id: string;
  event_type:
    | "message_added"
    | "message_deleted"
    | "labels_added"
    | "labels_removed";
  gmail_message_id: string;
  gmail_thread_id: string | null;
  label_ids: string[];
}

interface HistoryIngestionResult {
  effectiveHistoryId: string;
  historyRecords: number;
  changeEvents: number;
}

interface ReceiptClaim {
  receipt_id: string;
  claim_state: "claimed" | "replay" | "busy";
  receipt_status: "processing" | "succeeded" | "ignored" | "failed";
  attempts: number;
}

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
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function pushAcknowledgement(): Response {
  return new Response(null, {
    status: 204,
    headers: { "X-Gmail-Watch-Contract": "pubsub-oidc-v1" },
  });
}

function pushRetry(code: string): Response {
  return jsonResponse(
    { error: "Gmail push processing must be retried", code },
    503,
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorCode(error: unknown): string {
  if (error instanceof HttpError) return error.code;
  if (error instanceof GmailWatchProtocolError) return error.code;
  if (error instanceof GoogleOidcVerificationError) return error.code;
  return "GMAIL_WATCH_FAILED";
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(`${name} is required`, 500, "SERVER_CONFIG_MISSING");
  }
  return value;
}

function createAdminClient(): AdminClient {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function readJsonBody(req: Request): Promise<unknown> {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new HttpError("Request body is too large", 413, "REQUEST_TOO_LARGE");
  }
  const body = await req.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new HttpError("Request body is invalid", 400, "INVALID_REQUEST");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError("Request body is not valid JSON", 400, "INVALID_JSON");
  }
}

async function authorizeControlRequest(
  req: Request,
  supabase: AdminClient,
): Promise<{ serviceRole: boolean; userId: string | null }> {
  const authorization = req.headers.get("Authorization") ??
    req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (isExactServiceRoleBearer(authorization, serviceRoleKey)) {
    return { serviceRole: true, userId: null };
  }
  const bearer = authorization?.match(/^Bearer (.+)$/i)?.[1] ?? null;
  if (!bearer) throw new HttpError("Unauthorized", 401, "UNAUTHORIZED");

  const { data: { user }, error } = await supabase.auth.getUser(bearer);
  if (error || !user) throw new HttpError("Unauthorized", 401, "UNAUTHORIZED");
  return { serviceRole: false, userId: user.id };
}

async function loadOAuthAccount(
  supabase: AdminClient,
  accountId: string,
  callerUserId: string | null,
): Promise<OAuthAccountRow> {
  let query = supabase
    .from("oauth_accounts")
    .select(
      "id,user_id,provider,account_email,access_token,refresh_token,expires_at,scopes,scopes_string",
    )
    .eq("id", accountId);
  if (callerUserId) query = query.eq("user_id", callerUserId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new HttpError(
      "OAuth account not found",
      404,
      "OAUTH_ACCOUNT_NOT_FOUND",
    );
  }
  if (!hasGmailWatchCapability(data)) {
    throw new HttpError(
      "Gmail metadata or read scope is required",
      403,
      "GMAIL_WATCH_SCOPE_REQUIRED",
    );
  }
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new HttpError(
      "Gmail access token is missing",
      401,
      "GMAIL_ACCESS_TOKEN_MISSING",
    );
  }
  return data as OAuthAccountRow;
}

async function decryptStoredToken(value: string): Promise<string> {
  return await decryptOAuthToken(value, await loadOAuthTokenEncryptionKey());
}

async function refreshOAuthAccessToken(
  supabase: AdminClient,
  account: OAuthAccountRow,
): Promise<string> {
  if (!account.refresh_token) {
    throw new HttpError(
      "Gmail authorization must be renewed",
      401,
      "GMAIL_REFRESH_TOKEN_MISSING",
    );
  }
  const refreshToken = await decryptStoredToken(account.refresh_token);
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: requireEnv("GOOGLE_CLIENT_ID"),
        client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      }),
    });
  } catch {
    throw new HttpError(
      "Gmail token refresh is unavailable",
      502,
      "GMAIL_REFRESH_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    throw new HttpError(
      "Gmail authorization must be renewed",
      401,
      "GMAIL_REFRESH_REJECTED",
    );
  }
  const data = await response.json().catch(() => null);
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new HttpError(
      "Gmail token refresh was invalid",
      502,
      "GMAIL_REFRESH_INVALID",
    );
  }

  const storedAccessToken = await encryptOAuthToken(
    data.access_token,
    await loadOAuthTokenEncryptionKey(),
  );
  const { error } = await supabase
    .from("oauth_accounts")
    .update({
      access_token: storedAccessToken,
      expires_at: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000)
        .toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .eq("user_id", account.user_id);
  if (error) {
    throw new HttpError(
      "Refreshed Gmail credentials could not be saved",
      500,
      "GMAIL_REFRESH_PERSISTENCE_FAILED",
    );
  }
  return data.access_token;
}

async function gmailFetch(
  supabase: AdminClient,
  account: OAuthAccountRow,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const perform = async (accessToken: string): Promise<Response> => {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      throw new HttpError(
        "Gmail API is unavailable",
        502,
        "GMAIL_NETWORK_UNAVAILABLE",
      );
    }
  };

  let response = await perform(await decryptStoredToken(account.access_token!));
  if (response.status !== 401) return response;
  response = await perform(await refreshOAuthAccessToken(supabase, account));
  return response;
}

async function loadWatchByOAuthAccount(
  supabase: AdminClient,
  accountId: string,
): Promise<GmailWatchRow | null> {
  const { data, error } = await supabase
    .from("gmail_watch_subscriptions")
    .select("*")
    .eq("oauth_account_id", accountId)
    .maybeSingle();
  if (error) {
    throw new HttpError(
      "Gmail watch state could not be loaded",
      500,
      "WATCH_STATE_READ_FAILED",
    );
  }
  return data as GmailWatchRow | null;
}

async function getGmailProfileEmail(
  supabase: AdminClient,
  account: OAuthAccountRow,
): Promise<string> {
  const response = await gmailFetch(
    supabase,
    account,
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new HttpError(
      "Gmail profile lookup failed",
      502,
      "GMAIL_PROFILE_REJECTED",
    );
  }
  const profile = await response.json().catch(() => null);
  const emailAddress = normalizeEmailAddress(profile?.emailAddress);
  if (
    account.account_email &&
    normalizeEmailAddress(account.account_email) !== emailAddress
  ) {
    throw new HttpError(
      "Gmail mailbox does not match the connected OAuth account",
      409,
      "GMAIL_ACCOUNT_EMAIL_MISMATCH",
    );
  }
  return emailAddress;
}

async function logSync(
  supabase: AdminClient,
  input: {
    userId: string;
    accountId: string;
    operation: string;
    status: "success" | "error";
    itemsProcessed?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("sync_logs").insert({
    user_id: input.userId,
    provider: "google",
    service_type: "gmail",
    operation: input.operation,
    status: input.status,
    account_id: input.accountId,
    items_processed: input.itemsProcessed ?? 0,
    error_message: input.errorMessage?.slice(0, 2000) ?? null,
    started_at: now,
    completed_at: now,
  });
  if (error) console.error("Gmail watch sync receipt could not be written");
}

async function startOrRenewWatch(
  supabase: AdminClient,
  account: OAuthAccountRow,
  action: "start" | "renew",
): Promise<Record<string, unknown>> {
  const topicName = requireGmailPubSubTopic(
    Deno.env.get("GMAIL_PUBSUB_TOPIC"),
    Deno.env.get("GOOGLE_CLOUD_PROJECT_ID"),
  );
  const subscriptionName = requireEnv("GMAIL_PUBSUB_SUBSCRIPTION");
  if (!/^projects\/[^/]+\/subscriptions\/[^/]+$/.test(subscriptionName)) {
    throw new HttpError(
      "GMAIL_PUBSUB_SUBSCRIPTION is invalid",
      500,
      "PUBSUB_SUBSCRIPTION_CONFIG_INVALID",
    );
  }
  const existing = await loadWatchByOAuthAccount(supabase, account.id);
  if (existing?.status === "resync_required") {
    throw new HttpError(
      "A full Gmail mailbox resync is required before this watch can restart",
      409,
      "GMAIL_FULL_RESYNC_REQUIRED",
    );
  }
  const existingExpiry = existing?.watch_expires_at
    ? Date.parse(existing.watch_expires_at)
    : 0;
  if (
    action === "start" &&
    existing?.status === "active" &&
    existing.topic_name === topicName &&
    existing.subscription_name === subscriptionName &&
    existingExpiry > Date.now() + HEALTHY_WATCH_REUSE_MS
  ) {
    return {
      success: true,
      status: "active",
      expiresAt: existing.watch_expires_at,
      reused: true,
    };
  }

  const accountEmail = await getGmailProfileEmail(supabase, account);
  const response = await gmailFetch(
    supabase,
    account,
    "https://gmail.googleapis.com/gmail/v1/users/me/watch",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGmailWatchRequest(topicName)),
    },
  );
  if (!response.ok) {
    throw new HttpError(
      "Gmail watch registration failed",
      502,
      "GMAIL_WATCH_REJECTED",
    );
  }
  const watchResponse = await response.json().catch(() => null);
  const responseHistoryId = normalizeHistoryId(watchResponse?.historyId);
  const expirationMillis = Number(watchResponse?.expiration);
  if (
    !Number.isSafeInteger(expirationMillis) || expirationMillis <= Date.now()
  ) {
    throw new HttpError(
      "Gmail watch response was invalid",
      502,
      "GMAIL_WATCH_RESPONSE_INVALID",
    );
  }

  const preserveCursor = action === "renew" || existing?.status === "active" ||
    existing?.status === "error";
  const historyId = preserveCursor && existing?.history_id
    ? existing.history_id
    : responseHistoryId;
  const watchExpiresAt = new Date(expirationMillis).toISOString();
  const { data, error } = await supabase
    .from("gmail_watch_subscriptions")
    .upsert({
      user_id: account.user_id,
      oauth_account_id: account.id,
      account_email: accountEmail,
      topic_name: topicName,
      subscription_name: subscriptionName,
      label_ids: ["INBOX"],
      status: "active",
      history_id: historyId,
      watch_expires_at: watchExpiresAt,
      watch_generation: Number(existing?.watch_generation ?? 0) + 1,
      stopped_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "oauth_account_id" })
    .select("id,status,watch_expires_at,watch_generation")
    .single();
  if (error || !data) {
    throw new HttpError(
      "Gmail watch state could not be saved",
      500,
      "WATCH_STATE_WRITE_FAILED",
    );
  }

  await logSync(supabase, {
    userId: account.user_id,
    accountId: account.id,
    operation: action === "renew" ? "watch_renewal" : "watch_start",
    status: "success",
  });
  return {
    success: true,
    status: data.status,
    expiresAt: data.watch_expires_at,
    generation: data.watch_generation,
    reused: false,
  };
}

async function stopWatch(
  supabase: AdminClient,
  account: OAuthAccountRow,
): Promise<Record<string, unknown>> {
  const existing = await loadWatchByOAuthAccount(supabase, account.id);
  if (existing?.status === "inactive") {
    return { success: true, status: "inactive", reused: true };
  }

  const response = await gmailFetch(
    supabase,
    account,
    "https://gmail.googleapis.com/gmail/v1/users/me/stop",
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );
  if (!response.ok && response.status !== 404) {
    throw new HttpError("Gmail watch stop failed", 502, "GMAIL_STOP_REJECTED");
  }

  if (existing) {
    const { error } = await supabase
      .from("gmail_watch_subscriptions")
      .update({
        status: "inactive",
        watch_expires_at: null,
        stopped_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", account.user_id);
    if (error) {
      throw new HttpError(
        "Stopped Gmail watch state could not be saved",
        500,
        "WATCH_STATE_WRITE_FAILED",
      );
    }
  }

  await logSync(supabase, {
    userId: account.user_id,
    accountId: account.id,
    operation: "watch_stop",
    status: "success",
  });
  return { success: true, status: "inactive", reused: false };
}

async function handleControlRequest(
  req: Request,
  body: unknown,
): Promise<Response> {
  const supabase = createAdminClient();
  const caller = await authorizeControlRequest(req, supabase);
  const input = body as ControlBody;
  const action = normalizeGmailWatchAction(input?.action, input?.operation);
  const accountId = normalizeOAuthAccountId(input?.accountId);
  if (!action || !accountId) {
    throw new HttpError(
      "A specific OAuth account and start, renew, or stop action are required",
      400,
      "INVALID_CONTROL_REQUEST",
    );
  }

  const account = await loadOAuthAccount(supabase, accountId, caller.userId);
  const result = action === "stop"
    ? await stopWatch(supabase, account)
    : await startOrRenewWatch(supabase, account, action);
  return jsonResponse(result);
}

function normalizeMessageReference(message: GmailHistoryMessage | undefined): {
  messageId: string;
  threadId: string | null;
} | null {
  if (
    !message ||
    typeof message.id !== "string" ||
    !message.id ||
    message.id.length > 512 ||
    containsAsciiControlCharacters(message.id)
  ) return null;
  return {
    messageId: message.id,
    threadId:
      typeof message.threadId === "string" && message.threadId.length <= 512
        ? message.threadId
        : null,
  };
}

function collectHistoryEvents(input: {
  page: GmailHistoryPage;
  watch: GmailWatchRow;
  receiptId: string;
  seen: Set<string>;
}): { events: GmailHistoryEvent[]; records: number } {
  const events: GmailHistoryEvent[] = [];
  const history = Array.isArray(input.page.history) ? input.page.history : [];
  const append = (
    historyId: string,
    eventType: GmailHistoryEvent["event_type"],
    message: GmailHistoryMessage | undefined,
    labels: unknown = [],
  ) => {
    const reference = normalizeMessageReference(message);
    if (!reference) return;
    const key = `${historyId}:${eventType}:${reference.messageId}`;
    if (input.seen.has(key)) return;
    input.seen.add(key);
    const labelIds = Array.isArray(labels)
      ? labels.filter((label): label is string =>
        typeof label === "string" && label.length <= 128
      )
      : [];
    events.push({
      user_id: input.watch.user_id,
      watch_id: input.watch.id,
      oauth_account_id: input.watch.oauth_account_id,
      receipt_id: input.receiptId,
      history_id: historyId,
      event_type: eventType,
      gmail_message_id: reference.messageId,
      gmail_thread_id: reference.threadId,
      label_ids: labelIds,
    });
  };

  for (const record of history) {
    const historyId = normalizeHistoryId(record.id);
    for (const entry of record.messagesAdded ?? []) {
      append(historyId, "message_added", entry.message);
    }
    for (const entry of record.messagesDeleted ?? []) {
      append(historyId, "message_deleted", entry.message);
    }
    for (const entry of record.labelsAdded ?? []) {
      append(historyId, "labels_added", entry.message, entry.labelIds);
    }
    for (const entry of record.labelsRemoved ?? []) {
      append(historyId, "labels_removed", entry.message, entry.labelIds);
    }
  }
  return { events, records: history.length };
}

async function insertHistoryEvents(
  supabase: AdminClient,
  events: GmailHistoryEvent[],
): Promise<void> {
  for (let offset = 0; offset < events.length; offset += 500) {
    const { error } = await supabase
      .from("gmail_history_events")
      .upsert(events.slice(offset, offset + 500), {
        onConflict: "oauth_account_id,history_id,event_type,gmail_message_id",
        ignoreDuplicates: true,
      });
    if (error) {
      throw new HttpError(
        "Gmail history events could not be saved",
        500,
        "HISTORY_EVENT_WRITE_FAILED",
      );
    }
  }
}

async function ingestHistory(
  supabase: AdminClient,
  account: OAuthAccountRow,
  watch: GmailWatchRow,
  receiptId: string,
  notificationHistoryId: string,
): Promise<HistoryIngestionResult> {
  if (!watch.history_id) {
    throw new HttpError(
      "Gmail history cursor is missing",
      409,
      "HISTORY_BOOTSTRAP_REQUIRED",
    );
  }
  let pageToken: string | null = null;
  let effectiveHistoryId = watch.history_id;
  let historyRecords = 0;
  let changeEvents = 0;
  const seen = new Set<string>();

  for (let pageNumber = 0; pageNumber < MAX_HISTORY_PAGES; pageNumber += 1) {
    const params = new URLSearchParams({
      startHistoryId: watch.history_id,
      maxResults: String(HISTORY_PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await gmailFetch(
      supabase,
      account,
      `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    if (response.status === 404) {
      throw new HttpError(
        "Stored Gmail history cursor is no longer valid",
        409,
        "HISTORY_CURSOR_EXPIRED",
      );
    }
    if (!response.ok) {
      throw new HttpError(
        "Gmail history lookup failed",
        502,
        "GMAIL_HISTORY_REJECTED",
      );
    }
    const page = await response.json().catch(() => null) as
      | GmailHistoryPage
      | null;
    if (!page || typeof page !== "object") {
      throw new HttpError(
        "Gmail history response was invalid",
        502,
        "GMAIL_HISTORY_RESPONSE_INVALID",
      );
    }
    const collected = collectHistoryEvents({ page, watch, receiptId, seen });
    await insertHistoryEvents(supabase, collected.events);
    historyRecords += collected.records;
    changeEvents += collected.events.length;

    if (page.historyId !== undefined) {
      const pageHistoryId = normalizeHistoryId(page.historyId);
      if (compareHistoryIds(pageHistoryId, effectiveHistoryId) > 0) {
        effectiveHistoryId = pageHistoryId;
      }
    }
    if (page.nextPageToken === undefined) {
      if (compareHistoryIds(notificationHistoryId, effectiveHistoryId) > 0) {
        effectiveHistoryId = notificationHistoryId;
      }
      return { effectiveHistoryId, historyRecords, changeEvents };
    }
    if (typeof page.nextPageToken !== "string" || !page.nextPageToken) {
      throw new HttpError(
        "Gmail history page token was invalid",
        502,
        "GMAIL_HISTORY_RESPONSE_INVALID",
      );
    }
    pageToken = page.nextPageToken;
  }
  throw new HttpError(
    "Gmail history page limit was reached",
    503,
    "GMAIL_HISTORY_PAGE_LIMIT",
  );
}

async function claimPushReceipt(
  supabase: AdminClient,
  watch: GmailWatchRow,
  notification: GmailPubSubNotification,
): Promise<ReceiptClaim> {
  const { data, error } = await supabase.rpc("claim_gmail_pubsub_message", {
    p_watch_id: watch.id,
    p_subscription_name: notification.subscription,
    p_pubsub_message_id: notification.messageId,
    p_notification_history_id: notification.historyId,
    p_publish_time: notification.publishTime,
  });
  const claim = Array.isArray(data) ? data[0] : null;
  if (error || !claim) {
    throw new HttpError(
      "Pub/Sub receipt could not be claimed",
      503,
      "PUBSUB_CLAIM_FAILED",
    );
  }
  return claim as ReceiptClaim;
}

async function completePushReceipt(
  supabase: AdminClient,
  input: {
    receiptId: string;
    status: "succeeded" | "ignored" | "failed";
    effectiveHistoryId: string;
    historyRecords?: number;
    changeEvents?: number;
    resultSummary?: Json;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const { error } = await supabase.rpc("complete_gmail_pubsub_message", {
    p_receipt_id: input.receiptId,
    p_status: input.status,
    p_effective_history_id: input.effectiveHistoryId,
    p_history_records: input.historyRecords ?? 0,
    p_change_events: input.changeEvents ?? 0,
    p_result_summary: input.resultSummary ?? {},
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
  });
  if (error) {
    throw new HttpError(
      "Pub/Sub receipt could not be completed",
      503,
      "PUBSUB_COMPLETION_FAILED",
    );
  }
}

async function markWatchFailure(
  supabase: AdminClient,
  watch: GmailWatchRow,
  error: unknown,
  requiresResync: boolean,
): Promise<void> {
  const { error: updateError } = await supabase
    .from("gmail_watch_subscriptions")
    .update({
      status: requiresResync ? "resync_required" : watch.status,
      last_error_code: getErrorCode(error),
      last_error_message: getErrorMessage(error).slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", watch.id)
    .eq("user_id", watch.user_id);
  if (updateError) {
    console.error("Gmail watch failure state could not be saved");
  }
}

async function handlePubSubPush(
  req: Request,
  body: unknown,
): Promise<Response> {
  const bearer = extractOidcBearerToken(
    req.headers.get("Authorization") ?? req.headers.get("authorization"),
  );
  if (!bearer) {
    throw new HttpError(
      "Pub/Sub OIDC bearer is required",
      401,
      "OIDC_TOKEN_MISSING",
    );
  }

  // Signature, issuer, expiry, audience, and service-account identity are all
  // verified before any mailbox lookup or provider cursor is touched.
  await verifyGooglePubSubOidcJwt(bearer, {
    expectedAudience: requireEnv("GMAIL_PUBSUB_PUSH_AUDIENCE"),
    expectedServiceAccountEmail: requireEnv(
      "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
    ),
  });
  const notification = parseGmailPubSubEnvelope(
    body,
    requireEnv("GMAIL_PUBSUB_SUBSCRIPTION"),
  );
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("gmail_watch_subscriptions")
    .select("*")
    .eq("account_email", notification.emailAddress)
    .eq("subscription_name", notification.subscription)
    .eq("status", "active")
    .maybeSingle();
  if (error) return pushRetry("WATCH_LOOKUP_FAILED");
  if (!data) {
    // The request is genuinely from our authenticated subscription, but the
    // mailbox is no longer active. Acknowledge without leaking account state.
    return pushAcknowledgement();
  }
  const watch = data as GmailWatchRow;
  let claim: ReceiptClaim;
  try {
    claim = await claimPushReceipt(supabase, watch, notification);
  } catch (error) {
    console.error(
      "Authenticated Gmail push receipt claim failed",
      getErrorCode(error),
    );
    return pushRetry(getErrorCode(error));
  }
  if (claim.claim_state === "replay") return pushAcknowledgement();
  if (claim.claim_state === "busy") return pushRetry("PUBSUB_RECEIPT_BUSY");

  const cursorDecision = classifyHistoryCursor(
    watch.history_id,
    notification.historyId,
  );
  if (cursorDecision === "stale") {
    try {
      await completePushReceipt(supabase, {
        receiptId: claim.receipt_id,
        status: "ignored",
        effectiveHistoryId: notification.historyId,
        resultSummary: { reason: "stale_or_duplicate" },
      });
      return pushAcknowledgement();
    } catch (error) {
      return pushRetry(getErrorCode(error));
    }
  }
  if (cursorDecision === "bootstrap_required") {
    const error = new HttpError(
      "Gmail history cursor is missing",
      409,
      "HISTORY_BOOTSTRAP_REQUIRED",
    );
    await markWatchFailure(supabase, watch, error, true);
    try {
      await completePushReceipt(supabase, {
        receiptId: claim.receipt_id,
        status: "failed",
        effectiveHistoryId: notification.historyId,
        errorCode: error.code,
        errorMessage: error.message,
      });
    } catch {
      return pushRetry("PUBSUB_COMPLETION_FAILED");
    }
    await logSync(supabase, {
      userId: watch.user_id,
      accountId: watch.oauth_account_id,
      operation: "pubsub_history",
      status: "error",
      errorMessage: error.message,
    });
    return pushAcknowledgement();
  }

  try {
    const account = await loadOAuthAccount(
      supabase,
      watch.oauth_account_id,
      watch.user_id,
    );
    const result = await ingestHistory(
      supabase,
      account,
      watch,
      claim.receipt_id,
      notification.historyId,
    );
    await completePushReceipt(supabase, {
      receiptId: claim.receipt_id,
      status: "succeeded",
      effectiveHistoryId: result.effectiveHistoryId,
      historyRecords: result.historyRecords,
      changeEvents: result.changeEvents,
      resultSummary: {
        historyRecords: result.historyRecords,
        changeEvents: result.changeEvents,
      },
    });
    await logSync(supabase, {
      userId: watch.user_id,
      accountId: watch.oauth_account_id,
      operation: "pubsub_history",
      status: "success",
      itemsProcessed: result.changeEvents,
    });
    console.log("Authenticated Gmail push processed", {
      watchId: watch.id,
      receiptId: claim.receipt_id,
      historyRecords: result.historyRecords,
      changeEvents: result.changeEvents,
    });
    return pushAcknowledgement();
  } catch (error) {
    const errorCode = getErrorCode(error);
    const requiresResync = errorCode === "HISTORY_CURSOR_EXPIRED" ||
      errorCode === "GMAIL_HISTORY_PAGE_LIMIT";
    await markWatchFailure(supabase, watch, error, requiresResync);
    try {
      await completePushReceipt(supabase, {
        receiptId: claim.receipt_id,
        status: "failed",
        effectiveHistoryId: notification.historyId,
        errorCode: getErrorCode(error),
        errorMessage: getErrorMessage(error),
      });
    } catch {
      return pushRetry("PUBSUB_COMPLETION_FAILED");
    }
    await logSync(supabase, {
      userId: watch.user_id,
      accountId: watch.oauth_account_id,
      operation: "pubsub_history",
      status: "error",
      errorMessage: getErrorMessage(error),
    });
    // A 404 cursor cannot be repaired by redelivering the same notification;
    // persist resync_required and acknowledge. Transient provider/storage
    // failures are negatively acknowledged so Pub/Sub replays them.
    return requiresResync
      ? pushAcknowledgement()
      : pushRetry(getErrorCode(error));
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    }, 405);
  }

  try {
    const body = await readJsonBody(req);
    return isPubSubEnvelopeCandidate(body)
      ? await handlePubSubPush(req, body)
      : await handleControlRequest(req, body);
  } catch (error) {
    console.error("Gmail watch request failed", getErrorCode(error));
    if (error instanceof GoogleOidcVerificationError) {
      return jsonResponse({
        error: "Unauthorized Pub/Sub push",
        code: error.code,
      }, 401);
    }
    if (error instanceof GmailWatchProtocolError) {
      return jsonResponse({ error: error.message, code: error.code }, 400);
    }
    const httpError = error instanceof HttpError
      ? error
      : new HttpError("Gmail watch failed", 500, "GMAIL_WATCH_FAILED");
    return jsonResponse(
      { error: httpError.message, code: httpError.code },
      httpError.status,
    );
  }
};

serve(handler);
