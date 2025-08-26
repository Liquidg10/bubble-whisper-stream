import type { Bubble } from '@/types/bubble';
import { logger } from '@/utils/logger';

export function classifyBubbleDomain(bubble: Bubble): string {
  const content = (bubble.content || '').toLowerCase();
  const tags = bubble.tags?.map(t => t.name.toLowerCase()) || [];
  const allText = [content, ...tags].join(' ');

  let domain = 'Default';

  if (allText.match(/money|budget|finance|pay|cost|expense|income|invest/)) domain = 'Financial';
  else if (allText.match(/child|parent|family|kid|school|homework|bedtime/)) domain = 'Parenting';
  else if (allText.match(/anxiety|mood|mental|therapy|stress|depression|wellness/)) domain = 'Mental';
  else if (allText.match(/work|job|career|meeting|deadline|project|colleague/)) domain = 'Work';
  else if (allText.match(/home|house|clean|chore|repair|garden|cook|laundry/)) domain = 'Home';
  else if (allText.match(/friend|relationship|social|date|partner|marriage/)) domain = 'Relationships';

  logger.debug(`Classified bubble domain: ${domain}`, {
    bubbleId: bubble.id,
    content: content.substring(0, 50),
    tagCount: tags.length,
    domain
  });

  return domain;
}
