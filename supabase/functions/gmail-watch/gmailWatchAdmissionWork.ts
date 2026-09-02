import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { Database } from "../../../src/integrations/supabase/types.ts";
import type { Json } from "../../../src/integrations/supabase/types.ts";
import type { GmailWatchPushMigrationContext } from "../_shared/gmailMigrationScope.ts";
import {
  type GmailPubSubNotification,
  GmailWatchProtocolError,
} from "./gmailWatchProtocol.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class GmailWatchHttpError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

export function safeGmailWatchErrorMessage(error: unknown): string {
  // Only our own fixed-message errors may cross into persisted receipts.
  // Crypto/transport/provider objects can include secrets or request content.
  return error instanceof GmailWatchHttpError ||
      error instanceof GmailWatchProtocolError
    ? error.message
    : "Gmail watch processing did not complete";
}

export interface ReceiptClaim {
  receipt_id: string;
  claim_state: "claimed" | "replay" | "busy";
  receipt_status: "processing" | "succeeded" | "ignored" | "failed";
  attempts: number;
}

export interface GmailWatchRow {
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

export function validGmailWatchGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isVerifiedGmailWatchWriteReceipt(
  value: unknown,
  expected: {
    ownerId: string;
    accountId: string;
    expiresAt: string;
    generation: number;
  },
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const expectedExpiration = Date.parse(expected.expiresAt);
  const actualExpiration = typeof row.watch_expires_at === "string"
    ? Date.parse(row.watch_expires_at)
    : NaN;
  return typeof row.id === "string" && UUID.test(row.id) &&
    row.user_id === expected.ownerId &&
    row.oauth_account_id === expected.accountId &&
    row.status === "active" && Number.isFinite(expectedExpiration) &&
    Number.isFinite(actualExpiration) &&
    actualExpiration === expectedExpiration &&
    validGmailWatchGeneration(row.watch_generation) &&
    row.watch_generation === expected.generation;
}

export async function loadAdmittedGmailPushWatch(
  supabase: SupabaseClient<Database>,
  scope: GmailWatchPushMigrationContext,
): Promise<GmailWatchRow | null> {
  const notification = scope.notification;
  const { data, error } = await supabase
    .from("gmail_watch_subscriptions")
    .select("*")
    .eq("id", scope.watchId)
    .eq("user_id", scope.subjectId)
    .eq("account_email", notification.emailAddress)
    .eq("subscription_name", notification.subscription)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Gmail watch revalidation unavailable");
  if (!data) return null;
  if (
    data.id !== scope.watchId || data.user_id !== scope.subjectId ||
    data.account_email !== notification.emailAddress ||
    data.subscription_name !== notification.subscription ||
    data.status !== "active" ||
    !validGmailWatchGeneration(data.watch_generation) ||
    typeof data.oauth_account_id !== "string" ||
    !UUID.test(data.oauth_account_id)
  ) {
    throw new Error("Gmail watch revalidation unavailable");
  }
  return data as GmailWatchRow;
}

export async function claimAdmittedGmailPushReceipt(
  supabase: SupabaseClient<Database>,
  watch: GmailWatchRow,
  notification: GmailPubSubNotification,
): Promise<ReceiptClaim> {
  const { data, error } = await supabase.rpc(
    "claim_gmail_pubsub_message_scoped",
    {
      p_watch_id: watch.id,
      p_user_id: watch.user_id,
      p_oauth_account_id: watch.oauth_account_id,
      p_account_email: watch.account_email,
      p_watch_generation: watch.watch_generation,
      p_subscription_name: notification.subscription,
      p_pubsub_message_id: notification.messageId,
      p_notification_history_id: notification.historyId,
      p_publish_time: notification.publishTime,
    },
  );
  const claim = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (
    error || !claim || typeof claim.receipt_id !== "string" ||
    !UUID.test(claim.receipt_id) ||
    claim.receipt_id === "00000000-0000-0000-0000-000000000000" ||
    !Number.isSafeInteger(claim.attempts) || claim.attempts < 1 ||
    !(["claimed", "busy"].includes(claim.claim_state) &&
        claim.receipt_status === "processing" ||
      claim.claim_state === "replay" &&
        ["succeeded", "ignored"].includes(claim.receipt_status))
  ) {
    throw new Error("Gmail push claim was not verified");
  }
  return claim as ReceiptClaim;
}

export interface GmailPushCompletion {
  watch: GmailWatchRow;
  claim: ReceiptClaim;
  status: "succeeded" | "ignored" | "failed";
  effectiveHistoryId: string;
  historyRecords?: number;
  changeEvents?: number;
  resultSummary?: Json;
  errorCode?: string;
  errorMessage?: string;
}

export async function completeAdmittedGmailPushReceipt(
  supabase: SupabaseClient<Database>,
  input: GmailPushCompletion,
): Promise<void> {
  const { watch, claim } = input;
  const { data, error } = await supabase.rpc(
    "complete_gmail_pubsub_message_scoped",
    {
      p_receipt_id: claim.receipt_id,
      p_watch_id: watch.id,
      p_user_id: watch.user_id,
      p_oauth_account_id: watch.oauth_account_id,
      p_account_email: watch.account_email,
      p_watch_generation: watch.watch_generation,
      p_subscription_name: watch.subscription_name,
      p_attempt_count: claim.attempts,
      p_status: input.status,
      p_effective_history_id: input.effectiveHistoryId,
      p_history_records: input.historyRecords ?? 0,
      p_change_events: input.changeEvents ?? 0,
      p_result_summary: input.resultSummary ?? {},
      p_error_code: input.errorCode ?? null,
      p_error_message: input.errorMessage ?? null,
    },
  );
  const completion = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (
    error || !completion ||
    !["completed", "already_complete"].includes(completion.completion_state) ||
    (completion.stored_history_id !== null &&
      (typeof completion.stored_history_id !== "string" ||
        !/^[0-9]{1,32}$/.test(completion.stored_history_id)))
  ) {
    throw new Error("Gmail push completion was not verified");
  }
  if (
    input.status === "succeeded" && (completion.stored_history_id === null ||
      BigInt(completion.stored_history_id) < BigInt(input.effectiveHistoryId))
  ) {
    throw new Error("Gmail push completion was not verified");
  }
}
