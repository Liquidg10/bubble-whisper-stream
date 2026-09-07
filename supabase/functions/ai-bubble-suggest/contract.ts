/** Shared by the selected-bubble client and its stateless Edge handler. */
export const BUBBLE_SUGGESTION_MODEL = 'gpt-4.1-2025-04-14';
export const BUBBLE_SUGGESTION_LIMITS = Object.freeze({
  title: 300,
  notes: 4000,
  reason: 400,
  suggestions: 3,
  requestBytes: 24_000,
  responseBytes: 32_000,
});

export interface BubbleSuggestionInput {
  title: string;
  notes: string;
}

export interface BubbleSuggestionStep {
  title: string;
  reason: string;
  estimatedMinutes: number;
}

export interface BubbleSuggestionResponse {
  suggestions: BubbleSuggestionStep[];
  model: typeof BUBBLE_SUGGESTION_MODEL;
  origin: 'ai';
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function boundedText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && !hasControlCharacter(value) &&
    (allowEmpty || value.trim().length > 0);
}

export function parseBubbleSuggestionInput(value: unknown): BubbleSuggestionInput | null {
  if (!exactObject(value, ['title', 'notes']) ||
    !boundedText(value.title, BUBBLE_SUGGESTION_LIMITS.title, true) ||
    !boundedText(value.notes, BUBBLE_SUGGESTION_LIMITS.notes, true) ||
    (!value.title.trim() && !value.notes.trim())) return null;
  return { title: value.title, notes: value.notes };
}

export function parseBubbleSuggestionSteps(value: unknown): BubbleSuggestionStep[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > BUBBLE_SUGGESTION_LIMITS.suggestions) return null;
  const seen = new Set<string>();
  const steps: BubbleSuggestionStep[] = [];
  for (const raw of value) {
    if (!exactObject(raw, ['title', 'reason', 'estimatedMinutes']) ||
      !boundedText(raw.title, BUBBLE_SUGGESTION_LIMITS.title) ||
      !boundedText(raw.reason, BUBBLE_SUGGESTION_LIMITS.reason) ||
      typeof raw.estimatedMinutes !== 'number' || !Number.isInteger(raw.estimatedMinutes) ||
      raw.estimatedMinutes < 1 || raw.estimatedMinutes > 60) return null;
    const title = raw.title.trim();
    const key = title.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ');
    if (seen.has(key)) return null;
    seen.add(key);
    steps.push({ title, reason: raw.reason.trim(), estimatedMinutes: raw.estimatedMinutes });
  }
  return steps;
}

export function parseBubbleSuggestionResponse(value: unknown): BubbleSuggestionResponse | null {
  if (!exactObject(value, ['suggestions', 'model', 'origin']) ||
    value.model !== BUBBLE_SUGGESTION_MODEL || value.origin !== 'ai') return null;
  const suggestions = parseBubbleSuggestionSteps(value.suggestions);
  return suggestions ? { suggestions, model: BUBBLE_SUGGESTION_MODEL, origin: 'ai' } : null;
}

/** Bound a stream before JSON parsing; Content-Length alone is not authoritative. */
export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Body limit');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch {
    try { await reader.cancel(); } catch { /* A failed stream still stays rejected. */ }
    throw new Error('Invalid bounded JSON');
  } finally {
    reader.releaseLock();
  }
}
