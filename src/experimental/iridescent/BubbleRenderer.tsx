import React, {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { useBubbleStore } from '@/stores/bubbleStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { useLODSystem } from '@/hooks/useLODSystem';
import type { Bubble } from '@/types/bubble';
import type { BubbleCanvasProps, ThemeTokens } from '@/themes/ThemeTypes';
import { MergeConfirmPortal } from '@/components/MergeConfirmPortal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReducedMotion } from '@/components/ReducedMotionEnforcer';
import { bubbleToTask } from '@/adapters/taskAdapter';
import {
  projectAdaptiveBubbles,
  type AdaptiveBubbleProjection,
  type AdaptiveBubbleSemantics,
} from '@/services/adaptiveBubbleContract';
import type { CurrentEnergy } from '@/services/readinessEngine';
import type { TaskReadiness } from '@/types/task';
import { PhotoBubbleIridescent } from './PhotoBubbleIridescent';
import {
  getSafeBubbleRadius,
  recoverPersistedBubblePosition,
} from './bubblePosition';
import {
  planBubbleVisibility,
  type BubbleDensity,
} from './bubbleCapacity';

import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Map as MapIcon,
  Filter,
  Focus,
  Layers,
} from 'lucide-react';

interface IridescentNode {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  type: string;
  glow: string;
  bubble: Bubble;
  readiness: TaskReadiness;
  semantics: AdaptiveBubbleSemantics;
}

interface LastMerge {
  A: Bubble;
  B: Bubble;
  mergedId: string;
}

type BubbleVisualProperties = React.CSSProperties & {
  '--cx': string;
  '--cy': string;
  '--hx': string;
  '--hy': string;
};

interface AdaptiveTaskNavigatorProps {
  projections: readonly AdaptiveBubbleProjection[];
  onTaskSelect: (taskId: string) => void;
}

export function AdaptiveTaskNavigator({
  projections,
  onTaskSelect,
}: AdaptiveTaskNavigatorProps) {
  return (
    <details className="absolute bottom-6 right-4 z-30 max-w-[min(24rem,calc(100%-2rem))] rounded-md border bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm">
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        All tasks ({projections.length})
      </summary>
      <ol
        aria-label="All tasks by current readiness"
        className="max-h-64 space-y-1 overflow-y-auto border-t p-2"
      >
        {projections.map(({ task, semantics }) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onTaskSelect(task.id)}
              className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Open ${semantics.accessibleSummary}`}
            >
              <span className="block font-medium">{task.title}</span>
              <span className="block text-xs text-muted-foreground">
                {semantics.readinessLabel} · {semantics.urgencyLabel}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  );
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

export default function IridescentCanvas({ onBubbleSelect, onBubbleEdit, className, theme }: BubbleCanvasProps) {
  const {
    bubbles,
    settings,
    selectedBubbles,
    toggleSelection,
    clearSelection,
    mergeBubbles,
    undoLastMerge,
  } = useBubbleStore();
  const { getLODConfig } = useLODSystem();
  const isMobile = useIsMobile();
  const systemPrefersReducedMotion = useReducedMotion();
  const lodConfig = getLODConfig();
  const reducedMotion = settings.reducedMotion || systemPrefersReducedMotion;
  
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportStart, setViewportStart] = useState({ x: 0, y: 0 });
  const [confirm, setConfirm] = useState<{ x: number; y: number; a: string; b: string } | null>(null);
  const [toast, setToast] = useState(false);
  const [lastMerge, setLastMerge] = useState<LastMerge | null>(null);
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    scale: 1,
    width: 0,
    height: 0,
  });
  const [declutterMode, setDeclutterMode] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [bubbleDensity, setBubbleDensity] = useState<BubbleDensity>(
    settings.bubbleDensity,
  );
  const [currentEnergy, setCurrentEnergy] = useState<CurrentEnergy | undefined>();
  const [availableMinutes, setAvailableMinutes] = useState<number | undefined>();
  const [movementAnnouncement, setMovementAnnouncement] = useState('');
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // BubbleStore hydrates settings from IndexedDB after the first render. Keep
  // this view state aligned with the persisted density once hydration lands.
  useEffect(() => {
    setBubbleDensity(settings.bubbleDensity);
  }, [settings.bubbleDensity]);

  const bubbleById = useMemo(
    () => new Map(bubbles.map((bubble) => [bubble.id, bubble])),
    [bubbles],
  );

  const adaptiveProjections = useMemo(
    () => projectAdaptiveBubbles(
      bubbles.map(bubbleToTask),
      {
        currentEnergy,
        availableMinutes,
        now: Date.now(),
      },
    ),
    [availableMinutes, bubbles, currentEnergy],
  );

  const densityCandidates = useMemo(() => {
    if (focusMode && selectedBubbles.size > 0) {
      return adaptiveProjections.filter(
        ({ task }) => selectedBubbles.has(task.id),
      );
    }

    return adaptiveProjections;
  }, [adaptiveProjections, focusMode, selectedBubbles]);

  const densityPlan = useMemo(
    () => planBubbleVisibility(
      densityCandidates.length,
      bubbleDensity,
      {
        width: viewport.width,
        height: viewport.height,
      },
    ),
    [
      bubbleDensity,
      densityCandidates.length,
      viewport.height,
      viewport.width,
    ],
  );

  // Density and viewport capacity may change what is drawn, but the navigator
  // below keeps every canonical Task reachable in the same readiness order.
  const filteredProjections = useMemo(() => {
    let filtered = densityCandidates.slice(0, densityPlan.visibleCount);

    // Apply declutter mode filter (remove smaller bubbles)
    if (declutterMode) {
      const visibleBubbles = filtered
        .map(({ task }) => bubbleById.get(task.id))
        .filter((bubble): bubble is Bubble => bubble !== undefined);
      const avgSize = visibleBubbles.length === 0
        ? 0
        : visibleBubbles.reduce((sum, bubble) => sum + bubble.size, 0)
          / visibleBubbles.length;
      filtered = filtered.filter(({ task }) => (
        (bubbleById.get(task.id)?.size ?? 0) >= avgSize * 0.8
      ));
    }
    
    return filtered;
  }, [
    bubbleById,
    densityCandidates,
    densityPlan.visibleCount,
    declutterMode,
  ]);

  const filteredBubbles = useMemo(
    () => filteredProjections
      .map(({ task }) => bubbleById.get(task.id))
      .filter((bubble): bubble is Bubble => bubble !== undefined),
    [bubbleById, filteredProjections],
  );

  // Positions are persisted as viewport-agnostic, center-relative units. Repair
  // stale or malformed coordinates after the actual canvas size is known so
  // keyboard movement and future reloads operate on the visible position.
  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return;

    const recoveredAt = Date.now();
    bubbles.forEach((bubble) => {
      const recovered = recoverPersistedBubblePosition(bubble, {
        width: viewport.width,
        height: viewport.height,
      });
      if (!recovered.adjusted) return;

      void useBubbleStore.getState().updateBubble({
        ...bubble,
        x: recovered.x,
        y: recovered.y,
        updatedAt: recoveredAt,
      });
    });
  }, [bubbles, viewport.height, viewport.width]);

  // Convert bubbles to nodes with viewport transformation
  const nodes: IridescentNode[] = useMemo(() => {
    return filteredProjections.flatMap((projection) => {
      const bubble = bubbleById.get(projection.task.id);
      if (!bubble) return [];
      const recovered = recoverPersistedBubblePosition(bubble, viewport);

      return [{
        id: bubble.id,
        x: (recovered.x * viewport.scale) + viewport.x + (viewport.width / 2),
        y: (recovered.y * viewport.scale) + viewport.y + (viewport.height / 2),
        r: getSafeBubbleRadius(bubble.size, viewport.scale),
        label: bubble.content?.slice(0, 20) + (bubble.content?.length > 20 ? '...' : '') || `${bubble.type} bubble`,
        type: String(bubble.type || '').toLowerCase(),
        glow: getGlowColor(bubble, theme?.tokens.auraMapping),
        bubble,
        readiness: projection.readiness,
        semantics: projection.semantics,
      }];
    });
  }, [bubbleById, filteredProjections, theme?.tokens.auraMapping, viewport]);

  function getGlowColor(
    bubble: Bubble,
    auraMapping: ThemeTokens['auraMapping'] | undefined,
  ): string {
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
    e.stopPropagation();
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
    
    setDragOffset({
      x: e.clientX - rect.left - node.x,
      y: e.clientY - rect.top - node.y
    });
    setDragging(nodeId);
    setHasDragged(false);
  }, [nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    // Mark that we have dragged to prevent click events
    setHasDragged(true);
    
    // Update bubble position in store
    const bubble = bubbles.find(b => b.id === dragging);
    if (!bubble) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate new position in canvas coordinates, then convert to bubble coordinates
    const canvasX = e.clientX - rect.left - dragOffset.x;
    const canvasY = e.clientY - rect.top - dragOffset.y;
    
    // Convert back to bubble coordinate space
    const newX = (canvasX - viewport.x - (viewport.width / 2)) / viewport.scale;
    const newY = (canvasY - viewport.y - (viewport.height / 2)) / viewport.scale;
    
    const updatedBubble = { ...bubble, x: newX, y: newY, updatedAt: Date.now() };
    useBubbleStore.getState().updateBubble(updatedBubble);
  }, [bubbles, dragOffset, dragging, viewport]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    const draggedNode = nodes.find(n => n.id === dragging);
    if (!draggedNode) {
      setDragging(null);
      return;
    }

    // Check for merge candidates
    const candidates = nodes.filter(n => n.id !== dragging && overlapRatio(draggedNode, n) > (theme?.behavior.mergeThreshold || 0.06));
    
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
  }, [dragging, nodes, theme?.behavior.mergeThreshold]);

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

  const handleTaskSelect = useCallback((taskId: string) => {
    const bubble = bubbleById.get(taskId);
    if (bubble) {
      onBubbleSelect?.(bubble);
      toggleSelection(bubble.id);
    }
  }, [bubbleById, onBubbleSelect, toggleSelection]);

  const handleBubbleClick = useCallback((nodeId: string) => {
    // Only handle click if we haven't dragged.
    if (hasDragged) return;
    handleTaskSelect(nodeId);
  }, [handleTaskSelect, hasDragged]);

  const handleBubbleKeyDown = useCallback((
    nodeId: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const direction = {
      ArrowUp: { x: 0, y: -1, label: 'up' },
      ArrowDown: { x: 0, y: 1, label: 'down' },
      ArrowLeft: { x: -1, y: 0, label: 'left' },
      ArrowRight: { x: 1, y: 0, label: 'right' },
    }[event.key];

    if (!direction) return;

    event.preventDefault();
    event.stopPropagation();

    const bubble = bubbleById.get(nodeId);
    if (!bubble) return;

    const step = event.shiftKey ? 1 : 10;
    useBubbleStore.getState().updateBubble({
      ...bubble,
      x: bubble.x + direction.x * step,
      y: bubble.y + direction.y * step,
      updatedAt: Date.now(),
    });
    setMovementAnnouncement(
      `${bubble.content || 'Task'} moved ${direction.label} ${step} ${step === 1 ? 'unit' : 'units'}.`,
    );
  }, [bubbleById]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  }, []);

  const centerOnBubbles = useCallback(() => {
    if (filteredBubbles.length === 0) return;
    
    // Calculate bounds of all bubbles
    const minX = Math.min(...filteredBubbles.map(b => b.x));
    const maxX = Math.max(...filteredBubbles.map(b => b.x));
    const minY = Math.min(...filteredBubbles.map(b => b.y));
    const maxY = Math.max(...filteredBubbles.map(b => b.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setViewport(prev => ({
      ...prev,
      x: -centerX * prev.scale,
      y: -centerY * prev.scale,
      scale: 1
    }));
  }, [filteredBubbles]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(viewport.scale * zoomFactor, 0.1), 3);
    
    // Zoom towards mouse position
    const dx = mouseX - viewport.width / 2;
    const dy = mouseY - viewport.height / 2;
    
    setViewport(prev => ({
      ...prev,
      scale: newScale,
      x: prev.x - dx * (zoomFactor - 1),
      y: prev.y - dy * (zoomFactor - 1)
    }));
  }, [viewport]);

  // Mobile pinch zoom and pan handlers
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    const newScale = Math.max(0.1, Math.min(3, viewport.scale * scaleFactor));
    
    // Calculate world position of touch center
    const worldX = (center.x - viewport.width / 2) / viewport.scale + viewport.x;
    const worldY = (center.y - viewport.height / 2) / viewport.scale + viewport.y;
    
    // Calculate new viewport position to keep touch center fixed
    const newX = worldX - (center.x - viewport.width / 2) / newScale;
    const newY = worldY - (center.y - viewport.height / 2) / newScale;
    
    setViewport(prev => ({
      ...prev,
      x: newX,
      y: newY,
      scale: newScale
    }));
  }, [viewport]);

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
    if (target.closest('.iridescent-bubble') || dragging) return;
    
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setViewportStart({ x: viewport.x, y: viewport.y });
    e.preventDefault();
  }, [viewport.x, viewport.y, dragging]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning && !dragging) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      setViewport(prev => ({
        ...prev,
        x: viewportStart.x + deltaX / prev.scale,
        y: viewportStart.y + deltaY / prev.scale
      }));
    }
  }, [isPanning, panStart, viewportStart, dragging]);

  const handleCanvasPointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Bind mobile gestures
  const mobileGestures = usePinchZoom({
    onZoom: handlePinchZoom,
    onPan: handlePan,
    enabled: isMobile
  });

  // Initialize viewport dimensions
  useLayoutEffect(() => {
    const updateViewport = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        setViewport(prev => ({
          ...prev,
          width: rect.width,
          height: rect.height,
        }));
      }
    };

    updateViewport();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateViewport);
    if (canvasRef.current) {
      resizeObserver?.observe(canvasRef.current);
    }
    window.addEventListener('resize', updateViewport);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  return (
    <div 
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden bg-universe cursor-grab active:cursor-grabbing ${className || ''}`}
      role="region"
      aria-label="Adaptive Bubble view"
      aria-describedby="adaptive-bubble-view-description"
      data-reduced-motion={reducedMotion}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={(e) => {
        handleCanvasPointerMove(e);
        handlePointerMove(e);
      }}
      onPointerUp={(e) => {
        handleCanvasPointerUp();
        handlePointerUp(e);
      }}
      onPointerCancel={handleCanvasPointerUp}
      onWheel={handleWheel}
      {...(isMobile ? mobileGestures : {})}
      style={{ 
        background: 'var(--bg-universe)', 
        position: 'relative',
        touchAction: 'none'
      }}
    >
      <p id="adaptive-bubble-view-description" className="sr-only">
        Tasks are ordered by current readiness. Readiness and urgency are
        available as text, and every task remains reachable from the All tasks
        navigator. Focus a bubble and use the arrow keys to move it. Hold Shift
        for precise movement.
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {movementAnnouncement}
      </p>

      {/* Render bubbles */}
      <div
        data-testid="adaptive-bubble-layer"
        data-density-capacity={densityPlan.viewportCapacity}
        data-density-limited={densityPlan.capacityLimited}
        data-rendered-bubble-count={nodes.length}
        className="absolute inset-0 z-0"
      >
        {nodes.map((node, index) => {
          const bubbleId = node.id;
          const isSelected = selectedBubbles.has(bubbleId);
          return (
          <div className="iridescent-bubble" key={node.id}>
            <IridescentBubble
              {...node}
              selected={isSelected}
              onPointerDown={(e) => handlePointerDown(node.id, e)}
              onClick={() => handleBubbleClick(node.id)}
              onKeyDown={(event) => handleBubbleKeyDown(node.id, event)}
              phase={index}
              lod={!lodConfig.enableSpecular || dragging === node.id}
              zIndex={index}
              bubble={node.bubble}
              readiness={node.readiness}
              semantics={node.semantics}
              reducedMotion={reducedMotion}
            />
          </div>
          );
        })}
      </div>

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
      <div
        data-testid="adaptive-zoom-controls"
        className="absolute left-4 top-4 z-10 flex gap-2"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={centerOnBubbles}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Center visible bubbles"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewport(prev => ({ ...prev, scale: 1 }))}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Reset zoom"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* User-controlled, transient readiness context. */}
      <div
        className="absolute left-4 top-32 z-20 flex flex-wrap items-end gap-2 rounded-md border bg-card/90 p-2 text-card-foreground shadow-sm backdrop-blur-sm sm:top-16"
        role="group"
        aria-label="Current readiness context"
      >
        <span className="self-center text-xs font-medium">Right now</span>
        <label className="flex flex-col gap-1 text-xs">
          <span>Energy</span>
          <select
            aria-label="Current energy"
            value={currentEnergy ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setCurrentEnergy(value === '' ? undefined : value as CurrentEnergy);
            }}
            className="h-11 rounded border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            <option value="">Not set</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Time available</span>
          <select
            aria-label="Available time"
            value={availableMinutes ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setAvailableMinutes(value === '' ? undefined : Number(value));
            }}
            className="h-11 rounded border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            <option value="">Not set</option>
            <option value="10">10 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
          </select>
        </label>
        <p
          data-testid="keyboard-move-instructions"
          className="hidden max-w-40 self-center text-xs text-muted-foreground sm:block"
        >
          Keyboard: focus a bubble, then use arrow keys to move it. Hold Shift
          for precise movement.
        </p>
      </div>

      {/* Declutter & Focus controls */}
      <div
        data-testid="adaptive-mode-controls"
        className="absolute left-4 top-[4.5rem] z-10 flex gap-2 sm:left-auto sm:right-4 sm:top-4"
      >
        <Button
          variant={declutterMode ? "default" : "outline"}
          size="sm"
          onClick={() => setDeclutterMode(!declutterMode)}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Toggle decluttered view"
          aria-pressed={declutterMode}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Button
          variant={focusMode ? "default" : "outline"}
          size="sm"
          onClick={() => setFocusMode(!focusMode)}
          className="bg-card/80 backdrop-blur-sm"
          aria-label="Toggle focus mode"
          aria-pressed={focusMode}
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
          aria-label={`Change bubble density. Current density: ${bubbleDensity}`}
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
          <Button
            variant="default"
            size="sm"
            className="h-6 bg-bubble-selected/90 px-2 text-xs backdrop-blur-sm"
            onClick={clearSelection}
            aria-label={`Clear ${selectedBubbles.size} selected tasks`}
          >
            {selectedBubbles.size} selected • tap to clear
          </Button>
        )}
        <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
          Density: {bubbleDensity}
        </Badge>
        {densityPlan.capacityLimited && (
          <Badge
            variant="outline"
            className="bg-card/80 backdrop-blur-sm"
            aria-label={`Showing ${nodes.length} of ${adaptiveProjections.length} tasks based on current density and available space`}
          >
            Showing {nodes.length}
          </Badge>
        )}
      </div>

      <AdaptiveTaskNavigator
        projections={adaptiveProjections}
        onTaskSelect={handleTaskSelect}
      />

      {/* Performance Stats (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-20 right-4 text-xs text-muted-foreground bg-card/80 
                       backdrop-blur px-2 py-1 rounded border">
          Rendering: {nodes.length}/{adaptiveProjections.length} tasks ({filteredBubbles.length} visible)
          <br />
          Scale: {viewport.scale.toFixed(2)}x
        </div>
      )}


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
  onKeyDown,
  phase,
  lod,
  zIndex = 0,
  bubble,
  readiness,
  semantics,
  reducedMotion,
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  glow: string;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  phase: number;
  lod: boolean;
  zIndex?: number;
  bubble: Bubble;
  readiness: TaskReadiness;
  semantics: AdaptiveBubbleSemantics;
  reducedMotion: boolean;
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

  const varStyle: BubbleVisualProperties = {
    '--cx': `${cx}%`,
    '--cy': `${cy}%`,
    '--hx': `${hx}%`,
    '--hy': `${hy}%`,
  };

  const floatDuration = 16 + ((phase % 5) * 2);
  const floatDelay = -((phase % 7) * 0.7);

  return (
    <button
      type="button"
      className="rounded-full bg-transparent p-0 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      aria-label={semantics.accessibleSummary}
      aria-pressed={selected}
      data-adaptive-bubble
      data-task-id={semantics.taskId}
      data-readiness-band={readiness.band}
      data-urgency={semantics.urgencyLabel}
      data-motion-independent={semantics.motionIndependent}
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
      onKeyDown={onKeyDown}
    >
      <div
        ref={wrapRef}
        className={`soap ${selected ? 'ring-selected' : ''} ${lod ? 'lod' : ''}`}
        onPointerMove={reducedMotion ? undefined : handleMove}
        onPointerLeave={handleLeave}
        style={{
          width: '100%',
          height: '100%',
          animation: reducedMotion
            ? 'none'
            : `driftFloat ${floatDuration}s ease-in-out ${floatDelay}s infinite`,
          ...varStyle
        }}
      >
        {/* Photo renderer first - as the base layer */}
        {bubble.imageUri ? (
          <PhotoBubbleIridescent
            src={bubble.imageUri}
            alt={`${bubble.type}: ${bubble.content || 'Photo'}`}
            size={r * 2 * 0.88} // Slightly smaller to leave room for colored rim
            bubbleId={bubble.id}
            debugMode={false} // Remove debug badges for clean UI
          />
        ) : (
          /* Non-photo bubble core for standard bubbles */
          <div className="soap-core" style={{ zIndex: 1 }} />
        )}

        {/* Primary colored rim - the important type-based outline */}
        <div
          className="soap-rim"
          style={{
            WebkitMask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            mask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            background: `conic-gradient(${glow} 0 130deg, rgba(255,255,255,.9) 180deg, ${glow} 230deg 360deg)`,
            position: 'absolute',
            inset: '-0.05%',
            borderRadius: '999px',
            zIndex: 3, // Above photo to ensure colored rim is visible
            pointerEvents: 'none'
          }}
        />

        {/* Glass bubble effect for photos only - inner highlight ring */}
        {bubble.imageUri && (
          <div
            className="photo-glass-rim"
            style={{
              WebkitMask: 'radial-gradient(circle, transparent 80%, rgba(255,255,255,0.3) 81%, rgba(255,255,255,0.6) 83%, transparent 84%)',
              mask: 'radial-gradient(circle, transparent 80%, rgba(255,255,255,0.3) 81%, rgba(255,255,255,0.6) 83%, transparent 84%)',
              background: 'rgba(255,255,255,0.4)',
              position: 'absolute',
              inset: '0',
              borderRadius: '999px',
              zIndex: 4, // Above colored rim to add glass effect
              pointerEvents: 'none'
            }}
          />
        )}
        
        {/* Specular highlights - the light reflections on the bubble */}
        {!lod && (
          <>
            <div 
              className="soap-spec a" 
              style={{ 
                zIndex: 5,
                pointerEvents: 'none'
              }} 
            />
            <div 
              className="soap-spec b" 
              style={{ 
                zIndex: 5,
                pointerEvents: 'none'
              }} 
            />
          </>
        )}
        
        {/* Aura effect - soft glow around the bubble */}
        <div
          className="soap-aura"
          style={{
            boxShadow: `0 0 12px ${glow}40, inset 0 0 6px ${glow}20`,
            zIndex: 2, // Behind colored rim but above photo
            pointerEvents: 'none'
          }}
        />
      </div>
      {label && (
        <div
          className="pointer-events-none"
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
      <div className="pointer-events-none mt-1 flex min-w-max flex-wrap justify-center gap-1 text-[10px]">
        <span className="rounded-full border bg-card/90 px-2 py-0.5 text-card-foreground">
          {semantics.readinessLabel}
        </span>
        {semantics.requiresPersistentUrgencyCue ? (
          <span className="rounded-full border border-amber-300 bg-amber-950/90 px-2 py-0.5 font-semibold text-amber-100">
            {semantics.urgencyLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
