/**
 * Smart Defaults Service - Context-aware task creation
 * 
 * Uses existing Context Engine, prioritizer, and domain classification
 * to auto-populate Task fields with lightweight, explainable defaults.
 */

import type { Task, TaskType, TaskTag } from '@/types/task';
import type { ViewContext } from '@/views/sdk';
import type { Domain } from '@/lib/classifyDomain';
import { isFeatureEnabled } from '@/config/flags';
import { generateId } from '@/utils/atomicHelpers';
import { contextEngineService } from './contextEngineService';

export interface SmartDefaults {
  title?: string;
  type?: TaskType;
  priority?: number;
  tags?: TaskTag[];
  due?: number;
  view?: Partial<Task['view']>;
  explanation: string[];
}

export interface DerivationContext {
  inputText: string;
  viewContext: ViewContext;
  existingTasks?: Task[];
  currentTime?: number;
  bubblePosition?: { x: number; y: number };
}

/**
 * Derive smart defaults for task creation
 */
export async function deriveTaskDefaults(context: DerivationContext): Promise<SmartDefaults> {
  if (!isFeatureEnabled('smartDefaults')) {
    return {
      explanation: ['Smart defaults disabled']
    };
  }

  const explanationDrivers: string[] = [];
  
  // Enhanced context analysis
  const contextAnalysis = await contextEngineService.analyzeContext(context);
  
  // Classify domain and time context
  const domain = classifyDomainFromText(context.inputText);
  const timeCategory = categorizeTimeFromText(context.inputText);
  
  // Derive core properties with context insights
  const priority = derivePriorityScore(context, domain, timeCategory);
  const type = deriveTaskType(context.inputText);
  const viewDefaults = deriveViewDefaults(context, priority);
  
  // Generate tags with domain and time info
  const tags: Array<{id: string, name: string, emoji?: string, colorHex?: string}> = [];
  
  if (domain !== 'General') {
    tags.push({
      id: generateId(),
      name: domain,
      emoji: getDomainEmoji(domain),
      colorHex: getDomainColor(domain)
    });
    explanationDrivers.push(`categorized as ${domain}`);
  }
  
  if (timeCategory.urgency > 0.7) {
    tags.push({
      id: generateId(),
      name: 'urgent',
      emoji: '🔥'
    });
    explanationDrivers.push('detected urgency');
  }
  
  // Set due date if time context suggests it
  let due: number | undefined;
  if (timeCategory.dueDate) {
    due = timeCategory.dueDate;
    explanationDrivers.push(`due ${new Date(due).toLocaleDateString()}`);
  }
  
  // Add context-driven explanations
  explanationDrivers.push(contextAnalysis.primaryReason);
  
  const explanation = createBecauseExplanation(explanationDrivers);
  
  return {
    title: context.inputText,
    type,
    priority,
    tags,
    due,
    view: viewDefaults,
    explanation
  };
}

/**
 * Classify domain from text content
 */
function classifyDomainFromText(text: string): Domain {
  const content = text.toLowerCase();
  
  // Work-related keywords
  if (content.includes('meeting') || content.includes('deadline') || content.includes('project') || 
      content.includes('email') || content.includes('office') || content.includes('work') ||
      content.includes('client') || content.includes('presentation')) {
    return 'Work';
  }
  
  // Health-related keywords
  if (content.includes('doctor') || content.includes('appointment') || content.includes('health') ||
      content.includes('exercise') || content.includes('therapy') || content.includes('medical')) {
    return 'Health';
  }
  
  // Learning-related keywords
  if (content.includes('study') || content.includes('learn') || content.includes('course') ||
      content.includes('tutorial') || content.includes('research') || content.includes('book')) {
    return 'Learning';
  }
  
  // Finance-related keywords
  if (content.includes('budget') || content.includes('money') || content.includes('pay') ||
      content.includes('bank') || content.includes('invest') || content.includes('expense')) {
    return 'Finance';
  }
  
  // Relationship-related keywords
  if (content.includes('friend') || content.includes('family') || content.includes('date') ||
      content.includes('relationship') || content.includes('social') || content.includes('partner')) {
    return 'Relationships';
  }
  
  // Personal-related keywords (catch-all for personal activities)
  if (content.includes('home') || content.includes('personal') || content.includes('hobby') ||
      content.includes('travel') || content.includes('shopping') || content.includes('cook')) {
    return 'Personal';
  }
  
  return 'General';
}

/**
 * Categorize time context from text
 */
function categorizeTimeFromText(text: string): { urgency: number; dueDate?: number } {
  const content = text.toLowerCase();
  const now = Date.now();
  let urgency = 0.3; // Default low urgency
  let dueDate: number | undefined;

  // High urgency indicators
  if (content.includes('urgent') || content.includes('asap') || content.includes('immediately') ||
      content.includes('emergency') || content.includes('critical')) {
    urgency = 0.9;
  }
  // Medium urgency indicators
  else if (content.includes('soon') || content.includes('important') || content.includes('priority')) {
    urgency = 0.7;
  }
  // Today indicators
  else if (content.includes('today') || content.includes('now')) {
    urgency = 0.8;
    dueDate = now + (24 * 60 * 60 * 1000); // End of today
  }
  // Tomorrow indicators
  else if (content.includes('tomorrow')) {
    urgency = 0.6;
    dueDate = now + (2 * 24 * 60 * 60 * 1000); // End of tomorrow
  }
  // This week indicators
  else if (content.includes('week') && !content.includes('next week')) {
    urgency = 0.5;
    dueDate = now + (7 * 24 * 60 * 60 * 1000); // End of this week
  }

  return { urgency, dueDate };
}

/**
 * Derive priority score from context
 */
function derivePriorityScore(
  context: DerivationContext, 
  domain: Domain, 
  timeCategory: { urgency: number }
): number {
  let priority = 50; // Base priority

  // Adjust based on time urgency
  priority += timeCategory.urgency * 40; // 0-40 point boost for urgency

  // Adjust based on domain importance
  const domainBoosts: Record<Domain, number> = {
    'Work': 10,
    'Health': 15,
    'Finance': 8,
    'Learning': 5,
    'Relationships': 3,
    'Personal': 0,
    'General': 0
  };
  
  priority += domainBoosts[domain] || 0;

  // Adjust based on existing task load
  const existingTasks = context.existingTasks || [];
  const todayTasks = existingTasks.filter(task => {
    const taskDate = new Date(task.createdAt);
    const today = new Date();
    return taskDate.toDateString() === today.toDateString();
  });

  if (todayTasks.length > 5) {
    priority -= 10; // Lower priority when user has many tasks today
  }

  // Keep priority in valid range
  return Math.max(0, Math.min(100, Math.round(priority)));
}

/**
 * Derive task type from content
 */
function deriveTaskType(text: string): TaskType {
  const content = text.toLowerCase();
  
  if (content.includes('remind') || content.includes('remember') || 
      content.includes('don\'t forget') || content.includes('alert')) {
    return 'reminder';
  }
  
  if (content.includes('meeting') || content.includes('appointment') || 
      content.includes('call') || content.includes('event')) {
    return 'event';
  }
  
  if (content.includes('note') || content.includes('remember') || 
      content.includes('thought') || content.includes('idea')) {
    return 'thought';
  }
  
  if (content.includes('memory') || content.includes('recall') || 
      content.includes('happened') || content.includes('did')) {
    return 'memory';
  }
  
  return 'task'; // Default to task
}

/**
 * Derive view-specific defaults
 */
function deriveViewDefaults(context: DerivationContext, priority: number): Partial<Task['view']> {
  const viewData: Partial<Task['view']> = {};
  
  // Bubble view defaults
  if (context.bubblePosition) {
    viewData.bubble = {
      x: context.bubblePosition.x,
      y: context.bubblePosition.y,
      size: priority / 100, // Convert priority to size (0-1)
      colorHex: getPriorityColor(priority)
    };
  }
  
  // Matrix view defaults
  const urgency = priority > 70 ? 3 : priority > 50 ? 2 : priority > 30 ? 1 : 0;
  const importance = priority > 60 ? 3 : priority > 40 ? 2 : priority > 20 ? 1 : 0;
  
  viewData.matrix = {
    urgency: urgency as 0 | 1 | 2 | 3,
    importance: importance as 0 | 1 | 2 | 3,
    quadrant: calculateMatrixQuadrant(urgency, importance)
  };
  
  // Atomic view defaults
  const shell = priority > 70 ? 'today' : priority > 40 ? 'week' : 'later';
  viewData.atomic = {
    shell: shell as 'today' | 'week' | 'later'
  };
  
  return viewData;
}

/**
 * Get domain emoji
 */
function getDomainEmoji(domain: Domain): string {
  const emojiMap: Record<Domain, string> = {
    'Work': '💼',
    'Health': '🧠',
    'Learning': '📚',
    'Finance': '💰',
    'Relationships': '❤️',
    'Personal': '🏠',
    'General': '💭'
  };
  
  return emojiMap[domain];
}

/**
 * Get domain color
 */
function getDomainColor(domain: Domain): string {
  const colorMap: Record<Domain, string> = {
    'Work': '#3B82F6',
    'Health': '#10B981',
    'Learning': '#8B5CF6',
    'Finance': '#F59E0B',
    'Relationships': '#EF4444',
    'Personal': '#6B7280',
    'General': '#9CA3AF'
  };
  
  return colorMap[domain];
}

/**
 * Get priority color
 */
function getPriorityColor(priority: number): string {
  if (priority >= 80) return '#EF4444'; // Red for high priority
  if (priority >= 60) return '#F59E0B'; // Orange for medium-high
  if (priority >= 40) return '#10B981'; // Green for medium
  return '#6B7280'; // Gray for low priority
}

/**
 * Calculate matrix quadrant
 */
function calculateMatrixQuadrant(urgency: number, importance: number): 1 | 2 | 3 | 4 {
  if (urgency >= 2 && importance >= 2) return 1; // Do First
  if (urgency < 2 && importance >= 2) return 2;  // Schedule
  if (urgency >= 2 && importance < 2) return 3;  // Delegate
  return 4; // Don't Do
}

/**
 * Create "Because..." explanation
 */
function createBecauseExplanation(drivers: string[]): string[] {
  if (drivers.length === 0) {
    return ['Applied default settings'];
  }
  
  if (drivers.length === 1) {
    return [`Because ${drivers[0]}`];
  }
  
  const mainReason = drivers[0];
  const additionalReasons = drivers.slice(1);
  
  return [
    `Because ${mainReason}`,
    ...additionalReasons.map(reason => `Also ${reason}`)
  ];
}
