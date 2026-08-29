interface GoogleOAuthAccountReceipt {
  [key: string]: unknown;
  id?: unknown;
  account_email?: unknown;
  provider?: unknown;
  expires_at?: unknown;
  last_used_at?: unknown;
}

export function buildGoogleOAuthCompletion(
  savedAccount: GoogleOAuthAccountReceipt,
  scopes: string[],
): Record<string, unknown> {
  return {
    success: true,
    oauthAccountId: savedAccount.id,
    account: {
      id: savedAccount.id,
      email: savedAccount.account_email,
      provider: savedAccount.provider,
      expiresAt: savedAccount.expires_at,
      lastUsedAt: savedAccount.last_used_at,
    },
    scopes,
  };
}
