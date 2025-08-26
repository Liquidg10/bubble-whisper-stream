import type { BubbleType } from '@/types/bubble';

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function getTimeHorizonEmoji(horizon: string): string {
  switch (horizon) {
    case 'today':
      return '🔥';
    case 'week':
      return '📅';
    case 'later':
      return '🌙';
    default:
      return '⏰';
  }
}

export function getDomainConfig(domain: string): { defaultType: BubbleType; emoji: string } {
  const configs = {
    Financial: { defaultType: 'Task' as BubbleType, emoji: '💰' },
    Parenting: { defaultType: 'Memory' as BubbleType, emoji: '👨‍👩‍👧‍👦' },
    Mental: { defaultType: 'Thought' as BubbleType, emoji: '🧠' },
    Work: { defaultType: 'Task' as BubbleType, emoji: '💼' },
    Home: { defaultType: 'Task' as BubbleType, emoji: '🏠' },
    Relationships: { defaultType: 'Memory' as BubbleType, emoji: '❤️' }
  };

  return configs[domain as keyof typeof configs] || configs.Work;
}

