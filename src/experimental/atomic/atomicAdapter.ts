/**
 * Enhanced Atomic Adapter - Connects Atomic Renderer to Bubble Store
 * Provides comprehensive integration with AI-powered features
 */

import { useBubbleStore } from '@/stores/bubbleStore';
import type { Bubble, BubbleType, Tag } from '@/types/bubble';

export function updateTimeHorizon(moleculeId: string, fromRing: number, toRing: number) {
  const { bubbles, updateBubble } = useBubbleStore.getState();
  const timeHorizons = ['today', 'week', 'later'];
  const newTimeHorizon = timeHorizons[toRing] || 'today';
  
  // Find the corresponding bubble
  const bubble = bubbles.find(b => `mol-${b.id}` === moleculeId);
  if (!bubble) return;

  // Update bubble tags with new time horizon
  const updatedTags = bubble.tags?.filter(tag => 
    !['today', 'week', 'later'].includes(tag.name.toLowerCase())
  ) || [];
  
  updatedTags.push({
    name: newTimeHorizon,
    emoji: getTimeHorizonEmoji(newTimeHorizon)
  });

  updateBubble(bubble.id, { ...bubble, tags: updatedTags });
  console.log(`Time horizon updated: ${bubble.content} moved to ${newTimeHorizon}`);
}

export function createMoleculeFromDomain(domain: string) {
  const { addBubble } = useBubbleStore.getState();
  
  const domainConfig = getDomainConfig(domain);
  const newBubble: Partial<Bubble> = {
    id: generateId(),
    content: `New ${domain} bubble`,
    type: domainConfig.defaultType,
    x: Math.random() * 500 + 250,
    y: Math.random() * 300 + 150,
    tags: [
      { 
        name: domain.toLowerCase(), 
        emoji: domainConfig.emoji
      },
      { 
        name: 'today', 
        emoji: '⏰'
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  addBubble(newBubble as Bubble);
  console.log(`Created new ${domain} molecule`);
}

export function mergeMolecules(aId: string, bId: string) {
  const { bubbles, updateBubble, deleteBubble } = useBubbleStore.getState();
  
  // Find corresponding bubbles
  const bubbleA = bubbles.find(b => `mol-${b.id}` === aId);
  const bubbleB = bubbles.find(b => `mol-${b.id}` === bId);
  
  if (!bubbleA || !bubbleB) return;

  // Merge bubble content and properties
  const mergedContent = `${bubbleA.content} + ${bubbleB.content}`;
  const mergedTags = [
    ...bubbleA.tags || [],
    ...bubbleB.tags || []
  ].reduce((unique, tag) => {
    const exists = unique.find(t => t.name === tag.name);
    return exists ? unique : [...unique, tag];
  }, [] as Tag[]);

  // Update the first bubble with merged data
  updateBubble(bubbleA.id, {
    ...bubbleA,
    content: mergedContent,
    tags: mergedTags,
    x: (bubbleA.x + bubbleB.x) / 2,
    y: (bubbleA.y + bubbleB.y) / 2,
    updatedAt: Date.now()
  });

  // Delete the second bubble
  deleteBubble(bubbleB.id);
  
  console.log(`Merged molecules: ${bubbleA.content} + ${bubbleB.content}`);
}

export function splitMolecule(id: string) {
  const { bubbles, addBubble, updateBubble } = useBubbleStore.getState();
  
  const bubble = bubbles.find(b => `mol-${b.id}` === id);
  if (!bubble) return;

  // Split content if possible
  const words = bubble.content?.split(' ') || ['Split', 'Bubble'];
  const midpoint = Math.ceil(words.length / 2);
  const contentA = words.slice(0, midpoint).join(' ') + ' A';
  const contentB = words.slice(midpoint).join(' ') + ' B';

  // Update original bubble
  updateBubble(bubble.id, {
    ...bubble,
    content: contentA,
    x: bubble.x - 30,
    updatedAt: Date.now()
  });

  // Create new bubble
  const newBubble: Partial<Bubble> = {
    id: generateId(),
    content: contentB,
    type: bubble.type,
    x: bubble.x + 30,
    y: bubble.y,
    tags: bubble.tags ? [...bubble.tags] : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  addBubble(newBubble as Bubble);
  
  console.log(`Split molecule: ${bubble.content} into ${contentA} and ${contentB}`);
}

export function getAccessibilitySettings() {
  const { settings } = useBubbleStore.getState();
  return {
    reducedMotion: settings.reducedMotion || false,
    highContrast: settings.highContrast || false,
    bubbleDensity: settings.bubbleDensity || 'medium'
  };
}

export function notifyElectronMoved(electronId: string, fromShell: number, toShell: number) {
  // This could trigger analytics, notifications, or adaptive learning
  console.log(`Electron ${electronId} moved from shell ${fromShell} to shell ${toShell}`);
  
  // Future: Update user behavior patterns for AI recommendations
}

export function classifyBubbleDomain(bubble: Bubble): string {
  const content = (bubble.content || "").toLowerCase();
  const tags = bubble.tags?.map(t => t.name.toLowerCase()) || [];
  const allText = [content, ...tags].join(" ");

  // AI-powered domain classification
  if (allText.match(/money|budget|finance|pay|cost|expense|income|invest/)) return "Financial";
  if (allText.match(/child|parent|family|kid|school|homework|bedtime/)) return "Parenting";
  if (allText.match(/anxiety|mood|mental|therapy|stress|depression|wellness/)) return "Mental";
  if (allText.match(/work|job|career|meeting|deadline|project|colleague/)) return "Work";
  if (allText.match(/home|house|clean|chore|repair|garden|cook|laundry/)) return "Home";
  if (allText.match(/friend|relationship|social|date|partner|marriage/)) return "Relationships";
  
  return "Default";
}

export function suggestOptimalPosition(newBubble: Bubble, existingBubbles: Bubble[]): { x: number; y: number } {
  // AI-powered positioning to avoid overlaps and group related content
  const domain = classifyBubbleDomain(newBubble);
  const relatedBubbles = existingBubbles.filter(b => classifyBubbleDomain(b) === domain);
  
  if (relatedBubbles.length === 0) {
    // First bubble of this domain - use golden ratio positioning
    const angle = existingBubbles.length * 2.4; // Golden angle
    const radius = Math.sqrt(existingBubbles.length + 1) * 40;
    return {
      x: 500 + Math.cos(angle) * radius,
      y: 280 + Math.sin(angle) * radius
    };
  }

  // Position near related bubbles but avoid overlaps
  const avgX = relatedBubbles.reduce((sum, b) => sum + b.x, 0) / relatedBubbles.length;
  const avgY = relatedBubbles.reduce((sum, b) => sum + b.y, 0) / relatedBubbles.length;
  
  // Find a clear spot in a spiral around the cluster center
  for (let r = 60; r < 200; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const x = avgX + Math.cos(a) * r;
      const y = avgY + Math.sin(a) * r;
      
      // Check for overlaps
      const hasOverlap = existingBubbles.some(b => {
        const dist = Math.hypot(x - b.x, y - b.y);
        return dist < 100; // Minimum distance
      });
      
      if (!hasOverlap && x > 50 && x < 950 && y > 50 && y < 510) {
        return { x, y };
      }
    }
  }
  
  // Fallback to random position
  return {
    x: Math.random() * 500 + 250,
    y: Math.random() * 300 + 150
  };
}

// Utility functions
function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function getTimeHorizonEmoji(horizon: string): string {
  switch (horizon) {
    case 'today': return '🔥';
    case 'week': return '📅';
    case 'later': return '🌙';
    default: return '⏰';
  }
}

function getTimeHorizonColor(horizon: string): string {
  switch (horizon) {
    case 'today': return 'hsl(var(--danger-soft))';
    case 'week': return 'hsl(var(--warning-glow))';
    case 'later': return 'hsl(var(--accent-flow))';
    default: return 'hsl(var(--accent-void))';
  }
}

function getDomainConfig(domain: string): { defaultType: BubbleType; emoji: string; color: string } {
  const configs = {
    Financial: { defaultType: 'Task' as BubbleType, emoji: '💰', color: 'hsl(var(--warning-glow))' },
    Parenting: { defaultType: 'Memory' as BubbleType, emoji: '👨‍👩‍👧‍👦', color: 'hsl(var(--accent-flow))' },
    Mental: { defaultType: 'Thought' as BubbleType, emoji: '🧠', color: 'hsl(var(--accent-void))' },
    Work: { defaultType: 'Task' as BubbleType, emoji: '💼', color: 'hsl(var(--primary))' },
    Home: { defaultType: 'Task' as BubbleType, emoji: '🏠', color: 'hsl(var(--success-gentle))' },
    Relationships: { defaultType: 'Memory' as BubbleType, emoji: '❤️', color: 'hsl(var(--danger-soft))' }
  };
  
  return configs[domain as keyof typeof configs] || configs.Work;
}

export function hasStoreIntegration(): boolean {
  try {
    useBubbleStore.getState();
    return true;
  } catch {
    return false;
  }
}