import { useBubbleStore } from '@/stores/bubbleStore';

export async function clearAllTestBubbles() {
  const { clearAllBubbles } = useBubbleStore.getState();
  await clearAllBubbles();
}

// Execute immediately
clearAllTestBubbles();