// Zoomable, pannable bubble universe canvas with LOD rendering

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { BubbleCard } from './BubbleCard';
import { MiniMap } from './MiniMap';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MergeConfirmPopover } from './MergeConfirmPopover';
import { checkBubblesOverlapping, calculateMidpoint } from '@/utils/collision';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/themes/provider';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePanZoom } from '@/hooks/usePanZoom';
import { useLODSystem } from '@/hooks/useLODSystem';
import { crossViewUndoService } from '@/services/crossViewUndoService';

import { AtomicView } from './AtomicView';

import { ZoomIn, ZoomOut, RotateCcw, Map, Filter, Focus, Layers } from 'lucide-react';
import { viewportMemoryService } from '@/services/viewportMemoryService';
import { useBubbleDragMerge } from '@/hooks/useBubbleDragMerge';
import { MotionController } from '@/components/MotionController';
import { startAnimation, stopAnimation, setupGlobalKeyboardHandler } from '@/lib/motion';

interface BubbleCanvasProps {
  onBubbleSelect?: (bubble: Bubble) => void;
  onBubbleEdit?: (bubble: Bubble) => void;
  className?: string;
}

function DefaultBubbleCanvas({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { 
    bubbles, 
    settings, 
    selectedBubbles, 
    clearSelection, 
    selectAll,
    isSelected,
    mergeCandidate,
    setMergeCandidate,
    clearMergeCandidate,
    mergeBubbles,
    undoLastMerge,
    lastOperation,
    updateBubble
  } = useBubbleStore();
  const themeContext = useTheme();
  const currentTheme = themeContext?.currentTheme;
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { getLODConfig, setDragState, setMultiSelectState } = useLODSystem();
  
  // Unified pan/zoom system
  const {
    state: panZoomState,
    onPanStart,
    onPanMove,
    onPanEnd,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    zoomIn,
    zoomOut,
    resetZoom,
    cursor
  } = usePanZoom({
    getContainerRect: () => canvasRef.current?.getBoundingClientRect() || null
  });
  
  const { 
    startDrag, 
    updateDrag, 
    endDrag, 
    confirmMerge, 
    getDragState 
  } = useBubbleDragMerge({
    onMergeCandidate: (bubble1, bubble2, position) => {
      setMergeCandidate(bubble1, bubble2);
      setMergePopoverPosition(position);
      setShowMergePopover(true);
    },
    mergeThreshold: currentTheme?.behavior?.mergeThreshold || 0.1,
    getScreenPosition: (bubbleX, bubbleY) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return { x: bubbleX, y: bubbleY };
      
      const screenX = canvasRect.left + (bubbleX + panZoomState.x) * panZoomState.scale + canvasRect.width / 2;
      const screenY = canvasRect.top + (bubbleY + panZoomState.y) * panZoomState.scale + canvasRect.height / 2;
      
      return { x: screenX, y: screenY };
    }
  });

  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [declutterMode, setDeclutterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bubbleDensity, setBubbleDensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showMergePopover, setShowMergePopover] = useState(false);
  const [mergePopoverPosition, setMergePopoverPosition] = useState({ x: 0, y: 0 });

  // Keyboard navigation for bubbles
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedBubbleId) return;
      
      const selectedBubble = bubbles.find(b => b.id === selectedBubbleId);
      if (!selectedBubble) return;
      
      const { key, shiftKey, ctrlKey, altKey } = event;
      let moveDistance = 1; // Base movement
      
      // Adjust movement distance with modifiers
      if (shiftKey) moveDistance = 8;
      if (ctrlKey) moveDistance = 24;
      
      let newX = selectedBubble.x;
      let newY = selectedBubble.y;
      
      switch (key) {
        case 'ArrowUp':
          newY -= moveDistance;
          event.preventDefault();
          break;
        case 'ArrowDown':
          newY += moveDistance;
          event.preventDefault();
          break;
        case 'ArrowLeft':
          newX -= moveDistance;
          event.preventDefault();
          break;
        case 'ArrowRight':
          newX += moveDistance;
          event.preventDefault();
          break;
        default:
          return;
      }
      
      const updatedBubble = {
        ...selectedBubble,
        x: newX,
        y: newY,
        updatedAt: Date.now()
      };
      
      updateBubble(updatedBubble);
      
      // Add undo entry for keyboard movement
      crossViewUndoService.addEntry({
        view: 'bubble',
        type: 'drag',
        data: { 
          bubbleId: selectedBubble.id, 
          originalPosition: { x: selectedBubble.x, y: selectedBubble.y },
          newPosition: { x: newX, y: newY }
        },
        description: `Moved bubble with keyboard`
      });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBubbleId, bubbles, updateBubble]);
  
  
  
  // LOD configuration
  const lodConfig = getLODConfig();

  // Initialize canvas dimensions and motion control
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    // Setup global keyboard handler for spacebar
    const cleanupKeyboard = setupGlobalKeyboardHandler();
    
    // Setup float motion animation
    const floatStep = () => {
      const elements = document.querySelectorAll('.float-motion');
      elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        const offset = Math.sin(Date.now() * 0.001) * 2; // subtle float
        htmlElement.style.transform = `translateY(${offset}px)`;
      });
    };
    
    // Start float animation
    startAnimation(floatStep);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      cleanupKeyboard();
      stopAnimation();
    };
  }, []);



  // Merge detection on bubble position change
  const handleBubbleDragEnd = useCallback((draggedBubble: Bubble) => {
    // Check for overlaps with other bubbles
    const otherBubbles = bubbles.filter(b => b.id !== draggedBubble.id);
    
    for (const otherBubble of otherBubbles) {
      const collision = checkBubblesOverlapping(
        draggedBubble, 
        otherBubble, 
        currentTheme?.behavior?.mergeThreshold || 0.1
      );
      
      if (collision.isOverlapping) {
        // Set merge candidate and show popover
        setMergeCandidate(draggedBubble, otherBubble);
        
        // Calculate popover position (canvas coordinates to screen coordinates)
        const midpoint = calculateMidpoint(draggedBubble, otherBubble);
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        
        if (canvasRect) {
          const screenX = canvasRect.left + (midpoint.x + panZoomState.x) * panZoomState.scale + canvasRect.width / 2;
          const screenY = canvasRect.top + (midpoint.y + panZoomState.y) * panZoomState.scale + canvasRect.height / 2;
          
          setMergePopoverPosition({ x: screenX, y: screenY });
          setShowMergePopover(true);
        }
        break;
      }
    }
  }, [bubbles, currentTheme?.behavior?.mergeThreshold || 0.1, setMergeCandidate, panZoomState]);

  // Handle merge confirmation
  const handleMergeConfirm = useCallback(() => {
    if (mergeCandidate) {
      const { bubble1, bubble2 } = mergeCandidate;
      
      // Store original positions for undo
      const originalPositions = {
        bubble1: { x: bubble1.x, y: bubble1.y },
        bubble2: { x: bubble2.x, y: bubble2.y }
      };
      
      // Add to cross-view undo system
      crossViewUndoService.addEntry({
        view: 'bubble',
        type: 'merge',
        data: { 
          original: [bubble1, bubble2],
          originalPositions 
        },
        description: `Merged "${bubble1.content.slice(0, 20)}..." and "${bubble2.content.slice(0, 20)}..."`
      });
      
      // Perform merge - new bubble keeps larger bubble's type and combines labels
      const largerBubble = bubble1.size >= bubble2.size ? bubble1 : bubble2;
      const smallerBubble = bubble1.size >= bubble2.size ? bubble2 : bubble1;
      
      const mergedBubble = {
        ...largerBubble,
        content: `${bubble1.content} · ${bubble2.content}`,
        size: Math.max(largerBubble.size, smallerBubble.size * 1.1),
        x: (bubble1.x + bubble2.x) / 2,
        y: (bubble1.y + bubble2.y) / 2,
        updatedAt: Date.now()
      };
      
      mergeBubbles(bubble1, bubble2);
      setShowMergePopover(false);
      clearMergeCandidate();
      
      // Show undo toast
      toast({
        title: "Bubbles merged",
        description: `Combined "${bubble1.content.slice(0, 15)}..." and "${bubble2.content.slice(0, 15)}..."`,
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              crossViewUndoService.undo();
              toast({
                title: "Merge undone",
                description: "Bubbles restored to original positions"
              });
            }}
            className="min-h-[32px]"
          >
            Undo
          </Button>
        ),
        duration: 8000,
      });
    }
  }, [mergeCandidate, mergeBubbles, toast, clearMergeCandidate]);

  // Handle merge cancellation
  const handleMergeCancel = useCallback(() => {
    setShowMergePopover(false);
    clearMergeCandidate();
  }, [clearMergeCandidate]);

  // Auto-dismiss undo option after timeout
  useEffect(() => {
    if (lastOperation && lastOperation.type === 'merge') {
      const timeout = setTimeout(() => {
        // Clear last operation after 10 seconds if not used
        const state = useBubbleStore.getState();
        state.lastOperation = null;
      }, 10000);
      
      return () => clearTimeout(timeout);
    }
  }, [lastOperation]);

  // Get visible bubbles based on viewport, filters, and LOD performance limits
  const getVisibleBubbles = useCallback(() => {
    if (bubbles.length === 0) return [];

    let filteredBubbles = bubbles;

    // Apply density filter
    if (bubbleDensity === 'low') {
      filteredBubbles = bubbles.filter((_, index) => index % 3 === 0);
    } else if (bubbleDensity === 'medium') {
      filteredBubbles = bubbles.filter((_, index) => index % 2 === 0);
    }

    // Apply focus mode (show only selected + recent)
    if (focusMode && selectedBubbleId) {
      const selectedBubble = bubbles.find(b => b.id === selectedBubbleId);
      const recentBubbles = bubbles
        .filter(b => Date.now() - b.createdAt < 24 * 60 * 60 * 1000)
        .slice(0, 5);
      filteredBubbles = selectedBubble 
        ? [selectedBubble, ...recentBubbles.filter(b => b.id !== selectedBubbleId)]
        : recentBubbles;
    }

    // Apply declutter (hide completed tasks)
    if (declutterMode) {
      filteredBubbles = filteredBubbles.filter(bubble => 
        bubble.type !== 'Task' || !bubble.completed
      );
    }

    // Viewport culling
    const visibleBubbles = filteredBubbles.filter(bubble => {
      const bubbleScreenX = (bubble.x + panZoomState.x) * panZoomState.scale + canvasSize.width / 2;
      const bubbleScreenY = (bubble.y + panZoomState.y) * panZoomState.scale + canvasSize.height / 2;
      const bubbleSize = Math.max(60 * bubble.size * panZoomState.scale, 20);
      
      return bubbleScreenX + bubbleSize > 0 && 
             bubbleScreenX - bubbleSize < canvasSize.width &&
             bubbleScreenY + bubbleSize > 0 && 
             bubbleScreenY - bubbleSize < canvasSize.height;
    });

    // Apply LOD performance limits
    const maxBubbles = lodConfig.maxVisibleBubbles;
    if (visibleBubbles.length > maxBubbles) {
      // Keep selected bubbles and closest to center
      const selected = visibleBubbles.filter(bubble => selectedBubbles.has(bubble.id));
      const unselected = visibleBubbles.filter(bubble => !selectedBubbles.has(bubble.id));
      
      // Sort unselected by distance from viewport center
      const centerX = -panZoomState.x;
      const centerY = -panZoomState.y;
      
      unselected.sort((a, b) => {
        const distA = Math.sqrt((a.x - centerX) ** 2 + (a.y - centerY) ** 2);
        const distB = Math.sqrt((b.x - centerX) ** 2 + (b.y - centerY) ** 2);
        return distA - distB;
      });
      
      const remainingSlots = maxBubbles - selected.length;
      return [...selected, ...unselected.slice(0, Math.max(0, remainingSlots))];
    }

    return visibleBubbles;
  }, [bubbles, panZoomState, canvasSize, declutterMode, focusMode, selectedBubbles, selectedBubbleId, bubbleDensity, lodConfig.maxVisibleBubbles]);

  // Density-based filtering for performance
  const getDensityFilteredBubbles = useCallback(() => {
    const visible = getVisibleBubbles();
    
    // Additional density filtering based on current settings
    const densityLimits = {
      low: Math.floor(lodConfig.maxVisibleBubbles * 0.5),
      medium: Math.floor(lodConfig.maxVisibleBubbles * 0.75),
      high: lodConfig.maxVisibleBubbles,
    };

    const limit = densityLimits[bubbleDensity];
    if (visible.length <= limit) return visible;

    // Prioritize selected bubbles, then by importance (size), then by recency
    return visible
      .sort((a, b) => {
        const aSelected = selectedBubbles.has(a.id) ? 1 : 0;
        const bSelected = selectedBubbles.has(b.id) ? 1 : 0;
        if (aSelected !== bSelected) return bSelected - aSelected;
        
        if (a.size !== b.size) return b.size - a.size;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);
  }, [getVisibleBubbles, bubbleDensity, selectedBubbles, lodConfig.maxVisibleBubbles]);

  const visibleBubbles = getDensityFilteredBubbles();

  // Center canvas on bubbles
  const centerOnBubbles = useCallback(() => {
    if (bubbles.length === 0) return;
    
    const bounds = bubbles.reduce(
      (acc, bubble) => ({
        minX: Math.min(acc.minX, bubble.x),
        maxX: Math.max(acc.maxX, bubble.x),
        minY: Math.min(acc.minY, bubble.y),
        maxY: Math.max(acc.maxY, bubble.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    // Center by setting pan offset to negative of bubble center
    resetZoom();
    // Note: This would need to be implemented in usePanZoom to properly center
  }, [bubbles]);

  // Auto-center on first load
  useEffect(() => {
    if (bubbles.length > 0 && panZoomState.x === 0 && panZoomState.y === 0) {
      centerOnBubbles();
    }
  }, [bubbles, centerOnBubbles, panZoomState.x, panZoomState.y]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gradient-canvas ${className}`}>
      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className={`absolute inset-0`}
        onWheel={onWheel}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onPointerCancel={onPanEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          cursor,
          transform: `translate(${panZoomState.x}px, ${panZoomState.y}px) scale(${panZoomState.scale})`,
          transformOrigin: 'center',
          touchAction: 'none'
        }}
      >
        {/* Universe Background Grid */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              radial-gradient(circle at 1px 1px, hsl(var(--accent-void)) 1px, transparent 0)
            `,
            backgroundSize: '50px 50px',
            transform: `translate(${panZoomState.x % 50}px, ${panZoomState.y % 50}px)`,
          }}
        />
        
        {/* Render visible bubbles with LOD and motion */}
        {visibleBubbles.map(bubble => {
          const isSelected = selectedBubbleId === bubble.id;
          const shouldShowPreviewRing = mergeCandidate && 
            (mergeCandidate.bubble1.id === bubble.id || mergeCandidate.bubble2.id === bubble.id);
          
          return (
            <div
              key={bubble.id}
              data-bubble
              style={{
                position: 'absolute',
                left: bubble.x,
                top: bubble.y,
                transform: 'translate(-50%, -50%)',
              }}
              className={`${!settings.reducedMotion ? 'float-motion' : ''}`}
            >
              <BubbleCard
                bubble={bubble}
                scale={panZoomState.scale}
                lodConfig={lodConfig}
                isSelected={isSelected}
                showPreviewRing={shouldShowPreviewRing}
                onSelect={(b) => {
                  setSelectedBubbleId(b.id);
                  onBubbleSelect?.(b);
                }}
                onEdit={(editedBubble) => {
                  handleBubbleDragEnd(editedBubble);
                  onBubbleEdit?.(editedBubble);
                }}
              />
            </div>
          );
        })}
        
        {/* Merge Confirmation Popover */}
        {mergeCandidate && (
          <MergeConfirmPopover
            isOpen={showMergePopover}
            onOpenChange={setShowMergePopover}
            bubble1={mergeCandidate.bubble1}
            bubble2={mergeCandidate.bubble2}
            position={mergePopoverPosition}
            onMerge={handleMergeConfirm}
            onKeepSeparate={handleMergeCancel}
          />
        )}
      </div>


      {/* Canvas controls with motion toggle */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          className="bg-card/80 backdrop-blur-sm"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          className="bg-card/80 backdrop-blur-sm"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={centerOnBubbles}
          className="bg-card/80 backdrop-blur-sm"
          title="Center on bubbles"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={resetZoom}
          className="bg-card/80 backdrop-blur-sm"
          title="Reset zoom to 1:1"
        >
          <Map className="h-4 w-4" />
        </Button>
        <MotionController />
      </div>

      {/* Declutter & Focus controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <Button
          variant={declutterMode ? "default" : "outline"}
          size="sm"
          onClick={() => setDeclutterMode(!declutterMode)}
          className="bg-card/80 backdrop-blur-sm"
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Button
          variant={focusMode ? "default" : "outline"}
          size="sm"
          onClick={() => setFocusMode(!focusMode)}
          className="bg-card/80 backdrop-blur-sm"
        >
          <Focus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const densities: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
            const current = densities.indexOf(bubbleDensity);
            setBubbleDensity(densities[(current + 1) % densities.length]);
          }}
          className="bg-card/80 backdrop-blur-sm"
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>

      {/* Status indicators */}
      <div className="absolute bottom-6 left-6 flex gap-2 z-30">
        {declutterMode && (
          <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
            Decluttered
          </Badge>
        )}
        {focusMode && (
          <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
            Focus Mode
          </Badge>
        )}
        {selectedBubbles.size > 0 && (
          <Badge 
            variant="default" 
            className="bg-bubble-selected/90 backdrop-blur-sm cursor-pointer"
            onClick={clearSelection}
          >
            {selectedBubbles.size} selected • tap to clear
          </Badge>
        )}
        <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
          Density: {bubbleDensity}
        </Badge>
      </div>

    </div>
  );
}

// Theme-aware canvas wrapper that selects the appropriate renderer
export function BubbleCanvas({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const { settings } = useBubbleStore();
  const viewMode = settings.viewMode || 'bubble';
  
  // If atomic view is selected, render AtomicView directly without theme dependency
  if (viewMode === 'atomic') {
    return (
      <AtomicView 
        onBubbleSelect={(bubbleId) => {
          const bubble = useBubbleStore.getState().bubbles.find(b => b.id === bubbleId);
          if (bubble) onBubbleSelect?.(bubble);
        }}
        onBubbleEdit={(bubbleId) => {
          const bubble = useBubbleStore.getState().bubbles.find(b => b.id === bubbleId);
          if (bubble) onBubbleEdit?.(bubble);
        }}
        className={className}
      />
    );
  }
  
  // For bubble view, use theme-aware rendering
  return (
    <ThemeAwareBubbleCanvas 
      onBubbleSelect={onBubbleSelect}
      onBubbleEdit={onBubbleEdit}
      className={className}
    />
  );
}

// Separate component for theme-dependent bubble rendering
function ThemeAwareBubbleCanvas({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const themeContext = useTheme();
  
  // Handle loading state gracefully
  if (!themeContext || themeContext.isLoading) {
    return (
      <div className={`relative w-full h-full overflow-hidden bg-background flex items-center justify-center ${className || ''}`}>
        <div className="text-muted-foreground">Loading canvas...</div>
      </div>
    );
  }
  
  const { currentTheme } = themeContext;
  
  // Use custom renderer if theme provides one, otherwise use default
  const CanvasRenderer = currentTheme.components?.CanvasRenderer ?? DefaultBubbleCanvas;
  
  return (
    <div className={`relative w-full h-full overflow-hidden ${className || ''}`}>
      <CanvasRenderer 
        onBubbleSelect={onBubbleSelect}
        onBubbleEdit={onBubbleEdit}
        theme={currentTheme}
      />
    </div>
  );
}