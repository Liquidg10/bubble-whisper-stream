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
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { useLODSystem } from '@/hooks/useLODSystem';
import { useZoomStandard } from '@/hooks/useZoomStandard';
import { AtomicView } from './AtomicView';

import { ZoomIn, ZoomOut, RotateCcw, Map, Filter, Focus, Layers } from 'lucide-react';

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
    lastOperation
  } = useBubbleStore();
  const themeContext = useTheme();
  const currentTheme = themeContext?.currentTheme;
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { getLODConfig, setDragState, setMultiSelectState } = useLODSystem();
  
  const [viewport, setViewport] = useState<CanvasViewport>({
    x: 0,
    y: 0,
    scale: 1,
    width: 0,
    height: 0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportStart, setViewportStart] = useState({ x: 0, y: 0 });
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [declutterMode, setDeclutterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bubbleDensity, setBubbleDensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showMergePopover, setShowMergePopover] = useState(false);
  const [mergePopoverPosition, setMergePopoverPosition] = useState({ x: 0, y: 0 });
  
  
  // LOD configuration
  const lodConfig = getLODConfig();

  // Initialize viewport dimensions
  useEffect(() => {
    const updateViewport = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setViewport(prev => ({
          ...prev,
          width: rect.width,
          height: rect.height,
        }));
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Standardized zoom system
  const { 
    zoomIn: standardZoomIn, 
    zoomOut: standardZoomOut, 
    handleWheelZoom,
    handlePinchZoom: standardPinchZoom,
    resetZoom,
    cleanup
  } = useZoomStandard({
    onZoomChange: ({ scale }) => {
      setViewport(prev => ({ ...prev, scale }));
    },
    getContainerRect: () => canvasRef.current?.getBoundingClientRect() || null
  });

  // Cleanup zoom animations on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // Handle zoom buttons
  const zoomIn = useCallback(() => {
    standardZoomIn(viewport.scale);
  }, [standardZoomIn, viewport.scale]);

  const zoomOut = useCallback(() => {
    standardZoomOut(viewport.scale);
  }, [standardZoomOut, viewport.scale]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    handleWheelZoom(e, viewport.scale);
  }, [handleWheelZoom, viewport.scale]);

  // Mobile pinch zoom and pan handlers
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    standardPinchZoom(scaleFactor, viewport.scale, center);
  }, [standardPinchZoom, viewport.scale]);

  const handlePan = useCallback((delta: { x: number; y: number }) => {
    setViewport(prev => ({
      ...prev,
      x: prev.x - delta.x / prev.scale,
      y: prev.y - delta.y / prev.scale
    }));
  }, []);

  // Canvas pan handlers for mouse/touch
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start panning if clicking on empty canvas (not on a bubble)
    const target = e.target as HTMLElement;
    if (target.closest('[data-bubble]')) return;
    
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setViewportStart({ x: viewport.x, y: viewport.y });
    e.preventDefault();
  }, [viewport.x, viewport.y]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    
    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    
    setViewport(prev => ({
      ...prev,
      x: viewportStart.x + deltaX / prev.scale,
      y: viewportStart.y + deltaY / prev.scale
    }));
  }, [isPanning, panStart, viewportStart]);

  const handleCanvasPointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Bind mobile gestures
  const mobileGestures = usePinchZoom({
    onZoom: handlePinchZoom,
    onPan: handlePan,
    enabled: isMobile
  });

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
          const screenX = canvasRect.left + (midpoint.x - viewport.x) * viewport.scale + viewport.width / 2;
          const screenY = canvasRect.top + (midpoint.y - viewport.y) * viewport.scale + viewport.height / 2;
          
          setMergePopoverPosition({ x: screenX, y: screenY });
          setShowMergePopover(true);
        }
        break;
      }
    }
  }, [bubbles, currentTheme?.behavior?.mergeThreshold || 0.1, setMergeCandidate, viewport]);

  // Handle merge confirmation
  const handleMergeConfirm = useCallback(() => {
    if (mergeCandidate) {
      mergeBubbles(mergeCandidate.bubble1, mergeCandidate.bubble2);
      setShowMergePopover(false);
      
      // Show undo toast
      toast({
        title: "Bubbles merged",
        description: "Combined into a single bubble",
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={undoLastMerge}
            className="min-h-[32px]"
          >
            Undo
          </Button>
        ),
        duration: 8000, // 8 second undo window
      });
    }
  }, [mergeCandidate, mergeBubbles, toast, undoLastMerge]);

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
      const bubbleScreenX = (bubble.x - viewport.x) * viewport.scale + viewport.width / 2;
      const bubbleScreenY = (bubble.y - viewport.y) * viewport.scale + viewport.height / 2;
      const bubbleSize = Math.max(60 * bubble.size * viewport.scale, 20);
      
      return bubbleScreenX + bubbleSize > 0 && 
             bubbleScreenX - bubbleSize < viewport.width &&
             bubbleScreenY + bubbleSize > 0 && 
             bubbleScreenY - bubbleSize < viewport.height;
    });

    // Apply LOD performance limits
    const maxBubbles = lodConfig.maxVisibleBubbles;
    if (visibleBubbles.length > maxBubbles) {
      // Keep selected bubbles and closest to center
      const selected = visibleBubbles.filter(bubble => selectedBubbles.has(bubble.id));
      const unselected = visibleBubbles.filter(bubble => !selectedBubbles.has(bubble.id));
      
      // Sort unselected by distance from viewport center
      const centerX = viewport.x + viewport.width / 2;
      const centerY = viewport.y + viewport.height / 2;
      
      unselected.sort((a, b) => {
        const distA = Math.sqrt((a.x - centerX) ** 2 + (a.y - centerY) ** 2);
        const distB = Math.sqrt((b.x - centerX) ** 2 + (b.y - centerY) ** 2);
        return distA - distB;
      });
      
      const remainingSlots = maxBubbles - selected.length;
      return [...selected, ...unselected.slice(0, Math.max(0, remainingSlots))];
    }

    return visibleBubbles;
  }, [bubbles, viewport, declutterMode, focusMode, selectedBubbles, selectedBubbleId, bubbleDensity, lodConfig.maxVisibleBubbles]);

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
    
    setViewport(prev => ({
      ...prev,
      x: centerX,
      y: centerY,
      scale: 1,
    }));
  }, [bubbles]);

  // Auto-center on first load
  useEffect(() => {
    if (bubbles.length > 0 && viewport.x === 0 && viewport.y === 0) {
      centerOnBubbles();
    }
  }, [bubbles, centerOnBubbles, viewport.x, viewport.y]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gradient-canvas ${className}`}>
      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        {...(isMobile ? mobileGestures : {})}
        style={{
          transform: `translate(${viewport.width / 2}px, ${viewport.height / 2}px) scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`,
          transformOrigin: '0 0',
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
            transform: `translate(${viewport.x % 50}px, ${viewport.y % 50}px)`,
          }}
        />
        
        {/* Render visible bubbles */}
        {visibleBubbles.map(bubble => (
          <div
            key={bubble.id}
            data-bubble
            style={{
              position: 'absolute',
              left: bubble.x,
              top: bubble.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <BubbleCard
              bubble={bubble}
              scale={viewport.scale}
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
        ))}
        
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


      {/* Canvas controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          className="bg-card/80 backdrop-blur-sm"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          className="bg-card/80 backdrop-blur-sm"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={centerOnBubbles}
          className="bg-card/80 backdrop-blur-sm"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewport(prev => ({ ...prev, scale: 1 }))}
          className="bg-card/80 backdrop-blur-sm"
        >
          <Map className="h-4 w-4" />
        </Button>
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
        onBubbleSelect={onBubbleSelect}
        onBubbleEdit={onBubbleEdit}
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