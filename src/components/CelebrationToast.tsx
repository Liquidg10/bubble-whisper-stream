/**
 * P15 - Enhanced Celebration Toast Component
 * Brief, joy-focused micro-celebrations with tone controls
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import type { GlimmerTone } from '@/types/glimmer';

interface CelebrationToastProps {
  message: string;
  tone: GlimmerTone;
  onMute?: (tone: GlimmerTone) => void;
  onDismiss?: () => void;
}

export const CelebrationToast: React.FC<CelebrationToastProps> = ({
  message,
  tone,
  onMute,
  onDismiss
}) => {
  const getToneGradient = (tone: GlimmerTone) => {
    const gradients = {
      'Friend': 'from-orange-100 to-yellow-100 border-orange-200',
      'Coach': 'from-blue-100 to-indigo-100 border-blue-200', 
      'Scientist': 'from-green-100 to-emerald-100 border-green-200',
      'Future You': 'from-purple-100 to-pink-100 border-purple-200'
    };
    return gradients[tone] || 'from-gray-100 to-gray-100 border-gray-200';
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg bg-gradient-to-r ${getToneGradient(tone)} shadow-sm`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
      
      <div className="flex items-center gap-1 ml-3">
        {onMute && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMute(tone)}
            className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
            title={`Mute ${tone} celebrations`}
          >
            <VolumeX className="h-3 w-3" />
          </Button>
        )}
        
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
            title="Dismiss"
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
};