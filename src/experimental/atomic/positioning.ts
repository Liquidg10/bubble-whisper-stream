import type { Bubble } from '@/types/bubble';
import { classifyDomain } from '@/lib/classifyDomain';
import { logger } from '@/utils/logger';

export function suggestOptimalPosition(newBubble: Bubble, existingBubbles: Bubble[]): { x: number; y: number } {
  const domain = classifyDomain(newBubble);
  const relatedBubbles = existingBubbles.filter(b => classifyDomain(b) === domain);

  logger.debug(`Positioning bubble in domain: ${domain}`, {
    relatedBubblesCount: relatedBubbles.length,
    totalBubbles: existingBubbles.length
  });

  if (relatedBubbles.length === 0) {
    const angle = existingBubbles.length * 2.4;
    const radius = Math.sqrt(existingBubbles.length + 1) * 40;
    const position = {
      x: 500 + Math.cos(angle) * radius,
      y: 280 + Math.sin(angle) * radius
    };
    
    logger.debug(`No related bubbles, using spiral positioning`, position);
    return position;
  }

  const avgX = relatedBubbles.reduce((sum, b) => sum + b.x, 0) / relatedBubbles.length;
  const avgY = relatedBubbles.reduce((sum, b) => sum + b.y, 0) / relatedBubbles.length;

  // Find optimal position near related bubbles
  for (let r = 60; r < 200; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const x = avgX + Math.cos(a) * r;
      const y = avgY + Math.sin(a) * r;

      const hasOverlap = existingBubbles.some(b => {
        const dist = Math.hypot(x - b.x, y - b.y);
        return dist < 100;
      });

      if (!hasOverlap && x > 50 && x < 950 && y > 50 && y < 510) {
        logger.debug(`Found optimal position near related bubbles`, { x, y, radius: r, angle: a });
        return { x, y };
      }
    }
  }

  // Fallback to random position
  const fallbackPosition = {
    x: Math.random() * 500 + 250,
    y: Math.random() * 300 + 150
  };
  
  logger.warn(`Could not find optimal position, using fallback`, fallbackPosition);
  return fallbackPosition;
}
