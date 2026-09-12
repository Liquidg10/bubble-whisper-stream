import { verifyPlaidWebhook, PLAID_WEBHOOK_VERIFICATION_LIMITS, type VerifiedPlaidWebhook } from './plaidWebhookVerification.ts';
import type { MindManualScopeResolver } from './migrationWriteFence.ts';

type Row = Record<string, unknown>;
export interface PlaidItem { id: string; user_id: string; item_id: string }
export interface PlaidRuntime {
  rpc(name: string, params: Row): Promise<unknown>;
  findItem(itemId: string, owner?: string): Promise<PlaidItem | null>;
  provider(path: string, body: Row): Promise<Row>;
}
export interface PlaidWebhookContext { item: PlaidItem; webhook: Row; deliveryKey: string }
export const PLAID_REQUEST_BODY_TIMEOUT_MS = 5_000;
export class PlaidPipelineError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}
export function plaidResponse(body: Row, status = 200): Response {
  return Response.json(body, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
}
export function plaidFailure(error: unknown): Response {
  return error instanceof PlaidPipelineError
    ? plaidResponse({ error: error.code }, error.status)
    : plaidResponse({ error: 'PLAID_OPERATION_UNAVAILABLE' }, 503);
}
function record(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlaidPipelineError('PLAID_INVALID_RESPONSE');
  return value as Row;
}
function text(value: unknown, max = 512, status = 400): string {
  if (typeof value !== 'string' || !value || value.length > max || /[\x00-\x1f]/.test(value)) throw new PlaidPipelineError(status === 400 ? 'PLAID_INVALID_INPUT' : 'PLAID_INVALID_RESPONSE', status);
  return value;
}
function receiptUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new PlaidPipelineError('PLAID_INVALID_RECEIPT');
  return value;
}
async function boundedBody(req: Request): Promise<Uint8Array> {
  const reader = req.body?.getReader();
  if (!reader) throw new PlaidPipelineError('PLAID_INVALID_INPUT', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PlaidPipelineError('PLAID_BODY_TIMEOUT', 408)), PLAID_REQUEST_BODY_TIMEOUT_MS);
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]); if (next.done) break;
      size += next.value.length;
      if (size > PLAID_WEBHOOK_VERIFICATION_LIMITS.maxBodyBytes || chunks.length >= 4096) throw new PlaidPipelineError('PLAID_BODY_TOO_LARGE', 413);
      chunks.push(next.value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { clearTimeout(timer!); reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function plaidRequest(req: Request): Promise<Row> {
  if (req.method !== 'POST') throw new PlaidPipelineError('PLAID_METHOD_NOT_ALLOWED', 405);
  try { return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(req)))); }
  catch (error) { if (error instanceof PlaidPipelineError) throw error; throw new PlaidPipelineError('PLAID_INVALID_INPUT', 400); }
}

/** The body cannot supply owner, migration action, or a trusted child bearer. */
export function verifiedPlaidMindManualScope(
  runtime: PlaidRuntime,
  verify: (body: Uint8Array, header: string) => Promise<VerifiedPlaidWebhook> = verifyPlaidWebhook,
): MindManualScopeResolver<PlaidWebhookContext> {
  return async request => {
    try {
      if (request.method !== 'POST') return { kind: 'respond', response: plaidResponse({ error: 'PLAID_METHOD_NOT_ALLOWED' }, 405) };
      const bytes = await boundedBody(request);
      let proof: VerifiedPlaidWebhook;
      try { proof = await verify(bytes, request.headers.get('plaid-verification') ?? ''); }
      catch { return { kind: 'respond', response: plaidResponse({ error: 'PLAID_WEBHOOK_VERIFICATION_FAILED' }, 401) }; }
      const webhook = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      const itemId = text(webhook.item_id); text(webhook.webhook_type, 128); text(webhook.webhook_code, 128);
      const item = await runtime.findItem(itemId);
      if (!item || item.item_id !== itemId) throw new PlaidPipelineError('PLAID_ITEM_UNAVAILABLE', 404);
      // Body hash plus signed issuance distinguishes later identical update notifications.
      const deliveryKey = `${proof.keyId}:${proof.issuedAt}:${proof.requestBodySha256}`;
      return { kind: 'resolved', subjectId: item.user_id, action: 'verified_plaid_webhook', context: { item, webhook, deliveryKey } };
    } catch (error) { return { kind: 'respond', response: plaidFailure(error) }; }
  };
}
async function tokenFor(runtime: PlaidRuntime, item: PlaidItem): Promise<string> {
  const value = await runtime.rpc('mind_manual_plaid_token', { p_owner: item.user_id, p_item: item.id });
  if (typeof value !== 'string' || !value || value.length > 4096) throw new PlaidPipelineError('PLAID_VAULT_TOKEN_UNAVAILABLE');
  return value;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.length > 10000) throw new PlaidPipelineError('PLAID_INVALID_RESPONSE');
  return value.map(record);
}
function date(value: unknown): string {
  const result = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new PlaidPipelineError('PLAID_INVALID_DATE', 400);
  return result;
}
export async function syncPlaid(runtime: PlaidRuntime, item: PlaidItem, kind: 'accounts' | 'transactions', input: Row = {}): Promise<Row> {
  // Only exact owner/item Vault resolution can supply credentials; no plaintext fallback.
  const accessToken = await tokenFor(runtime, item);
  let data: Row[] = [];
  let start: string | undefined; let end: string | undefined;
  if (kind === 'accounts') data = rows((await runtime.provider('/accounts/get', { access_token: accessToken })).accounts);
  else {
    end = date(input.end_date ?? new Date().toISOString().slice(0, 10));
    start = date(input.start_date ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    if (start > end) throw new PlaidPipelineError('PLAID_INVALID_DATE', 400);
    for (let page = 0; page < 20; page++) {
      const response = await runtime.provider('/transactions/get', { access_token: accessToken, start_date: start, end_date: end, options: { offset: data.length, count: 500 } });
      const batch = rows(response.transactions);
      const total = response.total_transactions;
      if (!Number.isSafeInteger(total) || (total as number) < 0 || batch.length > 500) throw new PlaidPipelineError('PLAID_INVALID_RESPONSE');
      data.push(...batch);
      if (data.length >= (total as number)) break;
      if (!batch.length || page === 19) throw new PlaidPipelineError('PLAID_PAGINATION_INCOMPLETE');
    }
  }
  // The database rechecks and locks ownership, rejects foreign identifier collisions,
  // and commits the entire result and its sync receipt in one transaction.
  const count = await runtime.rpc('mind_manual_plaid_save_sync', { p_owner: item.user_id, p_item: item.id, p_kind: kind, p_rows: data });
  if (count !== data.length) throw new PlaidPipelineError('PLAID_SYNC_RECEIPT_MISMATCH');
  return { success: true, [`${kind}_synced`]: count, ...(kind === 'transactions' ? { date_range: { start_date: start, end_date: end } } : {}) };
}
export async function processPlaidWebhook(runtime: PlaidRuntime, context: PlaidWebhookContext): Promise<Response> {
  const { item, webhook, deliveryKey } = context;
  let receiptId: string | undefined; let claimToken: string | undefined;
  try {
    const claim = record(await runtime.rpc('mind_manual_plaid_claim_webhook', {
      p_owner: item.user_id, p_item: item.id, p_delivery: deliveryKey,
      p_type: webhook.webhook_type, p_code: webhook.webhook_code,
    }));
    if (claim.claimed !== true) {
      if (claim.processed === true) return plaidResponse({ success: true, duplicate: true });
      throw new PlaidPipelineError('PLAID_DELIVERY_RECONCILIATION_REQUIRED');
    }
    receiptId = receiptUuid(claim.receipt_id); claimToken = receiptUuid(claim.claim_token);
    if (webhook.webhook_type === 'TRANSACTIONS' && webhook.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      await syncPlaid(runtime, item, 'transactions');
    } else if (webhook.webhook_type === 'ACCOUNTS' && webhook.webhook_code === 'DEFAULT_UPDATE') {
      await syncPlaid(runtime, item, 'accounts');
    } else if (webhook.webhook_type === 'ITEM' && webhook.webhook_code === 'ERROR') {
      const error = webhook.error && typeof webhook.error === 'object' ? (webhook.error as Row).error_code : undefined;
      const recorded = await runtime.rpc('mind_manual_plaid_item_error', { p_owner: item.user_id, p_item: item.id, p_code: typeof error === 'string' && /^[A-Z_]{1,100}$/.test(error) ? error : 'PLAID_ITEM_ERROR' });
      if (recorded !== true) throw new PlaidPipelineError('PLAID_ITEM_ERROR_RECEIPT_MISMATCH');
    }
    const completed = await runtime.rpc('mind_manual_plaid_finish_webhook', { p_owner: item.user_id, p_receipt: receiptId, p_claim: claimToken, p_error: null });
    if (completed !== true) throw new PlaidPipelineError('PLAID_DELIVERY_RECEIPT_MISMATCH');
    return plaidResponse({ success: true });
  } catch (error) {
    if (receiptId && claimToken) {
      try { await runtime.rpc('mind_manual_plaid_finish_webhook', { p_owner: item.user_id, p_receipt: receiptId, p_claim: claimToken, p_error: 'PLAID_DELIVERY_INCOMPLETE' }); } catch { /* Preserve unknown receipt; no replay. */ }
    }
    return plaidFailure(error);
  }
}
export async function handlePlaidUserSync(request: Request, owner: string, runtime: PlaidRuntime, kind: 'accounts' | 'transactions'): Promise<Response> {
  try {
    const input = await plaidRequest(request); const itemId = text(input.item_id);
    const item = await runtime.findItem(itemId, owner);
    if (!item || item.user_id !== owner || item.item_id !== itemId) throw new PlaidPipelineError('PLAID_ITEM_UNAVAILABLE', 404);
    return plaidResponse(await syncPlaid(runtime, item, kind, input));
  } catch (error) { return plaidFailure(error); }
}
export async function handlePlaidExchange(request: Request, owner: string, runtime: PlaidRuntime): Promise<Response> {
  try {
    const input = await plaidRequest(request);
    const publicToken = text(input.public_token, 4096); const institution = text(input.institution_name, 256);
    const data = await runtime.provider('/item/public_token/exchange', { public_token: publicToken });
    const itemId = text(data.item_id, 512, 503); const accessToken = text(data.access_token, 4096, 503);
    const stored = await runtime.rpc('mind_manual_plaid_store_item', { p_owner: owner, p_external_item: itemId, p_token: accessToken, p_institution: institution });
    receiptUuid(stored);
    return plaidResponse({ success: true, item_id: itemId });
  } catch (error) { return plaidFailure(error); }
}
