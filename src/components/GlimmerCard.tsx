// Glimmer Card Component
// Displays self-compassion messages with tone personalization

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, X, Info, Heart, Brain, Target, FlaskConical } from 'lucide-react';
import { Glimmer, GlimmerTone } from '@/types/bubble';
import { ttsService } from '@/services/tts';
import { explainabilityService } from '@/services/explainabilityService';
import { useToast } from '@/hooks/use-toast';

interface GlimmerCardProps {
  glimmer: Glimmer;
  onDismiss?: (id: string) => void;
  onToneChange?: (id: string, tone: GlimmerTone) => void;
  className?: string;
  compact?: boolean;
}

const TONE_CONFIG = {
  FutureYou: {
    icon: Heart,
    label: 'Future You',
    description: 'Wise perspective from your future self',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    textColor: 'text-purple-900 dark:text-purple-100'
  },
  Friend: {
    icon: Heart,
    label: 'Assistant', 
    description: 'Warm, supportive guidance',
    bgColor: 'bg-pink-50 dark:bg-pink-950/20',
    borderColor: 'border-pink-200 dark:border-pink-800',
    badgeColor: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
    textColor: 'text-pink-900 dark:text-pink-100'
  },
  Coach: {
    icon: Target,
    label: 'Assistant',
    description: 'Encouraging performance mindset',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    textColor: 'text-blue-900 dark:text-blue-100'
  },
  Scientist: {
    icon: FlaskConical,
    label: 'Assistant',
    description: 'Data-driven, objective perspective',
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    textColor: 'text-green-900 dark:text-green-100'
  }
};

export const GlimmerCard: React.FC<GlimmerCardProps> = ({
  glimmer,
  onDismiss,
  onToneChange,
  className = '',
  compact = false
}) => {
  const { toast } = useToast();
  const toneConfig = TONE_CONFIG[glimmer.tone];
  const ToneIcon = toneConfig.icon;

  const handleReadAloud = async () => {
    try {
      await ttsService.speak(glimmer.message, {
        context: 'glimmers',
        tone: 'gentle'
      });
    } catch (error) {
      toast({
        title: "Speech unavailable",
        description: "Text-to-speech isn't available right now",
        variant: "destructive"
      });
    }
  };

  const handleShowExplanation = () => {
    const explanation = explainabilityService.generateGlimmerExplanation(
      glimmer.cause,
      {} // Context would be passed from parent
    );
    
    toast({
      title: "Why this glimmer?",
      description: explanation,
      duration: 5000
    });
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (glimmer.dismissed) {
    return null;
  }

  return (
    <Card className={`${toneConfig.bgColor} ${toneConfig.borderColor} ${className}`}>
      <CardContent className={`p-4 ${toneConfig.textColor}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <ToneIcon className="h-4 w-4" />
              <Badge variant="secondary" className={toneConfig.badgeColor}>
                {toneConfig.label}
              </Badge>
              <span className="text-xs opacity-70">
                {formatTimestamp(glimmer.createdAt)}
              </span>
            </div>

            {/* Message */}
            <p className="text-sm leading-relaxed font-medium">{glimmer.message}</p>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReadAloud}
                className="h-8 px-2 text-xs"
              >
                <Volume2 className="h-3 w-3 mr-1" />
                Listen
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleShowExplanation}
                className="h-8 px-2 text-xs"
              >
                <Info className="h-3 w-3 mr-1" />
                Why?
              </Button>

              {/* Tone switcher */}
              <div className="flex items-center gap-1">
                {Object.entries(TONE_CONFIG).map(([tone, config]) => (
                  <Button
                    key={tone}
                    variant={glimmer.tone === tone ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onToneChange?.(glimmer.id, tone as GlimmerTone)}
                    className="h-6 w-6 p-0"
                    title={config.description}
                  >
                    <config.icon className="h-3 w-3" />
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Dismiss button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss?.(glimmer.id)}
            className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};