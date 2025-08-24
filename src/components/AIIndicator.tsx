import React from 'react';
import { Sparkles, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { aiService } from '@/services/aiService';

interface AIIndicatorProps {
  model?: 'ai' | 'local';
  size?: 'sm' | 'md';
  showStatus?: boolean;
}

const AIIndicator: React.FC<AIIndicatorProps> = ({ 
  model, 
  size = 'sm',
  showStatus = false 
}) => {
  const isOnline = aiService.isAIAvailable();
  
  if (!model && !showStatus) return null;

  const getIcon = () => {
    if (showStatus) {
      return isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />;
    }
    return model === 'ai' ? <Sparkles className="w-3 h-3" /> : null;
  };

  const getText = () => {
    if (showStatus) {
      return isOnline ? 'AI Available' : 'Offline Mode';
    }
    return model === 'ai' ? 'AI Enhanced' : '';
  };

  const getVariant = () => {
    if (showStatus) {
      return isOnline ? 'default' : 'secondary';
    }
    return model === 'ai' ? 'default' : 'outline';
  };

  const getTooltip = () => {
    if (showStatus) {
      return isOnline 
        ? 'AI features are available and will enhance your experience'
        : 'AI temporarily unavailable, using local processing';
    }
    return model === 'ai' 
      ? 'This was enhanced with AI while protecting your privacy'
      : 'Generated using local processing';
  };

  if (!getText() && !getIcon()) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getVariant()}
            className={`inline-flex items-center gap-1 ${
              size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'
            }`}
          >
            {getIcon()}
            {getText()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-48">{getTooltip()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AIIndicator;