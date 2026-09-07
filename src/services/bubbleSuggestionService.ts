import { supabase, supabaseConfig } from '@/integrations/supabase/client';
import {
  BUBBLE_SUGGESTION_LIMITS,
  parseBubbleSuggestionInput,
  parseBubbleSuggestionResponse,
  readBoundedJson,
  type BubbleSuggestionInput,
  type BubbleSuggestionResponse,
  type BubbleSuggestionStep,
} from '../../supabase/functions/ai-bubble-suggest/contract';

export type { BubbleSuggestionInput, BubbleSuggestionResponse, BubbleSuggestionStep };

export type BubbleSuggestionErrorCode = 'auth-required' | 'unavailable' | 'provider-failure' |
  'invalid-response' | 'invalid-input' | 'aborted' | 'stale';

const messages: Record<BubbleSuggestionErrorCode, string> = {
  'auth-required': 'Sign in to ask AI for suggestions. Local ideas are still available.',
  unavailable: 'AI suggestions are unavailable right now. Local ideas are still available.',
  'provider-failure': 'AI could not finish these suggestions. Local ideas are still available.',
  'invalid-response': 'AI returned suggestions we could not use. Local ideas are still available.',
  'invalid-input': 'Choose a bubble with a title or notes to ask for suggestions.',
  aborted: 'Suggestion request cancelled.',
  stale: 'This bubble changed. Ask again to use its latest text.',
};

export class BubbleSuggestionError extends Error {
  constructor(public readonly code: BubbleSuggestionErrorCode) {
    super(messages[code]);
    this.name = 'BubbleSuggestionError';
  }
}

/** This exact bounded projection is the only task content sent to the service. */
export function boundBubbleSuggestionInput(input: BubbleSuggestionInput): BubbleSuggestionInput {
  return {
    title: input.title.slice(0, BUBBLE_SUGGESTION_LIMITS.title),
    notes: input.notes.slice(0, BUBBLE_SUGGESTION_LIMITS.notes),
  };
}

interface RequestOptions {
  signal?: AbortSignal;
  /** A local full-source/version check; it is never sent to the backend. */
  isCurrent?: () => boolean;
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new BubbleSuggestionError('unavailable'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Called only from an explicit selected-bubble request; no retries or creation. */
export async function requestBubbleSuggestions(
  selected: BubbleSuggestionInput,
  options: RequestOptions = {},
): Promise<BubbleSuggestionResponse> {
  const assertCurrent = () => {
    if (options.signal?.aborted) throw new BubbleSuggestionError('aborted');
    if (options.isCurrent && !options.isCurrent()) throw new BubbleSuggestionError('stale');
  };
  assertCurrent();
  const input = parseBubbleSuggestionInput(boundBubbleSuggestionInput(selected));
  if (!input) throw new BubbleSuggestionError('invalid-input');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 25_000);
  const assertActive = () => {
    assertCurrent();
    if (controller.signal.aborted) throw new BubbleSuggestionError('unavailable');
  };
  try {
    const { data, error } = await untilAborted(supabase.auth.getSession(), controller.signal);
    assertActive();
    if (error || !data.session?.access_token || !data.session.user?.id || data.session.user.is_anonymous) {
      throw new BubbleSuggestionError('auth-required');
    }
    const response = await untilAborted(fetch(`${supabaseConfig.url}/functions/v1/ai-bubble-suggest`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: supabaseConfig.publishableKey,
        Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(input),
    }), controller.signal);
    assertActive();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new BubbleSuggestionError('auth-required');
      if ([404, 429, 503, 504].includes(response.status)) throw new BubbleSuggestionError('unavailable');
      throw new BubbleSuggestionError('provider-failure');
    }
    let result: BubbleSuggestionResponse | null;
    try {
      result = parseBubbleSuggestionResponse(await untilAborted(readBoundedJson(response.body, BUBBLE_SUGGESTION_LIMITS.responseBytes), controller.signal));
    } catch {
      assertActive();
      throw new BubbleSuggestionError('invalid-response');
    }
    assertActive();
    if (!result) throw new BubbleSuggestionError('invalid-response');
    return result;
  } catch (error) {
    assertCurrent();
    if (error instanceof BubbleSuggestionError) throw error;
    throw new BubbleSuggestionError('unavailable');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
