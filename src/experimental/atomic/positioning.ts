import type { Bubble } from '@/types/bubble';
import { classifyDomain } from '@/lib/classifyDomain';
import { logger } from '@/utils/logger';

// Configuration for molecule positioning
const MOLECULE_CONFIG = {
  MIN_DISTANCE: 200, // Minimum distance between molecules (nucleus + largest shell + padding)
  MAX_SHELL_RADIUS: 140, // From SHELL_CONFIG in AtomicRenderer
  PADDING: 40, // Additional padding between molecules
  MAX_ITERATIONS: 100, // Maximum attempts to find non-overlapping position
  CANVAS_BOUNDS: { minX: 100, maxX: 700, minY: 100, maxY: 400 }
};

interface MoleculePosition {
  x: number;
  y: number;
  radius: number; // Bounding radius (nucleus + largest shell + padding)
}

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

/**
 * Calculate non-overlapping positions for molecules using force-directed layout
 */
export function calculateMoleculePositions(domains: string[]): MoleculePosition[] {
  const positions: MoleculePosition[] = [];
  const moleculeRadius = MOLECULE_CONFIG.MAX_SHELL_RADIUS + MOLECULE_CONFIG.PADDING;
  
  domains.forEach((domain, index) => {
    let attempts = 0;
    let position: { x: number; y: number } | null = null;
    
    while (attempts < MOLECULE_CONFIG.MAX_ITERATIONS && !position) {
      // Start with spiral positioning as base
      const angle = (index * 137.5) * (Math.PI / 180); // Golden angle
      const baseRadius = 100 + (index * 80);
      
      // Add some randomization to avoid perfect spirals
      const jitter = attempts * 20;
      const jitterAngle = (Math.random() - 0.5) * Math.PI;
      
      const candidateX = Math.cos(angle + jitterAngle) * (baseRadius + jitter);
      const candidateY = Math.sin(angle + jitterAngle) * (baseRadius + jitter);
      
      // Check bounds
      if (candidateX < MOLECULE_CONFIG.CANVAS_BOUNDS.minX || 
          candidateX > MOLECULE_CONFIG.CANVAS_BOUNDS.maxX ||
          candidateY < MOLECULE_CONFIG.CANVAS_BOUNDS.minY || 
          candidateY > MOLECULE_CONFIG.CANVAS_BOUNDS.maxY) {
        attempts++;
        continue;
      }
      
      // Check collision with existing molecules
      const hasCollision = positions.some(existing => {
        const distance = Math.hypot(candidateX - existing.x, candidateY - existing.y);
        const requiredDistance = existing.radius + moleculeRadius;
        return distance < requiredDistance;
      });
      
      if (!hasCollision) {
        position = { x: candidateX, y: candidateY };
      }
      
      attempts++;
    }
    
    // Fallback if no position found
    if (!position) {
      position = {
        x: MOLECULE_CONFIG.CANVAS_BOUNDS.minX + (index * 120) % (MOLECULE_CONFIG.CANVAS_BOUNDS.maxX - MOLECULE_CONFIG.CANVAS_BOUNDS.minX),
        y: MOLECULE_CONFIG.CANVAS_BOUNDS.minY + Math.floor(index * 120 / (MOLECULE_CONFIG.CANVAS_BOUNDS.maxX - MOLECULE_CONFIG.CANVAS_BOUNDS.minX)) * 120
      };
      logger.warn(`Using fallback grid position for domain: ${domain}`, position);
    }
    
    positions.push({
      x: position.x,
      y: position.y,
      radius: moleculeRadius
    });
    
    logger.debug(`Positioned molecule ${domain} at`, { x: position.x, y: position.y, attempts });
  });
  
  return positions;
}
