import { useBubbleStore } from '@/stores/bubbleStore';

export function updateTimeHorizon(moleculeId: string, fromRing: number, toRing: number) {
  const { bubbles, updateBubble } = useBubbleStore.getState();
  const timeHorizons = ['today', 'week', 'later'];
  const newTimeHorizon = timeHorizons[toRing] || 'today';

  const bubble = bubbles.find(b => `mol-${b.id}` === moleculeId);
  if (!bubble) return;

  const updatedTags = bubble.tags?.filter(tag =>
    !['today', 'week', 'later'].includes(tag.name.toLowerCase())
  ) || [];

  updatedTags.push({
    id: generateId(),
    name: newTimeHorizon,
    emoji: getTimeHorizonEmoji(newTimeHorizon)
  });

  updateBubble({ ...bubble, tags: updatedTags });
  console.log(`Time horizon updated: ${bubble.content} moved to ${newTimeHorizon}`);
}

function getTimeHorizonEmoji(horizon: string): string {
  switch (horizon) {
    case 'today': return '🔥';
    case 'week': return '📅';
    case 'later': return '🌙';
    default: return '⏰';
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}
