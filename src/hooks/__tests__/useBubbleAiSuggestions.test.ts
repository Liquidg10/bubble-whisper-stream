import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, type Task } from '@/types/task';
import { bubbleGrowthSourceFingerprint } from '@/domain/bubbleGarden';
import { BubbleSuggestionError, type BubbleSuggestionResponse } from '@/services/bubbleSuggestionService';
import { useBubbleAiSuggestions } from '@/hooks/useBubbleAiSuggestions';

const mocks = vi.hoisted(() => ({ tasks: [] as Task[], request: vi.fn() }));
vi.mock('@/stores/taskStore', () => ({ useTaskStore: { getState: () => ({ getTasks: () => mocks.tasks }) } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {}, supabaseConfig: {} }));
vi.mock('@/services/bubbleSuggestionService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/bubbleSuggestionService')>(),
  requestBubbleSuggestions: mocks.request,
}));

const source = (id = 'source'): Task => ({
  ...createTask('Plan a sketch', 'task', { description: 'Start with a simple shape.',
    domainLinks: [{ id: 'creativity-link', domainId: 'custom_creativity', label: 'Creativity', source: 'user', userConfirmed: true }],
    metadata: { privateFixture: 'never send surrounding metadata' },
  }), id,
});
const response = (): BubbleSuggestionResponse => ({ suggestions: [{ title: 'Draw one shape', reason: 'A small start from the selected notes.', estimatedMinutes: 2 }], origin: 'ai', model: 'gpt-4.1-2025-04-14' });
function deferred() {
  let resolve!: (value: BubbleSuggestionResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<BubbleSuggestionResponse>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('explicit AI request hook lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.tasks = [source()]; mocks.request.mockResolvedValue(response()); });

  it('does not call the AI service on mount, opening Grow, or switching modes', () => {
    const hook = renderHook(({ mode }: { mode: 'guide' | 'grow' | null }) => useBubbleAiSuggestions(mode), { initialProps: { mode: null } });
    hook.rerender({ mode: 'grow' }); hook.rerender({ mode: 'guide' }); hook.rerender({ mode: 'grow' });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('idle');
  });

  it('sends only the explicitly selected title/notes and keeps suggestions as drafts', async () => {
    const other = { ...source('other'), title: 'Unselected private fixture' };
    mocks.tasks.push(other); const before = structuredClone(mocks.tasks);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    await act(async () => { await hook.result.current.onRequest(mocks.tasks[0]); });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith({ title: 'Plan a sketch', notes: 'Start with a simple shape.' }, {
      signal: expect.any(AbortSignal), isCurrent: expect.any(Function),
    });
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.message).toContain('Nothing has been created');
    expect(hook.result.current.sprouts).toEqual([expect.objectContaining({ sourceTaskId: 'source', origin: 'ai',
      provenance: { sourceFingerprint: bubbleGrowthSourceFingerprint(mocks.tasks[0]), model: response().model },
      domainLinks: [expect.objectContaining({ domainId: 'custom_creativity' })],
    })]);
    expect(mocks.tasks).toEqual(before);
  });

  it('passes an empty notes string when the selected source has no notes', async () => {
    mocks.tasks = [{ ...source(), description: undefined }];
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    await act(async () => { await hook.result.current.onRequest(mocks.tasks[0]); });
    expect(mocks.request.mock.calls[0][0]).toEqual({ title: 'Plan a sketch', notes: '' });
  });

  it('aborts and clears a request when Grow closes, without accepting its late result', async () => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(({ mode }: { mode: 'grow' | null }) => useBubbleAiSuggestions(mode), { initialProps: { mode: 'grow' } });
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    expect(hook.result.current.status).toBe('loading');
    const options = mocks.request.mock.calls[0][1];
    hook.rerender({ mode: null });
    expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false);
    await act(async () => { pending.resolve(response()); await work; });
    expect(hook.result.current.status).toBe('idle'); expect(hook.result.current.sprouts).toEqual([]);
  });

  it('aborts and clears explicitly dismissed suggestions', async () => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    act(() => hook.result.current.onDismiss?.());
    expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { pending.reject(new BubbleSuggestionError('aborted')); await work; });
    expect(hook.result.current.status).toBe('idle'); expect(hook.result.current.message).toBeUndefined();
  });

  it('aborts the previous request when a new source replaces it and retains only the new result', async () => {
    const first = deferred(); const second = deferred();
    mocks.tasks.push({ ...source('second'), title: 'Learn a rhythm' });
    mocks.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let firstWork: void | Promise<void>; let secondWork: void | Promise<void>;
    act(() => { firstWork = hook.result.current.onRequest(mocks.tasks[0]); });
    act(() => { secondWork = hook.result.current.onRequest(mocks.tasks[1]); });
    expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.request.mock.calls[1][1].signal.aborted).toBe(false);
    await act(async () => { second.resolve(response()); await secondWork; });
    expect(hook.result.current.sourceTaskId).toBe('second'); expect(hook.result.current.status).toBe('ready');
    await act(async () => { first.resolve(response()); await firstWork; });
    expect(hook.result.current.sourceTaskId).toBe('second'); expect(hook.result.current.sprouts[0].sourceTaskId).toBe('second');
  });

  it('aborts on unmount and marks the request stale', async () => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    const options = mocks.request.mock.calls[0][1]; hook.unmount();
    expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false);
    pending.resolve(response()); await work;
  });

  it.each(['title', 'description'])('rejects a source with edited %s even if a late service ignores the stale guard', async field => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    const options = mocks.request.mock.calls[0][1];
    mocks.tasks = [{ ...mocks.tasks[0], [field]: 'Changed while waiting' }];
    expect(options.isCurrent()).toBe(false);
    await act(async () => { pending.resolve(response()); await work; });
    expect(hook.result.current.status).toBe('error'); expect(hook.result.current.sprouts).toEqual([]);
    expect(hook.result.current.message).toContain('This bubble changed');
  });

  it.each(['completed', 'reference', 'deleted'])('rejects a source that becomes %s while waiting', async change => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    mocks.tasks = change === 'deleted' ? [] : [{ ...mocks.tasks[0], ...(change === 'completed' ? { completed: true } : { actionability: 'reference' as const }) }];
    expect(mocks.request.mock.calls[0][1].isCurrent()).toBe(false);
    await act(async () => { pending.resolve(response()); await work; });
    expect(hook.result.current.status).toBe('error'); expect(hook.result.current.sprouts).toEqual([]);
  });

  it('retains a valid response when only unrelated metadata changes and uses current confirmed links', async () => {
    const pending = deferred(); mocks.request.mockReturnValue(pending.promise);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    let work: void | Promise<void>;
    act(() => { work = hook.result.current.onRequest(mocks.tasks[0]); });
    mocks.tasks = [{ ...mocks.tasks[0], priority: 10, updatedAt: Date.now() + 1, domainLinks: [] }];
    expect(mocks.request.mock.calls[0][1].isCurrent()).toBe(true);
    await act(async () => { pending.resolve(response()); await work; });
    expect(hook.result.current.status).toBe('ready'); expect(hook.result.current.sprouts[0].domainLinks).toEqual([]);
  });

  it.each(['auth-required', 'provider-failure', 'unavailable', 'stale'] as const)('reports %s truthfully without disguising local ideas as an AI result', async code => {
    const error = new BubbleSuggestionError(code); mocks.request.mockRejectedValue(error);
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    await act(async () => { await hook.result.current.onRequest(mocks.tasks[0]); });
    expect(hook.result.current.status).toBe('error'); expect(hook.result.current.message).toBe(error.message);
    expect(hook.result.current.sprouts).toEqual([]); expect(mocks.request).toHaveBeenCalledOnce();
  });

  it('sanitizes unexpected failures rather than reflecting text from exceptions', async () => {
    mocks.request.mockRejectedValue(new Error('PRIVATE_FIXTURE_DETAILS'));
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    await act(async () => { await hook.result.current.onRequest(mocks.tasks[0]); });
    expect(hook.result.current.message).not.toContain('PRIVATE');
    expect(hook.result.current.message).toContain('local starting ideas');
    expect(hook.result.current.status).toBe('error');
  });

  it('reports existing drafts without claiming new tasks when all returned keys already exist', async () => {
    mocks.tasks.push({ ...source('existing'), metadata: { bubbleGarden: { sproutKey: 'source:ai:draw%20one%20shape' } } });
    const hook = renderHook(() => useBubbleAiSuggestions('grow'));
    await act(async () => { await hook.result.current.onRequest(mocks.tasks[0]); });
    expect(hook.result.current.status).toBe('ready'); expect(hook.result.current.sprouts).toEqual([]);
    expect(hook.result.current.message).toContain('already represented');
  });
});
