import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTheme } from '@/hooks/use-theme';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { useLODSystem } from '@/hooks/useLODSystem';
import { Bubble } from '@/types/bubble';
import { BubbleCanvasProps } from '@/themes/ThemeTypes';
import { MergeConfirmPortal } from '@/components/MergeConfirmPortal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PerformanceMonitor } from '@/components/PerformanceMonitor';
import { ZoomIn, ZoomOut, RotateCcw, Map, Filter, Focus, Layers } from 'lucide-react';

interface IridescentNode {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  type: string;
  glow: string;
}

// Utility functions
function overlapRatio(a: IridescentNode, b: IridescentNode): number {
  const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const sumR = a.r + b.r;
  if (d >= sumR) return 0;
  const overlap = sumR - d;
  const minArea = Math.PI * Math.min(a.r, b.r) ** 2;
  return (overlap * overlap) / minArea;
}

function dist(a: IridescentNode, b: IridescentNode): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function IridescentBubbleRenderer({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const { bubbles, selectedBubbles, toggleSelection, clearSelection, mergeBubbles, undoLastMerge } = useBubbleStore();
  const { currentTheme } = useTheme();
  const { getLODConfig } = useLODSystem();
  const lodConfig = getLODConfig();
  
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [confirm, setConfirm] = useState<{ x: number; y: number; a: string; b: string } | null>(null);
  const [toast, setToast] = useState(false);
  const [lastMerge, setLastMerge] = useState<any>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1, width: 800, height: 600 });
  const [declutterMode, setDeclutterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bubbleDensity, setBubbleDensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Convert bubbles to nodes
  const nodes: IridescentNode[] = useMemo(() => {
    return bubbles.map((bubble, index) => ({
      id: bubble.id,
      x: bubble.x + 400, // Center in viewport
      y: bubble.y + 300,
      r: Math.max(20, bubble.size * 50),
      label: bubble.content?.slice(0, 20) + (bubble.content?.length > 20 ? '...' : '') || `${bubble.type} bubble`,
      type: String(bubble.type || '').toLowerCase(),
      glow: getGlowColor(bubble, currentTheme.tokens.auraMapping)
    }));
  }, [bubbles, currentTheme.tokens.auraMapping]);

  function getGlowColor(bubble: Bubble, auraMapping: any): string {
    const h = (val: string) => (/%/.test(val) ? `hsl(${val})` : val);
    const typeMap: Record<string, string> = {
      thought:     h(auraMapping?.cloudy   || '#FF3FD4'),
      task:        h(auraMapping?.volcanic || '#FF7A00'),
      memory:      h(auraMapping?.icy      || '#00FFA3'),
      mood:        h(auraMapping?.rocky    || '#8A4DFF'),
      remindernote:h(auraMapping?.gas      || '#00E5FF')
    };
    const key = String(bubble.type || '').toLowerCase();
    return typeMap[key] || typeMap.thought;
  }

  const handlePointerDown = useCallback((nodeId: string, e: React.PointerEvent) => {
    e.preventDefault();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Bring selected bubble to front by updating z-order
    const updatedNodes = [...nodes];
    const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex >= 0) {
      const [selectedNode] = updatedNodes.splice(nodeIndex, 1);
      updatedNodes.push(selectedNode);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate drag offset using bubble coordinates (without the +400/+300 offset)
    const bubbleX = node.x - 400; // Convert back to bubble coordinate space
    const bubbleY = node.y - 300;
    
    setDragOffset({
      x: e.clientX - rect.left - node.x,
      y: e.clientY - rect.top - node.y
    });
    setDragging(nodeId);
  }, [nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    // Update bubble position in store
    const bubble = bubbles.find(b => b.id === dragging);
    if (!bubble) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate new position in canvas coordinates, then convert to bubble coordinates
    const canvasX = e.clientX - rect.left - dragOffset.x;
    const canvasY = e.clientY - rect.top - dragOffset.y;
    
    // Convert from node coordinates (with +400/+300 offset) back to bubble coordinates
    const newX = canvasX - 400;
    const newY = canvasY - 300;
    
    const updatedBubble = { ...bubble, x: newX, y: newY, updatedAt: Date.now() };
    useBubbleStore.getState().updateBubble(updatedBubble);
  }, [dragging, dragOffset, bubbles]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    const draggedNode = nodes.find(n => n.id === dragging);
    if (!draggedNode) {
      setDragging(null);
      return;
    }

    // Check for merge candidates
    const candidates = nodes.filter(n => n.id !== dragging && overlapRatio(draggedNode, n) > (currentTheme.behavior.mergeThreshold || 0.06));
    
      if (candidates.length > 0) {
        const closest = candidates.reduce((best, curr) => 
          dist(draggedNode, curr) < dist(draggedNode, best) ? curr : best
        );
        
        // Convert canvas coords to screen coords for portal
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (canvasRect) {
          const midX = (draggedNode.x + closest.x) / 2;
          const midY = (draggedNode.y + closest.y) / 2;
          
          const screenX = canvasRect.left + midX;
          const screenY = canvasRect.top + midY;
          
          setConfirm({ x: screenX, y: screenY, a: dragging, b: closest.id });
        }
      }
    
    setDragging(null);
  }, [dragging, nodes, currentTheme.behavior.mergeThreshold]);

  const handleMerge = useCallback(() => {
    if (!confirm) return;
    
    const bubbleA = bubbles.find(b => b.id === confirm.a);
    const bubbleB = bubbles.find(b => b.id === confirm.b);
    
    if (bubbleA && bubbleB) {
      const nodeA = nodes.find(n => n.id === confirm.a)!;
      const nodeB = nodes.find(n => n.id === confirm.b)!;
      
      setLastMerge({ 
        A: { ...bubbleA, x: nodeA.x - 400, y: nodeA.y - 300 }, 
        B: { ...bubbleB, x: nodeB.x - 400, y: nodeB.y - 300 },
        mergedId: bubbleA.id
      });
      
      mergeBubbles(bubbleA, bubbleB);
      setConfirm(null);
      setToast(true);
      
      setTimeout(() => {
        setToast(false);
        setLastMerge(null);
      }, 6000);
    }
  }, [confirm, bubbles, nodes, mergeBubbles]);

  const handleUndo = useCallback(() => {
    if (!lastMerge) return;
    undoLastMerge();
    setLastMerge(null);
    setToast(false);
  }, [lastMerge, undoLastMerge]);

  const handleBubbleClick = useCallback((nodeId: string) => {
    const bubble = bubbles.find(b => b.id === nodeId);
    if (bubble) {
      if (onBubbleSelect) {
        onBubbleSelect(bubble);
      }
      // Also toggle selection for the renderer
      toggleSelection(bubble.id);
    }
  }, [bubbles, onBubbleSelect, toggleSelection]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  }, []);

  const centerOnBubbles = useCallback(() => {
    if (bubbles.length === 0) return;
    
    // Calculate bounds of all bubbles
    const minX = Math.min(...bubbles.map(b => b.x));
    const maxX = Math.max(...bubbles.map(b => b.x));
    const minY = Math.min(...bubbles.map(b => b.y));
    const maxY = Math.max(...bubbles.map(b => b.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setViewport(prev => ({
      ...prev,
      x: -centerX + prev.width / 2,
      y: -centerY + prev.height / 2,
      scale: 1
    }));
  }, [bubbles]);

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

  return (
    <div 
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden bg-universe ${className || ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ 
        background: 'var(--bg-universe)', 
        position: 'relative',
        touchAction: 'none'
      }}
    >
      {/* Render bubbles */}
      {nodes.map((node, index) => {
        const bubbleId = node.id;
        const isSelected = selectedBubbles.has(bubbleId);
        return (
        <IridescentBubble
          key={node.id}
          {...node}
          selected={isSelected}
          onPointerDown={(e) => handlePointerDown(node.id, e)}
          onClick={() => handleBubbleClick(node.id)}
          phase={index}
          lod={!lodConfig.enableSpecular || dragging === node.id}
          zIndex={index}
        />
        );
      })}

      {/* Meniscus at intersections */}
        {(() => {
          const rings: JSX.Element[] = [];
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i], b = nodes[j];
              const ratio = overlapRatio(a, b);
              if (ratio > 0.05) {
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                const rr = Math.min(a.r, b.r) * 0.18;
                rings.push(
                  <div
                    key={`m-${a.id}-${b.id}`}
                    className="meniscus"
                    style={{
                      position: 'absolute',
                      left: mx - rr,
                      top: my - rr,
                      width: rr * 2,
                      height: rr * 2,
                      pointerEvents: 'none'
                    }}
                  />
                );
              }
            }
          }
          return rings;
        })()}

      {/* Merge confirmation portal */}
      <MergeConfirmPortal
        isOpen={!!confirm}
        screenPosition={confirm ? { x: confirm.x, y: confirm.y } : { x: 0, y: 0 }}
        onMerge={handleMerge}
        onCancel={() => setConfirm(null)}
        bubble1Label={confirm ? nodes.find(n => n.id === confirm.a)?.label || 'Bubble' : ''}
        bubble2Label={confirm ? nodes.find(n => n.id === confirm.b)?.label || 'Bubble' : ''}
      />

      {/* Zoom & Pan controls */}
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

      {/* Performance Monitor Controls */}
      <div className="absolute bottom-6 right-6 z-30">
        <Button 
          variant={showPerformanceMonitor ? "default" : "outline"} 
          size="sm"
          onClick={() => setShowPerformanceMonitor(!showPerformanceMonitor)}
          className="bg-card/80 backdrop-blur-sm gap-1"
        >
          <Map className="w-4 h-4" />
          FPS Monitor
        </Button>
      </div>

      {/* Performance Stats (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-20 right-4 text-xs text-muted-foreground bg-card/80 
                       backdrop-blur px-2 py-1 rounded border">
          Rendering: {nodes.length}/{bubbles.length} bubbles
          <br />
          Scale: {viewport.scale.toFixed(2)}x
        </div>
      )}

      {/* Performance Monitor */}
      <PerformanceMonitor show={showPerformanceMonitor} />

      {/* Undo toast */}
      {toast && lastMerge && (
        <div
          className="merge-pop"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 16,
            position: 'absolute'
          }}
        >
          <span style={{ color: '#fff', fontSize: 12, marginRight: 8 }}>
            Merged.
          </span>
          <button onClick={handleUndo} className="btn-cancel">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function IridescentBubble({
  x,
  y,
  r,
  label,
  glow,
  selected,
  onPointerDown,
  onClick,
  phase,
  lod,
  zIndex = 0
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  glow: string;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  phase: number;
  lod: boolean;
  zIndex?: number;
}) {
  const [cx, setCx] = useState(35);
  const [cy, setCy] = useState(28);
  const [hx, setHx] = useState(18);
  const [hy, setHy] = useState(12);
  const wrapRef = useRef<HTMLDivElement>(null);

  function handleMove(e: React.PointerEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    setCx(20 + px * 0.6);
    setCy(18 + py * 0.5);
    setHx(10 + px * 0.6);
    setHy(8 + py * 0.5);
  }

  function handleLeave() {
    setCx(35);
    setCy(28);
    setHx(18);
    setHy(12);
  }

  const varStyle = {
    ['--cx' as any]: `${cx}%`,
    ['--cy' as any]: `${cy}%`,
    ['--hx' as any]: `${hx}%`,
    ['--hy' as any]: `${hy}%`
  } as React.CSSProperties;

  const floatDuration = 16 + ((phase % 5) * 2);
  const floatDelay = -((phase % 7) * 0.7);

  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        zIndex: zIndex
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div
        ref={wrapRef}
        className={`soap ${selected ? 'ring-selected' : ''} ${lod ? 'lod' : ''}`}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={{
          width: '100%',
          height: '100%',
          animation: `driftFloat ${floatDuration}s ease-in-out ${floatDelay}s infinite`,
          ...varStyle
        }}
      >
        <div
          className="soap-rim"
          style={{
            WebkitMask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            mask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            background: `conic-gradient(${glow} 0 130deg, rgba(255,255,255,.9) 180deg, ${glow} 230deg 360deg)`,
            position: 'absolute',
            inset: '-0.05%',
            borderRadius: '999px'
          }}
        />
        <div className="soap-core" />
        <div className="soap-spec a" />
        <div className="soap-spec b" />
        <div
          className="soap-aura"
          style={{
            boxShadow: `0 0 12px ${glow}40, inset 0 0 6px ${glow}20`
          }}
        />
      </div>
      {label && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,.85)',
            marginTop: 4
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}