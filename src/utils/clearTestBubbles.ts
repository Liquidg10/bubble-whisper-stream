import { useBubbleStore } from '@/stores/bubbleStore';
import { generateId } from '@/utils/atomicHelpers';
import { Bubble } from '@/types/bubble';

const cleanBubbles: Bubble[] = [
  {
    id: generateId(),
    content: "Write script for video",
    type: "Task",
    x: 300, y: 200,
    size: 0.8,
    tags: [{ id: generateId(), name: "today", emoji: "🔥" }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completed: false
  },
  {
    id: generateId(),
    content: "Beach vacation last summer",
    type: "Memory",
    x: 500, y: 150,
    size: 0.9,
    tags: [{ id: generateId(), name: "memories", emoji: "📸" }],
    imageUri: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=400&fit=crop",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000
  },
  {
    id: generateId(),
    content: "Remember to call mom",
    type: "Thought",
    x: 200, y: 300,
    size: 0.6,
    tags: [{ id: generateId(), name: "family", emoji: "❤️" }],
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000
  },
  {
    id: generateId(),
    content: "Feeling productive today! 🚀",
    type: "Mood",
    x: 400, y: 350,
    size: 0.7,
    tags: [{ id: generateId(), name: "positive", emoji: "✨" }],
    moodColor: "hsl(120, 60%, 50%)",
    createdAt: Date.now() - 1800000,
    updatedAt: Date.now() - 1800000
  },
  {
    id: generateId(),
    content: "Buy groceries",
    type: "Task",
    x: 350, y: 100,
    size: 0.5,
    tags: [{ id: generateId(), name: "errands", emoji: "🛒" }],
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
    completed: true
  }
];

export async function setupCleanBubbles() {
  const { clearAllBubbles, addBubble } = useBubbleStore.getState();
  
  // Clear all existing bubbles
  await clearAllBubbles();
  
  // Add the 5 clean bubbles
  for (const bubble of cleanBubbles) {
    await addBubble(bubble);
  }
}

export async function setupCompleteCleanSlate() {
  const { clearAllBubbles } = useBubbleStore.getState();
  
  // Clear ALL bubbles - complete clean slate
  await clearAllBubbles();
  
  console.log('🧹 Complete clean slate: All bubbles removed');
}

// Execute immediately
setupCleanBubbles();