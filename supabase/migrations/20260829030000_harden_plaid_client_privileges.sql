-- Keep Plaid credentials server-only.
--
-- The original safe-view migration created the least-privilege view but left
-- default SELECT grants on both the view and the credential-bearing base
-- table. Browser code now reads non-sensitive item metadata exclusively from
-- public.plaid_items_safe, so remove those unnecessary grants.

REVOKE ALL ON TABLE public.plaid_items FROM anon;
REVOKE SELECT, UPDATE ON TABLE public.plaid_items FROM authenticated;
REVOKE SELECT ON TABLE public.plaid_items_safe FROM anon;

-- A security-invoker view checks the caller's privileges on its underlying
-- relation. Grant only the non-secret columns exposed by the view; never grant
-- the access_token_secret_id credential pointer. The narrow UPDATE grant
-- preserves the existing client-side deactivate flow, whose RLS policy remains
-- owner-scoped.
GRANT SELECT (
  id,
  user_id,
  item_id,
  institution_name,
  is_active,
  created_at,
  updated_at
) ON TABLE public.plaid_items TO authenticated;
GRANT UPDATE (is_active) ON TABLE public.plaid_items TO authenticated;

-- Authenticated users retain the security-invoker view. Its predicate and the
-- base table's RLS both scope rows to auth.uid().
GRANT SELECT ON TABLE public.plaid_items_safe TO authenticated;

DO $$
BEGIN
  IF has_any_column_privilege('anon', 'public.plaid_items', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not SELECT any public.plaid_items column';
  END IF;

  IF has_table_privilege('authenticated', 'public.plaid_items', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not receive table-wide plaid_items SELECT';
  END IF;

  IF has_column_privilege(
    'authenticated',
    'public.plaid_items',
    'access_token_secret_id',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated must not SELECT Plaid credential columns';
  END IF;

  IF has_table_privilege('anon', 'public.plaid_items_safe', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not SELECT public.plaid_items_safe';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.plaid_items_safe', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must SELECT public.plaid_items_safe';
  END IF;
END
$$;

-- Executable invoker-role canary. Metadata-only ACL checks missed that a
-- security-invoker view also needs safe underlying-column grants.
SET ROLE authenticated;
SELECT id, user_id, item_id, institution_name, is_active, created_at, updated_at
FROM public.plaid_items_safe
LIMIT 0;
UPDATE public.plaid_items
SET is_active = is_active
WHERE item_id = '' AND false;
RESET ROLE;
