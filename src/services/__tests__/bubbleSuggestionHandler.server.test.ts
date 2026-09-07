import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BUBBLE_SUGGESTION_MODEL,
  parseBubbleSuggestionInput,
  parseBubbleSuggestionSteps,
  readBoundedJson,
} from '../../../supabase/functions/ai-bubble-suggest/contract';
import { handleBubbleSuggestion } from '../../../supabase/functions/ai-bubble-suggest/handler';

const input = { title: 'A sketch', notes: 'Begin with a simple shape.' };
const step = { title: 'Draw one shape', reason: 'A small action from the selected notes.', estimatedMinutes: 2 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const provider = (body: unknown = { suggestions: [step] }) => ({ model: BUBBLE_SUGGESTION_MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] });
const request = (body: unknown = input, headers = { Authorization: 'Bearer synthetic-user-token', 'Content-Type': 'application/json' }) =>
  new Request('https://synthetic.example.test/ai-bubble-suggest', { method: 'POST', headers, body: JSON.stringify(body) });
function fixture() {
  return { authenticate: vi.fn().mockResolvedValue(true), apiKey: 'synthetic-provider-key', fetch: vi.fn().mockResolvedValue(json(provider())) };
}

describe('selected-bubble Edge admission and privacy', () => {
  it('handles preflight without authentication or provider work', async () => {
    const deps = fixture();
    const result = await handleBubbleSuggestion(new Request('https://synthetic.example.test', { method: 'OPTIONS' }), deps);
    expect(result.status).toBe(204); expect(deps.authenticate).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('rejects other methods without work', async () => {
    const deps = fixture();
    expect((await handleBubbleSuggestion(new Request('https://synthetic.example.test'), deps)).status).toBe(405);
    expect(deps.authenticate).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['', 'synthetic-token', 'Basic synthetic-token', `Bearer ${'x'.repeat(8193)}`])('rejects missing/malformed authorization before consuming text', async Authorization => {
    const deps = fixture(); const req = request(input, { Authorization, 'Content-Type': 'application/json' });
    const result = await handleBubbleSuggestion(req, deps);
    expect(result.status).toBe(401); expect(req.bodyUsed).toBe(false);
    expect(deps.authenticate).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(['denied', 'throws'])('rejects %s user authentication before consuming text', async failure => {
    const deps = fixture(); const req = request();
    if (failure === 'denied') deps.authenticate.mockResolvedValue(false);
    else deps.authenticate.mockRejectedValue(new Error('PRIVATE_AUTH_ERROR'));
    const result = await handleBubbleSuggestion(req, deps);
    expect(result.status).toBe(401); expect(await result.json()).toEqual({ code: 'auth-required' });
    expect(req.bodyUsed).toBe(false); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, userContext: { secret: 'never accept broader context' } },
    { ...input, sourceTaskId: 'never accept locators' },
    { ...input, title: 't'.repeat(301) },
    { ...input, notes: 'n'.repeat(4001) },
    { title: '', notes: ' ' },
    { ...input, title: 'bad\u0000text' },
    ['array'], null,
  ])('rejects invalid or oversized selected input', async body => {
    const deps = fixture(); const result = await handleBubbleSuggestion(request(body), deps);
    expect(result.status).toBe(400); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('rejects excess input bytes even when Content-Length is absent', async () => {
    const deps = fixture(); const result = await handleBubbleSuggestion(request({ title: 't', notes: 'n'.repeat(30_000) }), deps);
    expect(result.status).toBe(400); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('requires JSON content type', async () => {
    const deps = fixture();
    expect((await handleBubbleSuggestion(request(input, { Authorization: 'Bearer synthetic', 'Content-Type': 'text/plain' }), deps)).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('does not contact any provider if its existing key is absent', async () => {
    const deps = { ...fixture(), apiKey: undefined };
    const result = await handleBubbleSuggestion(request(), deps);
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ code: 'unavailable' }); expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('sends only selected text as data and returns bounded, labelled drafts with no persistence', async () => {
    const deps = fixture(); const result = await handleBubbleSuggestion(request(), deps);
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({ suggestions: [step], model: BUBBLE_SUGGESTION_MODEL, origin: 'ai' });
    expect(deps.authenticate).toHaveBeenCalledExactlyOnceWith('synthetic-user-token');
    expect(deps.fetch).toHaveBeenCalledExactlyOnceWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({ method: 'POST', redirect: 'error' }));
    const body = JSON.parse(deps.fetch.mock.calls[0][1].body);
    expect(body.model).toBe(BUBBLE_SUGGESTION_MODEL); expect(body.store).toBe(false);
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.messages.map((message: { role: string }) => message.role)).toEqual(['system', 'user']);
    expect(JSON.parse(body.messages[1].content)).toEqual(input);
    expect(body).not.toHaveProperty('tools'); expect(body).not.toHaveProperty('user');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it.each([429, 401, 500])('sanitizes provider HTTP %s without reading its body', async status => {
    const deps = fixture(); const reflected = json({ message: 'PRIVATE_PROVIDER_ERROR' }, status); deps.fetch.mockResolvedValue(reflected);
    const result = await handleBubbleSuggestion(request(), deps);
    expect(result.status).toBe(status === 429 ? 503 : 502);
    expect(await result.json()).toEqual({ code: status === 429 ? 'unavailable' : 'provider-failure' });
    expect(reflected.bodyUsed).toBe(false);
  });

  it.each([
    { ...provider(), model: undefined },
    { ...provider(), model: 'gpt-4.1-other-snapshot' },
    { choices: [] },
    { model: BUBBLE_SUGGESTION_MODEL, choices: [{ finish_reason: 'length', message: { content: JSON.stringify({ suggestions: [step] }) } }] },
    { model: BUBBLE_SUGGESTION_MODEL, choices: [{ finish_reason: 'stop', message: { refusal: 'PRIVATE_REFUSAL', content: '{}' } }] },
    { model: BUBBLE_SUGGESTION_MODEL, choices: [{ finish_reason: 'stop', message: { content: 'PRIVATE_NOT_JSON' } }] },
    provider({ suggestions: [step], privateExtra: 'not accepted' }),
    provider({ suggestions: Array(4).fill(step) }),
    provider({ suggestions: [{ ...step, estimatedMinutes: 0 }] }),
    provider({ suggestions: [{ ...step, title: 't'.repeat(301) }] }),
  ])('rejects invalid, refused, truncated, or extra model output', async output => {
    const deps = fixture(); deps.fetch.mockResolvedValue(json(output));
    const result = await handleBubbleSuggestion(request(), deps);
    expect(result.status).toBe(502); expect(await result.json()).toEqual({ code: 'provider-failure' });
  });

  it('caps provider response bytes and sanitizes transport exceptions', async () => {
    const deps = fixture(); deps.fetch.mockResolvedValue(json({ extra: 'PRIVATE'.repeat(7000) }));
    expect((await handleBubbleSuggestion(request(), deps)).status).toBe(502);
    deps.fetch.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));
    expect(await (await handleBubbleSuggestion(request(), deps)).json()).toEqual({ code: 'provider-failure' });
  });

  it('forwards cancellation without accepting a late provider response', async () => {
    const controller = new AbortController(); const deps = fixture();
    const req = new Request(request(), { signal: controller.signal });
    deps.fetch.mockImplementation(async (_url, options) => {
      controller.abort(); expect(options.signal.aborted).toBe(true); return json(provider());
    });
    const result = await handleBubbleSuggestion(req, deps);
    expect(result.status).toBe(499); expect(await result.json()).toEqual({ code: 'aborted' });
  });

  it('does not accept a provider result after the bounded deadline', async () => {
    vi.useFakeTimers();
    try {
      const deps = fixture();
      deps.fetch.mockImplementation(async (_url, options) => {
        await vi.advanceTimersByTimeAsync(20_000);
        expect(options.signal.aborted).toBe(true);
        return json(provider());
      });
      const result = await handleBubbleSuggestion(request(), deps);
      expect(result.status).toBe(502); expect(await result.json()).toEqual({ code: 'provider-failure' });
    } finally { vi.useRealTimers(); }
  });

  it('keeps the independently verified user and no-logging release boundary in the entrypoint', () => {
    const entry = readFileSync(resolve('supabase/functions/ai-bubble-suggest/index.ts'), 'utf8');
    const handler = readFileSync(resolve('supabase/functions/ai-bubble-suggest/handler.ts'), 'utf8');
    const config = readFileSync(resolve('supabase/config.toml'), 'utf8');
    expect(entry).toContain('client.auth.getUser(bearer)'); expect(entry).toContain('is_anonymous !== true');
    expect(entry + handler).not.toMatch(/console\.|SERVICE_ROLE|\.from\(|\.rpc\(/u);
    expect(config).toMatch(/\[functions\.ai-bubble-suggest\]\s+verify_jwt = true/u);
  });
});

describe('selected-bubble strict response contract', () => {
  it('rejects inherited fields and duplicate normalized titles', () => {
    expect(parseBubbleSuggestionInput(Object.create(input))).toBeNull();
    expect(parseBubbleSuggestionSteps([Object.create(step)])).toBeNull();
    expect(parseBubbleSuggestionSteps([step, { ...step, title: 'DRAW  ONE SHAPE' }])).toBeNull();
  });

  it('rejects fractional, oversized, and nonnumeric estimates', () => {
    for (const estimatedMinutes of [1.5, 61, '5', null]) {
      expect(parseBubbleSuggestionSteps([{ ...step, estimatedMinutes }])).toBeNull();
    }
  });

  it('cancels an oversized stream instead of parsing it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('123456')); }, cancel });
    await expect(readBoundedJson(body, 5)).rejects.toThrow('Invalid bounded JSON');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
