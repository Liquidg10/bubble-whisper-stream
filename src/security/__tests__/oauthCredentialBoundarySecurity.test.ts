import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('generic OAuth credential boundary', () => {
  const migration = readRepoFile(
    'supabase/migrations/20260829000003_harden_generic_oauth_credentials.sql',
  );

  it('revokes browser base-table operations and exposes metadata views only', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.oauth_accounts');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.oauth_tokens');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public.oauth_state');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('CREATE VIEW public.oauth_accounts_metadata');
    expect(migration).toContain('CREATE VIEW public.oauth_tokens_metadata');
    expect(migration).toContain('security_invoker = true');

    const accountMetadataView = migration.slice(
      migration.indexOf('CREATE VIEW public.oauth_accounts_metadata'),
      migration.indexOf('DROP VIEW IF EXISTS public.oauth_tokens_metadata'),
    );
    const tokenMetadataView = migration.slice(
      migration.indexOf('CREATE VIEW public.oauth_tokens_metadata'),
      migration.indexOf('REVOKE ALL PRIVILEGES ON TABLE public.oauth_accounts_metadata'),
    );
    expect(accountMetadataView).not.toContain('access_token');
    expect(accountMetadataView).not.toContain('refresh_token');
    expect(tokenMetadataView).not.toContain('access_token');
    expect(tokenMetadataView).not.toContain('refresh_token');
  });

  it('fails migration on legacy credentials and enforces oauth:v1 writes', () => {
    expect(migration).toContain("access_token !~ '^oauth:v1:");
    expect(migration).toContain("refresh_token !~ '^oauth:v1:");
    expect(migration).toContain('oauth_accounts_access_token_envelope_check');
    expect(migration).toContain('oauth_tokens_access_token_envelope_check');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.encrypt_oauth_token(text)');
  });

  it('removes provider credentials and local encryption from the browser contract', () => {
    const service = readRepoFile('src/services/oauthService.ts');
    const callback = readRepoFile('src/pages/AuthCallback.tsx');
    expect(service).toContain(".from('oauth_accounts_metadata')");
    expect(service).not.toContain(".from('oauth_accounts')");
    expect(service).not.toContain("localStorage.getItem('oauth-encryption-key')");
    expect(service).not.toContain('oauth2.googleapis.com/revoke?token=');
    expect(callback).toContain('if (isCalendarCallbackRoute)');
    expect(callback).not.toContain('isCalendarCallbackRoute && !window.opener');

    const accountInterface = service.slice(
      service.indexOf('export interface OAuthAccount'),
      service.indexOf('export interface ScopeRequest'),
    );
    expect(accountInterface).not.toContain('access_token');
    expect(accountInterface).not.toContain('refresh_token');
  });

  it('keeps every generic credential consumer on strict shared crypto', () => {
    for (const relativePath of [
      'supabase/functions/oauth-google-start/index.ts',
      'supabase/functions/oauth-google-callback/index.ts',
      'supabase/functions/oauth-google-refresh/index.ts',
      'supabase/functions/oauth-google-revoke/index.ts',
      'supabase/functions/gmail-sync/index.ts',
      'supabase/functions/gmail-compose/index.ts',
    ]) {
      const source = readRepoFile(relativePath);
      expect(source, relativePath).toContain('loadOAuthTokenEncryptionKey');
      expect(source, relativePath).toContain('decryptOAuthToken');
    }

    const tree = [
      'supabase/functions/oauth-google-callback/index.ts',
      'supabase/functions/oauth-google-refresh/index.ts',
      'supabase/functions/oauth-google-revoke/index.ts',
      'supabase/functions/gmail-sync/index.ts',
      'supabase/functions/gmail-compose/index.ts',
    ].map(readRepoFile).join('\n');
    expect(tree).not.toContain('default-oauth-encryption-key');
    expect(tree).not.toContain('return token;');

    const gmailCompose = readRepoFile('supabase/functions/gmail-compose/index.ts');
    expect(gmailCompose).toContain('requireAllowedGoogleOAuthOrigin');
    expect(gmailCompose).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it('retires the arbitrary legacy exchange and requires JWTs on replacements', () => {
    const retired = readRepoFile('supabase/functions/oauth-google/index.ts');
    const retiredScopeDecay = readRepoFile('supabase/functions/oauth-scope-decay/index.ts');
    const config = readRepoFile('supabase/config.toml');
    expect(retired).toContain('status: 410');
    expect(retired).toContain('OAUTH_ENDPOINT_RETIRED');
    expect(retiredScopeDecay).toContain('status: 410');
    expect(retiredScopeDecay).toContain('OAUTH_SCOPE_DECAY_RETIRED');
    expect(retiredScopeDecay).not.toContain(".from('oauth_accounts')");

    for (const functionName of [
      'oauth-google',
      'oauth-google-start',
      'oauth-google-callback',
      'oauth-google-refresh',
      'oauth-google-revoke',
      'oauth-scope-decay',
      'gmail-sync',
      'gmail-compose',
    ]) {
      expect(config).toMatch(
        new RegExp(`\\[functions\\.${functionName}\\]\\s*verify_jwt = true`),
      );
    }
  });
});
