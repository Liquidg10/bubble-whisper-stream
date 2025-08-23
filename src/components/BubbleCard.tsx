// Individual bubble component with hover effects and interaction

import React, { useState } from 'react';
import { Bubble } from '@/types/bubble';
import { cn } from '@/lib/utils';

interface BubbleCardProps {
  bubble: Bubble;
  scale: number;
  onSelect?: (bubble: Bubble) => void;
  onEdit?: (bubble: Bubble) => void;
  style?: React.CSSProperties;
  className?: string;
}

export function BubbleCard({ 
  bubble, 
  scale, 
  onSelect, 
  onEdit, 
  style, 
  className 
}: BubbleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);

  // Calculate visual size based on bubble importance and zoom level
  const visualSize = Math.max(60 * bubble.size * scale, 20);
  const isLargeEnoughForContent = visualSize > 40;

  // Get bubble color based on mood or type
  const getBubbleColor = () => {
    if (bubble.moodColor) return bubble.moodColor;
    
    switch (bubble.type) {
      case 'Task': return 'hsl(var(--accent-void))';
      case 'Memory': return 'hsl(var(--accent-growth))';
      case 'Mood': return 'hsl(var(--accent-flow))';
      case 'ReminderNote': return 'hsl(var(--danger-soft))';
      default: return 'hsl(var(--bubble-active))';
    }
  };

  // Handle click
  const handleClick = () => {
    onSelect?.(bubble);
  };

  // Handle long press for edit
  const handleMouseDown = () => {
    const timer = setTimeout(() => {
      onEdit?.(bubble);
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  // Get emoji for bubble type
  const getTypeEmoji = () => {
    switch (bubble.type) {
      case 'Task': return '✓';
      case 'Memory': return '💭';
      case 'Mood': return '🎭';
      case 'ReminderNote': return '⏰';
      default: return '💫';
    }
  };

  // Truncate content for display
  const getDisplayContent = () => {
    if (!bubble.content) return '';
    const maxLength = visualSize > 80 ? 50 : 20;
    return bubble.content.length > maxLength 
      ? bubble.content.substring(0, maxLength) + '...'
      : bubble.content;
  };

  return (
    <div
      className={cn(
        "bubble-card relative transition-all duration-bubble cursor-pointer select-none",
        "rounded-full flex items-center justify-center text-center",
        "border-2 border-accent-void/20 backdrop-blur",
        isHovered && "shadow-glow-medium border-accent-void/40",
        bubble.completed && "opacity-60",
        className
      )}
      style={{
        ...style,
        width: visualSize,
        height: visualSize,
        backgroundColor: getBubbleColor(),
        boxShadow: isHovered 
          ? '0 0 30px rgba(123, 92, 255, 0.4), 0 0 60px rgba(123, 92, 255, 0.2)'
          : '0 0 15px rgba(0, 0, 0, 0.3)',
        transform: `${style?.transform || ''} ${isHovered ? 'scale(1.05)' : 'scale(1)'}`,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleMouseUp();
      }}
    >
      {/* Bubble Content */}
      <div className="flex flex-col items-center justify-center p-1 text-text-primary">
        {/* Type emoji - always visible */}
        <span 
          className="text-lg leading-none"
          style={{ fontSize: Math.max(visualSize * 0.2, 12) }}
        >
          {bubble.tags.find(tag => tag.emoji)?.emoji || getTypeEmoji()}
        </span>
        
        {/* Content text - only visible when large enough */}
        {isLargeEnoughForContent && bubble.content && (
          <span 
            className="text-xs font-medium mt-1 leading-tight"
            style={{ fontSize: Math.max(visualSize * 0.08, 8) }}
          >
            {getDisplayContent()}
          </span>
        )}
      </div>

      {/* Reminder indicator */}
      {bubble.reminderId && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-danger-soft rounded-full 
                       border border-text-primary animate-pulse" />
      )}

      {/* Completion indicator */}
      {bubble.completed && (
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success-gentle rounded-full 
                       border border-text-primary flex items-center justify-center">
          <span className="text-xs">✓</span>
        </div>
      )}

      {/* Audio indicator */}
      {bubble.audioUri && (
        <div className="absolute -top-1 -left-1 w-3 h-3 bg-accent-flow rounded-full 
                       border border-text-primary">
          <div className="absolute inset-0 bg-accent-flow rounded-full animate-ping opacity-50" />
        </div>
      )}

      {/* Image indicator */}
      {bubble.imageUri && (
        <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-accent-growth rounded-full 
                       border border-text-primary" />
      )}
    </div>
  );
}