import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { PlaidPipelineError, type PlaidItem, type PlaidRuntime } from './plaidPipeline.ts';

const paths = new Set(['/accounts/get', '/transactions/get', '/item/public_token/exchange']);
/** Service credentials never reach a child HTTP handler or browser response. */
export function createPlaidRuntime(): PlaidRuntime {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
  return {
    async rpc(name, params) {
      const { data, error } = await supabase.rpc(name, params);
      if (error) throw new PlaidPipelineError('PLAID_DATABASE_UNAVAILABLE');
      return data;
    },
    async findItem(itemId, owner) {
      let query = supabase.from('plaid_items').select('id,user_id,item_id').eq('item_id', itemId).eq('is_active', true);
      if (owner) query = query.eq('user_id', owner);
      const { data, error } = await query.maybeSingle();
      if (error) throw new PlaidPipelineError('PLAID_DATABASE_UNAVAILABLE');
      return data as PlaidItem | null;
    },
    async provider(path, body) {
      if (!paths.has(path)) throw new PlaidPipelineError('PLAID_INVALID_ROUTE');
      const client = Deno.env.get('PLAID_CLIENT_ID'); const secret = Deno.env.get('PLAID_SECRET');
      if (!client || !secret) throw new PlaidPipelineError('PLAID_PROVIDER_UNCONFIGURED');
      const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 20_000);
      try {
        const response = await fetch(`https://production.plaid.com${path}`, { method: 'POST', redirect: 'error', signal: abort.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, client_id: client, secret }) });
        if (!response.ok || !response.body) { void response.body?.cancel().catch(() => {}); throw new PlaidPipelineError('PLAID_PROVIDER_UNAVAILABLE'); }
        const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        try {
          for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length;
            if (size > 8 * 1024 * 1024 || chunks.length >= 16384) throw new PlaidPipelineError('PLAID_PROVIDER_RESPONSE_TOO_LARGE');
            chunks.push(next.value);
          }
        } catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PlaidPipelineError('PLAID_INVALID_RESPONSE');
        return data;
      } catch { throw new PlaidPipelineError('PLAID_PROVIDER_UNAVAILABLE'); }
      finally { clearTimeout(timer); }
    },
  };
}
