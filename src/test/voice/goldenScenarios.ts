/**
 * Golden Scenarios - Phase 3 voice validation test suite
 * Comprehensive test cases for voice intent recognition
 */

export interface GoldenScenario {
  id: string;
  category: 'reminder' | 'task' | 'note' | 'calendar' | 'email' | 'grocery' | 'finance' | 'edge_case';
  text: string;
  expectedIntent: string;
  expectedConfidence: number; // Minimum expected confidence
  expectedBubbleType?: string;
  description: string;
  timeToChipBudgetMs?: number; // Optional performance budget
  processingBudgetMs?: number;
}

export const goldenScenarios: GoldenScenario[] = [
  // === REMINDER SCENARIOS ===
  {
    id: 'reminder-simple',
    category: 'reminder',
    text: 'remind me to call mom tomorrow at 3pm',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.85,
    expectedBubbleType: 'reminder',
    description: 'Basic reminder with specific time',
    timeToChipBudgetMs: 400,
    processingBudgetMs: 800,
  },
  {
    id: 'reminder-recurring',
    category: 'reminder',
    text: 'remind me to take vitamins every morning at 8am',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.8,
    expectedBubbleType: 'reminder',
    description: 'Recurring reminder pattern',
  },
  {
    id: 'reminder-location',
    category: 'reminder',
    text: 'remind me to buy groceries when I get to the store',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.75,
    expectedBubbleType: 'reminder',
    description: 'Location-based reminder',
  },

  // === TASK SCENARIOS ===
  {
    id: 'task-simple',
    category: 'task',
    text: 'add task to finish the presentation',
    expectedIntent: 'create_task',
    expectedConfidence: 0.9,
    expectedBubbleType: 'task',
    description: 'Simple task creation',
    timeToChipBudgetMs: 350,
  },
  {
    id: 'task-deadline',
    category: 'task',
    text: 'I need to submit the report by Friday',
    expectedIntent: 'create_task',
    expectedConfidence: 0.75,
    expectedBubbleType: 'task',
    description: 'Task with deadline inference',
  },
  {
    id: 'task-priority',
    category: 'task',
    text: 'urgent task call the client immediately',
    expectedIntent: 'create_task',
    expectedConfidence: 0.8,
    expectedBubbleType: 'task',
    description: 'High priority task detection',
  },

  // === NOTE SCENARIOS ===
  {
    id: 'note-simple',
    category: 'note',
    text: 'note that the meeting went well today',
    expectedIntent: 'create_note',
    expectedConfidence: 0.85,
    expectedBubbleType: 'thought',
    description: 'Basic note creation',
  },
  {
    id: 'note-idea',
    category: 'note',
    text: 'I just had an idea about improving the user interface',
    expectedIntent: 'create_note',
    expectedConfidence: 0.75,
    expectedBubbleType: 'thought',
    description: 'Idea capture',
  },
  {
    id: 'note-memory',
    category: 'note',
    text: 'remember that John prefers coffee over tea',
    expectedIntent: 'create_note',
    expectedConfidence: 0.8,
    expectedBubbleType: 'memory',
    description: 'Memory note creation',
  },

  // === CALENDAR SCENARIOS ===
  {
    id: 'calendar-meeting',
    category: 'calendar',
    text: 'schedule a meeting with the team next Tuesday at 10am',
    expectedIntent: 'create_calendar_event',
    expectedConfidence: 0.8,
    description: 'Meeting scheduling',
    timeToChipBudgetMs: 500,
  },
  {
    id: 'calendar-appointment',
    category: 'calendar',
    text: 'book dentist appointment for next week',
    expectedIntent: 'create_calendar_event',
    expectedConfidence: 0.75,
    description: 'Appointment booking',
  },
  {
    id: 'calendar-personal',
    category: 'calendar',
    text: 'add lunch with Sarah on Friday at noon',
    expectedIntent: 'create_calendar_event',
    expectedConfidence: 0.85,
    description: 'Personal event scheduling',
  },

  // === EMAIL SCENARIOS ===
  {
    id: 'email-simple',
    category: 'email',
    text: 'email John about the project update',
    expectedIntent: 'create_email',
    expectedConfidence: 0.8,
    description: 'Basic email composition',
  },
  {
    id: 'email-follow-up',
    category: 'email',
    text: 'follow up with the client about the proposal',
    expectedIntent: 'create_email',
    expectedConfidence: 0.75,
    description: 'Follow-up email',
  },
  {
    id: 'email-reply',
    category: 'email',
    text: 'reply to Sarah that I will attend the meeting',
    expectedIntent: 'create_email',
    expectedConfidence: 0.8,
    description: 'Email reply',
  },

  // === GROCERY SCENARIOS ===
  {
    id: 'grocery-add',
    category: 'grocery',
    text: 'add milk and bread to my grocery list',
    expectedIntent: 'add_to_grocery_list',
    expectedConfidence: 0.85,
    description: 'Adding items to grocery list',
  },
  {
    id: 'grocery-meal-plan',
    category: 'grocery',
    text: 'I need ingredients for pasta tonight',
    expectedIntent: 'add_to_grocery_list',
    expectedConfidence: 0.7,
    description: 'Meal-based grocery planning',
  },

  // === FINANCE SCENARIOS ===
  {
    id: 'finance-expense',
    category: 'finance',
    text: 'log expense fifty dollars for lunch',
    expectedIntent: 'log_expense',
    expectedConfidence: 0.8,
    description: 'Expense logging',
  },
  {
    id: 'finance-budget',
    category: 'finance',
    text: 'check my budget for groceries this month',
    expectedIntent: 'check_budget',
    expectedConfidence: 0.75,
    description: 'Budget inquiry',
  },

  // === EDGE CASES ===
  {
    id: 'edge-ambiguous',
    category: 'edge_case',
    text: 'call',
    expectedIntent: 'unclear',
    expectedConfidence: 0.3,
    description: 'Ambiguous single word',
  },
  {
    id: 'edge-multiple-intents',
    category: 'edge_case',
    text: 'remind me to call John and schedule a meeting about the project',
    expectedIntent: 'create_reminder', // Should pick primary intent
    expectedConfidence: 0.6,
    description: 'Multiple potential intents',
  },
  {
    id: 'edge-no-intent',
    category: 'edge_case',
    text: 'what a beautiful day it is today',
    expectedIntent: 'casual_conversation',
    expectedConfidence: 0.4,
    description: 'Conversational with no clear intent',
  },
  {
    id: 'edge-question',
    category: 'edge_case',
    text: 'what time is my meeting tomorrow',
    expectedIntent: 'query_calendar',
    expectedConfidence: 0.7,
    description: 'Query rather than creation',
  },
  {
    id: 'edge-negative',
    category: 'edge_case',
    text: 'do not remind me about the party',
    expectedIntent: 'cancel_reminder',
    expectedConfidence: 0.6,
    description: 'Negative intent (cancellation)',
  },
  {
    id: 'edge-long-complex',
    category: 'edge_case',
    text: 'I need to remember to call my grandmother tomorrow afternoon around 3pm to discuss the family reunion plans and also remind myself to buy flowers for the event which is happening next weekend',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.7,
    description: 'Long, complex sentence with multiple components',
    processingBudgetMs: 1500, // Longer processing budget for complex input
  },

  // === PERFORMANCE EDGE CASES ===
  {
    id: 'perf-very-short',
    category: 'edge_case',
    text: 'note',
    expectedIntent: 'unclear',
    expectedConfidence: 0.3,
    description: 'Very short input',
    timeToChipBudgetMs: 200, // Should be very fast
  },
  {
    id: 'perf-repeated-words',
    category: 'edge_case',
    text: 'remind remind remind me to call call call mom',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.5,
    description: 'Repeated words (speech recognition artifact)',
  },
  {
    id: 'perf-numbers-time',
    category: 'edge_case',
    text: 'remind me at 2:30pm on March 15th 2024',
    expectedIntent: 'create_reminder',
    expectedConfidence: 0.8,
    description: 'Complex time parsing',
  },

  // === CONTEXTUAL SCENARIOS ===
  {
    id: 'context-continuation',
    category: 'edge_case',
    text: 'also add tomatoes',
    expectedIntent: 'add_to_grocery_list', // Assumes grocery context
    expectedConfidence: 0.6,
    description: 'Continuation of previous context',
  },
  {
    id: 'context-correction',
    category: 'edge_case',
    text: 'actually make that 4pm not 3pm',
    expectedIntent: 'modify_reminder',
    expectedConfidence: 0.5,
    description: 'Correction of previous input',
  },
];

// Performance budgets for categories
export const categoryBudgets = {
  reminder: { timeToChip: 400, processing: 800 },
  task: { timeToChip: 350, processing: 700 },
  note: { timeToChip: 300, processing: 600 },
  calendar: { timeToChip: 500, processing: 1000 },
  email: { timeToChip: 450, processing: 900 },
  grocery: { timeToChip: 350, processing: 700 },
  finance: { timeToChip: 400, processing: 800 },
  edge_case: { timeToChip: 600, processing: 1200 },
};

// Test suite configuration
export const testSuiteConfig = {
  confidenceThreshold: 0.6, // Minimum confidence for pass
  timeToChipBudget: 500, // Default time to chip budget (ms)
  processingBudget: 1000, // Default processing budget (ms)
  passRate: 0.85, // Minimum pass rate for overall suite
  performancePassRate: 0.9, // Minimum performance budget pass rate
};