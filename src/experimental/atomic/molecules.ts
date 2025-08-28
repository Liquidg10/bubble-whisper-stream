import type { Bubble, Tag } from '@/types/bubble';
import { generateId, getDomainConfig } from '@/utils/atomicHelpers';
import { getBubbleStoreState } from './store';
import { setHorizon } from '@/lib/horizon';
import { logger } from '@/utils/logger';

export function createMoleculeFromDomain(domain: string) {
  const { addBubble } = getBubbleStoreState();

  const domainConfig = getDomainConfig(domain);
  const newBubble: Partial<Bubble> = {
    id: generateId(),
    content: `New ${domain} bubble`,
    type: domainConfig.defaultType,
    x: Math.random() * 500 + 250,
    y: Math.random() * 300 + 150,
    tags: [
      {
        id: generateId(),
        name: domain.toLowerCase(),
        emoji: domainConfig.emoji
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Use canonical horizon setter
  const bubbleWithHorizon = setHorizon(newBubble as Bubble, 'today');

  addBubble(bubbleWithHorizon);
  logger.atomic(`Created new ${domain} molecule`, { domain, domainConfig });
}

export function mergeMolecules(aId: string, bId: string) {
  const { bubbles, updateBubble, deleteBubble } = getBubbleStoreState();

  const bubbleA = bubbles.find(b => `mol-${b.id}` === aId);
  const bubbleB = bubbles.find(b => `mol-${b.id}` === bId);

  if (!bubbleA || !bubbleB) {
    logger.warn(`Cannot merge molecules: bubbleA=${!!bubbleA}, bubbleB=${!!bubbleB}`, { aId, bId });
    return;
  }

  const mergedContent = `${bubbleA.content} + ${bubbleB.content}`;
  const mergedTags = [
    ...(bubbleA.tags || []),
    ...(bubbleB.tags || [])
  ].reduce((unique, tag) => {
    const exists = unique.find(t => t.name === tag.name);
    return exists ? unique : [...unique, tag];
  }, [] as Tag[]);

  updateBubble({
    ...bubbleA,
    content: mergedContent,
    tags: mergedTags,
    x: (bubbleA.x + bubbleB.x) / 2,
    y: (bubbleA.y + bubbleB.y) / 2,
    updatedAt: Date.now()
  });

  deleteBubble(bubbleB.id);

  logger.atomic(`Merged molecules: ${bubbleA.content} + ${bubbleB.content}`, {
    aId,
    bId,
    mergedContent,
    tagCount: mergedTags.length
  });
}

export function splitMolecule(id: string) {
  const { bubbles, addBubble, updateBubble } = getBubbleStoreState();

  const bubble = bubbles.find(b => `mol-${b.id}` === id);
  if (!bubble) {
    logger.warn(`Cannot split molecule: bubble not found`, { id });
    return;
  }

  const words = bubble.content?.split(' ') || ['Split', 'Bubble'];
  const midpoint = Math.ceil(words.length / 2);
  const contentA = words.slice(0, midpoint).join(' ') + ' A';
  const contentB = words.slice(midpoint).join(' ') + ' B';

  updateBubble({
    ...bubble,
    content: contentA,
    x: bubble.x - 30,
    updatedAt: Date.now()
  });

  const newBubble: Partial<Bubble> = {
    id: generateId(),
    content: contentB,
    type: bubble.type,
    x: bubble.x + 30,
    y: bubble.y,
    tags: bubble.tags ? [...bubble.tags] : [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  addBubble(newBubble as Bubble);

  logger.atomic(`Split molecule: ${bubble.content} into ${contentA} and ${contentB}`, {
    originalId: id,
    newId: newBubble.id,
    contentA,
    contentB
  });
}
