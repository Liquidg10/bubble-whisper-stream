#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

export const EXPECTED_CONTRACT = 'hmac-v1';
export const CONCURRENCY = 3;
export const MAX_ACCOUNTS = 500;

const EXECUTE_FLAG = '--execute';
const MANIFEST_PREFIX = '--manifest=';
const RECEIPTS_PREFIX = '--receipts=';
const ACCOUNT_PREFIX = '--account=';
const MANIFEST_VERSION = 1;
const LEDGER_VERSION = 1;

function requireSingleValue(argumentsProvided, prefix, label) {
  const matches = argumentsProvided.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) throw new Error(`${label} may be provided only once`);
  if (matches.length === 0) return null;

  const value = matches[0].slice(prefix.length).trim();
  if (!value) throw new Error(`${label} requires a non-empty path`);
  return value;
}

export function parseArguments(argumentsProvided) {
  const recognized = (argument) =>
    argument === EXECUTE_FLAG ||
    argument.startsWith(ACCOUNT_PREFIX) ||
    argument.startsWith(MANIFEST_PREFIX) ||
    argument.startsWith(RECEIPTS_PREFIX);
  const unknownArguments = argumentsProvided.filter((argument) => !recognized(argument));
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
  }

  const executeCount = argumentsProvided.filter((argument) => argument === EXECUTE_FLAG).length;
  if (executeCount > 1) throw new Error(`${EXECUTE_FLAG} may be provided only once`);

  const execute = executeCount === 1;
  const manifestPath = requireSingleValue(argumentsProvided, MANIFEST_PREFIX, '--manifest');
  const receiptsPath = requireSingleValue(argumentsProvided, RECEIPTS_PREFIX, '--receipts');
  if (!manifestPath) throw new Error('--manifest is required');
  if (execute && !receiptsPath) throw new Error('--receipts is required with --execute');
  if (!execute && receiptsPath) throw new Error('--receipts is valid only with --execute');

  const accountArguments = argumentsProvided.filter((argument) => argument.startsWith(ACCOUNT_PREFIX));
  const requestedAccountIds = [...new Set(
    accountArguments.map((argument) => argument.slice(ACCOUNT_PREFIX.length).trim()),
  )];
  if (requestedAccountIds.some((accountId) => accountId.length === 0)) {
    throw new Error('--account requires a non-empty account ID');
  }
  if (execute && requestedAccountIds.length > 0) {
    throw new Error('--account belongs to dry-run selection; execute uses the reviewed manifest');
  }

  return { execute, manifestPath, receiptsPath, requestedAccountIds };
}

export function getTargetIdentity(supabaseUrl) {
  const url = new URL(supabaseUrl);
  return {
    origin: url.origin,
    projectRef: url.hostname.split('.')[0] || url.hostname,
  };
}

function canonicalAccount(account) {
  return {
    id: account.id,
    watchChannelId: account.watch_channel_id ?? null,
    watchResourceId: account.watch_resource_id ?? null,
    watchExpiresAt: account.watch_expires_at ?? null,
  };
}

function manifestPayload(manifest) {
  return {
    version: manifest.version,
    contract: manifest.contract,
    target: manifest.target,
    createdAt: manifest.createdAt,
    selection: manifest.selection,
    requestedAccountIds: manifest.requestedAccountIds,
    exactActiveCount: manifest.exactActiveCount,
    accounts: manifest.accounts,
  };
}

export function calculateManifestDigest(manifest) {
  return createHash('sha256')
    .update(JSON.stringify(manifestPayload(manifest)))
    .digest('hex');
}

export function buildManifest({ target, accounts, requestedAccountIds, now = new Date() }) {
  const sortedAccounts = accounts
    .map(canonicalAccount)
    .sort((left, right) => left.id.localeCompare(right.id));
  const sortedRequestedIds = [...requestedAccountIds].sort();
  const manifest = {
    version: MANIFEST_VERSION,
    contract: EXPECTED_CONTRACT,
    target,
    createdAt: now.toISOString(),
    selection: sortedRequestedIds.length > 0 ? 'explicit-accounts' : 'all-active-accounts',
    requestedAccountIds: sortedRequestedIds,
    exactActiveCount: sortedAccounts.length,
    accounts: sortedAccounts,
  };
  return { ...manifest, digest: calculateManifestDigest(manifest) };
}

export function validateManifest(manifest, target) {
  if (!manifest || manifest.version !== MANIFEST_VERSION) {
    throw new Error('Unsupported or missing rotation manifest version');
  }
  if (manifest.contract !== EXPECTED_CONTRACT) {
    throw new Error(`Manifest contract is ${manifest.contract ?? 'missing'}, expected ${EXPECTED_CONTRACT}`);
  }
  if (manifest.target?.origin !== target.origin || manifest.target?.projectRef !== target.projectRef) {
    throw new Error('Manifest target does not match SUPABASE_URL');
  }
  if (!Array.isArray(manifest.accounts) || !Array.isArray(manifest.requestedAccountIds)) {
    throw new Error('Rotation manifest inventory is malformed');
  }
  if (manifest.exactActiveCount !== manifest.accounts.length) {
    throw new Error('Rotation manifest exact count does not match its inventory');
  }
  if (manifest.exactActiveCount > MAX_ACCOUNTS) {
    throw new Error(`Rotation manifest exceeds the ${MAX_ACCOUNTS}-account safety cap`);
  }
  const accountIds = manifest.accounts.map((account) => account?.id);
  if (accountIds.some((accountId) => typeof accountId !== 'string' || !accountId)) {
    throw new Error('Rotation manifest contains an invalid account ID');
  }
  if (new Set(accountIds).size !== accountIds.length) {
    throw new Error('Rotation manifest contains duplicate account IDs');
  }
  if (manifest.selection === 'all-active-accounts') {
    if (manifest.requestedAccountIds.length !== 0) {
      throw new Error('All-active manifest cannot contain an explicit account selection');
    }
  } else if (manifest.selection === 'explicit-accounts') {
    const requestedIds = [...new Set(manifest.requestedAccountIds)].sort();
    const sortedAccountIds = [...accountIds].sort();
    if (
      requestedIds.length === 0 ||
      JSON.stringify(requestedIds) !== JSON.stringify(sortedAccountIds)
    ) {
      throw new Error('Explicit manifest selection does not match its account inventory');
    }
  } else {
    throw new Error('Rotation manifest selection is invalid');
  }
  if (calculateManifestDigest(manifest) !== manifest.digest) {
    throw new Error('Rotation manifest digest is invalid');
  }
  return manifest;
}

export async function assertDeployedContract(fetchImpl, supabaseUrl) {
  const response = await fetchImpl(`${supabaseUrl}/functions/v1/calendar-watch`, {
    method: 'OPTIONS',
  });
  const contract = response.headers.get('X-Calendar-Watch-Contract');
  if (!response.ok || contract !== EXPECTED_CONTRACT) {
    throw new Error(
      `Refusing rotation: deployed calendar-watch contract is ${contract ?? 'missing'}, expected ${EXPECTED_CONTRACT}`,
    );
  }
}

export async function loadActiveAccounts(supabase, requestedAccountIds, maxAccounts = MAX_ACCOUNTS) {
  if (requestedAccountIds.length > maxAccounts) {
    throw new Error(
      `Refusing inventory: ${requestedAccountIds.length} requested accounts exceeds the ${maxAccounts}-account safety cap`,
    );
  }

  let query = supabase
    .from('calendar_accounts')
    .select('id, watch_channel_id, watch_resource_id, watch_expires_at', { count: 'exact' })
    .eq('watch_status', 'active')
    .order('id')
    .range(0, maxAccounts);
  if (requestedAccountIds.length > 0) query = query.in('id', requestedAccountIds);

  const { data, error, count } = await query;
  if (error) throw error;
  if (count === null || count === undefined) {
    throw new Error('Refusing inventory: PostgREST did not return an exact count');
  }
  if (count > maxAccounts) {
    throw new Error(
      `Refusing inventory: ${count} active accounts exceeds the ${maxAccounts}-account safety cap`,
    );
  }

  const accounts = data ?? [];
  if (accounts.length !== count) {
    throw new Error(
      `Refusing inventory: exact count is ${count}, but only ${accounts.length} rows were returned`,
    );
  }

  const foundAccountIds = new Set(accounts.map((account) => account.id));
  const missingAccountIds = requestedAccountIds.filter((accountId) => !foundAccountIds.has(accountId));
  if (missingAccountIds.length > 0) {
    throw new Error(`Requested account(s) are missing or inactive: ${missingAccountIds.join(', ')}`);
  }

  return accounts.sort((left, right) => left.id.localeCompare(right.id));
}

function assertSamePreRotationState(manifestAccount, currentAccount) {
  const current = canonicalAccount(currentAccount);
  for (const key of ['watchChannelId', 'watchResourceId', 'watchExpiresAt']) {
    if (current[key] !== manifestAccount[key]) {
      throw new Error(`Inventory drift for ${manifestAccount.id}: ${key} changed after manifest review`);
    }
  }
}

export function validateReceiptLedger(entries, manifest, target) {
  if (entries.length === 0) throw new Error('Existing receipt ledger is empty');

  const header = entries[0];
  if (
    header.type !== 'rotation-ledger' ||
    header.version !== LEDGER_VERSION ||
    header.manifestDigest !== manifest.digest ||
    header.target?.origin !== target.origin ||
    header.target?.projectRef !== target.projectRef
  ) {
    throw new Error('Receipt ledger does not match the reviewed manifest and target');
  }

  const successfulByAccount = new Map();
  const manifestAccountIds = new Set(manifest.accounts.map((account) => account.id));
  for (const entry of entries.slice(1)) {
    if (
      entry.manifestDigest !== manifest.digest ||
      entry.target?.origin !== target.origin ||
      entry.target?.projectRef !== target.projectRef
    ) {
      throw new Error('Receipt ledger contains a record for a different manifest or target');
    }
    if (entry.type === 'rotation-summary') continue;
    if (entry.type !== 'account-receipt' || !manifestAccountIds.has(entry.accountId)) {
      throw new Error('Receipt ledger contains an invalid account record');
    }
    if (entry.status === 'rotated') {
      if (typeof entry.channelId !== 'string' || !entry.channelId) {
        throw new Error('Receipt ledger contains a rotated account without a channel ID');
      }
      successfulByAccount.set(entry.accountId, entry);
    } else if (entry.status !== 'failed') {
      throw new Error('Receipt ledger contains an invalid account status');
    }
  }
  return successfulByAccount;
}

export function planExecution(manifest, currentAccounts, successfulByAccount) {
  const manifestById = new Map(manifest.accounts.map((account) => [account.id, account]));
  const currentById = new Map(currentAccounts.map((account) => [account.id, account]));

  if (manifestById.size !== currentById.size) {
    throw new Error('Active-account inventory changed after manifest review');
  }
  for (const accountId of manifestById.keys()) {
    if (!currentById.has(accountId)) {
      throw new Error(`Active-account inventory changed after manifest review: ${accountId} is missing`);
    }
  }

  const pending = [];
  const confirmed = [];
  for (const manifestAccount of manifest.accounts) {
    const currentAccount = currentById.get(manifestAccount.id);
    const receipt = successfulByAccount.get(manifestAccount.id);
    if (receipt) {
      if (receipt.channelId !== currentAccount.watch_channel_id || receipt.status !== 'rotated') {
        throw new Error(`Receipt/state drift for previously rotated account ${manifestAccount.id}`);
      }
      confirmed.push(receipt);
      continue;
    }

    assertSamePreRotationState(manifestAccount, currentAccount);
    pending.push(currentAccount);
  }

  return { pending, confirmed };
}

export async function rotateAccount(supabase, account) {
  const { data, error } = await supabase.functions.invoke('calendar-watch', {
    body: { action: 'renew', calendarAccountId: account.id },
  });
  if (error || !data?.success) {
    throw new Error(error?.message ?? data?.error ?? 'Calendar watch renewal failed');
  }
  if (typeof data.channelId !== 'string' || data.channelId.length === 0) {
    throw new Error('Calendar watch renewal returned no replacement channel ID');
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('calendar_accounts')
    .select('watch_channel_id, watch_expires_at, watch_status')
    .eq('id', account.id)
    .single();
  if (refreshError) throw refreshError;
  if (
    refreshed.watch_status !== 'active' ||
    refreshed.watch_channel_id !== data.channelId ||
    refreshed.watch_channel_id === account.watch_channel_id
  ) {
    throw new Error('Renewal returned without the exact persisted replacement channel');
  }

  return {
    channelId: refreshed.watch_channel_id,
    previousChannelId: account.watch_channel_id ?? null,
    expiresAt: refreshed.watch_expires_at,
  };
}

export async function rotatePendingAccounts({
  pending,
  supabase,
  target,
  manifestDigest,
  appendReceipt,
  emit,
  now = () => new Date(),
  concurrency = CONCURRENCY,
}) {
  const outcomes = [];
  for (let index = 0; index < pending.length; index += concurrency) {
    const batch = pending.slice(index, index + concurrency);
    await Promise.all(batch.map(async (account) => {
      let receipt;
      try {
        const result = await rotateAccount(supabase, account);
        receipt = {
          type: 'account-receipt',
          manifestDigest,
          target,
          accountId: account.id,
          status: 'rotated',
          ...result,
          recordedAt: now().toISOString(),
        };
      } catch (error) {
        receipt = {
          type: 'account-receipt',
          manifestDigest,
          target,
          accountId: account.id,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          recordedAt: now().toISOString(),
        };
      }

      appendReceipt(receipt);
      emit(receipt);
      outcomes.push(receipt);
    }));
  }
  return outcomes.sort((left, right) => left.accountId.localeCompare(right.accountId));
}

function parseJsonLines(contents) {
  if (!contents.trim()) return [];
  return contents.trim().split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Receipt ledger contains invalid JSON on line ${index + 1}`);
    }
  });
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  createClientImpl = createClient,
  stdout = (value) => console.log(value),
  fs = { appendFileSync, existsSync, readFileSync, writeFileSync },
  now = () => new Date(),
} = {}) {
  const { execute, manifestPath, receiptsPath, requestedAccountIds } = parseArguments(argv);
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const target = getTargetIdentity(supabaseUrl);
  const supabase = createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!execute) {
    const accounts = await loadActiveAccounts(supabase, requestedAccountIds);
    const manifest = buildManifest({ target, accounts, requestedAccountIds, now: now() });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    stdout(JSON.stringify({
      mode: 'dry-run',
      target,
      exactActiveCount: accounts.length,
      selection: manifest.selection,
      manifestPath,
      manifestDigest: manifest.digest,
      next: `Review the manifest, then re-run with ${EXECUTE_FLAG}, ${MANIFEST_PREFIX}<path>, and ${RECEIPTS_PREFIX}<path>`,
    }, null, 2));
    return 0;
  }

  await assertDeployedContract(fetchImpl, supabaseUrl);
  const manifest = validateManifest(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    target,
  );
  const selectedIds = manifest.selection === 'explicit-accounts'
    ? manifest.requestedAccountIds
    : [];
  const currentAccounts = await loadActiveAccounts(supabase, selectedIds);

  let ledgerEntries;
  if (fs.existsSync(receiptsPath)) {
    ledgerEntries = parseJsonLines(fs.readFileSync(receiptsPath, 'utf8'));
  } else {
    const header = {
      type: 'rotation-ledger',
      version: LEDGER_VERSION,
      manifestDigest: manifest.digest,
      target,
      createdAt: now().toISOString(),
    };
    fs.writeFileSync(receiptsPath, `${JSON.stringify(header)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    ledgerEntries = [header];
  }

  const successfulByAccount = validateReceiptLedger(ledgerEntries, manifest, target);
  const { pending, confirmed } = planExecution(manifest, currentAccounts, successfulByAccount);
  const appendReceipt = (receipt) => {
    fs.appendFileSync(receiptsPath, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8' });
  };
  const emit = (receipt) => stdout(JSON.stringify(receipt));
  const outcomes = await rotatePendingAccounts({
    pending,
    supabase,
    target,
    manifestDigest: manifest.digest,
    appendReceipt,
    emit,
    now,
  });

  const failed = outcomes.filter((receipt) => receipt.status === 'failed');
  const summary = {
    type: 'rotation-summary',
    manifestDigest: manifest.digest,
    target,
    attemptedThisRun: outcomes.length,
    rotatedThisRun: outcomes.length - failed.length,
    alreadyConfirmed: confirmed.length,
    failedThisRun: failed.length,
    complete: failed.length === 0 && confirmed.length + outcomes.length === manifest.accounts.length,
    recordedAt: now().toISOString(),
  };
  appendReceipt(summary);
  emit(summary);
  return failed.length > 0 ? 1 : 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
