import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boundBubbleSuggestionInput,
  BubbleSuggestionError,
  requestBubbleSuggestions,
} from '@/services/bubbleSuggestionService';
import { BUBBLE_SUGGESTION_MODEL } from '../../../supabase/functions/ai-bubble-suggest/contract';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  config: { url: 'https://ekekeywoxvdbfbmqyhjy.supabase.co', publishableKey: 'synthetic-publishable-key' },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  supabaseConfig: mocks.config,
}));

const input = { title: 'Plan a sketch', notes: 'Start with a simple shape.' };
const suggestion = { title: 'Draw one simple shape', reason: 'A small start from the selected notes.', estimatedMinutes: 2 };
const response = () => ({ suggestions: [suggestion], origin: 'ai', model: BUBBLE_SUGGESTION_MODEL });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const session = () => ({ data: { session: { access_token: 'synthetic-user-token', user: { id: 'synthetic-user' } } }, error: null });

describe('explicit selected-bubble AI request', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session());
    fetchMock.mockResolvedValue(json(response()));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('does no session/provider work merely by importing the service', () => {
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['ekekeywoxvdbfbmqyhjy', 'fjxedbaskrbewjunfxaj'])('sends only the bounded selected text to the configured %s target', async project => {
    mocks.config.url = `https://${project}.supabase.co`;
    const selected = { ...input, title: 't'.repeat(301), notes: 'n'.repeat(4001), id: 'never-send-id', context: 'never-send-context' };
    const result = await requestBubbleSuggestions(selected);
    expect(result).toEqual(response());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${mocks.config.url}/functions/v1/ai-bubble-suggest`, expect.objectContaining({
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: mocks.config.publishableKey, Authorization: 'Bearer synthetic-user-token' },
    }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: 't'.repeat(300), notes: 'n'.repeat(4000) });
  });

  it('can use notes without inventing a title', async () => {
    expect(boundBubbleSuggestionInput({ title: '', notes: 'A thought' })).toEqual({ title: '', notes: 'A thought' });
    await expect(requestBubbleSuggestions({ title: '', notes: 'A thought' })).resolves.toMatchObject({ origin: 'ai' });
  });

  it.each([
    { data: { session: null }, error: null },
    { ...session(), error: new Error('PRIVATE_AUTH_ERROR') },
    { data: { session: { access_token: '', user: { id: 'id' } } }, error: null },
    { data: { session: { access_token: 'token', user: { id: 'id', is_anonymous: true } } }, error: null },
  ])('requires a signed-in nonanonymous session', async auth => {
    mocks.getSession.mockResolvedValue(auth);
    await expect(requestBubbleSuggestions(input)).rejects.toMatchObject({ code: 'auth-required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ title: ' ', notes: '' }, { title: 'bad\u0000text', notes: '' }])('rejects invalid selected content without auth/provider work', async selected => {
    await expect(requestBubbleSuggestions(selected)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[401, 'auth-required'], [403, 'auth-required'], [404, 'unavailable'], [429, 'unavailable'], [503, 'unavailable'], [504, 'unavailable'], [502, 'provider-failure']])('sanitizes HTTP %s without reading the reflected error body', async (status, code) => {
    const result = json({ error: 'PRIVATE_REFLECTED_BODY' }, Number(status));
    fetchMock.mockResolvedValue(result);
    await expect(requestBubbleSuggestions(input)).rejects.toMatchObject({ code });
    expect(result.bodyUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...response(), origin: 'local' },
    { ...response(), model: 'unreviewed-model' },
    { ...response(), suggestions: Array.from({ length: 4 }, (_, i) => ({ ...suggestion, title: `Step ${i}` })) },
    { ...response(), suggestions: [{ ...suggestion, estimatedMinutes: 999 }] },
    { ...response(), extra: 'PRIVATE_EXTRA' },
  ])('rejects malformed or mislabelled responses', async body => {
    fetchMock.mockResolvedValue(json(body));
    await expect(requestBubbleSuggestions(input)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('caps response bytes before accepting JSON', async () => {
    fetchMock.mockResolvedValue(json({ ...response(), extra: 'x'.repeat(40_000) }));
    await expect(requestBubbleSuggestions(input)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('does not echo transport errors or automatically retry/fall back', async () => {
    fetchMock.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));
    const error = await requestBubbleSuggestions(input).catch(error => error);
    expect(error).toBeInstanceOf(BubbleSuggestionError);
    expect(error.code).toBe('unavailable');
    expect(error.message).not.toContain('PRIVATE');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not start an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(requestBubbleSuggestions(input, { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' });
    expect(mocks.getSession).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels promptly even while waiting for session access', async () => {
    mocks.getSession.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const request = requestBubbleSuggestions(input, { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an in-flight fetch and discards any late result', async () => {
    let respond: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { respond = resolve; }));
    const controller = new AbortController();
    const request = requestBubbleSuggestions(input, { signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'aborted' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    respond!(json(response()));
  });

  it('rejects a stale source before sending anything', async () => {
    await expect(requestBubbleSuggestions(input, { isCurrent: () => false })).rejects.toMatchObject({ code: 'stale' });
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('rejects source changes during session access before fetch', async () => {
    let current = true;
    mocks.getSession.mockImplementation(async () => { current = false; return session(); });
    await expect(requestBubbleSuggestions(input, { isCurrent: () => current })).rejects.toMatchObject({ code: 'stale' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects source changes while the model is working', async () => {
    let current = true;
    fetchMock.mockImplementation(async () => { current = false; return json(response()); });
    await expect(requestBubbleSuggestions(input, { isCurrent: () => current })).rejects.toMatchObject({ code: 'stale' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bounds a stalled request with a sanitized timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));
    const request = requestBubbleSuggestions(input);
    const rejected = expect(request).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(25_000);
    await rejected;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
