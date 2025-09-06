import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock, Sun } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface QuickSpeedControlsProps {
  className?: string;
}

export const QuickSpeedControls: React.FC<QuickSpeedControlsProps> = ({ className = '' }) => {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  const currentSpeed = settings.voiceSpeed || 1.3;

  const speedPresets = [
    { label: 'Relaxed', speed: 0.8, icon: Clock, description: 'Slower, calmer pace' },
    { label: 'Energetic', speed: 1.3, icon: Sun, description: 'Default energetic pace' },
    { label: 'Fast', speed: 1.8, icon: Zap, description: 'Quick, efficient delivery' }
  ];

  const handleSpeedChange = async (speed: number, label: string) => {
    await updateSettings({ voiceSpeed: speed });
    toast({
      title: `Voice speed set to ${label}`,
      description: `Now speaking at ${speed}x speed`,
    });
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      {speedPresets.map(({ label, speed, icon: Icon, description }) => (
        <Button
          key={label}
          variant={Math.abs(currentSpeed - speed) < 0.1 ? "default" : "outline"}
          size="sm"
          onClick={() => handleSpeedChange(speed, label)}
          className="gap-1.5"
          title={description}
        >
          <Icon className="h-3 w-3" />
          {label}
          <Badge variant="secondary" className="text-xs px-1">
            {speed}x
          </Badge>
        </Button>
      ))}
    </div>
  );
};