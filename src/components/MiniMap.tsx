// Mini-map component for navigation overview of the bubble universe

import React from 'react';
import { Bubble, CanvasViewport } from '@/types/bubble';
import { cn } from '@/lib/utils';

interface MiniMapProps {
  bubbles: Bubble[];
  viewport: CanvasViewport;
  onViewportChange: (viewport: CanvasViewport) => void;
  className?: string;
}

export function MiniMap({ bubbles, viewport, onViewportChange, className }: MiniMapProps) {
  const mapSize = 120;
  const mapPadding = 10;

  // Calculate bounds of all bubbles
  const bounds = bubbles.reduce(
    (acc, bubble) => ({
      minX: Math.min(acc.minX, bubble.x),
      maxX: Math.max(acc.maxX, bubble.x),
      minY: Math.min(acc.minY, bubble.y),
      maxY: Math.max(acc.maxY, bubble.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  // Handle empty universe
  if (bubbles.length === 0 || !isFinite(bounds.minX)) {
    return null;
  }

  // Calculate scale to fit all bubbles in minimap
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(
    (mapSize - mapPadding * 2) / Math.max(boundsWidth, 1),
    (mapSize - mapPadding * 2) / Math.max(boundsHeight, 1)
  );

  // Transform bubble coordinates to minimap coordinates
  const transformBubble = (bubble: Bubble) => {
    const x = (bubble.x - bounds.minX) * scale + mapPadding;
    const y = (bubble.y - bounds.minY) * scale + mapPadding;
    return { x, y, size: Math.max(2, bubble.size * 4) };
  };

  // Transform viewport to minimap coordinates
  const viewportRect = {
    x: (viewport.x - bounds.minX) * scale + mapPadding,
    y: (viewport.y - bounds.minY) * scale + mapPadding,
    width: Math.min(viewport.width / viewport.scale * scale, mapSize),
    height: Math.min(viewport.height / viewport.scale * scale, mapSize),
  };

  // Handle click on minimap to move viewport
  const handleMinimapClick = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Transform click coordinates back to world coordinates
    const worldX = (clickX - mapPadding) / scale + bounds.minX;
    const worldY = (clickY - mapPadding) / scale + bounds.minY;
    
    onViewportChange({
      ...viewport,
      x: worldX,
      y: worldY,
    });
  };

  return (
    <div 
      className={cn(
        "bg-bubble-idle/90 backdrop-blur border border-accent-void/30 rounded-lg p-2",
        "hover:bg-bubble-active/90 transition-colors duration-gentle cursor-pointer",
        className
      )}
      style={{ width: mapSize + 8, height: mapSize + 8 }}
      onClick={handleMinimapClick}
    >
      <div 
        className="relative bg-gradient-canvas rounded"
        style={{ width: mapSize, height: mapSize }}
      >
        {/* Render bubbles as dots */}
        {bubbles.map(bubble => {
          const pos = transformBubble(bubble);
          return (
            <div
              key={bubble.id}
              className="absolute rounded-full opacity-80"
              style={{
                left: pos.x - pos.size / 2,
                top: pos.y - pos.size / 2,
                width: pos.size,
                height: pos.size,
                backgroundColor: bubble.moodColor || 'hsl(var(--accent-void))',
              }}
            />
          );
        })}
        
        {/* Viewport indicator */}
        <div
          className="absolute border-2 border-text-primary/60 bg-text-primary/10 rounded"
          style={{
            left: Math.max(0, Math.min(viewportRect.x - viewportRect.width / 2, mapSize)),
            top: Math.max(0, Math.min(viewportRect.y - viewportRect.height / 2, mapSize)),
            width: Math.min(viewportRect.width, mapSize),
            height: Math.min(viewportRect.height, mapSize),
          }}
        />
      </div>
      
      {/* Mini-map label */}
      <div className="text-xs text-text-secondary text-center mt-1">
        {bubbles.length} bubbles
      </div>
    </div>
  );
}