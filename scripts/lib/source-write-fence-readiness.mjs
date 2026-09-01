import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

// These are missing implementation/evidence gates, not operator checkboxes.
// Do not add --force/--confirmed or turn a local test into an activation token.
export const ACTIVATION_BLOCKERS = Object.freeze([
  ['subject_scope', 'Subject-scoped export, preflight, storage and receipt binding are locally implemented, but require the actual owner-approved private subject list, reviewed legacy assignments, exact live guard membership and fresh scoped receipts. Synthetic tests do not approve any live subject.'],
  ['shared_identity', 'Selected identities and cross-product FK/trigger dependencies need an explicit disposition; fencing an Auth user also blocks that user\'s login metadata updates and can abort a commerce transaction that cascades into a selected row.'],
  ['storage_ingress', 'The admitted photo gateway and restrictive direct-write policies are locally implemented; historical signed/resumable/S3, privileged and already-authorized storage writers still require provider-level stop/drain evidence. Zero app leases is not a byte freeze.'],
  ['runtime_generation', 'Verify the 34 endpoints are exclusive to Mind Manual, every deployed version, and retirement of pre-instrumentation requests/WebSockets; zero new leases does not prove old workers retired.'],
  ['provider_outcomes', 'A completed HTTP handler is not proof a remote provider stopped after a lost response. Reconcile every ambiguous provider attempt, idempotency receipt and pending outcome before freeze.'],
  ['scheduler_inventory', 'Browser refresh/watch lifecycle safeguards are local implementation only, not a global stop or provider drain. GitHub calendar-watch-renewal schedule/manual dispatch, active runs, database jobs, other browser writers and external writers require fresh authenticated scoped inventory and drain evidence.'],
  ['catalog_parity', 'Fixed-reference exact guard catalog validation is locally implemented. Both projects must receive the identical reviewed manual guard artifacts after the retained pre-guard business baseline; fresh live catalog receipts are still required.'],
  ['live_denial_and_rollback', 'Fresh selected-user denial, unrelated-commerce continuity, storage-byte stability and tested rollback evidence are required after an approved deployment.'],
  ['owner_window', 'No source activation, Auth migration or maintenance window is authorized by implementing this code.'],
].map(([code, reason]) => Object.freeze({ code, reason })));

const digest = (value) => createHash('sha256').update(value).digest('hex');

export const OWNER_SCOPED_BEARER_FUNCTIONS = Object.freeze([
  'ai-cbt-reframe', 'ai-conversation', 'ai-embeddings', 'ai-glimmer-generate',
  'ai-monthly-summary', 'ai-pattern-analysis', 'ai-photo-analyze', 'ai-plan-generate',
  'ai-realtime-voice', 'ai-tts-generate', 'ai-voice-transcribe',
  'calendar-oauth-callback', 'calendar-oauth-start', 'document-scan',
  'gmail-compose', 'gmail-sync', 'grocery-intelligence',
  'oauth-google-callback', 'oauth-google-refresh', 'oauth-google-revoke',
  'oauth-google-start', 'personal-voice-record', 'plaid-create-link-token',
  'plaid-exchange-token', 'plaid-get-accounts', 'plaid-get-transactions',
  'storage-photo',
]);

export const LEGACY_GLOBAL_ADMISSION_FUNCTIONS = Object.freeze([
  'calendar-sync', 'calendar-watch', 'gmail-watch', 'plaid-webhook-handler',
  'watch-renewal-cron',
]);

export const RETIRED_UNWRAPPED_FUNCTIONS = Object.freeze([
  'oauth-google', 'oauth-scope-decay',
]);

export function inspectEdgeFenceCoverage(root) {
  const manifest = readFileSync(resolve(root, 'supabase/isolation/mind-manual-edge-functions.tsv'), 'utf8');
  const names = manifest.split(/\r?\n/u).filter((line) => line.trim() && !line.startsWith('#')).map((line) => line.split('\t')[0]);
  if (names.length === 0 || new Set(names).size !== names.length || names.some((name) => !/^[a-z][a-z0-9-]*$/u.test(name))) {
    throw new Error('Invalid Edge function manifest');
  }
  const classifications = [
    ...OWNER_SCOPED_BEARER_FUNCTIONS,
    ...LEGACY_GLOBAL_ADMISSION_FUNCTIONS,
    ...RETIRED_UNWRAPPED_FUNCTIONS,
  ];
  if (new Set(classifications).size !== classifications.length ||
    JSON.stringify([...classifications].sort()) !== JSON.stringify([...names].sort())) {
    throw new Error('Edge admission classification/manifest mismatch');
  }
  const directories = readdirSync(resolve(root, 'supabase/functions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared').map((entry) => entry.name).sort();
  if (JSON.stringify(directories) !== JSON.stringify([...names].sort())) throw new Error('Edge directory/manifest mismatch');
  return names.map((name) => {
    const relativePath = `supabase/functions/${name}/index.ts`;
    const text = readFileSync(resolve(root, relativePath), 'utf8');
    const source = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true);
    const calls = [];
    const visit = (node) => {
      if (ts.isCallExpression(node) && (node.expression.getText(source) === 'serve' || node.expression.getText(source) === 'Deno.serve')) calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    const call = calls[0];
    const wrapper = call?.arguments[0];
    const imported = (symbol) => source.statements.some((statement) => ts.isImportDeclaration(statement)
      && statement.moduleSpecifier.text === '../_shared/migrationWriteFence.ts'
      && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
      && statement.importClause.namedBindings.elements.some((element) => element.name.text === symbol && !element.propertyName));
    const ownerScoped = OWNER_SCOPED_BEARER_FUNCTIONS.includes(name)
      && imported('wrapMindManualSubjectHandler') && imported('verifiedBearerMindManualScope')
      && !imported('wrapMindManualHandler') && calls.length === 1 && call.arguments.length === 1
      && ts.isCallExpression(wrapper) && wrapper.expression.getText(source) === 'wrapMindManualSubjectHandler'
      && wrapper.arguments.length === 3 && ts.isStringLiteral(wrapper.arguments[0])
      && wrapper.arguments[0].text === name && ts.isCallExpression(wrapper.arguments[1])
      && wrapper.arguments[1].expression.getText(source) === 'verifiedBearerMindManualScope'
      && wrapper.arguments[1].arguments.length === 1;
    const legacyGlobal = LEGACY_GLOBAL_ADMISSION_FUNCTIONS.includes(name)
      && imported('wrapMindManualHandler') && !imported('wrapMindManualSubjectHandler')
      && calls.length === 1 && call.arguments.length === 1 && ts.isCallExpression(wrapper)
      && wrapper.expression.getText(source) === 'wrapMindManualHandler'
      && wrapper.arguments.length === 2 && ts.isStringLiteral(wrapper.arguments[0])
      && wrapper.arguments[0].text === name;
    const retired = RETIRED_UNWRAPPED_FUNCTIONS.includes(name)
      && !imported('wrapMindManualHandler') && !imported('wrapMindManualSubjectHandler')
      && !imported('verifiedBearerMindManualScope') && calls.length === 1
      && call.arguments.length === 1 && !ts.isCallExpression(wrapper);
    const classification = ownerScoped ? 'owner_scoped_bearer'
      : legacyGlobal ? 'legacy_global_blocked'
      : retired ? 'retired_unwrapped'
      : 'invalid';
    return {
      name,
      relativePath,
      classification,
      covered: source.parseDiagnostics.length === 0 && (ownerScoped || retired),
      sha256: digest(text),
    };
  });
}

export function buildLocalFenceReadiness(root) {
  const entrypoints = inspectEdgeFenceCoverage(root);
  const implementationFailures = entrypoints.filter((entry) => !entry.covered)
    .map((entry) => ({
      code: entry.classification === 'legacy_global_blocked'
        ? 'legacy_global_admission'
        : 'unguarded_entrypoint',
      reason: entry.relativePath,
    }));
  return {
    version: 1,
    status: 'blocked',
    evidenceClass: 'local_source_inspection_only',
    eligibleForActivation: false,
    sourceWriteFreezeConfirmed: false,
    implementedEntrypointCount: entrypoints.filter((entry) => entry.covered).length,
    expectedEntrypointCount: entrypoints.length,
    entrypoints,
    blockers: [...implementationFailures, ...ACTIVATION_BLOCKERS],
  };
}
