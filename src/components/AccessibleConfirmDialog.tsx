import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { microcopyService, MicrocopyOptions } from '@/services/microcopyService';
import { useCalmMode } from '@/providers/CalmModeProvider';

interface AccessibleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'delete' | 'save' | string;
  item?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'destructive';
  microcopyOptions?: Partial<MicrocopyOptions>;
  showReadAloud?: boolean;
}

export const AccessibleConfirmDialog: React.FC<AccessibleConfirmDialogProps> = ({
  open,
  onOpenChange,
  action,
  item,
  onConfirm,
  onCancel,
  variant = 'default',
  microcopyOptions,
  showReadAloud = true
}) => {
  const { getButtonSize } = useCalmMode();
  const [isReading, setIsReading] = useState(false);
  
  const buttonSize = getButtonSize() === 'xl' ? 'lg' : getButtonSize();
  const confirmationText = microcopyService.getConfirmationText(action, item, microcopyOptions);

  const handleReadAloud = async () => {
    if (isReading) {
      microcopyService.stopReading();
      setIsReading(false);
      return;
    }

    try {
      setIsReading(true);
      const textToRead = `${confirmationText.title}. ${confirmationText.description}. Options are: ${confirmationText.confirm} or ${confirmationText.cancel}.`;
      await microcopyService.readAloud(textToRead);
    } catch (error) {
      console.warn('Failed to read aloud:', error);
    } finally {
      setIsReading(false);
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle className="text-lg font-semibold">
              {confirmationText.title}
            </AlertDialogTitle>
            
            {showReadAloud && (
              <Button
                onClick={handleReadAloud}
                disabled={false}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Read dialog aloud"
              >
                {isReading ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          
          <AlertDialogDescription className="text-base leading-relaxed">
            {confirmationText.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row">
          <AlertDialogCancel 
            onClick={handleCancel}
            className="w-full sm:w-auto"
          >
            {confirmationText.cancel}
          </AlertDialogCancel>
          
          <AlertDialogAction
            onClick={handleConfirm}
            className={`w-full sm:w-auto ${variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
          >
            {confirmationText.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};