/**
 * P15 - Joy & Compassion Integration
 * Connects momentum detection with micro-celebrations
 */

import React, { useEffect } from 'react';
import { useMicroCelebrations } from '@/hooks/useMicroCelebrations';
import { useBubbleStore } from '@/stores/bubbleStore';

export const JoyMomentumIntegration: React.FC = () => {
  const { checkForCelebrations } = useMicroCelebrations();
  const { bubbles } = useBubbleStore();

  useEffect(() => {
    // Debounced celebration check when bubbles change
    const timeoutId = setTimeout(() => {
      checkForCelebrations();
    }, 3000); // 3 second delay to allow for completion patterns

    return () => clearTimeout(timeoutId);
  }, [bubbles.length, checkForCelebrations]);

  // This component is invisible - it just runs celebration logic
  return null;
};