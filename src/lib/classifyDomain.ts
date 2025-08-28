/**
 * Canonical domain classification for bubbles
 * Used across all views (Bubble, Atomic, Timeline, etc.)
 */

import type { Bubble } from '@/types/bubble';
import { devLog } from '@/devtools/devLog';

export type Domain = 'Work' | 'Personal' | 'Health' | 'Learning' | 'Relationships' | 'Finance' | 'General';

/**
 * Classifies a bubble into one of the canonical domains
 */
export function classifyDomain(bubble: Bubble): Domain {
  const content = (bubble.content || '').toLowerCase();
  const tags = bubble.tags?.map(t => t.name.toLowerCase()) || [];
  const allText = [content, ...tags].join(' ');

  let domain: Domain = 'General';

  // Finance keywords
  if (allText.match(/money|budget|finance|pay|cost|expense|income|invest|bank|loan|credit|debt|save|spending/)) {
    domain = 'Finance';
  }
  // Work keywords  
  else if (allText.match(/work|job|career|meeting|deadline|project|colleague|office|business|client|task|professional/)) {
    domain = 'Work';
  }
  // Health keywords
  else if (allText.match(/health|medical|doctor|therapy|exercise|fitness|mental|wellness|anxiety|stress|depression|medication|appointment/)) {
    domain = 'Health';
  }
  // Learning keywords
  else if (allText.match(/learn|study|course|education|school|training|skill|book|research|tutorial|homework|class/)) {
    domain = 'Learning';
  }
  // Relationships keywords
  else if (allText.match(/friend|relationship|social|date|partner|marriage|family|love|dating|communication|conflict/)) {
    domain = 'Relationships';
  }
  // Personal keywords (catch-all for personal life)
  else if (allText.match(/personal|home|house|clean|chore|repair|garden|cook|laundry|hobby|travel|vacation|shopping/)) {
    domain = 'Personal';
  }

  devLog('classifyDomain', {
    bubbleId: bubble.id,
    content: content.substring(0, 50),
    tagCount: tags.length,
    domain
  });

  return domain;
}

/**
 * Get all available domains
 */
export function getAllDomains(): Domain[] {
  return ['Work', 'Personal', 'Health', 'Learning', 'Relationships', 'Finance', 'General'];
}

/**
 * Get domain emoji for UI display
 */
export function getDomainEmoji(domain: Domain): string {
  const emojiMap: Record<Domain, string> = {
    Work: '💼',
    Personal: '🏠', 
    Health: '🧠',
    Learning: '📚',
    Relationships: '❤️',
    Finance: '💰',
    General: '💭'
  };
  
  return emojiMap[domain];
}