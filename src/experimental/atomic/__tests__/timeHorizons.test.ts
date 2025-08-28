/**
 * Unit tests for time horizon updates
 * Tests the canonical horizon representation used across views
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTimeHorizon } from '../timeHorizons';
import { TimeHorizon } from '@/types/atomic';
import * as storeModule from '../store';

// Mock the store
const mockUpdateBubble = vi.fn();
const mockBubbles = [
  {
    id: 'test-bubble-1',
    content: 'Test task',
    type: 'Task',
    x: 100,
    y: 100,
    size: 0.8,
    tags: [
      { id: 'tag-1', name: 'work', emoji: '💼' },
      { id: 'tag-2', name: 'today', emoji: '🔥' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

vi.mock('../store', () => ({
  getBubbleStoreState: () => ({
    bubbles: mockBubbles,
    updateBubble: mockUpdateBubble
  })
}));

describe('updateTimeHorizon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update bubble from today to week horizon', () => {
    updateTimeHorizon('mol-test-bubble-1', 0, 1);
    
    expect(mockUpdateBubble).toHaveBeenCalledWith({
      id: 'test-bubble-1',
      content: 'Test task',
      type: 'Task',
      x: 100,
      y: 100,
      tags: [
        { id: 'tag-1', name: 'work', emoji: '💼' },
        { id: expect.any(String), name: 'week', emoji: '📅' }
      ],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number)
    });
  });

  it('should update bubble from week to later horizon', () => {
    // Update mock to have week tag
    mockBubbles[0].tags = [
      { id: 'tag-1', name: 'work', emoji: '💼' },
      { id: 'tag-2', name: 'week', emoji: '📅' }
    ];

    updateTimeHorizon('mol-test-bubble-1', 1, 2);
    
    expect(mockUpdateBubble).toHaveBeenCalledWith({
      id: 'test-bubble-1',
      content: 'Test task',
      type: 'Task',
      x: 100,
      y: 100,
      tags: [
        { id: 'tag-1', name: 'work', emoji: '💼' },
        { id: expect.any(String), name: 'later', emoji: '🌙' }
      ],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number)
    });
  });

  it('should update bubble from later to today horizon', () => {
    // Update mock to have later tag
    mockBubbles[0].tags = [
      { id: 'tag-1', name: 'work', emoji: '💼' },
      { id: 'tag-2', name: 'later', emoji: '🌙' }
    ];

    updateTimeHorizon('mol-test-bubble-1', 2, 0);
    
    expect(mockUpdateBubble).toHaveBeenCalledWith({
      id: 'test-bubble-1',
      content: 'Test task',
      type: 'Task',
      x: 100,
      y: 100,
      tags: [
        { id: 'tag-1', name: 'work', emoji: '💼' },
        { id: expect.any(String), name: 'today', emoji: '🔥' }
      ],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number)
    });
  });

  it('should handle bubble not found gracefully', () => {
    updateTimeHorizon('mol-nonexistent', 0, 1);
    
    expect(mockUpdateBubble).not.toHaveBeenCalled();
  });

  it('should preserve other tags while updating horizon', () => {
    // Add multiple tags including non-horizon ones
    mockBubbles[0].tags = [
      { id: 'tag-1', name: 'work', emoji: '💼' },
      { id: 'tag-2', name: 'urgent', emoji: '⚠️' },
      { id: 'tag-3', name: 'today', emoji: '🔥' },
      { id: 'tag-4', name: 'meeting', emoji: '🤝' }
    ];

    updateTimeHorizon('mol-test-bubble-1', 0, 1);
    
    const updatedBubble = mockUpdateBubble.mock.calls[0][0];
    expect(updatedBubble.tags).toHaveLength(4);
    expect(updatedBubble.tags.find(t => t.name === 'work')).toBeDefined();
    expect(updatedBubble.tags.find(t => t.name === 'urgent')).toBeDefined();
    expect(updatedBubble.tags.find(t => t.name === 'meeting')).toBeDefined();
    expect(updatedBubble.tags.find(t => t.name === 'week')).toBeDefined();
    expect(updatedBubble.tags.find(t => t.name === 'today')).toBeUndefined();
  });

  it('should handle bubbles with no existing horizon tag', () => {
    // Remove horizon tag
    mockBubbles[0].tags = [
      { id: 'tag-1', name: 'work', emoji: '💼' }
    ];

    updateTimeHorizon('mol-test-bubble-1', 0, 1);
    
    const updatedBubble = mockUpdateBubble.mock.calls[0][0];
    expect(updatedBubble.tags).toHaveLength(2);
    expect(updatedBubble.tags.find(t => t.name === 'work')).toBeDefined();
    expect(updatedBubble.tags.find(t => t.name === 'week')).toBeDefined();
  });
});