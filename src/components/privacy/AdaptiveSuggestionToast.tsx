import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BecausePill } from '@/components/SmartBecausePill';
import { MoreHorizontal, Shield, Eye, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdaptiveSuggestionToastProps {
  title: string;
  suggestion: string;
  explanation: string[];
  privacyLayer: 'surface' | 'context' | 'deep';
  actionType: 'auto-write' | 'reminder' | 'celebration' | 'context-nudge';
  onAccept?: () => void;
  onDismiss?: () => void;
  onLearnMore?: () => void;
  onReduceFrequency?: () => void;
  className?: string;
}

const PrivacyLayerIcon = ({ layer }: { layer: string }) => {
  switch (layer) {
    case 'surface':
      return <Eye className="h-3 w-3" />;
    case 'context':
      return <Shield className="h-3 w-3" />;
    case 'deep':
      return <Lock className="h-3 w-3" />;
    default:
      return <Eye className="h-3 w-3" />;
  }
};

export function AdaptiveSuggestionToast({
  title,
  suggestion,
  explanation,
  privacyLayer,
  actionType,
  onAccept,
  onDismiss,
  onLearnMore,
  onReduceFrequency,
  className
}: AdaptiveSuggestionToastProps) {
  const openPrivacyControls = (type: string) => {
    // Navigate to privacy settings for this action type
    window.location.href = `/settings?tab=privacy&focus=${type}`;
  };

  return (
    <div className={cn("adaptive-suggestion-toast p-4 space-y-3", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-sm text-muted-foreground">{suggestion}</div>
          
          {/* Standardized "Because..." explanation */}
          <BecausePill 
            explanation={explanation}
            className="text-xs"
          />
          
          {/* Privacy layer indicator */}
          <Badge variant="outline" className="text-xs w-fit">
            <PrivacyLayerIcon layer={privacyLayer} />
            <span className="ml-1 capitalize">{privacyLayer} data</span>
          </Badge>
        </div>
        
        <div className="flex gap-1 ml-3">
          {onAccept && (
            <Button size="sm" onClick={onAccept}>
              Accept
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onLearnMore && (
                <DropdownMenuItem onClick={onLearnMore}>
                  Learn more
                </DropdownMenuItem>
              )}
              {onReduceFrequency && (
                <DropdownMenuItem onClick={onReduceFrequency}>
                  Less of this
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openPrivacyControls(actionType)}>
                Privacy settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}