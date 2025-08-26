import type { Bubble } from '@/types/bubble';

export function classifyBubbleDomain(bubble: Bubble): string {
  const content = (bubble.content || '').toLowerCase();
  const tags = bubble.tags?.map(t => t.name.toLowerCase()) || [];
  const allText = [content, ...tags].join(' ');

  if (allText.match(/money|budget|finance|pay|cost|expense|income|invest/)) return 'Financial';
  if (allText.match(/child|parent|family|kid|school|homework|bedtime/)) return 'Parenting';
  if (allText.match(/anxiety|mood|mental|therapy|stress|depression|wellness/)) return 'Mental';
  if (allText.match(/work|job|career|meeting|deadline|project|colleague/)) return 'Work';
  if (allText.match(/home|house|clean|chore|repair|garden|cook|laundry/)) return 'Home';
  if (allText.match(/friend|relationship|social|date|partner|marriage/)) return 'Relationships';

  return 'Default';
}
