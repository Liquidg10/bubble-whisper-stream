-- MANUAL, OWNER-GATED INSTALL ONLY. Not part of automatic migrations or cutover.
-- Adds an empty service-only receipt registry. Does not enable Calendar writes.
-- One-time install: existing objects cause rollback instead of being overwritten.
BEGIN;
CREATE SCHEMA mind_manual_calendar;
REVOKE ALL ON SCHEMA mind_manual_calendar FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION mind_manual_calendar.valid_identity(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE k text;
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) AS key) IS DISTINCT FROM
    ARRAY['afterDigest','calendarAccountId','eventId','expectedEtag','googleCalendarId','operationId','requestDigest','taskId'] THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['operationId','taskId','calendarAccountId','eventId','googleCalendarId','expectedEtag','requestDigest','afterDigest'] LOOP
    IF jsonb_typeof(v->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  END LOOP;
  RETURN coalesce(
    (v->>'operationId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
    (v->>'operationId') <> '00000000-0000-0000-0000-000000000000' AND
    (v->>'calendarAccountId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
    (v->>'calendarAccountId') <> '00000000-0000-0000-0000-000000000000' AND
    (v->>'taskId') ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$' AND
    (v->>'eventId') ~ '^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$' AND
    length(v->>'googleCalendarId') BETWEEN 1 AND 1024 AND
    (v->>'googleCalendarId') !~ '[[:space:][:cntrl:]]' AND
    (v->>'googleCalendarId') NOT IN ('primary','all','*') AND
    length(v->>'expectedEtag') BETWEEN 3 AND 258 AND (v->>'expectedEtag') ~ '^"[A-Za-z0-9_-]+"$' AND
    (v->>'requestDigest') ~ '^[a-f0-9]{64}$' AND (v->>'afterDigest') ~ '^[a-f0-9]{64}$', false);
END;
$$;

CREATE FUNCTION mind_manual_calendar.valid_result(v jsonb, expected_etag text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE keys text[];
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(v) AS key;
  IF keys = ARRAY['code','outcome'] THEN
    RETURN coalesce((v->>'outcome' = 'uncertain' AND v->>'code' = 'provider_outcome_unknown') OR
      (v->>'outcome' = 'not_written' AND v->>'code' IN ('disabled','unauthenticated','invalid_request',
        'account_unavailable','write_permission_required','authorization_expired','event_unavailable',
        'event_not_supported','stale_review','no_changes','provider_rejected','provider_unavailable')), false);
  END IF;
  IF keys = ARRAY['cacheUpdated','etag','outcome'] THEN
    RETURN coalesce(jsonb_typeof(v->'etag') = 'string' AND length(v->>'etag') BETWEEN 3 AND 258 AND (v->>'etag') ~ '^"[A-Za-z0-9_-]+"$' AND
      v->>'etag' <> expected_etag AND
      ((v->>'outcome' = 'written' AND v->'cacheUpdated' = 'true'::jsonb) OR
       (v->>'outcome' = 'provider_written_cache_unknown' AND v->'cacheUpdated' = 'false'::jsonb)), false);
  END IF;
  RETURN false;
END;
$$;

CREATE TABLE mind_manual_calendar.operations (
  owner_user_id uuid NOT NULL CHECK (owner_user_id <> '00000000-0000-0000-0000-000000000000'),
  operation_id uuid NOT NULL,
  identity jsonb NOT NULL CHECK (mind_manual_calendar.valid_identity(identity)),
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','written','not_written','uncertain','provider_written')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at bigint,
  result jsonb,
  PRIMARY KEY (owner_user_id, operation_id),
  CHECK (operation_id = (identity->>'operationId')::uuid),
  CHECK ((state = 'pending' AND completed_at IS NULL AND result IS NULL) OR
    (state <> 'pending' AND completed_at IS NOT NULL AND completed_at >= 0 AND result IS NOT NULL AND
      mind_manual_calendar.valid_result(result, identity->>'expectedEtag') AND
      state = CASE result->>'outcome' WHEN 'provider_written_cache_unknown' THEN 'provider_written' ELSE result->>'outcome' END))
);
-- Two account rows pointing to the same actual provider calendar cannot bypass a hold.
CREATE UNIQUE INDEX calendar_operation_active_event ON mind_manual_calendar.operations
  (owner_user_id, (identity->>'googleCalendarId'), (identity->>'eventId'))
  WHERE state NOT IN ('written','not_written');
ALTER TABLE mind_manual_calendar.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_manual_calendar.operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mind_manual_calendar.operations FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE mind_manual_calendar.operations IS
  'Server-only immutable operation identities. No account/auth foreign-key cascade, timeout, takeover, reset, automatic retention or pruning. Deletion and migration need a separate owner-approved policy.';

CREATE FUNCTION mind_manual_calendar.serialized(r mind_manual_calendar.operations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('ownerUserId', r.owner_user_id, 'identity', r.identity,
    'state', r.state, 'completedAt', r.completed_at, 'result', r.result);
$$;

CREATE FUNCTION public.calendar_operation_claim(p_owner uuid, p_identity jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r mind_manual_calendar.operations;
BEGIN
  IF p_owner IS NULL OR p_owner = '00000000-0000-0000-0000-000000000000' OR
    NOT mind_manual_calendar.valid_identity(p_identity) THEN RAISE EXCEPTION 'Invalid Calendar operation' USING ERRCODE = '22023'; END IF;
  -- An insertion loser never receives a claim nonce, even for an identical replay.
  INSERT INTO mind_manual_calendar.operations (owner_user_id, operation_id, identity)
    VALUES (p_owner, (p_identity->>'operationId')::uuid, p_identity)
    ON CONFLICT DO NOTHING RETURNING * INTO r;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false); END IF;
  RETURN jsonb_build_object('claimed', true, 'claimToken', r.claim_token);
END;
$$;

CREATE FUNCTION public.calendar_operation_read(p_owner uuid, p_identity jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r mind_manual_calendar.operations;
BEGIN
  IF p_owner IS NULL OR p_owner = '00000000-0000-0000-0000-000000000000' OR
    NOT mind_manual_calendar.valid_identity(p_identity) THEN RAISE EXCEPTION 'Invalid Calendar operation' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM mind_manual_calendar.operations
    WHERE owner_user_id = p_owner AND operation_id = (p_identity->>'operationId')::uuid AND identity = p_identity;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN mind_manual_calendar.serialized(r);
END;
$$;

CREATE FUNCTION public.calendar_operation_finalize(p_owner uuid, p_identity jsonb, p_claim_token uuid, p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r mind_manual_calendar.operations;
BEGIN
  IF p_owner IS NULL OR p_owner = '00000000-0000-0000-0000-000000000000' OR p_claim_token IS NULL OR
    NOT mind_manual_calendar.valid_identity(p_identity) OR
    NOT mind_manual_calendar.valid_result(p_result, p_identity->>'expectedEtag') THEN
    RAISE EXCEPTION 'Invalid Calendar operation' USING ERRCODE = '22023';
  END IF;
  UPDATE mind_manual_calendar.operations SET
    state = CASE p_result->>'outcome' WHEN 'provider_written_cache_unknown' THEN 'provider_written' ELSE p_result->>'outcome' END,
    result = p_result, completed_at = floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
    WHERE owner_user_id = p_owner AND operation_id = (p_identity->>'operationId')::uuid AND identity = p_identity AND
      claim_token = p_claim_token AND state = 'pending'
    RETURNING * INTO r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN mind_manual_calendar.serialized(r);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mind_manual_calendar FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calendar_operation_claim(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calendar_operation_read(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calendar_operation_finalize(uuid,jsonb,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_operation_claim(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.calendar_operation_read(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.calendar_operation_finalize(uuid,jsonb,uuid,jsonb) TO service_role;
COMMIT;
