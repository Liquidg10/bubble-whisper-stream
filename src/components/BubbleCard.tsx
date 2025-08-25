// Individual bubble component with theme-aware styling and type-specific effects

import React, { useState, useEffect } from 'react';
import { Bubble } from '@/types/bubble';
import { useTheme } from '@/hooks/use-theme';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Brain, Edit3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBubbleStore } from '@/stores/bubbleStore';

interface BubbleCardProps {
  bubble: Bubble;
  scale: number;
  onSelect?: (bubble: Bubble) => void;
  onEdit?: (bubble: Bubble) => void;
  style?: React.CSSProperties;
  className?: string;
  isDragging?: boolean;
}

export function BubbleCard({
  bubble,
  scale,
  onSelect,
  onEdit,
  style,
  className,
  isDragging = false
}: BubbleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  useEffect(() => {
    setHasImageError(false);
  }, [bubble.imageUri]);
  const { currentTheme } = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { intelligenceEnabled } = useBubbleStore();

  // Touch gesture handling for mobile
  const { gestureState, handlers, isSelected } = useTouchGestures({
    bubbleId: bubble.id,
    onTap: () => onSelect?.(bubble),
    onLongPress: () => {
      // Selection handled in useTouchGestures
    },
    onDragStart: () => {
      // Future: implement bubble dragging
    },
  });

  // Calculate visual size based on bubble importance and zoom level
  const visualSize = Math.max(80 * bubble.size * scale, 30);
  const isLargeEnoughForContent = visualSize > 40;

  // Get bubble type for styling (map BubbleType to our theme types)
  const getBubbleThemeType = (): keyof typeof currentTheme.tokens.auraMapping => {
    switch (bubble.type) {
      case 'Task': return 'rocky';
      case 'Memory': return 'icy';
      case 'Mood': return 'gas';
      case 'ReminderNote': return 'volcanic';
      case 'Thought': return 'cloudy';
      default: return 'rocky';
    }
  };

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

  // Get rim styling based on theme policy
  const getRimStyling = () => {
    const themeType = getBubbleThemeType();
    
    if (currentTheme.tokens.rimPolicy === 'specular') {
      // Type-colored rim with specular segment for iridescent theme
      const auraColor = currentTheme.tokens.auraMapping[themeType];
      return {
        border: `1px solid hsl(${auraColor} / 0.6)`,
        boxShadow: `
          inset 0 1px 0 hsl(${auraColor} / 0.3),
          0 0 0 1px hsl(${auraColor} / 0.2),
          ${isHovered ? `0 0 20px hsl(${auraColor} / 0.4)` : 'none'}
        `
      };
    } else {
      // Single color, subtle rim for minimal theme
      const rimColor = currentTheme.tokens.rimColor || '210 20% 56%';
      return {
        border: `1px solid hsl(${rimColor} / 0.4)`,
        boxShadow: isHovered ? `0 0 10px hsl(${rimColor} / 0.2)` : 'none'
      };
    }
  };

  // Get aura effects based on theme and type
  const getAuraEffects = () => {
    const themeType = getBubbleThemeType();
    const auraColor = currentTheme.tokens.auraMapping[themeType];
    
    // No aura for minimal theme (aura colors are black/transparent)
    if (auraColor === '0 0% 0%') return {};
    
    // Strong type-colored auras for iridescent theme
    return {
      filter: isHovered 
        ? `drop-shadow(0 0 15px hsl(${auraColor} / 0.6))`
        : `drop-shadow(0 0 8px hsl(${auraColor} / 0.3))`
    };
  };

  // Level of Detail optimization during drag
  const shouldUseLOD = isDragging && currentTheme.behavior.lodDuringDrag;

  // Selection ring styling
  const getSelectionStyling = () => {
    if (!isSelected) return {};
    
    return {
      border: `2px solid hsl(var(--bubble-selected))`,
      boxShadow: `0 0 15px hsl(var(--bubble-selected) / 0.4)`,
    };
  };

  // Parallax offset for mobile touch interactions
  const getParallaxTransform = () => {
    if (!isMobile || !gestureState.isParallaxMode) return '';
    
    const { x, y } = gestureState.parallaxOffset;
    return `translate(${x}px, ${y}px) `;
  };

  // Desktop interaction handlers
  const handleClick = () => {
    if (!isMobile) {
      onSelect?.(bubble);
    }
  };

  const handleCBTThoughtCheck = () => {
    // Navigate to CBT worksheet with initial thought from bubble
    const params = new URLSearchParams();
    if (bubble.content) {
      params.set('thought', bubble.content);
    }
    params.set('bubbleId', bubble.id);
    navigate(`/cbt-worksheet?${params.toString()}`);
  };

  const handleMouseEnter = () => {
    if (!isMobile) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHovered(false);
    }
  };

  // Get emoji for bubble type
  const getTypeEmoji = () => {
    switch (bubble.type) {
      case 'Task': return '✓';
      case 'Memory': return '💭';
      case 'Mood': return '🎭';
      case 'ReminderNote': return '⏰';
      case 'Thought': return '💫';
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

  const rimStyling = getRimStyling();
  const auraEffects = getAuraEffects();
  const selectionStyling = getSelectionStyling();

  const BubbleContent = (
    <div
      className={cn(
        "bubble-card relative transition-all duration-bubble cursor-pointer select-none",
        "rounded-full flex items-center justify-center text-center backdrop-blur",
        bubble.completed && "opacity-60",
        shouldUseLOD && "backdrop-blur-none", // Reduce heavy effects during drag
        isSelected && "ring-2 ring-bubble-selected ring-offset-1",
        gestureState.isParallaxMode && "transition-transform duration-150",
        className
      )}
      style={{
        ...style,
        width: visualSize,
        height: visualSize,
        // Only set background color if no photo
        backgroundColor: bubble.imageUri ? 'transparent' : getBubbleColor(),
        ...rimStyling,
        ...auraEffects,
        ...selectionStyling,
        transform: `${style?.transform || ''} ${getParallaxTransform()}${
          (isHovered && !isDragging && !isMobile) ? 'scale(1.05)' : 'scale(1)'
        }`,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...(isMobile ? handlers : {})}
      aria-selected={isSelected}
      aria-label={`${bubble.type}: ${bubble.content}${isSelected ? ' (selected)' : ''}`}
    >
      {/* Photo thumbnail - always show if present */}
      {bubble.imageUri ? (
        <>
          <img
            src={bubble.imageUri}
            alt="Bubble photo"
            className="absolute inset-0 w-full h-full object-cover rounded-full z-0"
            style={{ display: hasImageError ? 'none' : undefined }}
            onLoad={(e) => console.log('Photo loaded successfully:', e.currentTarget.src)}
            onError={(e) => {
              const message = (e as unknown as { message?: string }).message;
              console.error('Photo failed to load:', e.currentTarget.src, message);
              setHasImageError(true);
            }}
          />
          {/* Error overlay or small-bubble overlay */}
          {hasImageError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full z-10">
              <span className="text-white text-xs font-bold">❌</span>
            </div>
          ) : visualSize <= 60 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full z-10">
              <span className="text-white text-xs font-bold">📷</span>
            </div>
          ) : null}
        </>
      ) : (
        /* Bubble Content - only show when no photo */
        <div className="relative z-10 flex flex-col items-center justify-center p-1 text-text-primary">
          {/* Type emoji */}
          <span
            className="text-lg leading-none"
            style={{ fontSize: Math.max(visualSize * 0.2, 12) }}
          >
            {bubble.tags.find(tag => tag.emoji)?.emoji || getTypeEmoji()}
          </span>
          
          {/* Content text - only visible when large enough and not in LOD mode */}
          {!shouldUseLOD && isLargeEnoughForContent && bubble.content && (
            <span 
              className="text-xs font-medium mt-1 leading-tight"
              style={{ fontSize: Math.max(visualSize * 0.08, 8) }}
            >
              {getDisplayContent()}
            </span>
          )}
        </div>
      )}

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

      {/* Audio indicator - simplified in LOD mode */}
      {bubble.audioUri && (
        <div className="absolute -top-1 -left-1 w-3 h-3 bg-accent-flow rounded-full 
                       border border-text-primary">
          {!shouldUseLOD && (
            <div className="absolute inset-0 bg-accent-flow rounded-full animate-ping opacity-50" />
          )}
        </div>
      )}

      {/* Image indicator - only show for very small bubbles where photo isn't clearly visible */}
      {bubble.imageUri && visualSize <= 40 && (
        <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-accent-growth rounded-full 
                       border border-text-primary" />
      )}
    </div>
  );

  // Wrap with context menu on desktop
  if (!isMobile && intelligenceEnabled) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {BubbleContent}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={handleCBTThoughtCheck}>
            <Brain className="w-4 h-4 mr-2" />
            CBT Thought Check
          </ContextMenuItem>
          {onEdit && (
            <ContextMenuItem onClick={() => onEdit(bubble)}>
              <Edit3 className="w-4 h-4 mr-2" />
              Edit Bubble
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return BubbleContent;
}