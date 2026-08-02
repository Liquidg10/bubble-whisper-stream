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
import { wheelScaleFactor } from '@/hooks/usePanZoom';
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
import {
  centerViewportOnWorldPoint,
  panViewportByScreenDelta,
  screenToWorld,
  worldToScreen,
  zoomViewportAtPoint,
} from '@/lib/canvasGeometry';
import { PhotoBubbleIridescent } from './PhotoBubbleIridescent';
import {
  getSafeBubbleRadius,
  placeOriginBubble,
  recoverPersistedBubblePosition,
  separateSeverelyOverlappingBubbles,
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

interface MergeConfirmation {
  x: number;
  y: number;
  a: string;
  b: string;
  aPosition: { x: number; y: number };
  bPosition: { x: number; y: number };
}

type BubbleVisualProperties = React.CSSProperties & {
  '--cx': string;
  '--cy': string;
  '--hx': string;
  '--hy': string;
};

const COMPACT_ICON_BUTTON_CLASSES = [
  'h-11',
  'w-11',
  'bg-card/80',
  'p-0',
  'backdrop-blur-sm',
].join(' ');
const COMPACT_CONTROL_SAFE_TOP_INSET = 112;
const DESKTOP_CONTROL_SAFE_TOP_INSET = 136;

interface AdaptiveTaskNavigatorProps {
  projections: readonly AdaptiveBubbleProjection[];
  onTaskSelect: (taskId: string) => void;
  compact?: boolean;
}

export function AdaptiveTaskNavigator({
  projections,
  onTaskSelect,
  compact = false,
}: AdaptiveTaskNavigatorProps) {
  return (
    <details
      data-panel
      className={`absolute z-30 rounded-md border bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm ${
        compact
          ? 'right-4 top-4 max-w-[min(24rem,calc(100%-13rem))]'
          : 'bottom-6 right-24 max-w-[min(24rem,calc(100%-8rem))]'
      }`}
    >
      <summary
        aria-label={`All tasks (${projections.length})`}
        className="flex min-h-11 cursor-pointer select-none items-center whitespace-nowrap px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={compact ? 'sr-only' : undefined}>All </span>
        tasks ({projections.length})
      </summary>
      <ol
        aria-label="All tasks by current readiness"
        className="max-h-40 space-y-1 overflow-y-auto border-t p-2 sm:max-h-64"
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

interface ReadinessContextFieldsProps {
  currentEnergy: CurrentEnergy | undefined;
  availableMinutes: number | undefined;
  onEnergyChange: (energy: CurrentEnergy | undefined) => void;
  onAvailableMinutesChange: (minutes: number | undefined) => void;
  showKeyboardHelp?: boolean;
}

function ReadinessContextFields({
  currentEnergy,
  availableMinutes,
  onEnergyChange,
  onAvailableMinutesChange,
  showKeyboardHelp = false,
}: ReadinessContextFieldsProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        <span>Energy</span>
        <select
          aria-label="Current energy"
          value={currentEnergy ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onEnergyChange(value === '' ? undefined : value as CurrentEnergy);
          }}
          className="h-11 rounded border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            onAvailableMinutesChange(value === '' ? undefined : Number(value));
          }}
          className="h-11 rounded border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Not set</option>
          <option value="10">10 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
        </select>
      </label>
      {showKeyboardHelp && (
        <p
          data-testid="keyboard-move-instructions"
          className="max-w-40 self-center text-xs text-muted-foreground"
        >
          Keyboard: focus a bubble, then use arrow keys to move it. Hold Shift
          for precise movement.
        </p>
      )}
    </>
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
    isLoading,
    selectedBubbles,
    toggleSelection,
    clearSelection,
    mergeBubbles,
    undoLastMerge,
  } = useBubbleStore();
  const { getLODConfig } = useLODSystem();
  const systemPrefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const lodConfig = getLODConfig();
  const reducedMotion = settings.reducedMotion || systemPrefersReducedMotion;
  
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportStart, setViewportStart] = useState({ x: 0, y: 0 });
  const [confirm, setConfirm] = useState<MergeConfirmation | null>(null);
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
  const [originPlacementById, setOriginPlacementById] = useState(
    () => new Map<string, { x: number; y: number }>(),
  );
  const [legacyRecoveryById, setLegacyRecoveryById] = useState(
    () => new Map<string, { x: number; y: number }>(),
  );
  const compactControls = isMobile
    || (viewport.height > 0 && viewport.height < 420);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const dragPreviewRef = useRef<typeof dragPreview>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragCaptureTargetRef = useRef<HTMLElement | null>(null);
  const mergeReturnFocusRef = useRef<HTMLElement | null>(null);
  const panPointerIdRef = useRef<number | null>(null);
  const autoPlacedIdsRef = useRef(new Set<string>());

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

  useLayoutEffect(() => {
    if (
      isLoading
      || viewport.width <= 0
      || viewport.height <= 0
    ) {
      return;
    }

    const currentIds = new Set(bubbles.map(bubble => bubble.id));
    autoPlacedIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) autoPlacedIdsRef.current.delete(id);
    });
    bubbles.forEach((bubble) => {
      const isAtCanonicalOrigin = (
        Number.isFinite(bubble.x)
        && Number.isFinite(bubble.y)
        && bubble.x === 0
        && bubble.y === 0
      );
      if (isAtCanonicalOrigin) {
        autoPlacedIdsRef.current.add(bubble.id);
      } else {
        // Coordinates can change through sync or another view. Stop applying
        // the local first-layout plan as soon as canonical data becomes
        // explicitly positioned.
        autoPlacedIdsRef.current.delete(bubble.id);
      }
    });
    const placementBubbles = bubbles.filter((bubble) => (
      autoPlacedIdsRef.current.has(bubble.id)
    ));
    const dimensions = {
      width: viewport.width,
      height: viewport.height,
    };
    const presentationInsets = {
      top: compactControls
        ? COMPACT_CONTROL_SAFE_TOP_INSET
        : DESKTOP_CONTROL_SAFE_TOP_INSET,
    };
    const placementRadius = placementBubbles.length > 0
      ? Math.max(
        ...placementBubbles.map(bubble => getSafeBubbleRadius(bubble.size)),
      )
      : 0;
    const originPlan = placementBubbles.length > 1
      ? new Map(placementBubbles.map((bubble, index) => [
        bubble.id,
        placeOriginBubble(
          bubble,
          index,
          placementBubbles.length,
          dimensions,
          placementRadius,
          presentationInsets,
        ),
      ]))
      : new Map<string, { x: number; y: number }>();

    // Preserve user-arranged tasks first, then fit new origin tasks around
    // them. A single unified clearance pass prevents the two cohorts from
    // producing a visually overlapping layout while keeping all repairs
    // presentation-only.
    const arrangedBubbles = bubbles.filter(
      bubble => !autoPlacedIdsRef.current.has(bubble.id),
    );
    const layoutCandidates = [
      ...arrangedBubbles,
      ...placementBubbles.map((bubble) => {
        const planned = originPlan.get(bubble.id);
        return planned ? { ...bubble, ...planned } : bubble;
      }),
    ];
    const repairs = separateSeverelyOverlappingBubbles(
      layoutCandidates,
      dimensions,
      {
        separateAllOverlaps: true,
        insets: presentationInsets,
      },
    );

    setOriginPlacementById(originPlan);
    setLegacyRecoveryById(repairs);
  }, [
    bubbles,
    compactControls,
    isLoading,
    viewport.height,
    viewport.width,
  ]);

  // Automatic first layout, viewport clamping, and legacy-stack recovery are
  // presentation-only. They must never rewrite canonical coordinates merely
  // because the same task was opened on a smaller screen. A deliberate drag
  // or keyboard move below is the point where a position becomes persisted.

  const getDisplayPosition = useCallback((bubble: Bubble) => {
    const planned = legacyRecoveryById.get(bubble.id)
      ?? originPlacementById.get(bubble.id);
    return recoverPersistedBubblePosition(
      planned ? { ...bubble, ...planned } : bubble,
      viewport,
    );
  }, [legacyRecoveryById, originPlacementById, viewport]);

  // Convert bubbles to nodes with viewport transformation
  const nodes: IridescentNode[] = useMemo(() => {
    return filteredProjections.flatMap((projection) => {
      const bubble = bubbleById.get(projection.task.id);
      if (!bubble) return [];
      const recovered = getDisplayPosition(bubble);
      const worldPosition = dragPreview?.id === bubble.id
        ? dragPreview
        : recovered;
      const screenPosition = worldToScreen(worldPosition, viewport, viewport);

      return [{
        id: bubble.id,
        x: screenPosition.x,
        y: screenPosition.y,
        r: getSafeBubbleRadius(bubble.size, viewport.scale),
        label: bubble.content?.slice(0, 20) + (bubble.content?.length > 20 ? '...' : '') || `${bubble.type} bubble`,
        type: String(bubble.type || '').toLowerCase(),
        glow: getGlowColor(bubble, theme?.tokens.auraMapping),
        bubble,
        readiness: projection.readiness,
        semantics: projection.semantics,
      }];
    });
  }, [
    bubbleById,
    dragPreview,
    filteredProjections,
    getDisplayPosition,
    theme?.tokens.auraMapping,
    viewport,
  ]);

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
    if (
      e.button !== 0
      || draggingRef.current !== null
      || (e.pointerType === 'touch' && e.isPrimary === false)
    ) {
      return;
    }
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const captureTarget = e.currentTarget as HTMLElement;
    captureTarget.setPointerCapture?.(e.pointerId);
    setDragOffset({
      x: e.clientX - rect.left - node.x,
      y: e.clientY - rect.top - node.y
    });
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragPointerIdRef.current = e.pointerId;
    dragCaptureTargetRef.current = captureTarget;
    draggingRef.current = nodeId;
    hasDraggedRef.current = false;
    setDragging(nodeId);
    setHasDragged(false);
  }, [nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const activeId = draggingRef.current;
    if (!activeId || dragPointerIdRef.current !== e.pointerId) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const start = dragStartRef.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 8) {
      hasDraggedRef.current = true;
      setHasDragged(true);
    }

    const worldPosition = screenToWorld(
      {
        x: e.clientX - rect.left - dragOffset.x,
        y: e.clientY - rect.top - dragOffset.y,
      },
      viewport,
      viewport,
    );
    const preview = { id: activeId, ...worldPosition };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  }, [dragOffset, viewport]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const activeId = draggingRef.current;
    if (!activeId || dragPointerIdRef.current !== e.pointerId) return;

    const capturedTarget = dragCaptureTargetRef.current;
    if (capturedTarget?.hasPointerCapture?.(e.pointerId)) {
      capturedTarget.releasePointerCapture(e.pointerId);
    }

    const preview = dragPreviewRef.current;
    const baseNode = nodes.find(n => n.id === activeId);
    const previewScreen = preview
      ? worldToScreen(preview, viewport, viewport)
      : null;
    const draggedNode = baseNode && previewScreen
      ? { ...baseNode, x: previewScreen.x, y: previewScreen.y }
      : baseNode;
    if (!draggedNode) {
      draggingRef.current = null;
      dragPointerIdRef.current = null;
      dragCaptureTargetRef.current = null;
      setDragging(null);
      return;
    }

    let pendingMerge: MergeConfirmation | null = null;
    if (preview && hasDraggedRef.current) {
      const candidates = nodes.filter(node => (
        node.id !== activeId
        && overlapRatio(draggedNode, node)
          > (theme?.behavior.mergeThreshold ?? 0.06)
      ));
      if (candidates.length > 0) {
        const closest = candidates.reduce((best, candidate) => (
          dist(draggedNode, candidate) < dist(draggedNode, best)
            ? candidate
            : best
        ));
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (canvasRect) {
          pendingMerge = {
            x: canvasRect.left + ((draggedNode.x + closest.x) / 2),
            y: canvasRect.top + ((draggedNode.y + closest.y) / 2),
            a: activeId,
            b: closest.id,
            aPosition: { x: preview.x, y: preview.y },
            bPosition: screenToWorld(closest, viewport, viewport),
          };
        }
      }
    }

    const bubble = useBubbleStore.getState().bubbles.find(
      candidate => candidate.id === activeId,
    );
    if (bubble && preview && hasDraggedRef.current) {
      if (pendingMerge) {
        // Keep the transient drop position visible until the user decides.
        // Persisting before the decision can race the merge and resurrect a
        // deleted or stale task record.
        mergeReturnFocusRef.current = dragCaptureTargetRef.current;
        setConfirm(pendingMerge);
      } else {
        autoPlacedIdsRef.current.delete(activeId);
        setOriginPlacementById((currentPlan) => {
          if (!currentPlan.has(activeId)) return currentPlan;
          const nextPlan = new Map(currentPlan);
          nextPlan.delete(activeId);
          return nextPlan;
        });
        setLegacyRecoveryById((currentPlan) => {
          if (!currentPlan.has(activeId)) return currentPlan;
          const nextPlan = new Map(currentPlan);
          nextPlan.delete(activeId);
          return nextPlan;
        });
        const pendingPreview = preview;
        void useBubbleStore.getState().updateBubble({
          ...bubble,
          x: preview.x,
          y: preview.y,
          updatedAt: Date.now(),
        }).finally(() => {
          if (dragPreviewRef.current === pendingPreview) {
            dragPreviewRef.current = null;
            setDragPreview(null);
          }
        });
      }
    } else {
      dragPreviewRef.current = null;
      setDragPreview(null);
    }

    draggingRef.current = null;
    dragStartRef.current = null;
    dragPointerIdRef.current = null;
    dragCaptureTargetRef.current = null;
    setDragging(null);
  }, [nodes, theme?.behavior.mergeThreshold, viewport]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    const capturedTarget = dragCaptureTargetRef.current;
    if (capturedTarget?.hasPointerCapture?.(e.pointerId)) {
      capturedTarget.releasePointerCapture(e.pointerId);
    }
    draggingRef.current = null;
    dragPreviewRef.current = null;
    dragStartRef.current = null;
    dragPointerIdRef.current = null;
    dragCaptureTargetRef.current = null;
    hasDraggedRef.current = false;
    setDragging(null);
    setDragPreview(null);
    setHasDragged(false);
  }, []);

  const restoreFocusAfterMergeDecision = useCallback((taskId?: string) => {
    const priorTarget = mergeReturnFocusRef.current;
    mergeReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (priorTarget?.isConnected) {
        priorTarget.focus();
        return;
      }
      const currentTarget = Array.from(
        document.querySelectorAll<HTMLElement>('[data-task-id]'),
      ).find(element => taskId && element.dataset.taskId === taskId);
      if (currentTarget) {
        currentTarget.focus();
      } else {
        canvasRef.current?.focus();
      }
    });
  }, []);

  const handleMerge = useCallback(() => {
    if (!confirm) return;

    const currentBubbles = useBubbleStore.getState().bubbles;
    const bubbleA = currentBubbles.find(bubble => bubble.id === confirm.a);
    const bubbleB = currentBubbles.find(bubble => bubble.id === confirm.b);

    if (bubbleA && bubbleB) {
      const positionedA = { ...bubbleA, ...confirm.aPosition };
      const positionedB = { ...bubbleB, ...confirm.bPosition };
      mergeBubbles(positionedA, positionedB);
      const mergedId = useBubbleStore.getState().lastOperation?.mergedBubble.id;
      setLastMerge({
        A: positionedA,
        B: positionedB,
        mergedId: mergedId ?? bubbleA.id,
      });
      dragPreviewRef.current = null;
      setDragPreview(null);
      setConfirm(null);
      restoreFocusAfterMergeDecision(mergedId);
      setToast(true);

      setTimeout(() => {
        setToast(false);
        setLastMerge(null);
      }, 6000);
    }
  }, [confirm, mergeBubbles, restoreFocusAfterMergeDecision]);

  const handleMergeCancel = useCallback(() => {
    if (!confirm) return;
    setConfirm(null);
    dragPreviewRef.current = null;
    setDragPreview(null);
    restoreFocusAfterMergeDecision(confirm.a);
  }, [confirm, restoreFocusAfterMergeDecision]);

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
    if (hasDragged || hasDraggedRef.current) return;
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

    const screenStep = event.shiftKey ? 1 : 10;
    const worldStep = screenStep / viewport.scale;
    const currentPosition = getDisplayPosition(bubble);
    autoPlacedIdsRef.current.delete(nodeId);
    setOriginPlacementById((currentPlan) => {
      if (!currentPlan.has(nodeId)) return currentPlan;
      const nextPlan = new Map(currentPlan);
      nextPlan.delete(nodeId);
      return nextPlan;
    });
    setLegacyRecoveryById((currentPlan) => {
      if (!currentPlan.has(nodeId)) return currentPlan;
      const nextPlan = new Map(currentPlan);
      nextPlan.delete(nodeId);
      return nextPlan;
    });
    useBubbleStore.getState().updateBubble({
      ...bubble,
      x: currentPosition.x + direction.x * worldStep,
      y: currentPosition.y + direction.y * worldStep,
      updatedAt: Date.now(),
    });
    setMovementAnnouncement(
      `${bubble.content || 'Task'} moved ${direction.label} ${screenStep} ${screenStep === 1 ? 'pixel' : 'pixels'}.`,
    );
  }, [
    bubbleById,
    getDisplayPosition,
    viewport,
  ]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setViewport((previous) => ({
      ...previous,
      ...zoomViewportAtPoint(
        previous,
        1.2,
        { x: previous.width / 2, y: previous.height / 2 },
        previous,
        0.1,
        3,
      ),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((previous) => ({
      ...previous,
      ...zoomViewportAtPoint(
        previous,
        1 / 1.2,
        { x: previous.width / 2, y: previous.height / 2 },
        previous,
        0.1,
        3,
      ),
    }));
  }, []);

  const centerOnBubbles = useCallback(() => {
    if (filteredBubbles.length === 0) return;
    
    const displayPositions = filteredBubbles.map(getDisplayPosition);
    const minX = Math.min(...displayPositions.map(position => position.x));
    const maxX = Math.max(...displayPositions.map(position => position.x));
    const minY = Math.min(...displayPositions.map(position => position.y));
    const maxY = Math.max(...displayPositions.map(position => position.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setViewport((previous) => ({
      ...previous,
      ...centerViewportOnWorldPoint(
        previous,
        { x: centerX, y: centerY },
        1,
      ),
    }));
  }, [
    filteredBubbles,
    getDisplayPosition,
  ]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const dimensions = { width: rect.width, height: rect.height };
    const focalPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const scaleFactor = wheelScaleFactor(
      e.deltaY,
      e.deltaMode,
      dimensions.height,
    );
    if (scaleFactor === 1) return;

    setViewport((previous) => ({
      ...previous,
      ...zoomViewportAtPoint(
        previous,
        scaleFactor,
        focalPoint,
        dimensions,
        0.1,
        3,
      ),
      ...dimensions,
    }));
  }, []);

  // Mobile pinch zoom and pan handlers
  const handlePinchZoom = useCallback((scaleFactor: number, center: { x: number; y: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dimensions = { width: rect.width, height: rect.height };
    setViewport((previous) => ({
      ...previous,
      ...zoomViewportAtPoint(
        previous,
        scaleFactor,
        { x: center.x - rect.left, y: center.y - rect.top },
        dimensions,
        0.1,
        3,
      ),
      ...dimensions,
    }));
  }, []);

  const handlePan = useCallback((delta: { x: number; y: number }) => {
    setViewport((previous) => ({
      ...previous,
      ...panViewportByScreenDelta(previous, delta),
    }));
  }, []);

  // Canvas pan handlers for mouse/touch
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    // Only start panning if clicking on empty canvas (not on a bubble)
    const target = e.target as HTMLElement;
    if (
      target.closest('.iridescent-bubble')
      || target.closest('button, input, select, textarea, a, summary, [role="button"], [data-panel]')
      || draggingRef.current
    ) return;

    panPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setViewportStart({ x: viewport.x, y: viewport.y });
    e.preventDefault();
  }, [viewport.x, viewport.y]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning && !dragging) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      setViewport(prev => ({
        ...prev,
        x: viewportStart.x + deltaX,
        y: viewportStart.y + deltaY
      }));
    }
  }, [isPanning, panStart, viewportStart, dragging]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (
      panPointerIdRef.current === e.pointerId
      && e.currentTarget.hasPointerCapture?.(e.pointerId)
    ) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    panPointerIdRef.current = null;
    setIsPanning(false);
  }, []);

  // Bind mobile gestures
  const {
    onTouchStart: handlePinchTouchStart,
    onTouchMove: handlePinchTouchMove,
    onTouchEnd: handlePinchTouchEnd,
    onTouchCancel: handlePinchTouchCancel,
  } = usePinchZoom({
    onZoom: handlePinchZoom,
    onPan: handlePan,
    enabled: true
  });

  const handleCanvasTouchStart = useCallback((event: React.TouchEvent) => {
    if (draggingRef.current) return;
    const target = event.target as HTMLElement;
    if (
      event.touches.length === 1
      && target.closest('.iridescent-bubble, button, input, select, textarea, a, summary, [data-panel]')
    ) {
      return;
    }
    handlePinchTouchStart(event);
  }, [handlePinchTouchStart]);

  const handleCanvasTouchMove = useCallback((event: React.TouchEvent) => {
    if (draggingRef.current) return;
    const target = event.target as HTMLElement;
    if (
      event.touches.length === 1
      && target.closest('.iridescent-bubble, button, input, select, textarea, a, summary, [data-panel]')
    ) {
      return;
    }
    handlePinchTouchMove(event);
  }, [handlePinchTouchMove]);

  const handleCanvasTouchEnd = useCallback((event: React.TouchEvent) => {
    if (draggingRef.current) return;
    handlePinchTouchEnd(event);
  }, [handlePinchTouchEnd]);

  const handleCanvasTouchCancel = useCallback(() => {
    if (draggingRef.current) return;
    handlePinchTouchCancel();
  }, [handlePinchTouchCancel]);

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
      tabIndex={-1}
      aria-label="Adaptive Bubble view"
      aria-describedby="adaptive-bubble-view-description"
      data-reduced-motion={reducedMotion}
      data-viewport-scale={viewport.scale}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={(e) => {
        handleCanvasPointerMove(e);
        handlePointerMove(e);
      }}
      onPointerUp={(e) => {
        handleCanvasPointerUp(e);
        handlePointerUp(e);
      }}
      onPointerCancel={(e) => {
        handleCanvasPointerUp(e);
        handlePointerCancel(e);
      }}
      onWheel={handleWheel}
      onTouchStart={handleCanvasTouchStart}
      onTouchMove={handleCanvasTouchMove}
      onTouchEnd={handleCanvasTouchEnd}
      onTouchCancel={handleCanvasTouchCancel}
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
        onCancel={handleMergeCancel}
        bubble1Label={confirm ? nodes.find(n => n.id === confirm.a)?.label || 'Bubble' : ''}
        bubble2Label={confirm ? nodes.find(n => n.id === confirm.b)?.label || 'Bubble' : ''}
      />

      {/* Zoom & Pan controls */}
      {!compactControls && (
      <div data-testid="adaptive-zoom-controls" className="absolute left-4 top-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={zoomIn}
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={zoomOut}
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={centerOnBubbles}
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label="Center visible bubbles"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewport((previous) => ({
            ...previous,
            x: 0,
            y: 0,
            scale: 1,
          }))}
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label="Reset zoom"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      </div>
      )}

      {/* Compact mobile canvas controls stay out of the task field until opened. */}
      {compactControls && (
      <details
        data-panel
        data-testid="adaptive-mobile-view-controls"
        className="absolute left-4 top-4 z-30 rounded-md border bg-card/95 text-card-foreground shadow-sm backdrop-blur-sm"
      >
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          View
        </summary>
        <div className="absolute left-0 top-14 grid grid-cols-4 gap-2 rounded-md border bg-card/95 p-2 shadow-lg backdrop-blur-sm">
          <Button variant="outline" size="sm" onClick={zoomIn} className={COMPACT_ICON_BUTTON_CLASSES} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={zoomOut} className={COMPACT_ICON_BUTTON_CLASSES} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={centerOnBubbles} className={COMPACT_ICON_BUTTON_CLASSES} aria-label="Center visible bubbles">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewport((previous) => ({ ...previous, x: 0, y: 0, scale: 1 }))}
            className={COMPACT_ICON_BUTTON_CLASSES}
            aria-label="Reset zoom"
          >
            <MapIcon className="h-4 w-4" />
          </Button>
          <Button variant={declutterMode ? 'default' : 'outline'} size="sm" onClick={() => setDeclutterMode(!declutterMode)} className={COMPACT_ICON_BUTTON_CLASSES} aria-label="Toggle decluttered view" aria-pressed={declutterMode}>
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant={focusMode ? 'default' : 'outline'} size="sm" onClick={() => setFocusMode(!focusMode)} className={COMPACT_ICON_BUTTON_CLASSES} aria-label="Toggle focus mode" aria-pressed={focusMode}>
            <Focus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const densities: BubbleDensity[] = ['low', 'medium', 'high'];
              const current = densities.indexOf(bubbleDensity);
              setBubbleDensity(densities[(current + 1) % densities.length]);
            }}
            className={COMPACT_ICON_BUTTON_CLASSES}
            aria-label={`Change bubble density. Current density: ${bubbleDensity}`}
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </details>
      )}

      {/* User-controlled, transient readiness context. */}
      {compactControls && (
      <details
        data-panel
        className="absolute left-20 top-4 z-30 rounded-md border bg-card/95 text-card-foreground shadow-sm backdrop-blur-sm"
      >
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Right now
        </summary>
        <div
          className="absolute left-0 top-14 flex w-56 flex-wrap items-end gap-2 rounded-md border bg-card/95 p-2 shadow-lg backdrop-blur-sm"
          role="group"
          aria-label="Current readiness context"
        >
          <ReadinessContextFields
            currentEnergy={currentEnergy}
            availableMinutes={availableMinutes}
            onEnergyChange={setCurrentEnergy}
            onAvailableMinutesChange={setAvailableMinutes}
          />
        </div>
      </details>
      )}
      {!compactControls && (
      <div
        className="absolute left-4 top-16 z-20 flex flex-wrap items-end gap-2 rounded-md border bg-card/90 p-2 text-card-foreground shadow-sm backdrop-blur-sm"
        role="group"
        aria-label="Current readiness context"
      >
        <span className="self-center text-xs font-medium">Right now</span>
        <ReadinessContextFields
          currentEnergy={currentEnergy}
          availableMinutes={availableMinutes}
          onEnergyChange={setCurrentEnergy}
          onAvailableMinutesChange={setAvailableMinutes}
          showKeyboardHelp
        />
      </div>
      )}

      {/* Declutter & Focus controls */}
      {!compactControls && (
      <div
        data-testid="adaptive-mode-controls"
        className="absolute right-4 top-4 z-10 flex gap-2"
      >
        <Button
          variant={declutterMode ? "default" : "outline"}
          size="sm"
          onClick={() => setDeclutterMode(!declutterMode)}
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label="Toggle decluttered view"
          aria-pressed={declutterMode}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Button
          variant={focusMode ? "default" : "outline"}
          size="sm"
          onClick={() => setFocusMode(!focusMode)}
          className={COMPACT_ICON_BUTTON_CLASSES}
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
          className={COMPACT_ICON_BUTTON_CLASSES}
          aria-label={`Change bubble density. Current density: ${bubbleDensity}`}
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>
      )}

      {/* Status indicators */}
      {!compactControls && (
      <div data-shell-control="adaptive-status" className="absolute bottom-6 left-6 z-30 flex max-w-[calc(100%-2rem)] flex-wrap gap-2">
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
            className="h-11 bg-bubble-selected/90 px-3 text-xs backdrop-blur-sm sm:h-6 sm:px-2"
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
      )}

      <AdaptiveTaskNavigator
        projections={adaptiveProjections}
        onTaskSelect={handleTaskSelect}
        compact={compactControls}
      />

      {/* Performance Stats (Development) */}
      {process.env.NODE_ENV === 'development' && !compactControls && (
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
      className="rounded-full bg-transparent !p-0 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
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
          className="pointer-events-none mt-1 rounded bg-card/95 px-1.5 py-0.5 text-center text-xs font-medium text-card-foreground shadow-sm"
          style={{
            maxWidth: Math.max(96, r * 2.5),
            marginInline: 'auto',
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
