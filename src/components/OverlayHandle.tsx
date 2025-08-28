import React from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OverlayHandleProps {
  className?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export function OverlayHandle({ className, onMouseDown, children }: OverlayHandleProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 cursor-move select-none bg-background/80 backdrop-blur-sm border rounded px-2 py-1.5 hover:bg-accent/50 transition-colors",
        className
      )}
      onMouseDown={onMouseDown}
      style={{ pointerEvents: 'auto' }}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      {children}
    </div>
  );
}

interface OverlayPanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function OverlayPanel({ children, className, style }: OverlayPanelProps) {
  return (
    <div
      className={cn(
        "absolute bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg",
        className
      )}
      style={{ 
        pointerEvents: 'none',
        ...style 
      }}
    >
      {children}
    </div>
  );
}