export const GMAIL_WATCH_SCOPES = new Set([
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
]);

export type GmailWatchAction = "start" | "renew" | "stop";

export interface GmailPubSubNotification {
  messageId: string;
  publishTime: string | null;
  subscription: string;
  emailAddress: string;
  historyId: string;
}

export type HistoryCursorDecision = "bootstrap_required" | "stale" | "advance";

export class GmailWatchProtocolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function containsAsciiControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function decodeBase64Url(value: string): string {
  if (!value || value.length > 8192 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new GmailWatchProtocolError(
      "Pub/Sub message data is not valid base64url",
      "PUBSUB_DATA_INVALID",
    );
  }

  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GmailWatchProtocolError(
      "Pub/Sub message data could not be decoded",
      "PUBSUB_DATA_INVALID",
    );
  }
}

export function normalizeEmailAddress(value: unknown): string {
  if (typeof value !== "string") {
    throw new GmailWatchProtocolError(
      "Gmail notification is missing an email address",
      "PUBSUB_EMAIL_INVALID",
    );
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    containsAsciiControlCharacters(normalized) ||
    !/^[^\s@]+@[^\s@]+$/.test(normalized)
  ) {
    throw new GmailWatchProtocolError(
      "Gmail notification contains an invalid email address",
      "PUBSUB_EMAIL_INVALID",
    );
  }
  return normalized;
}

export function normalizeHistoryId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]{1,32}$/.test(value)) {
    throw new GmailWatchProtocolError(
      "Gmail notification contains an invalid history ID",
      "PUBSUB_HISTORY_ID_INVALID",
    );
  }
  return value.replace(/^0+(?=\d)/, "");
}

export function compareHistoryIds(left: string, right: string): number {
  const normalizedLeft = normalizeHistoryId(left);
  const normalizedRight = normalizeHistoryId(right);
  const leftNumber = BigInt(normalizedLeft);
  const rightNumber = BigInt(normalizedRight);
  return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
}

export function classifyHistoryCursor(
  storedHistoryId: string | null | undefined,
  notificationHistoryId: string,
): HistoryCursorDecision {
  const normalizedNotification = normalizeHistoryId(notificationHistoryId);
  if (!storedHistoryId) return "bootstrap_required";
  return compareHistoryIds(normalizedNotification, storedHistoryId) <= 0
    ? "stale"
    : "advance";
}

export function parseGmailPubSubEnvelope(
  value: unknown,
  expectedSubscription: string,
): GmailPubSubNotification {
  if (
    !expectedSubscription ||
    !/^projects\/[^/]+\/subscriptions\/[^/]+$/.test(expectedSubscription)
  ) {
    throw new GmailWatchProtocolError(
      "GMAIL_PUBSUB_SUBSCRIPTION is not configured correctly",
      "PUBSUB_SUBSCRIPTION_CONFIG_INVALID",
    );
  }
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new GmailWatchProtocolError(
      "Request is not a Pub/Sub push envelope",
      "PUBSUB_ENVELOPE_INVALID",
    );
  }

  const subscription = value.subscription;
  const messageId = value.message.messageId ?? value.message.message_id;
  const publishTime = value.message.publishTime ?? value.message.publish_time ??
    null;
  const data = value.message.data;

  if (subscription !== expectedSubscription) {
    throw new GmailWatchProtocolError(
      "Pub/Sub subscription does not match the configured subscription",
      "PUBSUB_SUBSCRIPTION_MISMATCH",
    );
  }
  if (
    typeof messageId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(messageId)
  ) {
    throw new GmailWatchProtocolError(
      "Pub/Sub message ID is invalid",
      "PUBSUB_MESSAGE_ID_INVALID",
    );
  }
  if (
    publishTime !== null &&
    (typeof publishTime !== "string" ||
      !Number.isFinite(Date.parse(publishTime)))
  ) {
    throw new GmailWatchProtocolError(
      "Pub/Sub publish time is invalid",
      "PUBSUB_PUBLISH_TIME_INVALID",
    );
  }
  if (typeof data !== "string") {
    throw new GmailWatchProtocolError(
      "Pub/Sub message data is missing",
      "PUBSUB_DATA_INVALID",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(data));
  } catch (error) {
    if (error instanceof GmailWatchProtocolError) throw error;
    throw new GmailWatchProtocolError(
      "Pub/Sub message data is not valid JSON",
      "PUBSUB_DATA_INVALID",
    );
  }
  if (!isRecord(payload)) {
    throw new GmailWatchProtocolError(
      "Gmail notification payload is invalid",
      "PUBSUB_DATA_INVALID",
    );
  }

  return {
    messageId,
    publishTime: typeof publishTime === "string" ? publishTime : null,
    subscription,
    emailAddress: normalizeEmailAddress(payload.emailAddress),
    historyId: normalizeHistoryId(payload.historyId),
  };
}

export function isPubSubEnvelopeCandidate(value: unknown): boolean {
  return isRecord(value) && ("message" in value || "subscription" in value);
}

export function normalizeGmailWatchAction(
  action: unknown,
  legacyOperation: unknown,
): GmailWatchAction | null {
  if (
    action !== undefined &&
    legacyOperation !== undefined &&
    action !== legacyOperation
  ) {
    return null;
  }
  const candidate = action ?? legacyOperation;
  return candidate === "start" || candidate === "renew" || candidate === "stop"
    ? candidate
    : null;
}

export function normalizeOAuthAccountId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(normalized)
    ? normalized
    : null;
}

export function collectOAuthScopes(
  account: Record<string, unknown>,
): Set<string> {
  const scopes = new Set<string>();
  if (typeof account.scopes_string === "string") {
    for (const scope of account.scopes_string.split(/\s+/)) {
      if (scope) scopes.add(scope);
    }
  }
  if (Array.isArray(account.scopes)) {
    for (const scope of account.scopes) {
      if (typeof scope === "string" && scope) scopes.add(scope);
    }
  }
  return scopes;
}

export function hasGmailWatchCapability(
  account: Record<string, unknown>,
): boolean {
  if (account.provider !== "google" && account.provider !== "gmail") {
    return false;
  }
  return [...collectOAuthScopes(account)].some((scope) =>
    GMAIL_WATCH_SCOPES.has(scope)
  );
}

export function requireGmailPubSubTopic(
  topicName: string | undefined,
  expectedProjectId: string | undefined,
): string {
  const match = topicName?.match(
    /^projects\/([a-z][a-z0-9-]{4,61}[a-z0-9])\/topics\/([A-Za-z][A-Za-z0-9._~-]{2,254})$/,
  );
  if (!match) {
    throw new GmailWatchProtocolError(
      "GMAIL_PUBSUB_TOPIC must be a fully qualified Pub/Sub topic",
      "PUBSUB_TOPIC_CONFIG_INVALID",
    );
  }
  if (expectedProjectId && match[1] !== expectedProjectId) {
    throw new GmailWatchProtocolError(
      "The Pub/Sub topic project must match GOOGLE_CLOUD_PROJECT_ID",
      "PUBSUB_TOPIC_PROJECT_MISMATCH",
    );
  }
  return topicName!;
}

export function buildGmailWatchRequest(
  topicName: string,
  labelIds: string[] = ["INBOX"],
): Record<string, unknown> {
  return {
    topicName,
    labelIds,
    labelFilterBehavior: "INCLUDE",
  };
}
