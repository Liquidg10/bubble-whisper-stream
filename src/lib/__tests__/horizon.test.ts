/**
 * Unit tests for canonical time horizon management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getHorizon, 
  setHorizon, 
  getHorizonEmoji, 
  getHorizonDisplayName,
  horizonToRingIndex,
  ringIndexToHorizon,
  createHorizonMoveEntry,
  getAllHorizons
} from '../horizon';
import type { Bubble } from '@/types/bubble';

// Helper to create test bubble
function createTestBubble(content: string, tags: Array<{ name: string; emoji?: string }> = []): Bubble {
  return {
    id: 'test-bubble-1',
    content,
    type: 'Task',
    x: 100,
    y: 100,
    size: 0.8,
    tags: tags.map(tag => ({ id: crypto.randomUUID(), name: tag.name, emoji: tag.emoji || '🏷️' })),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

describe('getHorizon', () => {
  it('should return null for bubble without horizon tags', () => {
    const bubble = createTestBubble('Test task', [{ name: 'work' }]);
    expect(getHorizon(bubble)).toBeNull();
  });

  it('should return today horizon', () => {
    const bubble = createTestBubble('Test task', [{ name: 'today' }]);
    expect(getHorizon(bubble)).toBe('today');
  });

  it('should return week horizon', () => {
    const bubble = createTestBubble('Test task', [{ name: 'week' }]);
    expect(getHorizon(bubble)).toBe('week');
  });

  it('should return later horizon', () => {
    const bubble = createTestBubble('Test task', [{ name: 'later' }]);
    expect(getHorizon(bubble)).toBe('later');
  });

  it('should be case-insensitive', () => {
    const bubble = createTestBubble('Test task', [{ name: 'TODAY' }]);
    expect(getHorizon(bubble)).toBe('today');
  });

  it('should return first horizon tag found', () => {
    const bubble = createTestBubble('Test task', [
      { name: 'today' },
      { name: 'week' }
    ]);
    expect(getHorizon(bubble)).toBe('today');
  });

  it('should handle bubble without tags', () => {
    const bubble = { ...createTestBubble('Test task'), tags: undefined };
    expect(getHorizon(bubble)).toBeNull();
  });
});

describe('setHorizon', () => {
  it('should add horizon tag to bubble without existing horizon', () => {
    const bubble = createTestBubble('Test task', [{ name: 'work' }]);
    const updated = setHorizon(bubble, 'today');
    
    expect(getHorizon(updated)).toBe('today');
    expect(updated.tags).toHaveLength(2);
    expect(updated.tags?.find(t => t.name === 'work')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'today')).toBeDefined();
  });

  it('should replace existing horizon tag', () => {
    const bubble = createTestBubble('Test task', [
      { name: 'work' },
      { name: 'today' }
    ]);
    const updated = setHorizon(bubble, 'week');
    
    expect(getHorizon(updated)).toBe('week');
    expect(updated.tags).toHaveLength(2);
    expect(updated.tags?.find(t => t.name === 'work')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'week')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'today')).toBeUndefined();
  });

  it('should be idempotent', () => {
    const bubble = createTestBubble('Test task', [{ name: 'today' }]);
    const updated1 = setHorizon(bubble, 'today');
    const updated2 = setHorizon(updated1, 'today');
    
    expect(getHorizon(updated2)).toBe('today');
    expect(updated2.tags?.filter(t => t.name === 'today')).toHaveLength(1);
  });

  it('should update the updatedAt timestamp', () => {
    const bubble = createTestBubble('Test task');
    const originalTime = bubble.updatedAt;
    
    // Small delay to ensure different timestamp
    const updated = setHorizon(bubble, 'today');
    
    expect(updated.updatedAt).toBeGreaterThan(originalTime);
  });

  it('should preserve other tags when replacing horizon', () => {
    const bubble = createTestBubble('Test task', [
      { name: 'work' },
      { name: 'urgent' },
      { name: 'week' },
      { name: 'meeting' }
    ]);
    const updated = setHorizon(bubble, 'later');
    
    expect(updated.tags).toHaveLength(4);
    expect(updated.tags?.find(t => t.name === 'work')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'urgent')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'meeting')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'later')).toBeDefined();
    expect(updated.tags?.find(t => t.name === 'week')).toBeUndefined();
  });
});

describe('getHorizonEmoji', () => {
  it('should return correct emojis', () => {
    expect(getHorizonEmoji('today')).toBe('🔥');
    expect(getHorizonEmoji('week')).toBe('📅');
    expect(getHorizonEmoji('later')).toBe('🌙');
  });
});

describe('getHorizonDisplayName', () => {
  it('should return correct display names', () => {
    expect(getHorizonDisplayName('today')).toBe('Today');
    expect(getHorizonDisplayName('week')).toBe('Week');
    expect(getHorizonDisplayName('later')).toBe('Later');
  });
});

describe('horizonToRingIndex and ringIndexToHorizon', () => {
  it('should convert horizons to ring indices correctly', () => {
    expect(horizonToRingIndex('today')).toBe(0);
    expect(horizonToRingIndex('week')).toBe(1);
    expect(horizonToRingIndex('later')).toBe(2);
  });

  it('should convert ring indices to horizons correctly', () => {
    expect(ringIndexToHorizon(0)).toBe('today');
    expect(ringIndexToHorizon(1)).toBe('week');
    expect(ringIndexToHorizon(2)).toBe('later');
  });

  it('should handle invalid ring index gracefully', () => {
    expect(ringIndexToHorizon(99)).toBe('today');
    expect(ringIndexToHorizon(-1)).toBe('today');
  });

  it('should be inverse operations', () => {
    const horizons: Array<'today' | 'week' | 'later'> = ['today', 'week', 'later'];
    
    horizons.forEach(horizon => {
      const ringIndex = horizonToRingIndex(horizon);
      const backToHorizon = ringIndexToHorizon(ringIndex);
      expect(backToHorizon).toBe(horizon);
    });
  });
});

describe('createHorizonMoveEntry', () => {
  it('should create undo entry for horizon move', () => {
    const entry = createHorizonMoveEntry('bubble-1', 'today', 'week', 'atomic');
    
    expect(entry.view).toBe('atomic');
    expect(entry.type).toBe('drag');
    expect(entry.data.bubbleId).toBe('bubble-1');
    expect(entry.data.fromHorizon).toBe('today');
    expect(entry.data.toHorizon).toBe('week');
    expect(entry.description).toBe('Moved from Today to Week');
  });

  it('should create undo entry for initial horizon setting', () => {
    const entry = createHorizonMoveEntry('bubble-1', null, 'today', 'bubble');
    
    expect(entry.view).toBe('bubble');
    expect(entry.description).toBe('Set horizon to Today');
  });
});

describe('getAllHorizons', () => {
  it('should return all 3 horizons', () => {
    const horizons = getAllHorizons();
    expect(horizons).toHaveLength(3);
    expect(horizons).toEqual(['today', 'week', 'later']);
  });
});