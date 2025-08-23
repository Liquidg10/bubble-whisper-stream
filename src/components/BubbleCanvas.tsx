// Zoomable, pannable bubble universe canvas with LOD rendering

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { BubbleCard } from './BubbleCard';
import { MiniMap } from './MiniMap';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZoomIn, ZoomOut, RotateCcw, Map, Filter, Focus, Layers } from 'lucide-react';

interface BubbleCanvasProps {
  onBubbleSelect?: (bubble: Bubble) => void;
  onBubbleEdit?: (bubble: Bubble) => void;
  className?: string;
}

export function BubbleCanvas({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { bubbles, settings } = useBubbleStore();
  
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
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [declutterMode, setDeclutterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bubbleDensity, setBubbleDensity] = useState<'low' | 'medium' | 'high'>('medium');

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

  // Handle zoom buttons only - no mouse gestures
  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  }, []);

  // Get visible bubbles based on viewport and filters
  const getVisibleBubbles = () => {
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
    return filteredBubbles.filter(bubble => {
      const bubbleScreenX = (bubble.x - viewport.x) * viewport.scale + viewport.width / 2;
      const bubbleScreenY = (bubble.y - viewport.y) * viewport.scale + viewport.height / 2;
      const bubbleSize = Math.max(60 * bubble.size * viewport.scale, 20);
      
      return bubbleScreenX + bubbleSize > 0 && 
             bubbleScreenX - bubbleSize < viewport.width &&
             bubbleScreenY + bubbleSize > 0 && 
             bubbleScreenY - bubbleSize < viewport.height;
    });
  };

  const visibleBubbles = getVisibleBubbles();

  // Density-based declutter filtering
  const getDensityFilteredBubbles = () => {
    if (settings.bubbleDensity === 'high') return visibleBubbles;
    
    const threshold = settings.bubbleDensity === 'medium' ? 50 : 100;
    if (visibleBubbles.length <= threshold) return visibleBubbles;
    
    // Show most important bubbles first
    return visibleBubbles
      .sort((a, b) => b.size - a.size)
      .slice(0, threshold);
  };

  const displayBubbles = getDensityFilteredBubbles();

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
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.width / 2}px, ${viewport.height / 2}px) scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`,
          transformOrigin: '0 0',
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
          <BubbleCard
            key={bubble.id}
            bubble={bubble}
            scale={viewport.scale}
            onSelect={(b) => {
              setSelectedBubbleId(b.id);
              onBubbleSelect?.(b);
            }}
            onEdit={onBubbleEdit}
            style={{
              position: 'absolute',
              left: bubble.x,
              top: bubble.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
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
      <div className="absolute bottom-4 left-4 flex gap-2 z-10">
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
        <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
          Density: {bubbleDensity}
        </Badge>
      </div>

      {/* Performance Stats (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-20 right-4 text-xs text-muted-foreground bg-card/80 
                       backdrop-blur px-2 py-1 rounded border">
          Rendering: {visibleBubbles.length}/{bubbles.length} bubbles
          <br />
          Scale: {viewport.scale.toFixed(2)}x
        </div>
      )}
    </div>
  );
}