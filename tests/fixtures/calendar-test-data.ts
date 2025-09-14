/**
 * Calendar Test Data Fixtures
 * Mock data and utilities for calendar testing
 */

export interface MockCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  priority?: 'low' | 'medium' | 'high';
  type?: 'task' | 'event' | 'reminder';
}

export interface MockTask {
  id: string;
  title: string;
  content?: string;
  completed: boolean;
  priority: number;
  tags: string[];
  due?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate sample calendar events for testing
 */
export function generateMockEvents(count: number = 10): MockCalendarEvent[] {
  const events: MockCalendarEvent[] = [];
  const now = new Date();
  
  const eventTypes = ['Meeting', 'Call', 'Review', 'Planning', 'Development', 'Testing'];
  const priorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
  
  for (let i = 0; i < count; i++) {
    const startTime = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000) + (Math.random() * 8 * 60 * 60 * 1000));
    const duration = (Math.random() * 3 + 0.5) * 60 * 60 * 1000; // 30min to 3.5 hours
    const endTime = new Date(startTime.getTime() + duration);
    
    events.push({
      id: `event-${i}`,
      title: `${eventTypes[Math.floor(Math.random() * eventTypes.length)]} ${i + 1}`,
      start: startTime,
      end: endTime,
      allDay: Math.random() < 0.1, // 10% all-day events
      description: `Description for event ${i + 1}`,
      location: Math.random() < 0.3 ? `Location ${i + 1}` : undefined,
      priority: priorities[Math.floor(Math.random() * priorities.length)],
      type: Math.random() < 0.7 ? 'event' : 'task'
    });
  }
  
  return events;
}

/**
 * Generate sample tasks for testing
 */
export function generateMockTasks(count: number = 15): MockTask[] {
  const tasks: MockTask[] = [];
  const now = new Date();
  
  const taskTitles = [
    'Review project proposal',
    'Update documentation',
    'Fix critical bug',
    'Prepare presentation',
    'Code review',
    'Team standup',
    'Client meeting',
    'Write tests',
    'Deploy to staging',
    'User research session',
    'Design review',
    'Performance optimization',
    'Security audit',
    'Database migration',
    'API integration'
  ];
  
  const tags = ['work', 'urgent', 'personal', 'development', 'meeting', 'review', 'bug', 'feature'];
  
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(now.getTime() - (Math.random() * 7 * 24 * 60 * 60 * 1000));
    const dueDate = Math.random() < 0.6 ? new Date(now.getTime() + (Math.random() * 14 * 24 * 60 * 60 * 1000)) : undefined;
    
    tasks.push({
      id: `task-${i}`,
      title: taskTitles[i % taskTitles.length],
      content: Math.random() < 0.5 ? `Detailed content for task ${i + 1}` : undefined,
      completed: Math.random() < 0.3, // 30% completed
      priority: Math.floor(Math.random() * 100),
      tags: tags.slice(0, Math.floor(Math.random() * 3) + 1),
      due: dueDate,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + (Math.random() * 24 * 60 * 60 * 1000))
    });
  }
  
  return tasks;
}

/**
 * Generate heavy calendar day for stress testing
 */
export function generateHeavyCalendarDay(date: Date = new Date()): MockCalendarEvent[] {
  const events: MockCalendarEvent[] = [];
  const startOfDay = new Date(date);
  startOfDay.setHours(8, 0, 0, 0); // Start at 8 AM
  
  // Create back-to-back meetings
  const meetings = [
    { title: 'Team Standup', duration: 30 },
    { title: 'Project Planning', duration: 60 },
    { title: 'Client Call', duration: 45 },
    { title: 'Code Review', duration: 60 },
    { title: 'Architecture Discussion', duration: 90 },
    { title: 'Sprint Planning', duration: 120 },
    { title: 'Demo Session', duration: 30 },
    { title: 'Retrospective', duration: 60 }
  ];
  
  let currentTime = new Date(startOfDay);
  
  meetings.forEach((meeting, index) => {
    const startTime = new Date(currentTime);
    const endTime = new Date(currentTime.getTime() + (meeting.duration * 60 * 1000));
    
    events.push({
      id: `heavy-${index}`,
      title: meeting.title,
      start: startTime,
      end: endTime,
      priority: 'high',
      type: 'event'
    });
    
    // Add small break (or overlap for stress)
    currentTime = new Date(endTime.getTime() + (Math.random() < 0.3 ? -10 : 10) * 60 * 1000);
  });
  
  return events;
}

/**
 * Generate conflicting events for conflict resolution testing
 */
export function generateConflictingEvents(): MockCalendarEvent[] {
  const now = new Date();
  const baseTime = new Date(now);
  baseTime.setHours(14, 0, 0, 0); // 2 PM today
  
  return [
    {
      id: 'conflict-1',
      title: 'Important Meeting',
      start: new Date(baseTime),
      end: new Date(baseTime.getTime() + 60 * 60 * 1000), // 1 hour
      priority: 'high'
    },
    {
      id: 'conflict-2', 
      title: 'Team Sync',
      start: new Date(baseTime.getTime() + 30 * 60 * 1000), // Overlaps by 30 min
      end: new Date(baseTime.getTime() + 90 * 60 * 1000),
      priority: 'medium'
    },
    {
      id: 'conflict-3',
      title: 'Client Call',
      start: new Date(baseTime.getTime() + 15 * 60 * 1000), // Multiple overlaps
      end: new Date(baseTime.getTime() + 75 * 60 * 1000),
      priority: 'high'
    }
  ];
}

/**
 * Generate AI suggestion test scenarios
 */
export function generateAISuggestionScenarios(): Array<{
  pattern: string;
  events: MockCalendarEvent[];
  expectedSuggestion: string;
}> {
  const now = new Date();
  
  return [
    {
      pattern: 'morning_workout',
      events: [
        {
          id: 'workout-1',
          title: 'Morning workout',
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          priority: 'medium'
        },
        {
          id: 'workout-2',
          title: 'Gym session',
          start: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          priority: 'medium'
        }
      ],
      expectedSuggestion: 'Schedule morning workout'
    },
    {
      pattern: 'lunch_break',
      events: [
        {
          id: 'lunch-1',
          title: 'Lunch break',
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          end: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
          priority: 'low'
        }
      ],
      expectedSuggestion: 'Block lunch time'
    }
  ];
}

/**
 * Mock calendar integration data
 */
export const mockCalendarIntegration = {
  googleCalendar: {
    calendarId: 'primary',
    watchExpiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    syncToken: 'mock-sync-token-123',
    lastSync: new Date(Date.now() - 5 * 60 * 1000)
  },
  gmailWatch: {
    watchExpiration: new Date(Date.now() + 24 * 60 * 60 * 1000),
    historyId: 'mock-history-id-456',
    lastSync: new Date(Date.now() - 2 * 60 * 1000)
  }
};

/**
 * Performance test data sets
 */
export const performanceTestData = {
  small: {
    events: 10,
    tasks: 15,
    description: 'Light load for baseline testing'
  },
  medium: {
    events: 50,
    tasks: 75,
    description: 'Moderate load for typical usage'
  },
  large: {
    events: 200,
    tasks: 300,
    description: 'Heavy load for stress testing'
  },
  extreme: {
    events: 500,
    tasks: 750,
    description: 'Extreme load for maximum stress'
  }
};

/**
 * Accessibility test scenarios
 */
export const accessibilityTestScenarios = [
  {
    name: 'keyboard_navigation',
    description: 'Test full keyboard navigation through calendar',
    events: generateMockEvents(5)
  },
  {
    name: 'screen_reader',
    description: 'Test screen reader compatibility',
    events: generateMockEvents(3).map(event => ({
      ...event,
      description: `Accessible description for ${event.title}`
    }))
  },
  {
    name: 'high_contrast',
    description: 'Test high contrast mode compatibility',
    events: generateMockEvents(8)
  },
  {
    name: 'reduced_motion', 
    description: 'Test reduced motion preferences',
    events: generateMockEvents(6)
  }
];

/**
 * Mobile test configurations
 */
export const mobileTestConfigs = [
  {
    name: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPhone 13',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'Android Medium',
    viewport: { width: 360, height: 640 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 4) AppleWebKit/537.36'
  },
  {
    name: 'iPad',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
  }
];