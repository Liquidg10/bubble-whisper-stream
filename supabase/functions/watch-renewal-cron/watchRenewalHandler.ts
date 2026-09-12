import {
  type MigrationWriteFenceDependencies,
  MindManualAdmissionUnavailableError,
  runMindManualSubjectWork,
} from "../_shared/migrationWriteFence.ts";
import { isExactServiceRoleBearer } from "../_shared/calendarWatchSecurity.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { Database } from "../../../src/integrations/supabase/types.ts";

type AdminClient = SupabaseClient<Database>;
const MAX_DISCOVERY_ROWS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_SELECT =
  "id,user_id,watch_resource_id,watch_channel_id,watch_expires_at,calendar_id";
const GMAIL_SELECT = "id,user_id,oauth_account_id,watch_expires_at";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export interface WatchRenewalDependencies {
  env: (name: string) => string | undefined;
  createAdminClient: (url: string, serviceKey: string) => AdminClient;
  now?: () => number;
  admissionDependencies?: MigrationWriteFenceDependencies;
}

interface WatchChannel {
  id: string;
  user_id: string;
  provider: "google-calendar" | "gmail";
  resource_id: string | null;
  channel_id: string | null;
  expires_at: string;
  account_id: string;
  calendar_id: string | null;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000";
}

function parseWatch(
  value: unknown,
  provider: WatchChannel["provider"],
): WatchChannel {
  const row = value as Record<string, unknown> | null;
  if (
    !row || !uuid(row.id) || !uuid(row.user_id) ||
    typeof row.watch_expires_at !== "string" ||
    !Number.isFinite(Date.parse(row.watch_expires_at)) ||
    (provider === "gmail" && !uuid(row.oauth_account_id))
  ) {
    throw new Error("Watch renewal row is invalid");
  }
  return {
    id: row.id,
    user_id: row.user_id,
    provider,
    account_id: provider === "gmail" ? row.oauth_account_id as string : row.id,
    expires_at: row.watch_expires_at,
    resource_id: typeof row.watch_resource_id === "string"
      ? row.watch_resource_id
      : null,
    channel_id: typeof row.watch_channel_id === "string"
      ? row.watch_channel_id
      : null,
    calendar_id: typeof row.calendar_id === "string" ? row.calendar_id : null,
  };
}

async function revalidateWatch(
  supabase: AdminClient,
  watch: WatchChannel,
): Promise<boolean> {
  // This read is inside admission and binds the exact owner/account/generation
  // tuple discovered earlier. Reassigned, stopped, or already-renewed rows do
  // not invoke a child or write a receipt for the stale owner.
  const query = watch.provider === "google-calendar"
    ? supabase.from("calendar_accounts").select(CALENDAR_SELECT)
      .eq("id", watch.id).eq("user_id", watch.user_id).eq(
        "watch_status",
        "active",
      )
      .eq("watch_expires_at", watch.expires_at)
    : supabase.from("gmail_watch_subscriptions").select(GMAIL_SELECT)
      .eq("id", watch.id).eq("user_id", watch.user_id).eq("status", "active")
      .eq("oauth_account_id", watch.account_id).eq(
        "watch_expires_at",
        watch.expires_at,
      );
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Watch renewal revalidation unavailable");
  if (!data) return false;
  const current = parseWatch(data, watch.provider);
  return Object.entries(watch).every(([key, value]) =>
    current[key as keyof WatchChannel] === value
  );
}

async function writeReceipt(
  supabase: AdminClient,
  watch: WatchChannel,
  status: "success" | "error",
  now: () => number,
): Promise<void> {
  const timestamp = new Date(now()).toISOString();
  const { error } = await supabase.from("sync_logs").insert({
    user_id: watch.user_id,
    provider: "google",
    service_type: watch.provider === "google-calendar" ? "calendar" : "gmail",
    operation: "watch_renewal",
    status,
    account_id: watch.account_id,
    error_message: status === "error"
      ? "Watch renewal completion was not verified"
      : null,
    started_at: timestamp,
    completed_at: timestamp,
  });
  if (error) throw new Error("Watch renewal receipt was not persisted");
}

async function renewWatch(
  supabase: AdminClient,
  watch: WatchChannel,
  now: () => number,
): Promise<void> {
  // Exactly one child invocation, no scheduler-level provider retries. Nested
  // functions must authenticate and admit their own canonical account owner.
  let succeeded = false;
  try {
    const result = watch.provider === "google-calendar"
      ? await supabase.functions.invoke("calendar-watch", {
        body: { action: "renew", calendarAccountId: watch.account_id },
      })
      : await supabase.functions.invoke("gmail-watch", {
        body: { action: "renew", accountId: watch.account_id },
      });
    succeeded = !result.error && result.data?.success === true;
  } catch {
    // Provider/transport errors may include secrets. Persist only a fixed code.
  }
  await writeReceipt(supabase, watch, succeeded ? "success" : "error", now);
  if (!succeeded) throw new Error("Watch renewal completion was not verified");
}

export function createWatchRenewalHandler(
  dependencies: WatchRenewalDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const url = dependencies.env("SUPABASE_URL");
    const serviceKey = dependencies.env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json({ error: "Watch renewal is unavailable" }, 503);
    }
    if (
      !isExactServiceRoleBearer(
        request.headers.get("authorization"),
        serviceKey,
      )
    ) {
      return json({ error: "Unauthorized" }, 401);
    }
    try {
      // Authentication precedes both privileged-client construction and bounded
      // discovery. A body cannot choose owners, account IDs, or batch limits.
      const supabase = dependencies.createAdminClient(url, serviceKey);
      const now = dependencies.now ?? Date.now;
      const calendarExpiry = new Date(now() + 24 * 60 * 60 * 1000)
        .toISOString();
      const gmailExpiry = new Date(now() + 6 * 24 * 60 * 60 * 1000)
        .toISOString();
      const { data: calendarRows, error: calendarError } = await supabase
        .from("calendar_accounts").select(CALENDAR_SELECT)
        .eq("watch_status", "active").not("watch_expires_at", "is", null)
        .lte("watch_expires_at", calendarExpiry)
        .order("watch_expires_at").order("id").limit(MAX_DISCOVERY_ROWS + 1);
      const { data: gmailRows, error: gmailError } = await supabase
        .from("gmail_watch_subscriptions").select(GMAIL_SELECT)
        .eq("status", "active").not("watch_expires_at", "is", null)
        .lt("watch_expires_at", gmailExpiry)
        .order("watch_expires_at").order("id").limit(MAX_DISCOVERY_ROWS + 1);
      if (
        calendarError || gmailError || !Array.isArray(calendarRows) ||
        !Array.isArray(gmailRows) ||
        calendarRows.length > MAX_DISCOVERY_ROWS + 1 ||
        gmailRows.length > MAX_DISCOVERY_ROWS + 1
      ) {
        throw new Error("Watch renewal discovery unavailable");
      }
      let renewalsScheduled = 0;
      let renewalErrors = 0;
      let migrationBlocked = 0;
      let admissionErrors = 0;
      let staleSkipped = 0;
      const processWatch = async (
        row: unknown,
        provider: WatchChannel["provider"],
      ) => {
        try {
          const watch = parseWatch(row, provider);
          const action = watch.provider === "google-calendar"
            ? "renew_calendar"
            : "renew_gmail";
          const admission = await runMindManualSubjectWork(
            "watch-renewal-cron",
            { subjectId: watch.user_id, action },
            async (lifecycle) => {
              if (!(await revalidateWatch(supabase, watch))) return "stale";
              // Child invocation and durable receipt are one admitted unit.
              const completion = renewWatch(supabase, watch, now);
              lifecycle.holdUntil(completion);
              await completion;
              return "renewed";
            },
            { env: dependencies.env, ...dependencies.admissionDependencies },
          );
          if (admission.kind === "blocked") migrationBlocked += 1;
          else if (admission.value === "stale") staleSkipped += 1;
          else renewalsScheduled += 1;
        } catch (error) {
          if (error instanceof MindManualAdmissionUnavailableError) {
            admissionErrors += 1;
          } else renewalErrors += 1;
        }
      };
      for (const row of calendarRows.slice(0, MAX_DISCOVERY_ROWS)) {
        await processWatch(row, "google-calendar");
      }
      for (const row of gmailRows.slice(0, MAX_DISCOVERY_ROWS)) {
        await processWatch(row, "gmail");
      }
      return json({
        message: "Bounded watch renewal batch completed",
        renewalsScheduled,
        renewalErrors,
        migrationBlocked,
        admissionErrors,
        staleSkipped,
        calendarWatches: Math.min(calendarRows.length, MAX_DISCOVERY_ROWS),
        gmailWatches: Math.min(gmailRows.length, MAX_DISCOVERY_ROWS),
        moreEligible: calendarRows.length > MAX_DISCOVERY_ROWS ||
          gmailRows.length > MAX_DISCOVERY_ROWS,
      }, admissionErrors > 0 || renewalErrors > 0 ? 503 : 200);
    } catch {
      return json({ error: "Watch renewal is unavailable" }, 503);
    }
  };
}
