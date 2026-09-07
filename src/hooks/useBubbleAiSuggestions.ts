import { useCallback, useEffect, useRef, useState } from 'react';
import type { GardenAiSuggestions } from '@/components/BubbleGarden';
import type { Task } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { bubbleGrowthSourceFingerprint, canGrowBubble, createAiSprouts } from '@/domain/bubbleGarden';
import { requestBubbleSuggestions, BubbleSuggestionError } from '@/services/bubbleSuggestionService';

type ResultState = Omit<GardenAiSuggestions, 'onRequest' | 'onDismiss'>;

/** AI runs only on an explicit request; closing or replacing the request aborts it. */
export function useBubbleAiSuggestions(mode: 'guide' | 'grow' | null): GardenAiSuggestions {
  const [result, setResult] = useState<ResultState>({ sourceTaskId: '', sourceFingerprint: '', sprouts: [], status: 'idle' });
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const dismiss = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setResult({ sourceTaskId: '', sourceFingerprint: '', sprouts: [], status: 'idle' });
  }, []);
  useEffect(() => {
    if (mode !== 'grow') dismiss();
  }, [mode, dismiss]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestRef.current?.abort(); };
  }, []);
  const onRequest = useCallback(async (source: Task) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const sourceFingerprint = bubbleGrowthSourceFingerprint(source);
    const isCurrent = () => {
      const current = useTaskStore.getState().getTasks().find(task => task.id === source.id);
      return mounted.current && requestRef.current === controller && !controller.signal.aborted
        && !!current && canGrowBubble(current) && bubbleGrowthSourceFingerprint(current) === sourceFingerprint;
    };
    setResult({ sourceTaskId: source.id, sourceFingerprint, sprouts: [], status: 'loading' });
    try {
      const response = await requestBubbleSuggestions({ title: source.title, notes: source.description ?? '' }, { signal: controller.signal, isCurrent });
      if (!isCurrent()) {
        if (!controller.signal.aborted && mounted.current && requestRef.current === controller) {
          setResult({ sourceTaskId: source.id, sourceFingerprint, sprouts: [], status: 'error', message: 'This bubble changed while the ideas were being made. Request fresh ideas from the current version.' });
        }
        return;
      }
      const tasks = useTaskStore.getState().getTasks();
      const current = tasks.find(task => task.id === source.id)!;
      const sprouts = createAiSprouts(current, response.suggestions, tasks, { sourceFingerprint, model: response.model });
      setResult({ sourceTaskId: source.id, sourceFingerprint, sprouts, status: 'ready', message: sprouts.length ? 'AI ideas are ready for your review. Nothing has been created.' : 'These ideas are already represented by your connected steps.' });
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || requestRef.current !== controller) return;
      const message = error instanceof BubbleSuggestionError ? error.message : 'AI ideas are unavailable right now. Your notes and local starting ideas are still here.';
      setResult({ sourceTaskId: source.id, sourceFingerprint, sprouts: [], status: 'error', message });
    }
  }, []);
  return { ...result, onRequest, onDismiss: dismiss };
}
