import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AISchedulingSuggestions } from '../AISchedulingSuggestions';
import {
  decisionTraceService,
  getDecisionUserAction
} from '@/services/decisionTraceService';

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  toast: vi.fn(),
  generateSeasonalSuggestions: vi.fn(),
  generateHabitBasedPredictions: vi.fn()
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ addTask: mocks.addTask })
}));

vi.mock('@/services/seasonalPatternService', () => ({
  seasonalPatternService: {
    generateSeasonalSuggestions: mocks.generateSeasonalSuggestions
  }
}));

vi.mock('@/services/advancedHabitEngine', () => ({
  advancedHabitEngine: {
    generateHabitBasedPredictions: mocks.generateHabitBasedPredictions
  }
}));

vi.mock('@/services/behavioralScienceEngine', () => ({
  behavioralScienceEngine: {
    detectStressLevel: () => 1,
    getNeuromodulatorContext: () => ({ recommendedStimuli: 'reduce' })
  }
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const seasonalSuggestion = {
  id: 'season-1',
  title: 'Plan the week',
  content: 'Reserve a weekly planning block',
  timeContext: { hour: 9, energyLevel: 'medium' },
  confidence: 0.9,
  reasoning: ['You plan weekly', 'Morning focus is strong'],
  priority: 'high',
  tags: ['planning']
};

describe('AISchedulingSuggestions decision outcomes', () => {
  beforeEach(() => {
    localStorage.clear();
    decisionTraceService.clear();
    vi.clearAllMocks();
    mocks.generateSeasonalSuggestions.mockResolvedValue([seasonalSuggestion]);
    mocks.generateHabitBasedPredictions.mockResolvedValue([]);
    mocks.addTask.mockResolvedValue({
      id: 'task-1',
      title: 'Plan the week',
      type: 'task',
      priority: 90,
      completed: false,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  afterEach(() => cleanup());

  it('creates one idempotent presentation trace and accepts only after task creation', async () => {
    render(
      <React.StrictMode>
        <AISchedulingSuggestions />
      </React.StrictMode>
    );

    await screen.findByText('Plan the week');
    expect(decisionTraceService.getTraces()).toHaveLength(1);
    expect(getDecisionUserAction(decisionTraceService.getTraces()[0])).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule as Draft' }));
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));

    const trace = decisionTraceService.getTraces()[0];
    expect(getDecisionUserAction(trace)).toBe('accept');
    expect(trace.metadata.executionStatus).toBe('succeeded');
    expect(trace.metadata.outcomes).toHaveLength(2);
  });

  it('allows only one task write while an acceptance is in flight', async () => {
    let resolveTask!: (task: {
      id: string;
      title: string;
      type: 'task';
      priority: number;
      completed: boolean;
      tags: never[];
      createdAt: number;
      updatedAt: number;
    }) => void;
    mocks.addTask.mockReturnValue(new Promise(resolve => {
      resolveTask = resolve;
    }));

    render(<AISchedulingSuggestions />);
    await screen.findByText('Plan the week');

    const acceptButton = screen.getByRole('button', { name: 'Schedule as Draft' });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    expect(acceptButton).toBeDisabled();

    await act(async () => {
      resolveTask({
        id: 'task-1',
        title: 'Plan the week',
        type: 'task',
        priority: 90,
        completed: false,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    await waitFor(() => expect(screen.queryByText('Plan the week')).not.toBeInTheDocument());
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
  });

  it('records rejection only after the cooldown is persisted', async () => {
    render(<AISchedulingSuggestions />);
    await screen.findByText('Plan the week');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Plan the week' }));

    const trace = decisionTraceService.getTraces()[0];
    expect(getDecisionUserAction(trace)).toBe('reject');
    expect(JSON.parse(localStorage.getItem('ai-suggestion-cooldowns') || '[]')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('Plan the week')).not.toBeInTheDocument());
  });
});
