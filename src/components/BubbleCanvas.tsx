// Zoomable, pannable bubble universe canvas with LOD rendering

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { BubbleCard } from './BubbleCard';
import { MiniMap } from './MiniMap';
import { useBubbleStore } from '@/stores/bubbleStore';

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

  // Handle pan gesture
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setLastPanPoint({ x: viewport.x, y: viewport.y });
    }
  }, [viewport.x, viewport.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      setViewport(prev => ({
        ...prev,
        x: lastPanPoint.x + deltaX / prev.scale,
        y: lastPanPoint.y + deltaY / prev.scale,
      }));
    }
  }, [isDragging, dragStart, lastPanPoint]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle zoom gesture
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(viewport.scale * scaleFactor, 0.1), 5);
    
    // Zoom towards mouse position
    const mouseWorldX = (mouseX - viewport.width / 2) / viewport.scale + viewport.x;
    const mouseWorldY = (mouseY - viewport.height / 2) / viewport.scale + viewport.y;
    
    const newViewportX = mouseWorldX - (mouseX - viewport.width / 2) / newScale;
    const newViewportY = mouseWorldY - (mouseY - viewport.height / 2) / newScale;
    
    setViewport(prev => ({
      ...prev,
      x: newViewportX,
      y: newViewportY,
      scale: newScale,
    }));
  }, [viewport]);

  // Calculate visible bubbles for LOD (Level of Detail) rendering
  const visibleBubbles = bubbles.filter(bubble => {
    const bubbleScreenX = (bubble.x - viewport.x) * viewport.scale + viewport.width / 2;
    const bubbleScreenY = (bubble.y - viewport.y) * viewport.scale + viewport.height / 2;
    const bubbleSize = Math.max(60 * bubble.size * viewport.scale, 20);
    
    return bubbleScreenX + bubbleSize > 0 && 
           bubbleScreenX - bubbleSize < viewport.width &&
           bubbleScreenY + bubbleSize > 0 && 
           bubbleScreenY - bubbleSize < viewport.height;
  });

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
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
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
        {displayBubbles.map(bubble => (
          <BubbleCard
            key={bubble.id}
            bubble={bubble}
            scale={viewport.scale}
            onSelect={onBubbleSelect}
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

      {/* Mini Map */}
      <MiniMap
        bubbles={bubbles}
        viewport={viewport}
        onViewportChange={setViewport}
        className="absolute bottom-4 right-4"
      />

      {/* Canvas Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={centerOnBubbles}
          className="px-3 py-2 rounded-lg bg-bubble-active/80 backdrop-blur text-text-primary
                     hover:bg-bubble-selected/80 transition-colors duration-gentle
                     border border-accent-void/20"
        >
          Center
        </button>
        <button
          onClick={() => setViewport(prev => ({ ...prev, scale: 1 }))}
          className="px-3 py-2 rounded-lg bg-bubble-active/80 backdrop-blur text-text-primary
                     hover:bg-bubble-selected/80 transition-colors duration-gentle
                     border border-accent-void/20"
        >
          Reset Zoom
        </button>
      </div>

      {/* Performance Stats (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 left-4 text-xs text-text-secondary bg-bubble-idle/80 
                       backdrop-blur px-2 py-1 rounded">
          Rendering: {displayBubbles.length}/{bubbles.length} bubbles
          <br />
          Scale: {viewport.scale.toFixed(2)}x
        </div>
      )}
    </div>
  );
}