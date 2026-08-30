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

type Handler = (
  request: Request,
  lifecycle: MindManualWorkLifecycle,
) => Response | Promise<Response>;

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
      response = await handler(request, lifecycle);
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
