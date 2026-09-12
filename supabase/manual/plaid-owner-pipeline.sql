-- Manual engineering artifact: review/install with the owner migration plan,
-- before its Edge handlers. No production installation is implicit.
-- Vault API: https://supabase.com/docs/guides/database/vault
-- No legacy plaintext token is read, copied or guessed by this contract.
BEGIN;
ALTER TABLE public.plaid_items ADD COLUMN IF NOT EXISTS access_token_secret_id uuid;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plaid_items' AND column_name='access_token') THEN
    ALTER TABLE public.plaid_items ALTER COLUMN access_token DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE public.plaid_webhooks ADD COLUMN IF NOT EXISTS delivery_key text;
ALTER TABLE public.plaid_webhooks ADD COLUMN IF NOT EXISTS execution_claim uuid;
CREATE UNIQUE INDEX IF NOT EXISTS plaid_verified_delivery_key ON public.plaid_webhooks(delivery_key) WHERE delivery_key IS NOT NULL;

CREATE FUNCTION public.mind_manual_plaid_token(p_owner uuid, p_item uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text;
BEGIN
  SELECT v.decrypted_secret INTO token FROM public.plaid_items i
    JOIN vault.decrypted_secrets v ON v.id=i.access_token_secret_id
    WHERE i.id=p_item AND i.user_id=p_owner AND i.is_active;
  IF token IS NULL OR length(token) NOT BETWEEN 1 AND 4096 THEN RAISE EXCEPTION 'Plaid Vault token unavailable' USING ERRCODE='42501'; END IF;
  RETURN token;
END $$;

CREATE FUNCTION public.mind_manual_plaid_store_item(p_owner uuid,p_external_item text,p_token text,p_institution text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item uuid; secret_id uuid;
BEGIN
  IF p_owner IS NULL OR length(p_external_item) NOT BETWEEN 1 AND 512 OR length(p_token) NOT BETWEEN 1 AND 4096
     OR length(p_institution) NOT BETWEEN 1 AND 256 OR p_external_item IS NULL OR p_token IS NULL OR p_institution IS NULL THEN
    RAISE EXCEPTION 'Invalid Plaid item' USING ERRCODE='22023';
  END IF;
  -- Insert, rather than upsert, forbids replacing another owner's linked item.
  -- Vault creation and item insertion roll back together on any conflict.
  secret_id := vault.create_secret(p_token);
  INSERT INTO public.plaid_items(user_id,item_id,access_token_secret_id,institution_name)
    VALUES(p_owner,p_external_item,secret_id,p_institution) RETURNING id INTO item;
  RETURN item;
END $$;

CREATE FUNCTION public.mind_manual_plaid_save_sync(p_owner uuid,p_item uuid,p_kind text,p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; status_count integer;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('accounts','transactions') OR p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>10000 THEN
    RAISE EXCEPTION 'Invalid Plaid sync' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.plaid_items WHERE id=p_item AND user_id=p_owner AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plaid owner mismatch' USING ERRCODE='42501'; END IF;
  IF p_kind='accounts' THEN
    INSERT INTO public.plaid_accounts(account_id,plaid_item_id,user_id,name,official_name,type,subtype,balances)
      SELECT x.account_id,p_item,p_owner,x.name,x.official_name,x.type,x.subtype,x.balances
      FROM jsonb_to_recordset(p_rows) AS x(account_id text,name text,official_name text,type text,subtype text,balances jsonb)
      ON CONFLICT(account_id) DO UPDATE SET name=excluded.name,official_name=excluded.official_name,
        type=excluded.type,subtype=excluded.subtype,balances=excluded.balances
        WHERE plaid_accounts.user_id=p_owner AND plaid_accounts.plaid_item_id=p_item;
  ELSE
    INSERT INTO public.plaid_transactions(transaction_id,account_id,plaid_item_id,user_id,amount,date,name,merchant_name,category,
      iso_currency_code,account_owner,authorized_date,location,payment_meta,pending,pending_transaction_id)
      SELECT x.transaction_id,x.account_id,p_item,p_owner,-x.amount,x.date,x.name,x.merchant_name,x.category,
        x.iso_currency_code,x.account_owner,x.authorized_date,x.location,x.payment_meta,x.pending,x.pending_transaction_id
      FROM jsonb_to_recordset(p_rows) AS x(transaction_id text,account_id text,amount numeric,date date,name text,
        merchant_name text,category jsonb,iso_currency_code text,account_owner text,authorized_date date,
        location jsonb,payment_meta jsonb,pending boolean,pending_transaction_id text)
      ON CONFLICT(transaction_id) DO UPDATE SET account_id=excluded.account_id,amount=excluded.amount,date=excluded.date,
        name=excluded.name,merchant_name=excluded.merchant_name,category=excluded.category,iso_currency_code=excluded.iso_currency_code,
        account_owner=excluded.account_owner,authorized_date=excluded.authorized_date,location=excluded.location,
        payment_meta=excluded.payment_meta,pending=excluded.pending,pending_transaction_id=excluded.pending_transaction_id
        WHERE plaid_transactions.user_id=p_owner AND plaid_transactions.plaid_item_id=p_item;
  END IF;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Plaid identifier ownership conflict' USING ERRCODE='42501'; END IF;
  INSERT INTO public.plaid_sync_status(plaid_item_id,user_id,last_accounts_sync,last_transactions_sync,is_healthy,error_count,last_error)
    VALUES(p_item,p_owner,CASE WHEN p_kind='accounts' THEN now() END,CASE WHEN p_kind='transactions' THEN now() END,true,0,NULL)
    ON CONFLICT(plaid_item_id) DO UPDATE SET
      last_accounts_sync=CASE WHEN p_kind='accounts' THEN now() ELSE plaid_sync_status.last_accounts_sync END,
      last_transactions_sync=CASE WHEN p_kind='transactions' THEN now() ELSE plaid_sync_status.last_transactions_sync END,
      is_healthy=true,error_count=0,last_error=NULL WHERE plaid_sync_status.user_id=p_owner;
  GET DIAGNOSTICS status_count=ROW_COUNT;
  IF status_count<>1 THEN RAISE EXCEPTION 'Plaid status ownership conflict' USING ERRCODE='42501'; END IF;
  RETURN n;
END $$;

CREATE FUNCTION public.mind_manual_plaid_item_error(p_owner uuid,p_item uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[A-Z_]{1,100}$' THEN RAISE EXCEPTION 'Invalid Plaid error' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.plaid_items WHERE id=p_item AND user_id=p_owner AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plaid owner mismatch' USING ERRCODE='42501'; END IF;
  INSERT INTO public.plaid_sync_status(plaid_item_id,user_id,is_healthy,error_count,last_error)
    VALUES(p_item,p_owner,false,1,p_code) ON CONFLICT(plaid_item_id) DO UPDATE SET
      is_healthy=false,error_count=plaid_sync_status.error_count+1,last_error=p_code WHERE plaid_sync_status.user_id=p_owner;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Plaid status ownership conflict' USING ERRCODE='42501'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.mind_manual_plaid_claim_webhook(p_owner uuid,p_item uuid,p_delivery text,p_type text,p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt public.plaid_webhooks%ROWTYPE; claimed_id uuid; claim uuid:=gen_random_uuid();
BEGIN
  IF p_delivery IS NULL OR length(p_delivery) NOT BETWEEN 68 AND 256 OR p_type IS NULL OR p_code IS NULL
    OR length(p_type) NOT BETWEEN 1 AND 128 OR length(p_code) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid Plaid delivery' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.plaid_items WHERE id=p_item AND user_id=p_owner AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plaid owner mismatch' USING ERRCODE='42501'; END IF;
  INSERT INTO public.plaid_webhooks(webhook_id,plaid_item_id,user_id,webhook_type,webhook_code,payload,delivery_key,execution_claim)
    VALUES(gen_random_uuid()::text,p_item,p_owner,p_type,p_code,'{}',p_delivery,claim)
    ON CONFLICT(delivery_key) WHERE delivery_key IS NOT NULL DO NOTHING RETURNING id INTO claimed_id;
  IF claimed_id IS NOT NULL THEN RETURN jsonb_build_object('claimed',true,'receipt_id',claimed_id,'claim_token',claim); END IF;
  SELECT * INTO STRICT receipt FROM public.plaid_webhooks WHERE delivery_key=p_delivery;
  IF receipt.user_id IS DISTINCT FROM p_owner OR receipt.plaid_item_id IS DISTINCT FROM p_item OR receipt.webhook_type<>p_type OR receipt.webhook_code<>p_code THEN
    RAISE EXCEPTION 'Plaid delivery ownership conflict' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('claimed',false,'processed',receipt.processed);
END $$;

CREATE FUNCTION public.mind_manual_plaid_finish_webhook(p_owner uuid,p_receipt uuid,p_claim uuid,p_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
  IF p_error IS NOT NULL AND p_error<>'PLAID_DELIVERY_INCOMPLETE' THEN RAISE EXCEPTION 'Invalid Plaid receipt' USING ERRCODE='22023'; END IF;
  UPDATE public.plaid_webhooks SET processed=(p_error IS NULL),processed_at=now(),error_message=p_error,execution_claim=NULL
    WHERE id=p_receipt AND user_id=p_owner AND execution_claim=p_claim AND NOT processed AND processed_at IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;

REVOKE ALL ON FUNCTION public.mind_manual_plaid_token(uuid,uuid), public.mind_manual_plaid_store_item(uuid,text,text,text),
  public.mind_manual_plaid_save_sync(uuid,uuid,text,jsonb), public.mind_manual_plaid_item_error(uuid,uuid,text),
  public.mind_manual_plaid_claim_webhook(uuid,uuid,text,text,text), public.mind_manual_plaid_finish_webhook(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mind_manual_plaid_token(uuid,uuid), public.mind_manual_plaid_store_item(uuid,text,text,text),
  public.mind_manual_plaid_save_sync(uuid,uuid,text,jsonb), public.mind_manual_plaid_item_error(uuid,uuid,text),
  public.mind_manual_plaid_claim_webhook(uuid,uuid,text,text,text), public.mind_manual_plaid_finish_webhook(uuid,uuid,uuid,text)
  TO service_role;
COMMIT;
