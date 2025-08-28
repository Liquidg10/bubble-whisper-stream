/**
 * Unit tests for domain classification
 * Tests the canonical function that determines bubble domains
 */

import { describe, it, expect } from 'vitest';
import { classifyBubbleDomain } from '../domainClassification';
import { Bubble } from '@/types/bubble';

describe('classifyBubbleDomain', () => {
  const createTestBubble = (content: string, tags: string[] = []): Bubble => ({
    id: 'test-id',
    content,
    type: 'Task',
    x: 0,
    y: 0,
    size: 0.8,
    tags: tags.map(name => ({ id: `tag-${name}`, name, emoji: '📌' })),
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  it('should classify financial content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('pay bills'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('budget review'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('investment portfolio'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('expense tracking'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('Income tax'))).toBe('Financial');
  });

  it('should classify parenting content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('pick up kids from school'))).toBe('Parenting');
    expect(classifyBubbleDomain(createTestBubble('bedtime routine'))).toBe('Parenting');
    expect(classifyBubbleDomain(createTestBubble('homework help'))).toBe('Parenting');
    expect(classifyBubbleDomain(createTestBubble('parent teacher meeting'))).toBe('Parenting');
    expect(classifyBubbleDomain(createTestBubble('family vacation planning'))).toBe('Parenting');
  });

  it('should classify mental health content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('therapy appointment'))).toBe('Mental');
    expect(classifyBubbleDomain(createTestBubble('anxiety management'))).toBe('Mental');
    expect(classifyBubbleDomain(createTestBubble('mood tracking'))).toBe('Mental');
    expect(classifyBubbleDomain(createTestBubble('stress relief'))).toBe('Mental');
    expect(classifyBubbleDomain(createTestBubble('mental wellness'))).toBe('Mental');
  });

  it('should classify work content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('project deadline'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('team meeting'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('career development'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('job interview'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('colleague feedback'))).toBe('Work');
  });

  it('should classify home content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('clean the house'))).toBe('Home');
    expect(classifyBubbleDomain(createTestBubble('laundry day'))).toBe('Home');
    expect(classifyBubbleDomain(createTestBubble('garden maintenance'))).toBe('Home');
    expect(classifyBubbleDomain(createTestBubble('cook dinner'))).toBe('Home');
    expect(classifyBubbleDomain(createTestBubble('home repair'))).toBe('Home');
  });

  it('should classify relationship content correctly', () => {
    expect(classifyBubbleDomain(createTestBubble('date night'))).toBe('Relationships');
    expect(classifyBubbleDomain(createTestBubble('friend meetup'))).toBe('Relationships');
    expect(classifyBubbleDomain(createTestBubble('marriage counseling'))).toBe('Relationships');
    expect(classifyBubbleDomain(createTestBubble('social gathering'))).toBe('Relationships');
    expect(classifyBubbleDomain(createTestBubble('partner discussion'))).toBe('Relationships');
  });

  it('should use tags for classification when content is ambiguous', () => {
    expect(classifyBubbleDomain(createTestBubble('meeting', ['work']))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('appointment', ['finance']))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('task', ['home']))).toBe('Home');
  });

  it('should default to Default domain for unmatched content', () => {
    expect(classifyBubbleDomain(createTestBubble('random task'))).toBe('Default');
    expect(classifyBubbleDomain(createTestBubble('unknown activity'))).toBe('Default');
    expect(classifyBubbleDomain(createTestBubble(''))).toBe('Default');
  });

  it('should be case insensitive', () => {
    expect(classifyBubbleDomain(createTestBubble('BUDGET REVIEW'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('Team Meeting'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('anxiety Management'))).toBe('Mental');
  });

  it('should handle partial word matches', () => {
    expect(classifyBubbleDomain(createTestBubble('budgeting for vacation'))).toBe('Financial');
    expect(classifyBubbleDomain(createTestBubble('working on project'))).toBe('Work');
    expect(classifyBubbleDomain(createTestBubble('anxious about presentation'))).toBe('Mental');
  });
});