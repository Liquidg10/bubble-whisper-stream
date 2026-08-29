-- Keep Plaid credentials server-only.
--
-- The original safe-view migration created the least-privilege view but left
-- default SELECT grants on both the view and the credential-bearing base
-- table. Browser code now reads non-sensitive item metadata exclusively from
-- public.plaid_items_safe, so remove those unnecessary grants.

REVOKE SELECT ON TABLE public.plaid_items FROM anon, authenticated;
REVOKE SELECT ON TABLE public.plaid_items_safe FROM anon;

-- Authenticated users retain the security-invoker view. Its WHERE predicate
-- and the base table's RLS both scope rows to auth.uid().
GRANT SELECT ON TABLE public.plaid_items_safe TO authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.plaid_items', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not SELECT public.plaid_items';
  END IF;

  IF has_table_privilege('authenticated', 'public.plaid_items', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not SELECT public.plaid_items';
  END IF;

  IF has_table_privilege('anon', 'public.plaid_items_safe', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not SELECT public.plaid_items_safe';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.plaid_items_safe', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must SELECT public.plaid_items_safe';
  END IF;
END
$$;
