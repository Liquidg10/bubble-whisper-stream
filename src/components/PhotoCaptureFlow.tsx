import React, { useState } from 'react';
import { PhotoCapture } from './PhotoCapture';
import { EnhancedPhotoCapture } from './EnhancedPhotoCapture';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { visionService } from '@/services/vision';
import { toast } from 'sonner';

interface PhotoCaptureFlowProps {
  onComplete: (bubble: Bubble) => void;
  onCancel: () => void;
  triggerSource?: 'joy-nudge' | 'voice-intent' | 'manual';
  enhancedMode?: boolean;
}

export const PhotoCaptureFlow: React.FC<PhotoCaptureFlowProps> = ({
  onComplete,
  onCancel,
  triggerSource = 'manual',
  enhancedMode = false
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { addBubble } = useBubbleStore();

  const handlePhotoSave = async (photoUrl: string) => {
    try {
      setIsAnalyzing(true);
      
      // Create bubble with photo
      const bubble: Bubble = {
        id: crypto.randomUUID(),
        content: '',
        type: 'Memory',
        imageUri: photoUrl,
        x: Math.random() * 400,
        y: Math.random() * 400,
        size: 0.7,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          source: triggerSource,
          captured: true
        }
      };

      // Auto-analyze if enhanced mode
      if (enhancedMode) {
        try {
          const analysis = await visionService.describeImage(photoUrl);
          
          if (analysis.caption) {
            bubble.content = analysis.caption;
            bubble.caption = analysis.caption;
          }
          
          if (analysis.tags?.length > 0) {
            bubble.tags = analysis.tags.map(tag => ({
              id: crypto.randomUUID(),
              name: tag,
              emoji: tag === 'photo' ? '📸' : undefined
            }));
          }

          // Add joy tag if detected
          if (analysis.joyScore && analysis.joyScore > 0.6) {
            bubble.tags = [...(bubble.tags || []), {
              id: crypto.randomUUID(),
              name: 'joy-moment',
              emoji: '✨'
            }];
          }
        } catch (analysisError) {
          console.warn('Photo analysis failed:', analysisError);
          // Continue without analysis
        }
      }

      await addBubble(bubble);
      onComplete(bubble);
      
      toast.success(
        triggerSource === 'joy-nudge' 
          ? 'Joy moment captured! 📸✨' 
          : 'Photo saved to your thoughts'
      );
    } catch (error) {
      console.error('Failed to save photo:', error);
      toast.error('Failed to save photo');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVisionAnalysis = async (result: any) => {
    try {
      // Process vision analysis result
      console.log('Vision analysis result:', result);
      return result;
    } catch (error) {
      console.error('Vision analysis failed:', error);
      throw error;
    }
  };

  if (enhancedMode) {
    return (
      <EnhancedPhotoCapture
        onPhotoCapture={handlePhotoSave}
        onVisionAnalysis={handleVisionAnalysis}
        autoAnalyze={triggerSource === 'joy-nudge'}
        analysisType={triggerSource === 'joy-nudge' ? 'mood' : 'content'}
      />
    );
  }

  return (
    <PhotoCapture
      onSave={handlePhotoSave}
      onCancel={onCancel}
    />
  );
};