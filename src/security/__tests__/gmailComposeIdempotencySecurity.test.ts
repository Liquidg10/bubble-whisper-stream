import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Gmail compose durable idempotency wiring', () => {
  it('reserves the per-user receipt before the first Gmail provider fetch', () => {
    const source = readRepoFile('supabase/functions/gmail-compose/index.ts');
    const mutationHandler = source.indexOf('async function executeMutation');
    const reservation = source.indexOf('const reservation = await reserveReceipt', mutationHandler);
    const providerAttempt = source.indexOf('const attempt = await fetchWithRefresh', mutationHandler);

    expect(mutationHandler).toBeGreaterThan(-1);
    expect(reservation).toBeGreaterThan(mutationHandler);
    expect(providerAttempt).toBeGreaterThan(reservation);
    expect(source).toContain('.eq("user_id", input.userId)');
    expect(source).toContain('.eq("user_id", user.id)');
  });

  it('keeps receipts server-only and binds account ownership in the database', () => {
    const migration = readRepoFile(
      'supabase/migrations/20260829000001_gmail_compose_idempotency_receipts.sql',
    );

    expect(migration).toContain('UNIQUE (user_id, idempotency_key)');
    expect(migration).toContain('FOREIGN KEY (account_id, user_id)');
    expect(migration).toContain('REFERENCES public.oauth_accounts(id, user_id)');
    expect(migration).toContain('ALTER TABLE public.gmail_compose_receipts ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.gmail_compose_receipts');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  });

  it('keeps platform JWT verification enabled for gmail-compose', () => {
    const config = readRepoFile('supabase/config.toml');
    expect(config).toMatch(/\[functions\.gmail-compose\]\s*verify_jwt = true/);
  });
});
