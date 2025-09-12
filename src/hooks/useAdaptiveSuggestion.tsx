import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface AdaptiveSuggestionConfig {
  title: string;
  suggestion: string;
  explanation: string[];
  privacyLayer: 'surface' | 'context' | 'deep';
  actionType: 'auto-write' | 'reminder' | 'celebration' | 'context-nudge';
  onAccept?: () => void;
  onDismiss?: () => void;
  onLearnMore?: () => void;
  onReduceFrequency?: () => void;
}

// Analytics tracking for suggestion interactions
const recordSuggestionInteraction = (actionType: string, interaction: string) => {
  const key = `suggestion_${actionType}_${interaction}`;
  const currentCount = parseInt(localStorage.getItem(key) || '0');
  localStorage.setItem(key, (currentCount + 1).toString());
  
  console.log(`📊 Suggestion interaction: ${actionType} - ${interaction}`);
};

// Reduce frequency for a specific suggestion type
const reduceFrequency = (actionType: string) => {
  const key = `suggestion_${actionType}_frequency`;
  const currentLevel = parseInt(localStorage.getItem(key) || '100');
  const newLevel = Math.max(10, currentLevel - 25); // Reduce by 25%, minimum 10%
  localStorage.setItem(key, newLevel.toString());
  
  console.log(`🔇 Reduced frequency for ${actionType} to ${newLevel}%`);
};

// Check if we should show a suggestion based on frequency settings
export const shouldShowSuggestion = (actionType: string): boolean => {
  const key = `suggestion_${actionType}_frequency`;
  const frequency = parseInt(localStorage.getItem(key) || '100');
  return Math.random() * 100 < frequency;
};

export function useAdaptiveSuggestion() {
  const { toast } = useToast();
  
  const showSuggestion = useCallback((config: AdaptiveSuggestionConfig) => {
    // Validate required explanation
    if (!config.explanation || config.explanation.length === 0) {
      console.warn('Adaptive suggestion missing explanation:', config);
      config.explanation = ['Standard system suggestion'];
    }

    // Check frequency limits
    if (!shouldShowSuggestion(config.actionType)) {
      console.log(`🔇 Skipping ${config.actionType} suggestion due to frequency limit`);
      return;
    }
    
    // Show unified toast with standard pattern
    toast({
      title: config.title,
      description: `${config.suggestion} • Because: ${config.explanation.join(' • ')} • Data: ${config.privacyLayer} layer`,
      duration: 8000,
      action: config.onAccept ? (
        <Button 
          size="sm"
          onClick={() => {
            recordSuggestionInteraction(config.actionType, 'accepted');
            config.onAccept?.();
          }}
        >
          Accept
        </Button>
      ) : undefined,
    });
    
    // Track that we showed the suggestion
    recordSuggestionInteraction(config.actionType, 'shown');
  }, [toast]);
  
  return { showSuggestion };
}

// Export the config type for external use
export type { AdaptiveSuggestionConfig };