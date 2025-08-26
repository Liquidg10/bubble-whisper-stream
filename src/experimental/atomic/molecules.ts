import { useBubbleStore } from '@/stores/bubbleStore';
import type { Bubble, BubbleType, Tag } from '@/types/bubble';

export function createMoleculeFromDomain(domain: string) {
  const { addBubble } = useBubbleStore.getState();

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
      {
        id: generateId(),
        name: 'today',
        emoji: '⏰'
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  addBubble(newBubble as Bubble);
  console.log(`Created new ${domain} molecule`);
}

export function mergeMolecules(aId: string, bId: string) {
  const { bubbles, updateBubble, deleteBubble } = useBubbleStore.getState();

  const bubbleA = bubbles.find(b => `mol-${b.id}` === aId);
  const bubbleB = bubbles.find(b => `mol-${b.id}` === bId);

  if (!bubbleA || !bubbleB) return;

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

  console.log(`Merged molecules: ${bubbleA.content} + ${bubbleB.content}`);
}

export function splitMolecule(id: string) {
  const { bubbles, addBubble, updateBubble } = useBubbleStore.getState();

  const bubble = bubbles.find(b => `mol-${b.id}` === id);
  if (!bubble) return;

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

  console.log(`Split molecule: ${bubble.content} into ${contentA} and ${contentB}`);
}

function getDomainConfig(domain: string): { defaultType: BubbleType; emoji: string } {
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

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}
