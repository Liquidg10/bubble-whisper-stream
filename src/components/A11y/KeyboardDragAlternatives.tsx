import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Move3D,
  Keyboard,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

interface KeyboardDragAlternativesProps {
  children: React.ReactNode;
  onMove?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onReorder?: (newIndex: number) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  itemIndex?: number;
  totalItems?: number;
  label?: string;
  showAlternatives?: boolean;
  disabled?: boolean;
}

/**
 * Provides keyboard alternatives for drag operations (WCAG 2.5.7 compliance)
 * Wraps draggable elements with keyboard controls
 */
export function KeyboardDragAlternatives({
  children,
  onMove,
  onReorder,
  canMoveUp = true,
  canMoveDown = true,
  canMoveLeft = false,
  canMoveRight = false,
  itemIndex,
  totalItems,
  label = 'item',
  showAlternatives = true,
  disabled = false
}: KeyboardDragAlternativesProps) {
  const [showKeyboardModal, setShowKeyboardModal] = useState(false);
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (disabled) return;
    
    if (onMove) {
      onMove(direction);
      toast.success(`Moved ${label} ${direction}`, {
        duration: 2000,
        id: `move-${direction}`
      });
    }
  }, [onMove, disabled, label]);

  const handleReorder = useCallback((newIndex: number) => {
    if (disabled || !onReorder) return;
    
    onReorder(newIndex);
    toast.success(`Moved ${label} to position ${newIndex + 1}`, {
      duration: 2000,
      id: 'reorder'
    });
  }, [onReorder, disabled, label]);

  const handleKeydown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;
    
    // Only handle keyboard events when focused on the container
    if (!containerRef.current?.contains(event.target as Node)) return;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        if (canMoveUp) handleMove('up');
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (canMoveDown) handleMove('down');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (canMoveLeft) handleMove('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (canMoveRight) handleMove('right');
        break;
      case ' ':
      case 'Enter':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          setShowKeyboardModal(true);
        }
        break;
      case '?':
        if (showAlternatives) {
          event.preventDefault();
          setShowKeyboardModal(true);
        }
        break;
    }
  }, [canMoveUp, canMoveDown, canMoveLeft, canMoveRight, handleMove, showAlternatives, disabled]);

  const renderDirectionButtons = () => (
    <div className="grid grid-cols-3 gap-2 max-w-[120px] mx-auto">
      <div />
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleMove('up')}
        disabled={disabled || !canMoveUp}
        onFocus={() => setFocusedButton('up')}
        onBlur={() => setFocusedButton(null)}
        className={`h-10 w-10 p-0 ${focusedButton === 'up' ? 'ring-2 ring-primary' : ''}`}
        aria-label={`Move ${label} up`}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <div />
      
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleMove('left')}
        disabled={disabled || !canMoveLeft}
        onFocus={() => setFocusedButton('left')}
        onBlur={() => setFocusedButton(null)}
        className={`h-10 w-10 p-0 ${focusedButton === 'left' ? 'ring-2 ring-primary' : ''}`}
        aria-label={`Move ${label} left`}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div />
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleMove('right')}
        disabled={disabled || !canMoveRight}
        onFocus={() => setFocusedButton('right')}
        onBlur={() => setFocusedButton(null)}
        className={`h-10 w-10 p-0 ${focusedButton === 'right' ? 'ring-2 ring-primary' : ''}`}
        aria-label={`Move ${label} right`}
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
      
      <div />
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleMove('down')}
        disabled={disabled || !canMoveDown}
        onFocus={() => setFocusedButton('down')}
        onBlur={() => setFocusedButton(null)}
        className={`h-10 w-10 p-0 ${focusedButton === 'down' ? 'ring-2 ring-primary' : ''}`}
        aria-label={`Move ${label} down`}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <div />
    </div>
  );

  const renderPositionButtons = () => {
    if (!totalItems || itemIndex === undefined) return null;
    
    const positions = Array.from({ length: totalItems }, (_, i) => i);
    
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Move to position:</p>
        <div className="flex flex-wrap gap-1">
          {positions.map((pos) => (
            <Button
              key={pos}
              size="sm"
              variant={pos === itemIndex ? "default" : "outline"}
              onClick={() => handleReorder(pos)}
              disabled={disabled || pos === itemIndex}
              className="h-8 w-8 p-0"
              aria-label={`Move to position ${pos + 1}`}
            >
              {pos + 1}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        className="relative group"
        onKeyDown={handleKeydown}
        tabIndex={0}
        role="button"
        aria-label={`Draggable ${label}. Press Ctrl+Space for keyboard controls, or use arrow keys to move.`}
        aria-describedby={showAlternatives ? `keyboard-help-${label}` : undefined}
      >
        {children}
        
        {/* Keyboard alternatives indicator */}
        {showAlternatives && !disabled && (
          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
            <Badge 
              variant="secondary" 
              className="h-6 px-2 bg-background/90 backdrop-blur-sm border"
            >
              <Keyboard className="h-3 w-3 mr-1" />
              Ctrl+Space
            </Badge>
          </div>
        )}
      </div>

      {/* Keyboard controls modal */}
      <Dialog open={showKeyboardModal} onOpenChange={setShowKeyboardModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Move3D className="h-5 w-5" />
              Keyboard Movement Controls
            </DialogTitle>
            <DialogDescription>
              Use these controls to move the {label} without dragging
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Direction Controls */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <ArrowUp className="h-4 w-4" />
                Direction Controls
              </h4>
              {renderDirectionButtons()}
              <div className="text-xs text-muted-foreground text-center">
                You can also use arrow keys when focused on the item
              </div>
            </div>

            {/* Position Controls */}
            {renderPositionButtons()}

            {/* Instructions */}
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Keyboard Shortcuts
              </h4>
              <div className="text-xs space-y-1">
                <div><kbd className="px-1 bg-background rounded">↑↓←→</kbd> Move item</div>
                <div><kbd className="px-1 bg-background rounded">Ctrl+Space</kbd> Open this dialog</div>
                <div><kbd className="px-1 bg-background rounded">?</kbd> Show help</div>
                <div><kbd className="px-1 bg-background rounded">Tab</kbd> Navigate between controls</div>
              </div>
            </div>

            <Button 
              onClick={() => setShowKeyboardModal(false)}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Hook to add keyboard drag alternatives to any element
 */
export function useKeyboardDragAlternatives({
  onMove,
  onReorder,
  itemIndex,
  totalItems,
  label = 'item'
}: {
  onMove?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onReorder?: (newIndex: number) => void;
  itemIndex?: number;
  totalItems?: number;
  label?: string;
}) {
  const [showModal, setShowModal] = useState(false);

  const keyboardProps = {
    onKeyDown: (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          onMove?.('up');
          break;
        case 'ArrowDown':
          event.preventDefault();
          onMove?.('down');
          break;
        case 'ArrowLeft':
          event.preventDefault();
          onMove?.('left');
          break;
        case 'ArrowRight':
          event.preventDefault();
          onMove?.('right');
          break;
        case ' ':
        case 'Enter':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            setShowModal(true);
          }
          break;
      }
    },
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `Draggable ${label}. Use arrow keys to move, Ctrl+Space for more options.`
  };

  return {
    keyboardProps,
    showModal,
    setShowModal,
    handleMove: onMove,
    handleReorder: onReorder
  };
}