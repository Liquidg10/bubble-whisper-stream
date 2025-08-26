import type { Bubble } from '@/types/bubble';
import { classifyBubbleDomain } from './domainClassification';

export function suggestOptimalPosition(newBubble: Bubble, existingBubbles: Bubble[]): { x: number; y: number } {
  const domain = classifyBubbleDomain(newBubble);
  const relatedBubbles = existingBubbles.filter(b => classifyBubbleDomain(b) === domain);

  if (relatedBubbles.length === 0) {
    const angle = existingBubbles.length * 2.4;
    const radius = Math.sqrt(existingBubbles.length + 1) * 40;
    return {
      x: 500 + Math.cos(angle) * radius,
      y: 280 + Math.sin(angle) * radius
    };
  }

  const avgX = relatedBubbles.reduce((sum, b) => sum + b.x, 0) / relatedBubbles.length;
  const avgY = relatedBubbles.reduce((sum, b) => sum + b.y, 0) / relatedBubbles.length;

  for (let r = 60; r < 200; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const x = avgX + Math.cos(a) * r;
      const y = avgY + Math.sin(a) * r;

      const hasOverlap = existingBubbles.some(b => {
        const dist = Math.hypot(x - b.x, y - b.y);
        return dist < 100;
      });

      if (!hasOverlap && x > 50 && x < 950 && y > 50 && y < 510) {
        return { x, y };
      }
    }
  }

  return {
    x: Math.random() * 500 + 250,
    y: Math.random() * 300 + 150
  };
}
