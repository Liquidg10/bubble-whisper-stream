import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// A fresh private socket-only cluster. Never accepts a database URL or remote host.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifact = readFileSync(join(root, 'supabase/manual/plaid-owner-pipeline.sql'), 'utf8');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
let binaries; let scratch; let started = false;
const children = new Set();
function command(executable, args, input) {
  const result = spawnSync(join(binaries, executable), args, { encoding: 'utf8', env: environment,
    timeout: 30_000, maxBuffer: 2 * 1024 * 1024, ...(input === undefined ? {} : { input }) });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}
function args() { return ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', scratch, '-p', '5432', '-U', 'postgres', '-d', 'postgres']; }
function sql(statement) {
  const result = command('psql', args(), statement);
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function denied(statement, code = '42501') {
  const result = command('psql', args(), statement);
  assert.notEqual(result.status, 0); assert.match(result.stderr, new RegExp(`\\b${code}\\b`, 'u'));
}
function concurrent(statement) {
  const child = spawn(join(binaries, 'psql'), args(), { env: environment }); children.add(child);
  return new Promise((resolveResult, reject) => {
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', status => { children.delete(child);
      if (status !== 0) reject(new Error(stderr)); else resolveResult(stdout.trim()); });
    child.stdin.end(statement);
  });
}
const owner = '10000000-0000-4000-8000-000000000001';
const other = '90000000-0000-4000-8000-000000000009';
const item = '20000000-0000-4000-8000-000000000002';
const otherItem = '80000000-0000-4000-8000-000000000008';
const service = statement => `SET ROLE service_role; ${statement}`;
const json = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const delivery = 'key:1780000000:' + 'a'.repeat(64);
const claim = (key=delivery, subject=owner, subjectItem=item) => `SELECT public.mind_manual_plaid_claim_webhook('${subject}','${subjectItem}','${key}','ACCOUNTS','DEFAULT_UPDATE');`;
const finish = (receipt, nonce, error='NULL', subject=owner) => `SELECT public.mind_manual_plaid_finish_webhook('${subject}','${receipt}','${nonce}',${error});`;
const save = (value, kind='accounts', subject=owner, subjectItem=item) => `SELECT public.mind_manual_plaid_save_sync('${subject}','${subjectItem}','${kind}',${json(value)});`;
const account = {account_id:'account-1',name:'Fixture',type:'depository',balances:{current:10}};

describe('Plaid owner pipeline — disposable local PostgreSQL', {concurrency:false}, () => {
  before(() => {
    const candidates = process.env.MIND_MANUAL_TEST_PG_BIN ? [process.env.MIND_MANUAL_TEST_PG_BIN]
      : ['/opt/homebrew/opt/postgresql@16/bin','/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/16/bin','/usr/lib/postgresql/17/bin',...String(process.env.PATH??'').split(delimiter)];
    binaries=candidates.find(candidate=>['postgres','initdb','pg_ctl','psql'].every(binary=>existsSync(join(candidate,binary))));
    assert.ok(binaries,'Local PostgreSQL required; no remote database or skipped pass.');
    scratch=mkdtempSync(join(tmpdir(),'mind-manual-plaid-pg-'));
    const data=join(scratch,'data');
    assert.equal(command('initdb',['-D',data,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8']).status,0);
    const start=command('pg_ctl',['-D',data,'-l',join(scratch,'server.log'),'-o',`-F -k '${scratch}' -h ''`,'-w','start']);
    assert.equal(start.status,0,start.stderr);started=true;
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT current_user::text';
      CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN NEW.updated_at=now();RETURN NEW;END';
      CREATE SCHEMA vault;CREATE TABLE vault.fixture_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decrypted_secret text);
      CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.fixture_secrets;
      CREATE FUNCTION vault.create_secret(text) RETURNS uuid LANGUAGE sql AS 'INSERT INTO vault.fixture_secrets(decrypted_secret) VALUES($1) RETURNING id';
      INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
    for(const file of ['20250908045744_0b0d1232-f8d8-467c-b074-d7d73f543c31.sql','20250908051810_7f12bbc5-4d5a-4002-9539-dcfb04efc7a8.sql']) sql(readFileSync(join(root,'supabase/migrations',file),'utf8'));
    sql(artifact);
  });
  beforeEach(()=>sql(`TRUNCATE public.plaid_accounts,public.plaid_transactions,public.plaid_sync_status,public.plaid_webhooks,public.plaid_items,vault.fixture_secrets;
    INSERT INTO public.plaid_items(id,user_id,item_id,institution_name) VALUES('${item}','${owner}','item-owner','Fixture'),('${otherItem}','${other}','item-other','Other');`));
  after(()=>{for(const child of children) child.kill('SIGTERM');if(started)command('pg_ctl',['-D',join(scratch,'data'),'-m','immediate','-w','stop']);
    if(scratch&&dirname(scratch)===tmpdir()&&scratch.includes('mind-manual-plaid-pg-'))rmSync(scratch,{recursive:true,force:true});});
  for(const role of ['anon','authenticated']) it(`denies ${role} sensitive RPCs`,()=>{
    for(const statement of [claim(),save([account]),`SELECT public.mind_manual_plaid_token('${owner}','${item}');`,
      `SELECT public.mind_manual_plaid_store_item('${owner}','new-item','fixture-secret','Fixture');`,
      `SELECT public.mind_manual_plaid_item_error('${owner}','${item}','ITEM_LOGIN_REQUIRED');`,finish(item,otherItem)]) denied(`SET ROLE ${role};${statement}`);
  });
  it('fails closed on foreign item ownership',()=>{
    denied(service(claim(delivery,other,item)));
    denied(service(save([account],'accounts',other,item)));
    denied(service(`SELECT public.mind_manual_plaid_token('${other}','${item}');`));
    assert.equal(sql('SELECT count(*) FROM public.plaid_webhooks;'),'0');
  });
  it('returns exactly one concurrent claim and never reclaims pending delivery',async()=>{
    const results=await Promise.all([concurrent(service(claim())),concurrent(service(claim()))]);
    assert.equal(results.map(JSON.parse).filter(r=>r.claimed).length,1);
    assert.deepEqual(JSON.parse(sql(service(claim()))),{claimed:false,processed:false});
    assert.equal(sql('SELECT count(*) FROM public.plaid_webhooks;'),'1');
  });
  it('completes only the exact owner, receipt and claim tuple',()=>{
    const a=JSON.parse(sql(service(claim()))), b=JSON.parse(sql(service(claim(delivery+'b'))));
    assert.equal(sql(service(finish(a.receipt_id,b.claim_token))),'f');
    assert.equal(sql(service(finish(a.receipt_id,a.claim_token,'NULL',other))),'f');
    assert.equal(sql(service(finish(a.receipt_id,a.claim_token))),'t');
    assert.equal(sql(service(finish(a.receipt_id,a.claim_token))), 'f');
    assert.deepEqual(JSON.parse(sql(service(claim()))),{claimed:false,processed:true});
    assert.equal(sql(`SELECT processed FROM public.plaid_webhooks WHERE id='${b.receipt_id}';`),'f');
  });
  it('retains failed receipts without replay permission',()=>{
    const a=JSON.parse(sql(service(claim())));
    assert.equal(sql(service(finish(a.receipt_id,a.claim_token,"'PLAID_DELIVERY_INCOMPLETE'"))),'t');
    assert.deepEqual(JSON.parse(sql(service(claim()))),{claimed:false,processed:false});
    assert.equal(sql(service(finish(a.receipt_id,a.claim_token))),'f');
  });
  it('commits rows and status atomically and rejects foreign identifier collision',()=>{
    assert.equal(sql(service(save([account]))),'1');
    assert.equal(sql(service(save([{...account,balances:{current:20}}]))),'1');
    denied(service(save([account],'accounts',other,otherItem)));
    assert.equal(sql(`SELECT user_id||':'||(balances->>'current') FROM public.plaid_accounts;`),owner+':20');
    assert.equal(sql('SELECT count(*) FROM public.plaid_sync_status;'),'1');
  });
  it('rolls back every row when one identifier belongs to another item',()=>{
    sql(service(save([account],'accounts',other,otherItem)));
    denied(service(save([{...account,account_id:'new-owner-row'},account])));
    assert.equal(sql('SELECT count(*) FROM public.plaid_accounts;'),'1');
    assert.equal(sql(`SELECT count(*) FROM public.plaid_sync_status WHERE user_id='${owner}';`),'0');
  });
  it('writes transaction values and rejects foreign transaction takeover',()=>{
    const transaction={transaction_id:'tx1',account_id:'acc',amount:12.5,date:'2026-09-12',name:'Fixture',pending:false};
    assert.equal(sql(service(save([transaction],'transactions'))),'1');
    assert.equal(sql('SELECT amount FROM public.plaid_transactions;'),'-12.5');
    denied(service(save([transaction],'transactions',other,otherItem)));
  });
  it('uses an owner-bound Vault pointer and never falls back to legacy plaintext',()=>{
    sql(`UPDATE public.plaid_items SET access_token='legacy-fixture' WHERE id='${item}';`);
    denied(service(`SELECT public.mind_manual_plaid_token('${owner}','${item}');`));
    const id=sql(service(`SELECT public.mind_manual_plaid_store_item('${owner}','new-item','fixture-token','Fixture');`));
    assert.equal(sql(service(`SELECT public.mind_manual_plaid_token('${owner}','${id}');`)),'fixture-token');
    denied(service(`SELECT public.mind_manual_plaid_token('${other}','${id}');`));
    denied(service(`SELECT public.mind_manual_plaid_store_item('${other}','new-item','other-token','Other');`),'23505');
    assert.equal(sql('SELECT count(*) FROM vault.fixture_secrets;'),'1');
    assert.equal(sql(`SELECT access_token IS NULL FROM public.plaid_items WHERE id='${id}';`),'t');
  });
  it('increments only exact owner error status and stores a safe code',()=>{
    sql(service(`SELECT public.mind_manual_plaid_item_error('${owner}','${item}','ITEM_LOGIN_REQUIRED');`));
    sql(service(`SELECT public.mind_manual_plaid_item_error('${owner}','${item}','ITEM_LOGIN_REQUIRED');`));
    assert.equal(sql(`SELECT error_count||':'||last_error FROM public.plaid_sync_status;`),'2:ITEM_LOGIN_REQUIRED');
    denied(service(`SELECT public.mind_manual_plaid_item_error('${other}','${item}','ITEM_LOGIN_REQUIRED');`));
  });
});
