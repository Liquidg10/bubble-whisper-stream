import { useState, useCallback } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { voiceRouter, IntentResult } from '@/intent/voiceRouter';
import { toast } from 'sonner';

interface VoiceAutoCommitState {
  isProcessing: boolean;
  lastIntent: IntentResult | null;
  wasAutoCommitted: boolean;
  bubbleCreated: boolean;
}

export function useVoiceAutoCommit() {
  const { addBubble } = useBubbleStore();
  const [state, setState] = useState<VoiceAutoCommitState>({
    isProcessing: false,
    lastIntent: null,
    wasAutoCommitted: false,
    bubbleCreated: false
  });

  const processVoiceInput = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Route the voice input to get intent
      const intent = voiceRouter.route(text);
      
      setState(prev => ({ 
        ...prev, 
        lastIntent: intent,
        wasAutoCommitted: false,
        bubbleCreated: false
      }));

      // Check if we should auto-commit
      if (intent.autoCommitRecommended && intent.confidence >= 0.9) {
        // Create bubble automatically
        const bubble = voiceRouter.createBubbleFromIntent(text, intent);
        await addBubble(bubble);
        
        setState(prev => ({ 
          ...prev, 
          wasAutoCommitted: true,
          bubbleCreated: true
        }));

        // Show auto-commit feedback
        toast.success(`Auto-created ${intent.type}: "${text.substring(0, 40)}..."`, {
          description: `${Math.round(intent.confidence * 100)}% confidence`,
          action: {
            label: 'Undo',
            onClick: () => {
              // TODO: Implement undo
              toast.info('Undo functionality coming soon');
            }
          }
        });

        console.log('🎯 Auto-committed voice bubble:', { text, intent, bubble });
      } else {
        // Show clarification or confirmation needed
        const feedback = voiceRouter.getConfidenceFeedback(text, intent);
        toast.info(feedback, {
          description: `${Math.round(intent.confidence * 100)}% confidence - Tap to confirm`,
          action: {
            label: 'Create',
            onClick: async () => {
              const bubble = voiceRouter.createBubbleFromIntent(text, intent);
              await addBubble(bubble);
              
              setState(prev => ({ 
                ...prev, 
                bubbleCreated: true
              }));
              
              toast.success(`Created ${intent.type}`);
            }
          }
        });

        console.log('🎯 Voice needs confirmation:', { text, intent, feedback });
      }
    } catch (error) {
      console.error('Voice processing error:', error);
      toast.error('Failed to process voice input');
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [addBubble]);

  const resetState = useCallback(() => {
    setState({
      isProcessing: false,
      lastIntent: null,
      wasAutoCommitted: false,
      bubbleCreated: false
    });
  }, []);

  return {
    ...state,
    processVoiceInput,
    resetState
  };
}