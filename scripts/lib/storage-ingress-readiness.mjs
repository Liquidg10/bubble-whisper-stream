import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import ts from 'typescript';
import { canonicalJson, sha256 } from './supabase-isolation.mjs';
import { assertScopeBinding, subjectScopeBinding } from './migration-subject-scope.mjs';
import { inspectEdgeFenceCoverage } from './source-write-fence-readiness.mjs';

// This roster is a review checklist, not an exhaustive provider attestation.
// Neither a caller-provided receipt hash nor zero application leases proves that
// historical/signed/privileged requests can no longer mutate backend bytes.
export const STORAGE_WRITER_ROSTER = Object.freeze([
  'direct_rest', 'signed_rest', 'resumable_tus', 'signed_resumable_tus',
  's3_user_jwt', 's3_generated_keys', 'service_role', 'pre_gateway_workers',
  'inflight_copy_move_delete', 'guarded_photo_gateway',
]);
const HASH = /^[0-9a-f]{64}$/u;
const MAX_OBSERVATION_AGE_MS = 15 * 60 * 1000;
const BOUNDARY_KEYS = ['version', 'edgeManifestSha256', 'gatewayBundleSha256', 'storagePolicySha256', 'photoClientSha256'];
const PERMANENT_BLOCKERS = Object.freeze([
  { code: 'provider_review_unproven', reason: 'Local inspection and caller-supplied hashes do not verify provider provenance, hosted versions, bucket exclusivity, retirement of signed/privileged or already-authorized work, or a byte-ingress freeze.' },
  { code: 'owner_window', reason: 'This diagnostic cannot authorize deployment, credentials, live writer retirement, a source freeze, or cutover.' },
]);

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}
function isHash(value) { return typeof value === 'string' && HASH.test(value); }
function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function timestamp(value) {
  if (typeof value !== 'string') throw new Error('Invalid storage observation timestamp');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error('Invalid storage observation timestamp');
  return time;
}

export function storageIngressBoundary(root) {
  const fileHash = (path) => sha256(readFileSync(resolve(root, path)));
  const gatewayFiles = [
    'supabase/functions/storage-photo/index.ts',
    'supabase/functions/_shared/storagePhotoGateway.ts',
    'supabase/functions/_shared/migrationWriteFence.ts',
  ];
  return {
    version: 1,
    edgeManifestSha256: fileHash('supabase/isolation/mind-manual-edge-functions.tsv'),
    gatewayBundleSha256: sha256(canonicalJson(gatewayFiles.map((path) => ({ path, sha256: fileHash(path) })))),
    storagePolicySha256: fileHash('supabase/isolation/storage-write-gateway.sql'),
    photoClientSha256: fileHash('src/services/photoService.ts'),
  };
}

/** Structural source checks only; never asserts behavior of deployed code. */
export function inspectStorageIngressWiring(root) {
  const entrypoints = inspectEdgeFenceCoverage(root);
  const sourceText = readFileSync(resolve(root, 'src/services/photoService.ts'), 'utf8');
  const source = ts.createSourceFile('photoService.ts', sourceText, ts.ScriptTarget.Latest, true);
  const operations = [];
  let unsafe = source.parseDiagnostics.length !== 0;
  const bannedProperties = new Set(['upload', 'uploadToSignedUrl', 'createSignedUploadUrl', 'update', 'remove', 'move', 'copy',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'eval', 'Function']);
  const propertyName = (node) => ts.isPropertyAccessExpression(node) ? node.name.text
    : ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;
  function objectProperty(node, name) {
    if (!node || !ts.isObjectLiteralExpression(node)) return undefined;
    return node.properties.find((property) => ts.isPropertyAssignment(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name)?.initializer;
  }
  const visit = (node) => {
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && bannedProperties.has(propertyName(node))) unsafe = true;
    if (ts.isCallExpression(node) && ['fetch', 'eval', 'Function'].includes(node.expression.getText(source))) unsafe = true;
    if (ts.isNewExpression(node) && ['XMLHttpRequest', 'WebSocket', 'Function'].includes(node.expression.getText(source))) unsafe = true;
    if (ts.isPropertyAccessExpression(node) && node.getText(source) === 'supabase.storage') {
      // The only direct Storage use is a private signed READ URL; aliases and
      // dynamically selected methods are not accepted by this narrow contract.
      const from = node.parent;
      const fromCall = from.parent;
      const read = fromCall.parent;
      if (!ts.isPropertyAccessExpression(from) || from.name.text !== 'from'
        || !ts.isCallExpression(fromCall) || fromCall.expression !== from || fromCall.arguments.length !== 1
        || !ts.isStringLiteral(fromCall.arguments[0]) || fromCall.arguments[0].text !== 'photos'
        || !ts.isPropertyAccessExpression(read) || read.name.text !== 'createSignedUrl'
        || !ts.isCallExpression(read.parent) || read.parent.expression !== read) unsafe = true;
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'supabase.functions.invoke') {
      const name = node.arguments[0];
      const operation = objectProperty(objectProperty(node.arguments[1], 'headers'), 'x-storage-operation');
      if (node.arguments.length !== 2 || !ts.isStringLiteral(name) || name.text !== 'storage-photo'
        || !operation || !ts.isStringLiteral(operation)) unsafe = true;
      else operations.push(operation.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const gateway = entrypoints.find((entry) => entry.name === 'storage-photo');
  return {
    evidenceClass: 'local_source_inspection_only',
    gatewayGuarded: gateway?.covered === true,
    allEntrypointsGuarded: entrypoints.length > 0 && entrypoints.every((entry) => entry.covered),
    guardedEntrypointCount: entrypoints.filter((entry) => entry.covered).length,
    expectedEntrypointCount: entrypoints.length,
    photoClientGatewayOnly: !unsafe && canonicalJson(operations.sort()) === canonicalJson(['delete', 'upload']),
    photoClientSha256: sha256(sourceText),
  };
}

export function loadStorageIngressObservations(path) {
  let descriptor;
  let contents;
  try {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Invalid path');
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > 4 * 1024 * 1024) throw new Error('Invalid file');
    contents = readFileSync(descriptor, 'utf8');
    if (Buffer.byteLength(contents) > 4 * 1024 * 1024) throw new Error('Oversize file');
  } catch {
    throw new Error('Storage observations must be an absolute private regular file');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try { return JSON.parse(contents); } catch { throw new Error('Storage observations are not valid JSON'); }
}

/** Validate internal consistency, not trustworthiness or external provenance. */
export function validateStorageIngressObservations(input, { scope, boundary, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error('Invalid diagnostic clock');
  if (!exactKeys(input, ['version', 'kind', 'subjectScope', 'boundary', 'observedAt', 'writers', 'leases', 'byteObservations'])
    || input.version !== 1 || input.kind !== 'mind_manual_storage_ingress_observations') throw new Error('Invalid storage observation envelope');
  const binding = subjectScopeBinding(scope);
  assertScopeBinding(input.subjectScope, binding, 'Storage observation subject scope');
  if (!exactKeys(boundary, BOUNDARY_KEYS) || boundary.version !== 1 || BOUNDARY_KEYS.slice(1).some((key) => !isHash(boundary[key]))
    || canonicalJson(input.boundary) !== canonicalJson(boundary)) throw new Error('Storage observation implementation boundary mismatch');
  const boundarySha256 = sha256(canonicalJson(boundary));
  const observedTime = timestamp(input.observedAt);
  if (observedTime > now + 30_000) throw new Error('Storage observations are future dated');
  const blockers = [];
  const add = (code, reason) => blockers.push({ code, reason });
  if (now - observedTime > MAX_OBSERVATION_AGE_MS) add('stale_observations', 'The observation packet is older than the local 15-minute diagnostic limit. Freshness alone would not establish a freeze.');
  const validateBinding = (item) => {
    if (item.scopeSha256 !== binding.scopeSha256 || item.boundarySha256 !== boundarySha256) throw new Error('Storage observation item binding mismatch');
  };
  const validateTime = (value) => {
    const time = timestamp(value);
    if (time > observedTime) throw new Error('Storage observation item is later than its packet');
    if (now - time > MAX_OBSERVATION_AGE_MS) add('stale_item', 'At least one writer or byte observation is too old for this diagnostic.');
    return time;
  };
  if (!Array.isArray(input.writers) || input.writers.length !== STORAGE_WRITER_ROSTER.length
    || canonicalJson(input.writers.map((writer) => writer?.writerId).sort()) !== canonicalJson([...STORAGE_WRITER_ROSTER].sort())) throw new Error('Storage observation writer roster must be exact and unique');
  let latestDrainTime = 0;
  let unresolvedWriters = 0;
  let reportedPendingOperations = 0;
  const writerReceipts = [];
  for (const writer of input.writers) {
    if (!exactKeys(writer, ['writerId', 'scopeSha256', 'boundarySha256', 'receiptSha256', 'observedAt', 'status', 'pendingOperations'])
      || !['retired', 'drained', 'pending', 'unobserved'].includes(writer.status)) throw new Error('Invalid storage writer observation');
    validateBinding(writer);
    if (writer.status === 'unobserved') {
      if (writer.receiptSha256 !== null || writer.observedAt !== null || writer.pendingOperations !== null) throw new Error('Unobserved writer cannot claim a receipt or pending count');
      unresolvedWriters++;
      add('writer_unobserved', `No observation for ${writer.writerId}.`);
      continue;
    }
    if (!isHash(writer.receiptSha256) || !count(writer.pendingOperations)) throw new Error('Invalid storage writer receipt or pending count');
    latestDrainTime = Math.max(latestDrainTime, validateTime(writer.observedAt));
    writerReceipts.push(writer.receiptSha256);
    reportedPendingOperations += writer.pendingOperations;
    if (!Number.isSafeInteger(reportedPendingOperations)) throw new Error('Storage pending operation total exceeds the safe count range');
    if (writer.status === 'pending' || writer.pendingOperations !== 0) {
      unresolvedWriters++;
      add('writer_pending', `Unresolved storage work for ${writer.writerId}.`);
    }
    if (['retired', 'drained'].includes(writer.status) && writer.pendingOperations !== 0) add('writer_contradiction', `Terminal writer status contradicts a nonzero pending count for ${writer.writerId}.`);
  }
  const leases = input.leases;
  if (!exactKeys(leases, ['scopeSha256', 'boundarySha256', 'receiptSha256', 'observedAt', 'activeCount', 'unresolvedCount'])
    || !isHash(leases.receiptSha256) || !count(leases.activeCount) || !count(leases.unresolvedCount)) throw new Error('Invalid storage lease observation');
  validateBinding(leases);
  latestDrainTime = Math.max(latestDrainTime, validateTime(leases.observedAt));
  if (leases.activeCount !== 0 || leases.unresolvedCount !== 0) add('leases_pending', 'Active or unresolved application admission leases remain. Zero leases alone would not prove historical or privileged writers retired.');
  const bytes = input.byteObservations;
  if (!exactKeys(bytes, ['scopeSha256', 'boundarySha256', 'before', 'after'])) throw new Error('Invalid storage byte observation pair');
  validateBinding(bytes);
  for (const item of [bytes.before, bytes.after]) {
    if (!exactKeys(item, ['receiptSha256', 'observedAt', 'objectCount', 'byteCount', 'contentsSha256'])
      || !isHash(item.receiptSha256) || !isHash(item.contentsSha256) || !count(item.objectCount) || !count(item.byteCount)) throw new Error('Invalid storage byte observation');
    validateTime(item.observedAt);
  }
  const beforeTime = timestamp(bytes.before.observedAt);
  const afterTime = timestamp(bytes.after.observedAt);
  if (beforeTime < latestDrainTime || afterTime <= beforeTime) add('byte_window_invalid', 'Byte observations must form a positive interval after all supplied writer and lease observations. The interval cannot itself prove provider retirement.');
  const byteContentsStable = ['contentsSha256', 'objectCount', 'byteCount'].every((key) => bytes.before[key] === bytes.after[key]);
  if (!byteContentsStable) add('byte_contents_changed', 'The supplied before/after object contents or counts disagree.');
  const receipts = [...writerReceipts, leases.receiptSha256, bytes.before.receiptSha256, bytes.after.receiptSha256];
  if (new Set(receipts).size !== receipts.length) add('receipt_reused', 'Distinct observations reuse receipt hashes; independent source receipts are not established.');
  return {
    evidenceClass: 'caller_observation_consistency_only',
    externalProvenanceVerified: false,
    subjectScope: binding,
    observationsSha256: sha256(canonicalJson(input)),
    boundarySha256,
    suppliedWriterCount: input.writers.length,
    unresolvedWriterCount: unresolvedWriters,
    reportedPendingOperations,
    activeLeaseCount: leases.activeCount,
    unresolvedLeaseCount: leases.unresolvedCount,
    suppliedByteContentsStable: byteContentsStable,
    blockers,
  };
}

export function buildStorageIngressReadiness(root, { scope, observations, now } = {}) {
  if ((scope === undefined) !== (observations === undefined)) throw new Error('Subject scope and observations must be supplied together');
  const boundary = storageIngressBoundary(root);
  const wiring = inspectStorageIngressWiring(root);
  const evidence = observations === undefined ? null : validateStorageIngressObservations(observations, { scope, boundary, now });
  const blockers = [];
  if (!wiring.gatewayGuarded || !wiring.allEntrypointsGuarded) blockers.push({ code: 'unguarded_entrypoint', reason: 'Local Edge entrypoints do not all meet the exact admission wrapper contract.' });
  if (!wiring.photoClientGatewayOnly) blockers.push({ code: 'direct_photo_ingress', reason: 'The photo client does not meet the gateway-only mutation contract.' });
  if (!evidence) blockers.push({ code: 'observations_missing', reason: 'No subject-bound storage writer, lease, and byte observations were supplied.' });
  return {
    version: 1, kind: 'mind_manual_storage_ingress_readiness', status: 'blocked',
    eligibleForActivation: false, sourceWriteFreezeConfirmed: false, storageByteFreezeConfirmed: false,
    externalProvenanceVerified: false, boundary, wiring, observations: evidence,
    blockers: [...blockers, ...(evidence?.blockers ?? []), ...PERMANENT_BLOCKERS],
  };
}
