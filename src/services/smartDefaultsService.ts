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
export function deriveTaskDefaults(context: DerivationContext): SmartDefaults {
  if (!isFeatureEnabled('smartDefaults')) {
    return {
      priority: 50,
      explanation: ['Smart defaults disabled']
    };
  }

  const { inputText, viewContext, existingTasks = [], currentTime = Date.now(), bubblePosition } = context;
  const explanation: string[] = [];
  let priority = 50; // Default medium priority
  let type: TaskType = 'task';
  let tags: TaskTag[] = [];
  let due: number | undefined;
  let viewData: Partial<Task['view']> = {};

  // 1. Domain Classification
  const domain = classifyDomainFromText(inputText);
  if (domain && domain !== 'General') {
    tags.push({
      id: `domain-${domain.toLowerCase()}`,
      name: domain,
      emoji: getDomainEmoji(domain.toLowerCase()),
      colorHex: getDomainColor(domain.toLowerCase())
    });
    explanation.push(`Categorized as ${domain} based on content`);
  }

  // 2. Horizon/Time Classification
  const horizon = categorizeTimeFromText(inputText, currentTime);
  if (horizon.dueDate) {
    due = horizon.dueDate;
    explanation.push(`Due ${horizon.label} based on time indicators`);
  }

  // 3. Priority Derivation
  priority = derivePriorityScore(inputText, domain?.toLowerCase() || null, horizon.urgency, existingTasks);
  explanation.push(`Priority ${priority}/100 from urgency and context patterns`);

  // 4. Type Detection
  type = deriveTaskType(inputText);
  if (type !== 'task') {
    explanation.push(`Detected as ${type} from content patterns`);
  }

  // 5. View-specific Defaults
  viewData = deriveViewDefaults(viewContext, bubblePosition, priority);

  return {
    priority,
    type,
    tags,
    due,
    view: viewData,
    explanation
  };
}

/**
 * Classify domain from text input
 */
function classifyDomainFromText(text: string): Domain | null {
  const content = text.toLowerCase();
  
  // Work-related keywords
  if (content.includes('meeting') || content.includes('deadline') || content.includes('project') || 
      content.includes('email') || content.includes('office') || content.includes('work') ||
      content.includes('client') || content.includes('presentation')) {
    return 'Work';
  }
  
  // Health-related keywords
  if (content.includes('doctor') || content.includes('appointment') || content.includes('exercise') ||
      content.includes('medication') || content.includes('health') || content.includes('gym') ||
      content.includes('diet') || content.includes('hospital')) {
    return 'Health';
  }
  
  // Finance-related keywords
  if (content.includes('pay') || content.includes('bill') || content.includes('budget') ||
      content.includes('money') || content.includes('bank') || content.includes('invest') ||
      content.includes('expense') || content.includes('financial')) {
    return 'Finance';
  }
  
  // Learning-related keywords
  if (content.includes('study') || content.includes('learn') || content.includes('course') ||
      content.includes('book') || content.includes('education') || content.includes('research') ||
      content.includes('homework') || content.includes('practice')) {
    return 'Learning';
  }
  
  // Relationship-related keywords
  if (content.includes('family') || content.includes('friend') || content.includes('social') ||
      content.includes('relationship') || content.includes('partner') || content.includes('date') ||
      content.includes('anniversary') || content.includes('birthday')) {
    return 'Relationships';
  }
  
  // Personal-related keywords
  if (content.includes('home') || content.includes('personal') || content.includes('hobby') ||
      content.includes('relax') || content.includes('vacation') || content.includes('entertainment')) {
    return 'Personal';
  }
  
  return 'General';
}

/**
 * Categorize time horizon from text
 */
function categorizeTimeFromText(text: string, currentTime: number) {
  const content = text.toLowerCase();
  const now = new Date(currentTime);
  
  // Immediate indicators
  if (content.includes('now') || content.includes('asap') || content.includes('immediately') ||
      content.includes('urgent') || content.includes('emergency')) {
    return {
      urgency: 'immediate' as const,
      label: 'immediately',
      dueDate: currentTime + 60 * 60 * 1000 // 1 hour from now
    };
  }
  
  // Today indicators
  if (content.includes('today') || content.includes('this morning') || content.includes('this afternoon') ||
      content.includes('this evening') || content.includes('tonight')) {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return {
      urgency: 'today' as const,
      label: 'today',
      dueDate: endOfDay.getTime()
    };
  }
  
  // Tomorrow indicators
  if (content.includes('tomorrow') || content.includes('next day')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    return {
      urgency: 'today' as const,
      label: 'tomorrow',
      dueDate: tomorrow.getTime()
    };
  }
  
  // This week indicators
  if (content.includes('this week') || content.includes('by friday') || content.includes('end of week')) {
    const endOfWeek = new Date(now);
    const daysToFriday = (5 - endOfWeek.getDay() + 7) % 7;
    endOfWeek.setDate(endOfWeek.getDate() + daysToFriday);
    endOfWeek.setHours(23, 59, 59, 999);
    return {
      urgency: 'week' as const,
      label: 'this week',
      dueDate: endOfWeek.getTime()
    };
  }
  
  // Next week indicators
  if (content.includes('next week') || content.includes('monday') || content.includes('tuesday') ||
      content.includes('wednesday') || content.includes('thursday') || content.includes('friday')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return {
      urgency: 'week' as const,
      label: 'next week',
      dueDate: nextWeek.getTime()
    };
  }
  
  // Later/someday indicators
  if (content.includes('someday') || content.includes('eventually') || content.includes('maybe') ||
      content.includes('when i have time') || content.includes('later')) {
    return {
      urgency: 'later' as const,
      label: 'someday',
      dueDate: undefined
    };
  }
  
  // Default to week
  return {
    urgency: 'week' as const,
    label: 'this week',
    dueDate: undefined
  };
}

/**
 * Derive priority score (0-100) using lightweight heuristics
 */
function derivePriorityScore(
  inputText: string, 
  domain: string | null, 
  urgency: 'immediate' | 'today' | 'week' | 'later',
  existingTasks: Task[]
): number {
  let score = 0.5; // Base 50/100

  // Urgency indicators
  const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'deadline'];
  const highWords = ['important', 'priority', 'must', 'need', 'required'];
  const lowWords = ['maybe', 'someday', 'eventually', 'if time', 'nice to have'];

  const text = inputText.toLowerCase();
  
  if (urgentWords.some(word => text.includes(word))) {
    score += 0.3;
  } else if (highWords.some(word => text.includes(word))) {
    score += 0.2;
  } else if (lowWords.some(word => text.includes(word))) {
    score -= 0.2;
  }

  // Time-based urgency
  switch (urgency) {
    case 'immediate':
      score += 0.3;
      break;
    case 'today':
      score += 0.2;
      break;
    case 'week':
      score += 0.1;
      break;
    case 'later':
      score -= 0.1;
      break;
  }

  // Domain-based adjustments
  if (domain === 'work') {
    score += 0.1;
  } else if (domain === 'health') {
    score += 0.15;
  } else if (domain === 'personal') {
    score -= 0.05;
  }

  // Context from existing tasks (workload pressure)
  const todayTasks = existingTasks.filter(task => 
    !task.completed && 
    task.due && 
    task.due < Date.now() + 24 * 60 * 60 * 1000
  );
  
  if (todayTasks.length > 5) {
    score -= 0.1; // Lower priority when overwhelmed
  }

  // Clamp and convert to 0-100
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

/**
 * Derive task type from content patterns
 */
function deriveTaskType(inputText: string): TaskType {
  const text = inputText.toLowerCase();
  
  if (text.includes('remind') || text.includes('don\'t forget')) {
    return 'reminder';
  }
  
  if (text.includes('meeting') || text.includes('call') || text.includes('appointment')) {
    return 'event';
  }
  
  if (text.includes('photo') || text.includes('picture') || text.includes('snapshot')) {
    return 'photo';
  }
  
  if (text.includes('remember') || text.includes('note') || text.includes('jot down')) {
    return 'memory';
  }
  
  if (text.includes('feeling') || text.includes('mood') || text.includes('emotion')) {
    return 'mood';
  }
  
  if (text.includes('think') || text.includes('idea') || text.includes('wonder')) {
    return 'thought';
  }
  
  return 'task';
}

/**
 * Derive view-specific metadata
 */
function deriveViewDefaults(
  viewContext: ViewContext,
  bubblePosition?: { x: number; y: number },
  priority: number = 50
): Partial<Task['view']> {
  const viewData: Partial<Task['view']> = {};

  switch (viewContext.mode) {
    case 'bubble':
      if (bubblePosition) {
        // Use bubble position to influence priority if available
        const normalizedY = Math.max(0, Math.min(1, bubblePosition.y / 600));
        const positionPriority = Math.round((1 - normalizedY) * 100);
        viewData.bubble = {
          x: bubblePosition.x,
          y: bubblePosition.y,
          size: Math.max(60, Math.min(120, priority + 20)),
          colorHex: getPriorityColor(positionPriority)
        };
      } else {
        viewData.bubble = {
          x: 400 + Math.random() * 200,
          y: 300 + Math.random() * 200,
          size: Math.max(60, Math.min(120, priority + 20)),
          colorHex: getPriorityColor(priority)
        };
      }
      break;

    case 'matrix':
      // Map priority to urgency/importance
      const urgency = priority > 70 ? 2 : priority > 40 ? 1 : 0;
      const importance = priority > 60 ? 2 : priority > 30 ? 1 : 0;
      viewData.matrix = {
        urgency: urgency as 0|1|2|3,
        importance: importance as 0|1|2|3,
        quadrant: calculateMatrixQuadrant(urgency, importance)
      };
      break;

    case 'list':
      viewData.list = {
        order: Date.now(), // Put at top by default
        group: priority > 70 ? 'high' : priority > 30 ? 'medium' : 'low'
      };
      break;

    case 'atomic':
      const atomicDomain = priority > 70 ? 'work' : 'personal';
      const shell = priority > 60 ? 'today' : priority > 30 ? 'week' : 'later';
      viewData.atomic = {
        domain: atomicDomain,
        shell: shell as 'today'|'week'|'later',
        angle: Math.random() * 360
      };
      break;
  }

  return viewData;
}

/**
 * Helper functions
 */
function getDomainEmoji(domain: string): string {
  const emojiMap: Record<string, string> = {
    work: '💼',
    personal: '🏠',
    health: '🏥',
    finance: '💰',
    education: '📚',
    social: '👥',
    creative: '🎨',
    maintenance: '🔧'
  };
  return emojiMap[domain] || '📝';
}

function getDomainColor(domain: string): string {
  const colorMap: Record<string, string> = {
    work: '#3b82f6',      // Blue
    personal: '#10b981',   // Green
    health: '#ef4444',     // Red
    finance: '#f59e0b',    // Amber
    education: '#8b5cf6',  // Violet
    social: '#ec4899',     // Pink
    creative: '#f97316',   // Orange
    maintenance: '#6b7280' // Gray
  };
  return colorMap[domain] || '#6b7280';
}

function getPriorityColor(priority: number): string {
  if (priority > 80) return '#ef4444'; // Red - high priority
  if (priority > 60) return '#f59e0b'; // Amber - medium-high
  if (priority > 40) return '#3b82f6'; // Blue - medium
  if (priority > 20) return '#10b981'; // Green - medium-low
  return '#6b7280'; // Gray - low priority
}

function calculateMatrixQuadrant(urgency: number, importance: number): 1|2|3|4 {
  if (urgency >= 2 && importance >= 2) return 1; // Do
  if (urgency < 2 && importance >= 2) return 2;  // Schedule  
  if (urgency >= 2 && importance < 2) return 3;  // Delegate
  return 4; // Drop
}

/**
 * Create explanation text from drivers
 */
export function createBecauseExplanation(drivers: string[]): string {
  if (drivers.length === 0) return "Based on basic defaults";
  if (drivers.length === 1) return `Because ${drivers[0]}`;
  if (drivers.length === 2) return `Because ${drivers[0]} and ${drivers[1]}`;
  return `Because ${drivers[0]}, ${drivers[1]}, and ${drivers[2]}`;
}