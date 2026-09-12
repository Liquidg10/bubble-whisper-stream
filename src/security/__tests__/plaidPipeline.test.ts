import { describe, it, expect, vi } from 'vitest';
import { handlePlaidExchange, handlePlaidUserSync, processPlaidWebhook, syncPlaid, verifiedPlaidMindManualScope, type PlaidRuntime } from '../../../supabase/functions/_shared/plaidPipeline.ts';
import type { MindManualResolverRuntime } from '../../../supabase/functions/_shared/migrationWriteFence.ts';

const item = { id: '20000000-0000-4000-8000-000000000002', user_id: '10000000-0000-4000-8000-000000000001', item_id: 'item-fixture' };
const body = { item_id: item.item_id, user_id: 'attacker', webhook_type: 'ACCOUNTS', webhook_code: 'DEFAULT_UPDATE' };
const context = { item, webhook: body, deliveryKey: 'key:1780000000:' + 'a'.repeat(64) };
const request = (value = body) => new Request('https://example.invalid/webhook', { method: 'POST', body: JSON.stringify(value), headers: { 'plaid-verification': 'signed-fixture' } });
function setup() {
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>): Promise<unknown> => {
    if (name === 'mind_manual_plaid_token') return 'private-fixture-token';
    if (name === 'mind_manual_plaid_claim_webhook') return { claimed: true, receipt_id: 'exact-receipt', claim_token: 'exact-claim' };
    if (name === 'mind_manual_plaid_save_sync') return (params.p_rows as unknown[]).length;
    if (name === 'mind_manual_plaid_store_item') return item.id;
    return true;
  });
  const provider = vi.fn(async (_path: string, _body: Record<string, unknown>) => ({ accounts: [{ account_id: 'account', name: 'Fixture', type: 'depository', balances: {} }] }));
  const findItem = vi.fn(async () => item);
  return { rpc, provider, findItem } satisfies PlaidRuntime;
}
describe('Plaid verified owner pipeline', () => {
  it('rejects invalid signatures before lookup, lease resolution, or writes', async () => {
    const runtime = setup(); const verify = vi.fn(async () => { throw new Error('untrusted provider detail'); });
    const result = await verifiedPlaidMindManualScope(runtime, verify)(request(), {} as MindManualResolverRuntime);
    expect(result.kind).toBe('respond'); if (result.kind === 'respond') expect(result.response.status).toBe(401);
    expect(runtime.findItem).not.toHaveBeenCalled(); expect(runtime.rpc).not.toHaveBeenCalled(); expect(runtime.provider).not.toHaveBeenCalled();
  });
  it('derives the owner only after verifying exact raw bytes and signed identity', async () => {
    const runtime = setup(); const verify = vi.fn(async (_bytes: Uint8Array, _header: string) => ({ keyId: 'key', issuedAt: 1780000000, requestBodySha256: 'a'.repeat(64) }));
    const result = await verifiedPlaidMindManualScope(runtime, verify)(request(), {} as MindManualResolverRuntime);
    expect(result.kind).toBe('resolved'); if (result.kind === 'resolved') { expect(result.subjectId).toBe(item.user_id); expect(result.action).toBe('verified_plaid_webhook'); expect(result.context.deliveryKey).toBe(context.deliveryKey); }
    expect(new TextDecoder().decode(verify.mock.calls[0][0])).toBe(JSON.stringify(body));
    expect(runtime.rpc).not.toHaveBeenCalled();
  });
  it('rejects excessive bytes before verifier/provider calls', async () => {
    const runtime = setup(); const verify = vi.fn();
    const result = await verifiedPlaidMindManualScope(runtime, verify)(new Request('https://example.invalid', { method: 'POST', body: 'x'.repeat(262145) }), {} as MindManualResolverRuntime);
    expect(result.kind).toBe('respond'); if (result.kind === 'respond') expect(result.response.status).toBe(413);
    expect(verify).not.toHaveBeenCalled(); expect(runtime.findItem).not.toHaveBeenCalled();
  });
  it('does not sync foreign owner items or expose upstream errors', async () => {
    const runtime = setup();
    const response = await handlePlaidUserSync(request(), 'another-owner', runtime, 'accounts');
    expect(response.status).toBe(404); expect(runtime.findItem).toHaveBeenCalledWith(item.item_id, 'another-owner'); expect(runtime.rpc).not.toHaveBeenCalled(); expect(runtime.provider).not.toHaveBeenCalled();
  });
  it('does not call provider when Vault lookup is unavailable', async () => {
    const runtime = setup(); runtime.rpc.mockResolvedValue(null);
    await expect(syncPlaid(runtime, item, 'accounts')).rejects.toThrow('PLAID_VAULT_TOKEN_UNAVAILABLE'); expect(runtime.provider).not.toHaveBeenCalled();
  });
  it('awaits sync and exact receipt completion', async () => {
    const runtime = setup(); const response = await processPlaidWebhook(runtime, context);
    expect(response.status).toBe(200);
    expect(runtime.rpc.mock.calls.map(c => c[0])).toEqual(['mind_manual_plaid_claim_webhook', 'mind_manual_plaid_token', 'mind_manual_plaid_save_sync', 'mind_manual_plaid_finish_webhook']);
    expect(runtime.rpc.mock.calls.at(-1)?.[1]).toEqual({ p_owner: item.user_id, p_receipt: 'exact-receipt', p_claim: 'exact-claim', p_error: null });
    expect(JSON.stringify(await response.json())).not.toContain('private-fixture-token');
  });
  it.each([false,true])('never reruns a duplicate delivery, processed=%s', async processed => {
    const runtime = setup(); runtime.rpc.mockResolvedValue({ claimed: false, processed });
    const response = await processPlaidWebhook(runtime, context);
    expect(response.status).toBe(processed ? 200 : 503); expect(runtime.provider).not.toHaveBeenCalled(); expect(runtime.rpc).toHaveBeenCalledTimes(1);
  });
  it('fails before sync when durable claim insertion fails', async () => {
    const runtime = setup(); runtime.rpc.mockRejectedValue(new Error('database secret detail'));
    const response = await processPlaidWebhook(runtime, context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret'); expect(runtime.provider).not.toHaveBeenCalled();
  });
  it('marks only its exact delivery failed when sync rejects', async () => {
    const runtime = setup(); runtime.provider.mockRejectedValue(new Error('provider secret detail'));
    const response = await processPlaidWebhook(runtime, context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
    expect(runtime.rpc.mock.calls.at(-1)?.[1]).toEqual({ p_owner: item.user_id, p_receipt: 'exact-receipt', p_claim: 'exact-claim', p_error: 'PLAID_DELIVERY_INCOMPLETE' });
  });
  it('uses Plaid options pagination and refuses incomplete data before saving', async () => {
    const runtime = setup(); runtime.provider.mockResolvedValue({ transactions: [], total_transactions: 10 } as never);
    await expect(syncPlaid(runtime, item, 'transactions')).rejects.toThrow('PLAID_PAGINATION_INCOMPLETE');
    expect(runtime.provider.mock.calls[0][1]).toMatchObject({ options: { offset: 0, count: 500 } });
    expect(runtime.rpc.mock.calls.map(c => c[0])).toEqual(['mind_manual_plaid_token']);
  });
  it('requires a matching committed row count', async () => {
    const runtime = setup(); runtime.rpc.mockImplementation(async name => name === 'mind_manual_plaid_token' ? 'token' : 0);
    await expect(syncPlaid(runtime, item, 'accounts')).rejects.toThrow('PLAID_SYNC_RECEIPT_MISMATCH');
  });
  it('stores an exchange token only through owner-bound Vault transaction', async () => {
    const runtime = setup(); runtime.provider.mockResolvedValue({ item_id: item.item_id, access_token: 'secret-access-token' } as never);
    const response = await handlePlaidExchange(request({ public_token: 'public-token', institution_name: 'Bank' } as never), item.user_id, runtime);
    expect(response.status).toBe(200); expect(await response.text()).not.toContain('secret-access-token');
    expect(runtime.rpc).toHaveBeenCalledWith('mind_manual_plaid_store_item', { p_owner: item.user_id, p_external_item: item.item_id, p_token: 'secret-access-token', p_institution: 'Bank' });
  });
});
