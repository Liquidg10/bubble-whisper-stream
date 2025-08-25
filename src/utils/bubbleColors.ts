import { BubbleType } from '@/types/bubble';

export interface BubbleColorScheme {
  background: string;
  border: string;
  text: string;
  accent: string;
  icon: string;
}

export const getBubbleColorScheme = (type: BubbleType, priority: number): BubbleColorScheme => {
  // Calculate intensity based on priority (0.1 to 1.0)
  const intensity = Math.max(0.3, Math.min(1.0, priority));
  
  // Base color schemes for each bubble type
  const colorSchemes: Record<BubbleType, BubbleColorScheme> = {
    Memory: {
      background: `hsl(220 ${Math.round(50 + intensity * 30)}% ${Math.round(95 - intensity * 10)}%)`,
      border: `hsl(220 ${Math.round(60 + intensity * 40)}% ${Math.round(70 - intensity * 20)}%)`,
      text: `hsl(220 ${Math.round(30 + intensity * 20)}% ${Math.round(20 + intensity * 10)}%)`,
      accent: `hsl(220 ${Math.round(70 + intensity * 30)}% ${Math.round(50 + intensity * 20)}%)`,
      icon: `hsl(220 ${Math.round(60 + intensity * 40)}% ${Math.round(40 + intensity * 30)}%)`
    },
    Task: {
      background: `hsl(150 ${Math.round(50 + intensity * 30)}% ${Math.round(95 - intensity * 10)}%)`,
      border: `hsl(150 ${Math.round(60 + intensity * 40)}% ${Math.round(70 - intensity * 20)}%)`,
      text: `hsl(150 ${Math.round(30 + intensity * 20)}% ${Math.round(20 + intensity * 10)}%)`,
      accent: `hsl(150 ${Math.round(70 + intensity * 30)}% ${Math.round(50 + intensity * 20)}%)`,
      icon: `hsl(150 ${Math.round(60 + intensity * 40)}% ${Math.round(40 + intensity * 30)}%)`
    },
    Thought: {
      background: `hsl(270 ${Math.round(50 + intensity * 30)}% ${Math.round(95 - intensity * 10)}%)`,
      border: `hsl(270 ${Math.round(60 + intensity * 40)}% ${Math.round(70 - intensity * 20)}%)`,
      text: `hsl(270 ${Math.round(30 + intensity * 20)}% ${Math.round(20 + intensity * 10)}%)`,
      accent: `hsl(270 ${Math.round(70 + intensity * 30)}% ${Math.round(50 + intensity * 20)}%)`,
      icon: `hsl(270 ${Math.round(60 + intensity * 40)}% ${Math.round(40 + intensity * 30)}%)`
    },
    Mood: {
      background: `hsl(40 ${Math.round(50 + intensity * 30)}% ${Math.round(95 - intensity * 10)}%)`,
      border: `hsl(40 ${Math.round(60 + intensity * 40)}% ${Math.round(70 - intensity * 20)}%)`,
      text: `hsl(40 ${Math.round(30 + intensity * 20)}% ${Math.round(20 + intensity * 10)}%)`,
      accent: `hsl(40 ${Math.round(70 + intensity * 30)}% ${Math.round(50 + intensity * 20)}%)`,
      icon: `hsl(40 ${Math.round(60 + intensity * 40)}% ${Math.round(40 + intensity * 30)}%)`
    },
    ReminderNote: {
      background: `hsl(10 ${Math.round(50 + intensity * 30)}% ${Math.round(95 - intensity * 10)}%)`,
      border: `hsl(10 ${Math.round(60 + intensity * 40)}% ${Math.round(70 - intensity * 20)}%)`,
      text: `hsl(10 ${Math.round(30 + intensity * 20)}% ${Math.round(20 + intensity * 10)}%)`,
      accent: `hsl(10 ${Math.round(70 + intensity * 30)}% ${Math.round(50 + intensity * 20)}%)`,
      icon: `hsl(10 ${Math.round(60 + intensity * 40)}% ${Math.round(40 + intensity * 30)}%)`
    }
  };

  return colorSchemes[type];
};

export const getBubbleTypeIcon = (type: BubbleType): string => {
  const icons: Record<BubbleType, string> = {
    Memory: '💭',
    Task: '✅',
    Thought: '🧠',
    Mood: '😊',
    ReminderNote: '⏰'
  };
  
  return icons[type];
};