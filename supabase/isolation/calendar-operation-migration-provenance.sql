-- MANUAL, COORDINATED INSTALL ONLY. Original registry then source-write-fence
-- must already exist. This preserves all historical rows with NULL provenance;
-- NULL means unknown, never permission to infer or release an old lease.
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL lock_timeout = '5s';
SELECT singleton FROM mind_manual_migration.control WHERE singleton FOR UPDATE;

CREATE FUNCTION mind_manual_calendar.valid_migration_admission(v jsonb, owner_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT coalesce(jsonb_typeof(v) = 'object' AND
   (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) =
     ARRAY['action','functionName','generation','leaseId','subjectId'] AND
   v->>'functionName' = 'calendar-sync' AND v->>'action' = 'user_confirm_reviewed_update' AND
   v->>'subjectId' = owner_id::text AND jsonb_typeof(v->'generation') = 'string' AND
   v->>'generation' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' AND
   jsonb_typeof(v->'leaseId') = 'string' AND
   v->>'leaseId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false);
$$;

ALTER TABLE mind_manual_calendar.operations ADD COLUMN migration_admission jsonb
 CHECK (migration_admission IS NULL OR mind_manual_calendar.valid_migration_admission(migration_admission, owner_user_id));
COMMENT ON COLUMN mind_manual_calendar.operations.migration_admission IS
 'Immutable original source admission tuple. Historical NULL is unknown. Export/copy preserves it; read/replay/finalize never creates, rewrites or releases its lease.';

CREATE FUNCTION public.calendar_operation_claim_scoped(p_owner uuid, p_identity jsonb, p_admission jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r mind_manual_calendar.operations; selected boolean; phase_value text;
BEGIN
  IF p_owner IS NULL OR p_owner = '00000000-0000-0000-0000-000000000000' OR
     NOT mind_manual_calendar.valid_identity(p_identity) THEN
    RAISE EXCEPTION 'Invalid Calendar operation' USING ERRCODE = '22023';
  END IF;
  SELECT phase INTO STRICT phase_value FROM mind_manual_migration.control WHERE singleton FOR SHARE;
  SELECT EXISTS (SELECT 1 FROM mind_manual_migration.subjects WHERE user_id=p_owner) INTO selected;
  IF selected THEN
    IF NOT mind_manual_calendar.valid_migration_admission(p_admission, p_owner) OR
       NOT EXISTS (SELECT 1 FROM mind_manual_migration.edge_leases e
         WHERE e.lease_id=(p_admission->>'leaseId')::uuid AND e.subject_id=p_owner
           AND e.function_name=p_admission->>'functionName' AND e.action=p_admission->>'action'
           AND e.generation=p_admission->>'generation') THEN
      RAISE EXCEPTION 'Calendar original admission unavailable' USING ERRCODE = '55000';
    END IF;
  ELSIF p_admission IS NOT NULL THEN
    RAISE EXCEPTION 'Calendar unexpected original admission' USING ERRCODE = '55000';
  END IF;
  -- No replay may attach its newer admission tuple to an older operation.
  INSERT INTO mind_manual_calendar.operations(owner_user_id, operation_id, identity, migration_admission)
    VALUES(p_owner, (p_identity->>'operationId')::uuid, p_identity, p_admission)
    ON CONFLICT DO NOTHING RETURNING * INTO r;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false); END IF;
  RETURN jsonb_build_object('claimed', true, 'claimToken', r.claim_token);
END;
$$;

REVOKE ALL ON FUNCTION mind_manual_calendar.valid_migration_admission(jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calendar_operation_claim(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.calendar_operation_claim_scoped(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_operation_claim_scoped(uuid,jsonb,jsonb) TO service_role;
COMMIT;
