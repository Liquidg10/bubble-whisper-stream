import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Play, Square } from 'lucide-react';
import { microcopyService, MicrocopyOptions } from '@/services/microcopyService';
import { useCalmMode } from '@/providers/CalmModeProvider';

interface AccessibleActionButtonProps {
  action: 'save' | 'delete' | 'add' | 'cancel' | string;
  context?: string;
  item?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  variant?: 'default' | 'destructive' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  microcopyOptions?: Partial<MicrocopyOptions>;
  showReadAloud?: boolean;
}

export const AccessibleActionButton: React.FC<AccessibleActionButtonProps> = ({
  action,
  context,
  item,
  onPrimary,
  onSecondary,
  variant = 'default',
  disabled = false,
  loading = false,
  className = '',
  microcopyOptions,
  showReadAloud = false
}) => {
  const { getButtonSize } = useCalmMode();
  const [isReading, setIsReading] = useState(false);
  
  const buttonSize = getButtonSize() === 'xl' ? 'lg' : (getButtonSize() as 'sm' | 'default' | 'lg');
  const actionText = microcopyService.getActionText(action, context, microcopyOptions);

  const handleReadAloud = async () => {
    if (isReading) {
      microcopyService.stopReading();
      setIsReading(false);
      return;
    }

    try {
      setIsReading(true);
      const textToRead = item 
        ? `${actionText.primary} ${item}` 
        : actionText.primary;
      await microcopyService.readAloud(textToRead);
    } catch (error) {
      console.warn('Failed to read aloud:', error);
    } finally {
      setIsReading(false);
    }
  };

  const primaryVariant = variant === 'destructive' ? 'destructive' : 'default';
  const secondaryVariant = 'outline';

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Primary Action */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onPrimary}
          disabled={disabled || loading}
          variant={primaryVariant}
          size={buttonSize}
          className="flex-1 min-h-12 text-base font-medium"
          aria-label={actionText.aria}
        >
          {loading && (
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-foreground" />
          )}
          {actionText.primary}
        </Button>
        
        {showReadAloud && (
          <Button
            onClick={handleReadAloud}
            disabled={disabled}
            variant="ghost"
            size="sm"
            className="h-12 w-12 p-0"
            aria-label={`Read aloud: ${actionText.primary}`}
          >
            {isReading ? (
              <Square className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Secondary Action */}
      {onSecondary && (
        <Button
          onClick={onSecondary}
          disabled={disabled}
          variant={secondaryVariant}
          size={buttonSize}
          className="min-h-12 text-base"
          aria-label={`Alternative action: ${actionText.secondary}`}
        >
          {actionText.secondary}
        </Button>
      )}
    </div>
  );
};