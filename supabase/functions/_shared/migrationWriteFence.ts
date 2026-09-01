/**
 * Mind Manual's admission lease spans all work, not just a handler's HTTP reply.
 * Deploy the matching service-only RPCs before deploying these wrappers. Missing
 * control-plane state is an outage, never permission to start provider work.
 */
export const MIND_MANUAL_EDGE_FUNCTIONS = Object.freeze([
  'ai-cbt-reframe', 'ai-conversation', 'ai-embeddings', 'ai-glimmer-generate',
  'ai-monthly-summary', 'ai-pattern-analysis', 'ai-photo-analyze', 'ai-plan-generate',
  'ai-realtime-voice', 'ai-tts-generate', 'ai-voice-transcribe',
  'calendar-oauth-callback', 'calendar-oauth-start', 'calendar-sync', 'calendar-watch',
  'document-scan', 'gmail-compose', 'gmail-sync', 'gmail-watch', 'grocery-intelligence',
  'oauth-google', 'oauth-google-callback', 'oauth-google-refresh', 'oauth-google-revoke',
  'oauth-google-start', 'oauth-scope-decay', 'personal-voice-record',
  'plaid-create-link-token', 'plaid-exchange-token', 'plaid-get-accounts',
  'plaid-get-transactions', 'plaid-webhook-handler', 'storage-photo', 'watch-renewal-cron',
] as const);

const allowedFunctions = new Set<string>(MIND_MANUAL_EDGE_FUNCTIONS);
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subjectUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actionName = /^[a-z][a-z0-9_]{0,63}$/;
const runtimeGeneration = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-storage-operation',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Retry-After',
};

export interface MindManualWorkLifecycle {
  /**
   * Register before the handler returns. Resolve only when ALL associated work
   * really ended (for voice: both the client and provider sockets are closed).
   * A rejection, missing close event, or lost isolate retains the lease. Never
   * substitute a timer, an error event, or sending close() for actual completion.
   * Detached side effects that are not registered here are forbidden.
   */
  holdUntil(completion: PromiseLike<unknown>): void;
}

export interface MigrationWriteFenceDependencies {
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
  randomUUID?: () => string;
  waitUntil?: (completion: Promise<unknown>) => void;
  /** RPC transport deadline only. This NEVER expires or removes a DB lease. */
  rpcTimeoutMs?: number;
}

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get(name: string): string | undefined } };
  EdgeRuntime?: { waitUntil(completion: Promise<unknown>): void };
};

type Handler<Context = undefined> = (
  request: Request,
  lifecycle: MindManualWorkLifecycle,
  context: Context,
) => Response | Promise<Response>;

interface ResolverRuntime {
  origin: string;
  serviceKey: string;
  fetch: typeof fetch;
}

export type MindManualScopeResolution<Context> =
  | Readonly<{ kind: 'resolved'; subjectId: string; action: string; context: Context }>
  | Readonly<{ kind: 'respond'; response: Response }>;

export type MindManualScopeResolver<Context> = (
  request: Request,
  runtime: ResolverRuntime,
) => Promise<MindManualScopeResolution<Context>>;

type ActionResolver = string | ((request: Request) => string | Response);

function unavailable(): Response {
  return new Response(JSON.stringify({
    error: 'MIND_MANUAL_TEMPORARILY_UNAVAILABLE',
    message: 'Mind Manual is temporarily unavailable. Please retry shortly.',
  }), {
    status: 503,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': '30',
    },
  });
}

function authenticationRequired(): Response {
  return new Response(JSON.stringify({ error: 'AUTHENTICATION_REQUIRED' }), {
    status: 401,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function serverConfiguration(env: (name: string) => string | undefined) {
  const rawUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawUrl || !serviceKey || serviceKey.trim() !== serviceKey || /[\r\n]/.test(serviceKey)) {
    throw new Error('Migration admission configuration unavailable');
  }
  const url = new URL(rawUrl);
  const localHost = ['localhost', '127.0.0.1', '[::1]', 'kong'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/'
  ) {
    throw new Error('Migration admission configuration invalid');
  }
  return { origin: url.origin, serviceKey };
}

function ownerScopedConfiguration(env: (name: string) => string | undefined) {
  const configuration = serverConfiguration(env);
  const generation = env('MIND_MANUAL_RUNTIME_GENERATION');
  if (!generation || !runtimeGeneration.test(generation)) {
    throw new Error('Owner-scoped migration generation unavailable');
  }
  return { ...configuration, generation };
}

function validSubject(value: unknown): value is string {
  return typeof value === 'string' && subjectUuid.test(value) &&
    value !== '00000000-0000-0000-0000-000000000000';
}

function validAction(value: unknown): value is string {
  return typeof value === 'string' && actionName.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('\n') === [...keys].sort().join('\n');
}

function admissionDecision(value: unknown, generation: string): 'unselected' | 'admitted' | 'blocked' | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (exactKeys(record, ['decision']) &&
    (record.decision === 'unselected' || record.decision === 'blocked')) {
    return record.decision;
  }
  if (exactKeys(record, ['decision', 'generation']) &&
    record.decision === 'admitted' && record.generation === generation) {
    return 'admitted';
  }
  return null;
}

function releaseDecision(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    exactKeys(value as Record<string, unknown>, ['decision']) &&
    (value as Record<string, unknown>).decision === 'released');
}

function rpcCaller(
  origin: string,
  serviceKey: string,
  requestFetch: typeof fetch,
  timeoutMs: number,
): (rpc: string, payload: Record<string, string>) => Promise<unknown> {
  return async (rpc, payload) => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The deadline includes body parsing. Abort alone is insufficient for a
      // stuck transport; neither outcome authorizes deleting a lease.
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error('Migration admission transport unavailable'));
        }, timeoutMs);
      });
      const operation = (async () => {
        const result = await requestFetch(`${origin}/rest/v1/rpc/${rpc}`, {
          method: 'POST',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: abort.signal,
          redirect: 'error',
        });
        if (!result.ok) return null;
        return await result.json();
      })();
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

/**
 * Resolve a Supabase bearer through the authoritative Auth endpoint before any
 * migration decision. Request bodies never provide subject or generation.
 */
export function verifiedBearerMindManualScope(
  action: ActionResolver,
): MindManualScopeResolver<Readonly<{ userId: string }>> {
  if (typeof action === 'string' && !validAction(action)) {
    throw new Error('Invalid owner-scoped migration action');
  }
  return async (request, runtime) => {
    const authorization = request.headers.get('authorization');
    const bearer = authorization && authorization.length <= 16_384
      ? /^Bearer[\t ]+([A-Za-z0-9._~-]+)[\t ]*$/i.exec(authorization)
      : null;
    if (!authorization || authorization.length > 16_384 ||
      !bearer) {
      return { kind: 'respond', response: authenticationRequired() };
    }
    const normalizedAuthorization = `Bearer ${bearer[1]}`;
    let result: Response;
    try {
      result = await runtime.fetch(`${runtime.origin}/auth/v1/user`, {
        method: 'GET',
        redirect: 'error',
        headers: { apikey: runtime.serviceKey, Authorization: normalizedAuthorization },
      });
    } catch {
      return { kind: 'respond', response: unavailable() };
    }
    if (result.status === 401 || result.status === 403) {
      return { kind: 'respond', response: authenticationRequired() };
    }
    if (!result.ok) return { kind: 'respond', response: unavailable() };

    let user: unknown;
    try {
      user = await result.json();
    } catch {
      return { kind: 'respond', response: unavailable() };
    }
    const subjectId = user && typeof user === 'object' && !Array.isArray(user)
      ? (user as Record<string, unknown>).id
      : undefined;
    if (!validSubject(subjectId)) return { kind: 'respond', response: unavailable() };

    const resolvedAction = typeof action === 'string' ? action : action(request);
    if (resolvedAction instanceof Response) return { kind: 'respond', response: resolvedAction };
    if (!validAction(resolvedAction)) return { kind: 'respond', response: unavailable() };
    return {
      kind: 'resolved',
      subjectId,
      action: resolvedAction,
      context: Object.freeze({ userId: subjectId }),
    };
  };
}

async function runWithoutLease<Context>(
  request: Request,
  handler: Handler<Context>,
  context: Context,
  dependencies: MigrationWriteFenceDependencies,
): Promise<Response> {
  const completions: Promise<void>[] = [];
  let registrationOpen = true;
  const lifecycle: MindManualWorkLifecycle = Object.freeze({
    holdUntil(completion: PromiseLike<unknown>) {
      if (!registrationOpen) throw new Error('Work lifecycle must be registered before returning');
      if (!completion || typeof completion.then !== 'function') {
        throw new Error('Work lifecycle requires an explicit completion promise');
      }
      completions.push(Promise.resolve(completion).then(() => undefined, () => undefined));
    },
  });
  let response: Response;
  try {
    response = await handler(request, lifecycle, context);
  } finally {
    registrationOpen = false;
  }
  if (completions.length > 0) {
    // Unrelated work needs no migration lease, but registered provider/socket
    // lifetime still has to survive the HTTP callback returning.
    const completion = Promise.all(completions).then(() => undefined);
    try {
      const runtime = globalThis as RuntimeGlobals;
      const waitUntil = dependencies.waitUntil ?? runtime.EdgeRuntime?.waitUntil.bind(runtime.EdgeRuntime);
      waitUntil?.(completion);
    } catch {
      // The work promises already have rejection handlers; never turn an
      // unrelated user's completed response into selected migration state.
    }
  }
  return response instanceof Response ? response : unavailable();
}

async function runWithLease<Context>(
  request: Request,
  handler: Handler<Context>,
  context: Context,
  releaseLease: () => Promise<void>,
  dependencies: MigrationWriteFenceDependencies,
): Promise<Response> {
  const completions: Promise<boolean>[] = [];
  let registrationOpen = true;
  let release: Promise<void> | undefined;
  const lifecycle: MindManualWorkLifecycle = Object.freeze({
    holdUntil(completion: PromiseLike<unknown>) {
      if (!registrationOpen) {
        throw new Error('Work lifecycle must be registered before returning');
      }
      if (!completion || typeof completion.then !== 'function') {
        completions.push(Promise.resolve(false));
        throw new Error('Work lifecycle requires an explicit completion promise');
      }
      completions.push(Promise.resolve(completion).then(() => true, () => false));
    },
  });

  const releaseAfterCompletion = (): Promise<void> => {
    release ??= (async () => {
      if (!(await Promise.all(completions)).every(Boolean)) return;
      await releaseLease();
    })();
    return release;
  };

  let response: Response;
  try {
    response = await handler(request, lifecycle, context);
  } finally {
    registrationOpen = false;
  }
  // Exceptions and 5xx outcomes retain the lease for reconciliation.
  if (!(response instanceof Response)) return unavailable();
  if (response.status >= 500) return response;
  if (response.status === 101) {
    if (completions.length > 0) {
      const completion = releaseAfterCompletion();
      try {
        const runtime = globalThis as RuntimeGlobals;
        const waitUntil = dependencies.waitUntil ?? runtime.EdgeRuntime?.waitUntil.bind(runtime.EdgeRuntime);
        waitUntil?.(completion);
      } catch {
        // A lost worker leaves the durable lease in place.
      }
    }
    return response;
  }
  if (!response.body) {
    await releaseAfterCompletion();
    return response;
  }
  try {
    const reader = response.body.getReader();
    let ended = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (ended) return;
        try {
          const chunk = await reader.read();
          if (ended) return;
          if (chunk.done) {
            ended = true;
            reader.releaseLock();
            await releaseAfterCompletion();
            controller.close();
          } else {
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          if (ended) return;
          ended = true;
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        if (ended) return;
        ended = true;
        try {
          await reader.cancel(reason);
        } finally {
          reader.releaseLock();
        }
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return unavailable();
  }
}

/**
 * V2 owner-scoped admission. The resolver proves the caller subject before the
 * RPC atomically classifies it as selected or unrelated. Unrelated users never
 * create a lease and continue in every migration phase.
 */
export function wrapMindManualSubjectHandler<Context>(
  functionName: string,
  resolver: MindManualScopeResolver<Context>,
  handler: Handler<Context>,
  dependencies: MigrationWriteFenceDependencies = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (!allowedFunctions.has(functionName)) return unavailable();

    let admission:
      | Readonly<{ kind: 'unselected'; context: Context }>
      | Readonly<{ kind: 'admitted'; context: Context; releaseLease: () => Promise<void> }>;
    try {
      const runtime = globalThis as RuntimeGlobals;
      const env = dependencies.env ?? ((name) => runtime.Deno?.env?.get(name));
      const { origin, serviceKey, generation } = ownerScopedConfiguration(env);
      const requestFetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
      const scope = await resolver(request, { origin, serviceKey, fetch: requestFetch });
      if (scope.kind === 'respond') return scope.response;
      if (!validSubject(scope.subjectId) || !validAction(scope.action)) return unavailable();

      const leaseId = (dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID()))();
      if (!uuidV4.test(leaseId)) return unavailable();
      const timeoutMs = dependencies.rpcTimeoutMs ?? 5_000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return unavailable();
      const callRpc = rpcCaller(origin, serviceKey, requestFetch, timeoutMs);
      const payload = {
        p_function_name: functionName,
        p_action: scope.action,
        p_subject_id: scope.subjectId,
        p_lease_id: leaseId,
        p_generation: generation,
      };
      const decision = admissionDecision(
        await callRpc('mind_manual_admit_subject_edge', payload),
        generation,
      );
      if (decision === 'unselected') {
        admission = { kind: 'unselected', context: scope.context };
      } else if (decision === 'admitted') {
        admission = {
          kind: 'admitted',
          context: scope.context,
          releaseLease: async () => {
            try {
              // One exact attempt. False/malformed/lost releases retain the row.
              releaseDecision(await callRpc('mind_manual_release_subject_edge', payload));
            } catch {
              // Retain uncertain selected work for explicit reconciliation.
            }
          },
        };
      } else {
        return unavailable();
      }
    } catch {
      // Do not log provider URLs, credentials, subjects, or control state.
      return unavailable();
    }
    // Handler behavior remains outside the sanitized control-plane boundary.
    // A selected exception propagates exactly as before while its lease remains.
    if (admission.kind === 'unselected') {
      return await runWithoutLease(request, handler, admission.context, dependencies);
    }
    return await runWithLease(
      request, handler, admission.context, admission.releaseLease, dependencies,
    );
  };
}

/**
 * This gate does not replace each endpoint's caller authentication. Its random
 * lease is server generated and the service credential never comes from the
 * request. Only an exact JSON true from the service-only admission RPC permits
 * the handler to run; a lost response may have acquired a lease, so admission is
 * never retried or compensated by blindly releasing an uncertain acquisition.
 */
export function wrapMindManualHandler(
  functionName: string,
  handler: Handler,
  dependencies: MigrationWriteFenceDependencies = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') {
      // Do not invoke the wrapped handler, even for preflight.
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (!allowedFunctions.has(functionName)) return unavailable();

    let leaseId: string;
    let callRpc: (rpc: string, payload: Record<string, string>) => Promise<boolean>;
    try {
      const runtime = globalThis as RuntimeGlobals;
      const env = dependencies.env ?? ((name) => runtime.Deno?.env?.get(name));
      const { origin, serviceKey } = serverConfiguration(env);
      const requestFetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
      const randomUUID = dependencies.randomUUID ?? (() => globalThis.crypto.randomUUID());
      leaseId = randomUUID();
      if (!uuidV4.test(leaseId)) return unavailable();

      const timeoutMs = dependencies.rpcTimeoutMs ?? 5_000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return unavailable();
      callRpc = async (rpc, payload) => {
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          // The deadline includes body parsing. Abort alone is insufficient for
          // a stuck transport; neither outcome authorizes deleting a lease.
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              abort.abort();
              reject(new Error('Migration admission transport unavailable'));
            }, timeoutMs);
          });
          const operation = (async () => {
            const result = await requestFetch(`${origin}/rest/v1/rpc/${rpc}`, {
              method: 'POST',
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
              signal: abort.signal,
              redirect: 'error',
            });
            return result.ok && (await result.json()) === true;
          })();
          return await Promise.race([operation, timeout]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      };

      if (!(await callRpc('mind_manual_admit_edge', {
        p_function_name: functionName,
        p_lease_id: leaseId,
      }))) return unavailable();
    } catch {
      // No exception/response body logging: provider URLs and credentials may
      // appear in transport errors. Also do not disclose whether freeze is on.
      return unavailable();
    }

    const completions: Promise<boolean>[] = [];
    let registrationOpen = true;
    let release: Promise<void> | undefined;
    const lifecycle: MindManualWorkLifecycle = Object.freeze({
      holdUntil(completion: PromiseLike<unknown>) {
        if (!registrationOpen) {
          throw new Error('Work lifecycle must be registered before returning');
        }
        if (!completion || typeof completion.then !== 'function') {
          completions.push(Promise.resolve(false));
          throw new Error('Work lifecycle requires an explicit completion promise');
        }
        // Attach rejection handling immediately, even if the handler is still
        // working. A failed completion cannot establish a clean drain.
        completions.push(Promise.resolve(completion).then(() => true, () => false));
      },
    });

    const releaseAfterCompletion = (): Promise<void> => {
      release ??= (async () => {
        if (!(await Promise.all(completions)).every(Boolean)) return;
        try {
          // One attempt only. Failure/false/lost response must not be treated as
          // a clean drain; SQL retains the lease unless it actually released it.
          await callRpc('mind_manual_release_edge', { p_lease_id: leaseId });
        } catch {
          // Retain uncertain leases for explicit operator reconciliation.
        }
      })();
      return release;
    };

    let response: Response;
    try {
      response = await handler(request, lifecycle, undefined);
    } finally {
      registrationOpen = false;
    }
    // A thrown handler or 5xx response does not prove an upstream provider
    // stopped: a lost response may hide a committed/continuing operation. Keep
    // the lease for reconciliation instead of counting failure as clean drain.
    // The finally above closes registration but intentionally does NOT release.

    if (!(response instanceof Response)) {
      // An invalid handler result gives no trustworthy lifecycle boundary.
      return unavailable();
    }
    if (response.status >= 500) return response;
    if (response.status === 101) {
      if (completions.length > 0) {
        const completion = releaseAfterCompletion();
        try {
          const runtime = globalThis as RuntimeGlobals;
          const waitUntil = dependencies.waitUntil ?? runtime.EdgeRuntime?.waitUntil.bind(runtime.EdgeRuntime);
          waitUntil?.(completion);
        } catch {
          // A runtime that cannot remain alive may lose the release, leaving the
          // DB lease in place. Do not synthesize socket completion to recover it.
        }
      }
      // An uninstrumented upgrade permanently retains its lease. Never infer
      // WebSocket completion from the HTTP handshake or request.signal.
      return response;
    }
    if (!response.body) {
      await releaseAfterCompletion();
      return response;
    }

    // Response.body is also a stream for buffered JSON/audio. Observe its actual
    // EOF instead of guessing from content-type and releasing a producer early.
    // Cancellation and stream errors intentionally retain the lease: producer
    // side effects may still be running. Such producers also need holdUntil().
    try {
      const reader = response.body.getReader();
      let ended = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (ended) return;
          try {
            const chunk = await reader.read();
            // cancel() can resolve an in-flight read with done:true. That is
            // cancellation, not producer EOF, and must never release a lease.
            if (ended) return;
            if (chunk.done) {
              ended = true;
              reader.releaseLock();
              await releaseAfterCompletion();
              controller.close();
            } else {
              controller.enqueue(chunk.value);
            }
          } catch (error) {
            if (ended) return;
            ended = true;
            reader.releaseLock();
            controller.error(error);
          }
        },
        async cancel(reason) {
          if (ended) return;
          ended = true;
          try {
            await reader.cancel(reason);
          } finally {
            reader.releaseLock();
          }
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      // Already consumed/locked/invalid bodies cannot prove completion.
      return unavailable();
    }
  };
}
