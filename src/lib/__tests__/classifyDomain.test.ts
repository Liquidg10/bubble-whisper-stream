/**
 * Unit tests for canonical domain classification
 */

import { describe, it, expect } from 'vitest';
import { classifyDomain, getAllDomains, getDomainEmoji } from '../classifyDomain';
import type { Bubble } from '@/types/bubble';

// Helper to create test bubble
function createTestBubble(content: string, tags: Array<{ name: string; emoji?: string }> = []): Bubble {
  return {
    id: 'test-bubble-1',
    content,
    type: 'Thought',
    x: 100,
    y: 100,
    size: 0.8,
    tags: tags.map(tag => ({ id: crypto.randomUUID(), name: tag.name, emoji: tag.emoji || '🏷️' })),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

describe('classifyDomain', () => {
  it('should classify finance-related content', () => {
    const bubble = createTestBubble('Need to check my budget and pay bills');
    expect(classifyDomain(bubble)).toBe('Finance');
  });

  it('should classify work-related content', () => {
    const bubble = createTestBubble('Meeting with client tomorrow');
    expect(classifyDomain(bubble)).toBe('Work');
  });

  it('should classify health-related content', () => {
    const bubble = createTestBubble('Doctor appointment for anxiety therapy');
    expect(classifyDomain(bubble)).toBe('Health');
  });

  it('should classify learning-related content', () => {
    const bubble = createTestBubble('Study for React course tutorial');
    expect(classifyDomain(bubble)).toBe('Learning');
  });

  it('should classify relationship-related content', () => {
    const bubble = createTestBubble('Date night with partner this weekend');
    expect(classifyDomain(bubble)).toBe('Relationships');
  });

  it('should classify personal-related content', () => {
    const bubble = createTestBubble('Clean house and do laundry');
    expect(classifyDomain(bubble)).toBe('Personal');
  });

  it('should default to General for unmatched content', () => {
    const bubble = createTestBubble('Random thought about the weather');
    expect(classifyDomain(bubble)).toBe('General');
  });

  it('should classify based on tags when content is ambiguous', () => {
    const bubble = createTestBubble('Important meeting', [{ name: 'finance' }]);
    expect(classifyDomain(bubble)).toBe('Finance');
  });

  it('should be case-insensitive', () => {
    const bubble = createTestBubble('WORK PROJECT DEADLINE');
    expect(classifyDomain(bubble)).toBe('Work');
  });

  it('should handle empty content gracefully', () => {
    const bubble = createTestBubble('', [{ name: 'health' }]);
    expect(classifyDomain(bubble)).toBe('Health');
  });

  it('should prioritize finance over other domains', () => {
    const bubble = createTestBubble('Work meeting about budget and expenses');
    expect(classifyDomain(bubble)).toBe('Finance');
  });

  it('should handle multiple keyword matches correctly', () => {
    const bubble = createTestBubble('Learning about personal finance and investment');
    expect(classifyDomain(bubble)).toBe('Finance');
  });
});

describe('getAllDomains', () => {
  it('should return all 7 canonical domains', () => {
    const domains = getAllDomains();
    expect(domains).toHaveLength(7);
    expect(domains).toEqual(['Work', 'Personal', 'Health', 'Learning', 'Relationships', 'Finance', 'General']);
  });
});

describe('getDomainEmoji', () => {
  it('should return correct emojis for all domains', () => {
    expect(getDomainEmoji('Work')).toBe('💼');
    expect(getDomainEmoji('Personal')).toBe('🏠');
    expect(getDomainEmoji('Health')).toBe('🧠');
    expect(getDomainEmoji('Learning')).toBe('📚');
    expect(getDomainEmoji('Relationships')).toBe('❤️');
    expect(getDomainEmoji('Finance')).toBe('💰');
    expect(getDomainEmoji('General')).toBe('💭');
  });
});