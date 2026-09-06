/**
 * Experimental Atomic renderer.
 *
 * Atomic layout is view-local and center-relative. The stationary viewport owns
 * input and measurement; only the inner world layer is transformed.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Bubble } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Pause,
  Play,
  Atom,
  Link2,
  Info,
  Target,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePanZoom } from '@/hooks/usePanZoom';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  fitViewportToWorldBounds,
  screenToWorld as canvasScreenToWorld,
  type CanvasDimensions,
  type CanvasPoint,
} from '@/lib/canvasGeometry';
import {
  isMotionEnabled,
  isReducedMotionPreferred,
  startAnimation,
  stopAnimation,
  subscribeToMotionState,
} from '@/lib/motion';
import { bubbleToTask } from '@/adapters/taskAdapter';
import {
  getHorizon,
  getHorizonDisplayName,
  ringIndexToHorizon,
} from '@/lib/horizon';
import { calculateMoleculePositions } from '@/experimental/atomic/positioning';
import { hapticsService } from '@/services/haptics';
import { interpolateOrbit, nearestFreeOrbitSlot, ORBIT_SETTLE_DURATION } from './orbitalMechanics';
import './atomic.css';
import { MoleculeBonds } from './MoleculeBonds';
import { buildMoleculeBonds } from './moleculeBondModel';

interface Electron {
  id: string;
  moleculeId: string;
  shell: number;
  angle: number;
  canvasSlot: number | null;
  content: string;
  originalBubble?: Bubble;
  settleFrom?: CanvasPoint;
  settleStartedAt?: number;
}

interface Molecule {
  id: string;
  x: number;
  y: number;
  nucleus: {
    domain: string;
  };
  electrons: Electron[];
  selected: boolean;
}

interface DragState {
  isDragging: boolean;
  type: 'electron' | 'molecule' | null;
  pointerId?: number;
  pointerType?: string;
  captureTarget?: HTMLElement;
  electronId?: string;
  moleculeId?: string;
  originalShell?: number;
  grabOffset?: CanvasPoint;
  startPointerWorld?: CanvasPoint;
  currentWorld?: CanvasPoint;
  originalMoleculePosition?: CanvasPoint;
  moved?: boolean;
}

interface AtomicState {
  molecules: Molecule[];
  selectedMolecules: string[];
  dragState: DragState;
}

const EMPTY_DRAG_STATE: DragState = {
  isDragging: false,
  type: null,
};

const SHELL_CONFIG = [
  {
    name: 'Today',
    radius: 64,
    color: '#B91C1C',
    highContrastColor: '#7F1D1D',
    canvasSlots: 8,
  },
  {
    name: 'Week',
    radius: 116,
    color: '#92400E',
    highContrastColor: '#78350F',
    canvasSlots: 14,
  },
  {
    name: 'Later',
    radius: 168,
    color: '#047857',
    highContrastColor: '#065F46',
    canvasSlots: 21,
  },
] as const;

const HORIZONS = ['today', 'week', 'later'] as const;
const MAX_SHELL_RADIUS = SHELL_CONFIG[SHELL_CONFIG.length - 1].radius;
const MOLECULE_FIT_RADIUS = MAX_SHELL_RADIUS + 36;
const MINIMUM_TARGET_SIZE = 44;
const DRAG_THRESHOLD = 8;
const ELECTRON_WORKING_SCALE = 0.9;
const MINIMUM_ATOMIC_SCALE = 0.14;
const COMPACT_VIEWPORT_HEIGHT = 420;
const WIDE_VIEWPORT_WIDTH = 768;
const SHORT_WIDE_VERTICAL_OFFSET = 24;

const ANIMATION_CONFIG = {
  electronSpeed: 0.00014,
  shellSpeedMultipliers: [1.2, 1, 0.8],
  maxElectronsForFastAnimation: 50,
} as const;

interface AtomicRendererProps {
  bubbles?: Bubble[];
  onBubbleSelect?: (bubble: Bubble) => void;
  onTimeHorizonUpdate?: (
    bubbleId: string,
    fromRing: number,
    toRing: number,
  ) => void;
  onMoleculeCreate?: (domain: string) => void;
  onMoleculeMerge?: (aId: string, bId: string) => void;
  reducedMotion?: boolean;
  highContrast?: boolean;
  className?: string;
}

function shellIndexForBubble(bubble: Bubble): number {
  const index = HORIZONS.indexOf(getHorizon(bubble) ?? 'today');
  return index < 0 ? 0 : index;
}

function getConfirmedDomainLinks(bubble: Bubble) {
  const seenDomainIds = new Set<string>();
  return (bubbleToTask(bubble).domainLinks ?? []).flatMap((link) => {
    const domainId = link.domainId.trim();
    if (!link.userConfirmed || !domainId || seenDomainIds.has(domainId)) {
      return [];
    }
    seenDomainIds.add(domainId);
    return [{ ...link, domainId }];
  });
}

function angleForCanvasSlot(shell: number, canvasSlot: number | null): number {
  if (canvasSlot === null) return 0;
  return (Math.PI * 2 * canvasSlot) / SHELL_CONFIG[shell].canvasSlots;
}

function nextAvailableCanvasSlot(
  shell: number,
  occupiedSlots: Set<number>,
  preferredSlot: number | null | undefined,
): number | null {
  const canvasSlots = SHELL_CONFIG[shell].canvasSlots;
  if (
    preferredSlot !== null
    && preferredSlot !== undefined
    && preferredSlot >= 0
    && preferredSlot < canvasSlots
    && !occupiedSlots.has(preferredSlot)
  ) {
    occupiedSlots.add(preferredSlot);
    return preferredSlot;
  }

  for (let slot = 0; slot < canvasSlots; slot += 1) {
    if (!occupiedSlots.has(slot)) {
      occupiedSlots.add(slot);
      return slot;
    }
  }
  return null;
}

function moveCanonicalTaskToShell(
  molecules: Molecule[],
  bubbleId: string,
  targetShell: number,
  preferredSlots = new Map<string, number | null>(),
  transition: {
    phase?: number;
    fromOffsets?: Map<string, CanvasPoint>;
    now?: number;
    animate?: boolean;
  } = {},
): Molecule[] {
  return molecules.map((molecule) => {
    if (!molecule.electrons.some(
      electron => electron.originalBubble?.id === bubbleId,
    )) {
      return molecule;
    }

    const occupiedSlots = new Set(
      molecule.electrons
        .filter(electron => (
          electron.originalBubble?.id !== bubbleId
          && electron.shell === targetShell
          && electron.canvasSlot !== null
        ))
        .map(electron => electron.canvasSlot as number),
    );

    return {
      ...molecule,
      electrons: molecule.electrons.map((electron) => {
        if (electron.originalBubble?.id !== bubbleId) return electron;
        const fromOffset = transition.fromOffsets?.get(electron.id);
        const preferredSlot = preferredSlots.has(electron.id)
          ? preferredSlots.get(electron.id)
          : fromOffset
            ? nearestFreeOrbitSlot(
                Math.atan2(fromOffset.y, fromOffset.x),
                SHELL_CONFIG[targetShell].canvasSlots,
                occupiedSlots,
                (transition.phase ?? 0) * ANIMATION_CONFIG.shellSpeedMultipliers[targetShell],
              )
            : electron.canvasSlot;
        const canvasSlot = nextAvailableCanvasSlot(
          targetShell,
          occupiedSlots,
          preferredSlot,
        );
        return {
          ...electron,
          shell: targetShell,
          canvasSlot,
          angle: angleForCanvasSlot(targetShell, canvasSlot),
          settleFrom: transition.animate ? fromOffset : undefined,
          settleStartedAt: transition.animate ? transition.now : undefined,
        };
      }),
    };
  });
}

function buildMolecules(
  inputBubbles: Bubble[],
  previousMolecules: Molecule[],
): Molecule[] {
  const bubblesByDomain = new Map<string, { label: string; bubbles: Bubble[] }>();
  inputBubbles.forEach((bubble) => {
    getConfirmedDomainLinks(bubble).forEach((link) => {
      const existing = bubblesByDomain.get(link.domainId) ?? {
        label: link.label?.trim() || link.domainId,
        bubbles: [],
      };
      existing.bubbles.push(bubble);
      bubblesByDomain.set(link.domainId, existing);
    });
  });

  const domainIds = Array.from(bubblesByDomain.keys());
  const layout = calculateMoleculePositions(domainIds);
  const previousById = new Map(
    previousMolecules.map(molecule => [molecule.id, molecule]),
  );
  const domainSetChanged = previousMolecules.length !== domainIds.length
    || domainIds.some(domainId => !previousById.has(`mol-${domainId}`));

  return domainIds.map((domainId, domainIndex) => {
    const id = `mol-${domainId}`;
    const previous = previousById.get(id);
    const domainGroup = bubblesByDomain.get(domainId)!;
    const domainBubbles = [...domainGroup.bubbles].sort((left, right) => (
      left.createdAt - right.createdAt || left.id.localeCompare(right.id)
    ));
    const previousElectrons = new Map(
      (previous?.electrons ?? []).map(electron => [electron.id, electron]),
    );
    const occupiedSlotsByShell = SHELL_CONFIG.map(() => new Set<number>());
    const reservedSlots = new Map<string, number>();

    domainBubbles.forEach((bubble) => {
      const shell = shellIndexForBubble(bubble);
      const electronId = `elec-${encodeURIComponent(bubble.id)}-${encodeURIComponent(domainId)}`;
      const previousElectron = previousElectrons.get(electronId);
      if (
        previousElectron?.shell !== shell
        || previousElectron.canvasSlot === null
        || previousElectron.canvasSlot < 0
        || previousElectron.canvasSlot >= SHELL_CONFIG[shell].canvasSlots
        || occupiedSlotsByShell[shell].has(previousElectron.canvasSlot)
      ) {
        return;
      }
      occupiedSlotsByShell[shell].add(previousElectron.canvasSlot);
      reservedSlots.set(electronId, previousElectron.canvasSlot);
    });

    return {
      id,
      x: domainSetChanged ? layout[domainIndex].x : previous?.x ?? layout[domainIndex].x,
      y: domainSetChanged ? layout[domainIndex].y : previous?.y ?? layout[domainIndex].y,
      nucleus: {
        domain: domainGroup.label,
      },
      selected: previous?.selected ?? false,
      electrons: domainBubbles.map((bubble) => {
        const shell = shellIndexForBubble(bubble);
        const electronId = `elec-${encodeURIComponent(bubble.id)}-${encodeURIComponent(domainId)}`;
        const canvasSlot = reservedSlots.get(electronId)
          ?? nextAvailableCanvasSlot(
            shell,
            occupiedSlotsByShell[shell],
            undefined,
          );
        return {
          id: electronId,
          moleculeId: id,
          shell,
          angle: angleForCanvasSlot(shell, canvasSlot),
          canvasSlot,
          content: bubble.content || '',
          originalBubble: bubble,
          settleFrom: previousElectrons.get(electronId)?.shell === shell
            ? previousElectrons.get(electronId)?.settleFrom : undefined,
          settleStartedAt: previousElectrons.get(electronId)?.shell === shell
            ? previousElectrons.get(electronId)?.settleStartedAt : undefined,
        };
      }),
    };
  });
}

function getElectronOrbitOffset(
  electron: Electron,
  animationStep: number,
  frameTime: number,
): CanvasPoint {
  const shell = SHELL_CONFIG[electron.shell] ?? SHELL_CONFIG[0];
  const speed = ANIMATION_CONFIG.shellSpeedMultipliers[electron.shell] ?? 1;
  // A paused orbit keeps its accumulated phase; pausing must never reset a task.
  const angle = electron.angle + animationStep * speed;
  const target = {
    x: Math.cos(angle) * shell.radius,
    y: Math.sin(angle) * shell.radius,
  };
  return electron.settleFrom && electron.settleStartedAt !== undefined
    ? interpolateOrbit(electron.settleFrom, target,
        (frameTime - electron.settleStartedAt) / ORBIT_SETTLE_DURATION)
    : target;
}

function getMoleculeBounds(molecules: Molecule[]) {
  if (molecules.length === 0) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  }

  return molecules.reduce(
    (bounds, molecule) => ({
      minX: Math.min(bounds.minX, molecule.x - MOLECULE_FIT_RADIUS),
      maxX: Math.max(bounds.maxX, molecule.x + MOLECULE_FIT_RADIUS),
      minY: Math.min(bounds.minY, molecule.y - MOLECULE_FIT_RADIUS),
      maxY: Math.max(bounds.maxY, molecule.y + MOLECULE_FIT_RADIUS),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

function closestShellIndex(distanceFromNucleus: number): number {
  const todayWeekBoundary = (SHELL_CONFIG[0].radius + SHELL_CONFIG[1].radius) / 2;
  const weekLaterBoundary = (SHELL_CONFIG[1].radius + SHELL_CONFIG[2].radius) / 2;
  if (distanceFromNucleus <= todayWeekBoundary) return 0;
  if (distanceFromNucleus <= weekLaterBoundary) return 1;
  return 2;
}

function pointerMoved(
  start: CanvasPoint,
  current: CanvasPoint,
  viewportScale: number,
): boolean {
  const worldDistance = Math.hypot(
    current.x - start.x,
    current.y - start.y,
  );
  return worldDistance * Math.max(0.01, viewportScale) >= DRAG_THRESHOLD;
}

function particleFlavor(bubble?: Bubble) {
  if (bubble?.type === 'Thought') return { name: 'Proton', symbol: '+', kind: 'proton', color: '#9A3E42' };
  if (bubble?.type === 'Memory' || bubble?.type === 'Mood') return { name: 'Neutron', symbol: '•', kind: 'neutron', color: '#555579' };
  return { name: 'Electron', symbol: '−', kind: 'electron', color: undefined };
}

interface AtomicTaskNavigatorProps {
  panelGroup: string;
  bubbles: readonly Bubble[];
  onOpenTask: (bubble: Bubble) => void;
  onHorizonChange: (bubble: Bubble, targetShell: number) => void;
}

function AtomicTaskNavigator({
  panelGroup,
  bubbles,
  onOpenTask,
  onHorizonChange,
}: AtomicTaskNavigatorProps) {
  const taskCount = bubbles.length;

  return (
    <details
      name={panelGroup}
      data-panel
      data-testid="atomic-task-navigator"
      className="absolute right-3 top-3 z-40 max-w-[min(23rem,calc(100%-7rem))] rounded-2xl border bg-card/95 text-card-foreground shadow-sm backdrop-blur-md"
    >
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Tasks ({taskCount})
      </summary>
      <ul
        aria-label="Atomic tasks by life domain and time horizon"
        className="max-h-[min(50vh,24rem)] space-y-1 overflow-y-auto border-t p-2"
      >
        {bubbles.map((bubble) => {
          const label = bubble.content || 'Untitled task';
          const confirmedDomains = getConfirmedDomainLinks(bubble)
            .map(link => link.label?.trim() || link.domainId);
          const domainDescription = confirmedDomains.length > 0
            ? confirmedDomains.join(', ')
            : 'No confirmed life-domain link';
          return (
            <li
              key={bubble.id}
              className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl p-1 hover:bg-muted"
            >
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  onOpenTask(bubble);
                }}
                aria-label={`Open ${label}. ${domainDescription}.`}
              >
                <span className="block truncate font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {domainDescription}
                </span>
              </button>
              <label className="sr-only" htmlFor={`atomic-horizon-${bubble.id}`}>
                Time horizon for {label}
              </label>
              <select
                id={`atomic-horizon-${bubble.id}`}
                value={shellIndexForBubble(bubble)}
                onChange={event => onHorizonChange(
                  bubble,
                  Number(event.target.value),
                )}
                className="h-11 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SHELL_CONFIG.map((shell, shellIndex) => (
                  <option key={shell.name} value={shellIndex}>
                    {shell.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export const AtomicRenderer: React.FC<AtomicRendererProps> = ({
  bubbles = [],
  onBubbleSelect,
  onTimeHorizonUpdate,
  reducedMotion = false,
  highContrast = false,
  className,
}) => {
  const panelGroup = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const atomicStateRef = useRef<AtomicState>({
    molecules: [],
    selectedMolecules: [],
    dragState: EMPTY_DRAG_STATE,
  });
  const dragStateRef = useRef<DragState>(EMPTY_DRAG_STATE);
  const dimensionsRef = useRef<CanvasDimensions>({ width: 0, height: 0 });
  const viewportTransformRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastAutoFitKeyRef = useRef('');
  const suppressClickRef = useRef<string | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [atomicState, setAtomicState] = useState<AtomicState>(
    atomicStateRef.current,
  );
  const [dimensions, setDimensions] = useState<CanvasDimensions>({
    width: 0,
    height: 0,
  });
  const [motionState, setMotionState] = useState(isMotionEnabled());
  const [atomicMotionRequested, setAtomicMotionRequested] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    isReducedMotionPreferred(),
  );
  const [animationStep, setAnimationStep] = useState(0);
  const [frameTime, setFrameTime] = useState(() => performance.now());
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const activeTaskId = hoveredTaskId ?? focusedTaskId;
  const interactionPaused = Boolean(activeTaskId);
  const [movementAnnouncement, setMovementAnnouncement] = useState('');

  const updateAtomicState = useCallback((
    updater: (previous: AtomicState) => AtomicState,
  ) => {
    setAtomicState((previous) => {
      const next = updater(previous);
      atomicStateRef.current = next;
      return next;
    });
  }, []);

  const setDragState = useCallback((dragState: DragState) => {
    dragStateRef.current = dragState;
    updateAtomicState(previous => ({ ...previous, dragState }));
  }, [updateAtomicState]);

  const {
    state: panZoomState,
    onPanStart,
    onPanMove,
    onPanEnd,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    zoomIn,
    zoomOut,
    setViewportTransform,
    cursor,
  } = usePanZoom({
    minScale: MINIMUM_ATOMIC_SCALE,
    maxScale: 2.5,
    getContainerRect: () => (
      viewportRef.current?.getBoundingClientRect() ?? null
    ),
  });
  viewportTransformRef.current = {
    x: panZoomState.x,
    y: panZoomState.y,
    scale: panZoomState.scale,
  };
  atomicStateRef.current = atomicState;
  dimensionsRef.current = dimensions;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setDimensions((previous) => {
        if (previous.width === rect.width && previous.height === rect.height) {
          return previous;
        }
        return { width: rect.width, height: rect.height };
      });
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure);
    observer?.observe(viewport);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    updateAtomicState(previous => ({
      ...previous,
      molecules: buildMolecules(bubbles, previous.molecules),
    }));
  }, [bubbles, updateAtomicState]);

  useEffect(() => subscribeToMotionState(setMotionState), []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setSystemReducedMotion(isReducedMotionPreferred());
    updatePreference();
    query.addEventListener('change', updatePreference);
    window.addEventListener('calmModeChange', updatePreference);
    return () => { query.removeEventListener('change', updatePreference); window.removeEventListener('calmModeChange', updatePreference); };
  }, []);

  const prefersReducedMotion = reducedMotion || systemReducedMotion;
  // Electrons stay still by default so their targets remain predictable.
  // Motion is an explicit, local sensory choice and the global/OS settings
  // still act as a ceiling.
  const motionEnabled = atomicMotionRequested
    && motionState
    && !prefersReducedMotion;
  const electronCount = useMemo(
    () => atomicState.molecules.reduce(
      (count, molecule) => count + molecule.electrons.length,
      0,
    ),
    [atomicState.molecules],
  );

  const hasSettlingElectrons = !prefersReducedMotion && motionState
    && atomicState.molecules.some(molecule => molecule.electrons.some(electron => (
      electron.settleStartedAt !== undefined
      && frameTime < electron.settleStartedAt + ORBIT_SETTLE_DURATION
    )));

  useEffect(() => {
    const canOrbit = motionEnabled && !interactionPaused && !atomicState.dragState.isDragging;
    if (!canOrbit && !hasSettlingElectrons) return;
    const speedMultiplier = electronCount > ANIMATION_CONFIG.maxElectronsForFastAnimation ? 0.5 : 1;
    let lastFrame = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min(48, Math.max(0, now - lastFrame));
      lastFrame = now;
      setFrameTime(now);
      if (canOrbit && !hasSettlingElectrons) {
        setAnimationStep(previous => previous + delta * ANIMATION_CONFIG.electronSpeed * speedMultiplier);
      }
    };
    startAnimation(animate);
    return () => stopAnimation(animate);
  }, [atomicState.dragState.isDragging, electronCount, hasSettlingElectrons, interactionPaused, motionEnabled]);

  const fitMolecules = useCallback(() => {
    const currentDimensions = dimensionsRef.current;
    const molecules = atomicStateRef.current.molecules;
    if (
      currentDimensions.width <= 0
      || currentDimensions.height <= 0
      || molecules.length === 0
    ) {
      return;
    }

    const fittedTransform = fitViewportToWorldBounds(
      getMoleculeBounds(molecules),
      currentDimensions,
      { padding: 56, minScale: MINIMUM_ATOMIC_SCALE, maxScale: 1 },
    );

    // A short landscape canvas needs the molecule field slightly above center
    // so the persistent bottom capture control does not cover the lower row.
    const y = currentDimensions.width >= WIDE_VIEWPORT_WIDTH
      && currentDimensions.height < COMPACT_VIEWPORT_HEIGHT
      ? fittedTransform.y - SHORT_WIDE_VERTICAL_OFFSET
      : fittedTransform.y;

    setViewportTransform({ ...fittedTransform, y });
  }, [setViewportTransform]);

  const moleculeBonds = useMemo(
    () => buildMoleculeBonds(atomicState.molecules),
    [atomicState.molecules],
  );

  const moleculeLayoutKey = useMemo(
    () => atomicState.molecules.map(molecule => molecule.id).join('|'),
    [atomicState.molecules],
  );

  useEffect(() => {
    if (!moleculeLayoutKey || dimensions.width <= 0 || dimensions.height <= 0) {
      return;
    }
    const key = `${dimensions.width}x${dimensions.height}:${moleculeLayoutKey}`;
    if (lastAutoFitKeyRef.current === key) return;
    lastAutoFitKeyRef.current = key;
    fitMolecules();
  }, [dimensions.height, dimensions.width, fitMolecules, moleculeLayoutKey]);

  const clientPointToWorld = useCallback((clientPoint: CanvasPoint) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const currentDimensions = dimensionsRef.current.width > 0
      && dimensionsRef.current.height > 0
      ? dimensionsRef.current
      : { width: rect.width, height: rect.height };

    return canvasScreenToWorld(
      {
        x: clientPoint.x - rect.left,
        y: clientPoint.y - rect.top,
      },
      viewportTransformRef.current,
      currentDimensions,
    );
  }, []);

  const updateElectronShell = useCallback((
    electron: Electron,
    targetShell: number,
    source: 'drag' | 'keyboard' | 'undo',
  ) => {
    const safeTarget = Math.max(0, Math.min(SHELL_CONFIG.length - 1, targetShell));
    const originalShell = electron.shell;
    if (safeTarget === originalShell && source !== 'drag') {
      setMovementAnnouncement(
        `${electron.content || 'Task'} is already in ${SHELL_CONFIG[originalShell].name}.`,
      );
      return;
    }

    const bubbleId = electron.originalBubble?.id;
    const originalSlots = new Map<string, number | null>();
    if (bubbleId) {
      atomicStateRef.current.molecules.forEach((molecule) => {
        molecule.electrons.forEach((candidate) => {
          if (candidate.originalBubble?.id === bubbleId) {
            originalSlots.set(candidate.id, candidate.canvasSlot);
          }
        });
      });
    }

    const fromOffsets = new Map<string, CanvasPoint>();
    atomicStateRef.current.molecules.forEach((molecule) => {
      molecule.electrons.forEach((candidate) => {
        if (candidate.originalBubble?.id !== bubbleId) return;
        const drag = dragStateRef.current;
        fromOffsets.set(candidate.id, drag.electronId === candidate.id && drag.currentWorld
          ? { x: drag.currentWorld.x - molecule.x, y: drag.currentWorld.y - molecule.y }
          : getElectronOrbitOffset(candidate, animationStep, frameTime));
      });
    });
    const now = performance.now();
    setFrameTime(now);
    updateAtomicState(previous => ({
      ...previous,
      molecules: bubbleId
        ? moveCanonicalTaskToShell(previous.molecules, bubbleId, safeTarget, new Map(), {
            phase: animationStep, fromOffsets, now,
            animate: !prefersReducedMotion && motionState,
          })
        : previous.molecules,
    }));
    if (safeTarget === originalShell) {
      setMovementAnnouncement(`${electron.content || 'Task'} placed on its ${SHELL_CONFIG[safeTarget].name} orbit.`);
      return;
    }

    if (electron.originalBubble) {
      onTimeHorizonUpdate?.(
        electron.originalBubble.id,
        originalShell,
        safeTarget,
      );
    }

    const targetHorizon = ringIndexToHorizon(safeTarget);
    const originalHorizon = ringIndexToHorizon(originalShell);
    setMovementAnnouncement(
      `${electron.content || 'Task'} moved to ${getHorizonDisplayName(targetHorizon)} by ${source}.`,
    );
    toast({
      title: `Moved to ${getHorizonDisplayName(targetHorizon)}`,
      description: `${electron.content || 'Task'} moved from ${getHorizonDisplayName(originalHorizon)}.`,
      action: source === 'undo' ? undefined : (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Undo moving ${electron.content || 'task'} to ${getHorizonDisplayName(targetHorizon)}`}
          onClick={() => {
            updateAtomicState(previous => ({
              ...previous,
              molecules: bubbleId
                ? moveCanonicalTaskToShell(
                  previous.molecules,
                  bubbleId,
                  originalShell,
                  originalSlots,
                )
                : previous.molecules,
            }));
            if (electron.originalBubble) {
              onTimeHorizonUpdate?.(
                electron.originalBubble.id,
                safeTarget,
                originalShell,
              );
            }
            setMovementAnnouncement(
              `${electron.content || 'Task'} returned to ${getHorizonDisplayName(originalHorizon)}.`,
            );
          }}
        >
          Undo
        </Button>
      ),
    });
  }, [animationStep, frameTime, motionState, onTimeHorizonUpdate, prefersReducedMotion, toast, updateAtomicState]);

  const startElectronDrag = useCallback((
    molecule: Molecule,
    electron: Electron,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      dragStateRef.current.isDragging
      || (event.pointerType === 'mouse' && event.button !== 0)
      || (event.pointerType === 'touch' && event.isPrimary === false)
    ) {
      return;
    }
    const pointerWorld = clientPointToWorld({
      x: event.clientX,
      y: event.clientY,
    });
    if (!pointerWorld) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const orbit = getElectronOrbitOffset(
      electron,
      animationStep,
      frameTime,
    );
    const electronWorld = {
      x: molecule.x + orbit.x,
      y: molecule.y + orbit.y,
    };
    const dragState: DragState = {
      isDragging: true,
      type: 'electron',
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      captureTarget: event.currentTarget,
      electronId: electron.id,
      moleculeId: molecule.id,
      originalShell: electron.shell,
      grabOffset: {
        x: electronWorld.x - pointerWorld.x,
        y: electronWorld.y - pointerWorld.y,
      },
      startPointerWorld: pointerWorld,
      currentWorld: electronWorld,
      moved: false,
    };
    setDragState(dragState);
    if (event.pointerType === 'touch' && hapticsService.isAvailable()) {
      hapticsService.trigger('light');
    }
  }, [animationStep, clientPointToWorld, frameTime, setDragState]);

  const startMoleculeDrag = useCallback((
    molecule: Molecule,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      dragStateRef.current.isDragging
      || (event.pointerType === 'mouse' && event.button !== 0)
      || (event.pointerType === 'touch' && event.isPrimary === false)
    ) {
      return;
    }
    const pointerWorld = clientPointToWorld({
      x: event.clientX,
      y: event.clientY,
    });
    if (!pointerWorld) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    setDragState({
      isDragging: true,
      type: 'molecule',
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      captureTarget: event.currentTarget,
      moleculeId: molecule.id,
      grabOffset: {
        x: molecule.x - pointerWorld.x,
        y: molecule.y - pointerWorld.y,
      },
      startPointerWorld: pointerWorld,
      currentWorld: { x: molecule.x, y: molecule.y },
      originalMoleculePosition: { x: molecule.x, y: molecule.y },
      moved: false,
    });
    if (event.pointerType === 'touch' && hapticsService.isAvailable()) {
      hapticsService.trigger('light');
    }
  }, [clientPointToWorld, setDragState]);

  const handleObjectPointerMove = useCallback((
    event: React.PointerEvent<HTMLElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (
      !dragState.isDragging
      || dragState.pointerId !== event.pointerId
      || !dragState.grabOffset
      || !dragState.startPointerWorld
    ) {
      return;
    }

    const pointerWorld = clientPointToWorld({
      x: event.clientX,
      y: event.clientY,
    });
    if (!pointerWorld) return;
    event.preventDefault();
    event.stopPropagation();

    const currentWorld = {
      x: pointerWorld.x + dragState.grabOffset.x,
      y: pointerWorld.y + dragState.grabOffset.y,
    };
    const nextDragState = {
      ...dragState,
      currentWorld,
      moved: dragState.moved
        || pointerMoved(
          dragState.startPointerWorld,
          pointerWorld,
          viewportTransformRef.current.scale,
        ),
    };
    dragStateRef.current = nextDragState;

    updateAtomicState(previous => ({
      ...previous,
      molecules: dragState.type === 'molecule' && nextDragState.moved
        ? previous.molecules.map(molecule => (
            molecule.id === dragState.moleculeId
              ? { ...molecule, x: currentWorld.x, y: currentWorld.y }
              : molecule
          ))
        : previous.molecules,
      dragState: nextDragState,
    }));
  }, [clientPointToWorld, updateAtomicState]);

  const finishObjectDrag = useCallback((
    event: React.PointerEvent<HTMLElement>,
    cancelled: boolean,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    const state = atomicStateRef.current;
    if (cancelled && dragState.type === 'molecule') {
      const original = dragState.originalMoleculePosition;
      if (original) {
        updateAtomicState(previous => ({
          ...previous,
          molecules: previous.molecules.map(molecule => (
            molecule.id === dragState.moleculeId
              ? { ...molecule, x: original.x, y: original.y }
              : molecule
          )),
        }));
      }
    } else if (
      !cancelled
      && dragState.type === 'electron'
      && dragState.electronId
      && dragState.currentWorld
      && dragState.moved
    ) {
      const electron = state.molecules
        .flatMap(molecule => molecule.electrons)
        .find(candidate => candidate.id === dragState.electronId);
      if (electron) {
        const owningMolecule = state.molecules.find(
          molecule => molecule.id === dragState.moleculeId,
        );
        if (owningMolecule) {
          const distanceFromOwningNucleus = Math.hypot(
            dragState.currentWorld.x - owningMolecule.x,
            dragState.currentWorld.y - owningMolecule.y,
          );
          updateElectronShell(
            electron,
            closestShellIndex(distanceFromOwningNucleus),
            'drag',
          );
          if (
            dragState.pointerType === 'touch'
            && hapticsService.isAvailable()
          ) {
            hapticsService.trigger('medium');
          }
        }
      }
    } else if (
      !cancelled
      && dragState.type === 'molecule'
      && dragState.moleculeId
      && dragState.currentWorld
      && dragState.moved
    ) {
      const molecule = state.molecules.find(
        candidate => candidate.id === dragState.moleculeId,
      );
      if (molecule) {
        setMovementAnnouncement(
          `${molecule.nucleus.domain} molecule moved. This experimental layout change is view-only and is not saved.`,
        );
      }
    }

    if (!cancelled && dragState.moved) {
      suppressClickRef.current = `${dragState.type}:${
        dragState.type === 'electron'
          ? dragState.electronId
          : dragState.moleculeId
      }`;
    } else if (cancelled) {
      suppressClickRef.current = null;
    }
    setDragState({ ...EMPTY_DRAG_STATE });
    const captureTarget = dragState.captureTarget;
    if (captureTarget?.hasPointerCapture?.(event.pointerId)) {
      captureTarget.releasePointerCapture?.(event.pointerId);
    }
  }, [setDragState, updateAtomicState, updateElectronShell]);

  const handleViewportPointerMove = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (dragStateRef.current.isDragging) {
      handleObjectPointerMove(event);
      return;
    }
    onPanMove(event);
  }, [handleObjectPointerMove, onPanMove]);

  const handleViewportPointerEnd = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    if (dragStateRef.current.isDragging) {
      finishObjectDrag(event, cancelled);
      return;
    }
    onPanEnd(event);
  }, [finishObjectDrag, onPanEnd]);

  const shouldSuppressClick = useCallback((key: string) => {
    if (suppressClickRef.current !== key) return false;
    suppressClickRef.current = null;
    return true;
  }, []);

  const selectMolecule = useCallback((
    moleculeId: string,
    additive = false,
  ) => {
    const chosen = atomicStateRef.current.molecules.find(molecule => molecule.id === moleculeId);
    if (chosen && !additive && viewportTransformRef.current.scale < ELECTRON_WORKING_SCALE) {
      setViewportTransform({ x: -chosen.x, y: -chosen.y, scale: 1 });
    }
    updateAtomicState((previous) => {
      const selectedMolecules = additive
        ? previous.selectedMolecules.includes(moleculeId)
          ? previous.selectedMolecules.filter(id => id !== moleculeId)
          : [...previous.selectedMolecules, moleculeId]
        : [moleculeId];
      return {
        ...previous,
        selectedMolecules,
        molecules: previous.molecules.map(molecule => ({
          ...molecule,
          selected: selectedMolecules.includes(molecule.id),
        })),
      };
    });
  }, [setViewportTransform, updateAtomicState]);

  const moveMoleculeWithKeyboard = useCallback((
    molecule: Molecule,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const direction = {
      ArrowUp: { x: 0, y: -1, label: 'up' },
      ArrowDown: { x: 0, y: 1, label: 'down' },
      ArrowLeft: { x: -1, y: 0, label: 'left' },
      ArrowRight: { x: 1, y: 0, label: 'right' },
    }[event.key];
    if (!direction) return false;
    event.preventDefault();
    event.stopPropagation();
    const screenStep = event.shiftKey ? 1 : 10;
    const worldStep = screenStep
      / Math.max(0.01, viewportTransformRef.current.scale);
    updateAtomicState(previous => ({
      ...previous,
      molecules: previous.molecules.map(candidate => (
        candidate.id === molecule.id
          ? {
              ...candidate,
              x: candidate.x + (direction.x * worldStep),
              y: candidate.y + (direction.y * worldStep),
            }
          : candidate
      )),
    }));
    setMovementAnnouncement(
      `${molecule.nucleus.domain} molecule moved ${direction.label} ${screenStep} ${screenStep === 1 ? 'pixel' : 'pixels'}. This view-only position is not saved.`,
    );
    return true;
  }, [updateAtomicState]);

  const toggleMotion = useCallback(() => {
    if (prefersReducedMotion) return;
    setAtomicMotionRequested(previous => !previous);
  }, [prefersReducedMotion]);

  const handleCanvasTouchStart = useCallback((event: React.TouchEvent) => {
    if (dragStateRef.current.isDragging) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-electron], [data-molecule]')) return;
    onTouchStart(event);
  }, [onTouchStart]);

  const handleCanvasTouchMove = useCallback((event: React.TouchEvent) => {
    if (dragStateRef.current.isDragging) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-electron], [data-molecule]')) return;
    onTouchMove(event);
  }, [onTouchMove]);

  const handleCanvasTouchEnd = useCallback((event: React.TouchEvent) => {
    if (dragStateRef.current.isDragging) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-electron], [data-molecule]')) return;
    onTouchEnd(event);
  }, [onTouchEnd]);

  const activeTaskPoints = activeTaskId ? atomicState.molecules.flatMap(molecule => {
    const electron = molecule.electrons.find(candidate => candidate.originalBubble?.id === activeTaskId && candidate.canvasSlot !== null);
    if (!electron) return [];
    const drag = atomicState.dragState;
    if (drag.electronId === electron.id && drag.currentWorld) return [drag.currentWorld];
    const orbit = getElectronOrbitOffset(electron, animationStep, frameTime);
    return [{ x: molecule.x + orbit.x, y: molecule.y + orbit.y }];
  }) : [];

  const minimumWorldTargetSize = MINIMUM_TARGET_SIZE
    / Math.max(0.01, panZoomState.scale);
  const visualScaleCompensation = 1 / Math.min(1, panZoomState.scale);
  const electronTargetSize = Math.max(MINIMUM_TARGET_SIZE, minimumWorldTargetSize);
  const nucleusVisualSize = 48 * visualScaleCompensation;
  const nucleusTargetSize = Math.max(nucleusVisualSize, minimumWorldTargetSize);
  const showElectronControls = panZoomState.scale >= ELECTRON_WORKING_SCALE;
  const compactControls = isMobile || (
    dimensions.height > 0
    && dimensions.height < COMPACT_VIEWPORT_HEIGHT
  );
  const motionStatus = prefersReducedMotion
    ? 'Motion off: reduced-motion preference'
    : !motionState
      ? 'Motion off: sensory setting'
      : motionEnabled
        ? 'Motion on'
        : 'Motion off by default';
  const motionButtonLabel = prefersReducedMotion
    ? 'Motion disabled by reduced-motion preference'
    : !motionState
      ? 'Motion disabled by sensory setting'
      : motionEnabled
        ? 'Pause Atomic motion'
        : 'Play optional Atomic motion';
  const atomicControlCards = (
    <>
      <Card className="flex w-fit gap-1 rounded-2xl bg-card/90 p-1 shadow-sm backdrop-blur-md">
        <Button
          variant="outline"
          className="h-11 w-11 p-0"
          onClick={toggleMotion}
          disabled={prefersReducedMotion || !motionState}
          aria-label={motionButtonLabel}
          aria-pressed={motionEnabled}
          title={motionButtonLabel}
        >
          {motionEnabled
            ? <Pause aria-hidden="true" className="h-4 w-4" />
            : <Play aria-hidden="true" className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          className="h-11 w-11 p-0"
          onClick={zoomIn}
          aria-label="Zoom in on Atomic view"
          title="Zoom in"
        >
          <ZoomIn aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="h-11 w-11 p-0"
          onClick={zoomOut}
          aria-label="Zoom out of Atomic view"
          title="Zoom out"
        >
          <ZoomOut aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="h-11 w-11 p-0"
          onClick={fitMolecules}
          aria-label="Fit all molecules in Atomic view"
          title="Fit all molecules"
        >
          <Target aria-hidden="true" className="h-4 w-4" />
        </Button>
      </Card>

    </>
  );

  return (
    <div
      className={`atomic-scene relative h-full w-full overflow-hidden bg-background ${className ?? ''}`}
      data-reduced-motion={prefersReducedMotion}
      data-high-contrast={highContrast}
    >
      <div
        ref={viewportRef}
        data-testid="atomic-viewport"
        className="absolute inset-0 overflow-hidden"
        role="region"
        aria-label="Atomic view (experimental)"
        aria-describedby="atomic-view-instructions"
        onWheel={onWheel}
        onPointerDown={onPanStart}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={event => handleViewportPointerEnd(event, false)}
        onPointerCancel={event => handleViewportPointerEnd(event, true)}
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleCanvasTouchMove}
        onTouchEnd={handleCanvasTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{ cursor, touchAction: 'none' }}
      >
        <p id="atomic-view-instructions" className="sr-only">
          Your life, connected. Each nucleus is a life area you chose. A bond means the same task belongs to both areas, without duplicating the task.
          Experimental Atomic view. Drag empty space to pan and use the zoom
          controls to change scale. At overview scale, use the Tasks navigator
          to open a task or change its Today, Week, or Later horizon. When
          zoomed in, electron buttons open tasks with Enter or Space and arrow
          keys change horizon. Molecule buttons select a life domain; arrow
          keys move its view-only position. Molecule positions are not saved,
          and orbit motion is off until you explicitly play it. Hover or focus a particle to pause the orbits. Electrons are actions, protons are thoughts, and neutrons are memories or moods; this is a personal metaphor.
        </p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {movementAnnouncement}
        </p>

        <div
          data-testid="atomic-world-layer"
          className="absolute inset-0"
          style={{
            transform: `translate(${panZoomState.x}px, ${panZoomState.y}px) scale(${panZoomState.scale})`,
            transformOrigin: 'center',
            willChange: 'transform',
          }}
        >
          <MoleculeBonds bonds={moleculeBonds} scale={panZoomState.scale} selectedIds={atomicState.selectedMolecules} activeTaskPoints={activeTaskPoints} />
          {atomicState.molecules.map((molecule) => (
            <div
              key={molecule.id}
              className="group absolute h-0 w-0"
              style={{
                left: `calc(50% + ${molecule.x}px)`,
                top: `calc(50% + ${molecule.y}px)`,
              }}
            >
              {SHELL_CONFIG.map((shell, shellIndex) => {
                const count = molecule.electrons.filter(
                  electron => electron.shell === shellIndex,
                ).length;
                const shownCount = Math.min(count, shell.canvasSlots);
                const displayRadius = showElectronControls ? shell.radius
                  : Math.max(shell.radius, (36 + shellIndex * 6) * visualScaleCompensation);
                const shellColor = highContrast
                  ? shell.highContrastColor
                  : shell.color;
                return (
                  <div
                    key={shell.name}
                    aria-hidden="true"
                    data-drop-target={atomicState.dragState.moleculeId === molecule.id
                      && atomicState.dragState.type === 'electron'
                      && !!atomicState.dragState.currentWorld
                      && closestShellIndex(Math.hypot(
                        atomicState.dragState.currentWorld.x - molecule.x,
                        atomicState.dragState.currentWorld.y - molecule.y,
                      )) === shellIndex}
                    className="atomic-orbit pointer-events-none absolute rounded-full"
                    style={{
                      width: displayRadius * 2,
                      height: displayRadius * 2,
                      left: -displayRadius,
                      top: -displayRadius,
                      '--orbit-color': shellColor,
                      '--orbit-glow': `${shellColor}0c`,
                    } as React.CSSProperties}
                  >
                    {showElectronControls ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-foreground">
                      {shell.name}{count > shell.canvasSlots ? ` · +${count - shownCount} in Tasks` : ''}
                    </span> : null}
                  </div>
                );
              })}

              {!showElectronControls ? molecule.electrons.filter(electron => electron.canvasSlot !== null).map(electron => {
                const orbit = getElectronOrbitOffset(electron, animationStep, frameTime);
                const displayRadius = Math.max(SHELL_CONFIG[electron.shell].radius, (36 + electron.shell * 6) * visualScaleCompensation);
                const radiusRatio = displayRadius / SHELL_CONFIG[electron.shell].radius;
                const dotSize = Math.max(14, 7 * visualScaleCompensation);
                const flavor = particleFlavor(electron.originalBubble);
                return <span key={electron.id} aria-hidden="true" data-overview-particle
                  className="atomic-particle pointer-events-none absolute rounded-full border border-white/60"
                  data-particle={flavor.kind}
                  style={{ left: orbit.x * radiusRatio - dotSize / 2, top: orbit.y * radiusRatio - dotSize / 2, width: dotSize, height: dotSize,
                    backgroundColor: flavor.color ?? SHELL_CONFIG[electron.shell].color }} />;
              }) : null}

              {showElectronControls ? molecule.electrons
                .filter(electron => electron.canvasSlot !== null)
                .map((electron) => {
                const isDragging = atomicState.dragState.isDragging
                  && atomicState.dragState.type === 'electron'
                  && atomicState.dragState.electronId === electron.id;
                const orbit = getElectronOrbitOffset(
                  electron,
                  animationStep,
                  frameTime,
                );
                const electronWorld = isDragging
                  && atomicState.dragState.currentWorld
                  ? atomicState.dragState.currentWorld
                  : {
                      x: molecule.x + orbit.x,
                      y: molecule.y + orbit.y,
                    };
                const localPosition = {
                  x: electronWorld.x - molecule.x,
                  y: electronWorld.y - molecule.y,
                };
                const shell = SHELL_CONFIG[electron.shell] ?? SHELL_CONFIG[0];
                const shellColor = highContrast
                  ? shell.highContrastColor
                  : shell.color;
                const label = electron.content || 'Untitled task';
                const flavor = particleFlavor(electron.originalBubble);
                const visualSize = (
                  electron.originalBubble?.type === 'Task' ? 32 : 26
                ) * visualScaleCompensation;

                return (
                  <button
                    key={electron.id}
                    type="button"
                    data-electron="true"
                    data-electron-id={electron.id}
                    data-minimum-screen-target={MINIMUM_TARGET_SIZE}
                    className={`group/electron absolute z-10 flex cursor-grab items-center justify-center rounded-full bg-transparent !p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isDragging ? 'z-50 cursor-grabbing' : 'z-30'
                    }`}
                    style={{
                      left: localPosition.x - (electronTargetSize / 2),
                      top: localPosition.y - (electronTargetSize / 2),
                      width: electronTargetSize,
                      height: electronTargetSize,
                    }}
                    aria-label={`${label}. ${molecule.nucleus.domain} molecule. ${shell.name} horizon. ${flavor.name}. Open with Enter; use arrow keys to change horizon.`}
                    aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight"
                    title={label}
                    onMouseEnter={() => setHoveredTaskId(electron.originalBubble?.id ?? null)}
                    onMouseLeave={() => setHoveredTaskId(null)}
                    onFocus={() => setFocusedTaskId(electron.originalBubble?.id ?? null)}
                    onBlur={() => setFocusedTaskId(null)}
                    onPointerDown={event => startElectronDrag(molecule, electron, event)}
                    onClick={() => {
                      if (shouldSuppressClick(`electron:${electron.id}`)) return;
                      if (electron.originalBubble) {
                        onBubbleSelect?.(electron.originalBubble);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        if (electron.originalBubble) {
                          onBubbleSelect?.(electron.originalBubble);
                        }
                        return;
                      }
                      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                        event.preventDefault();
                        event.stopPropagation();
                        updateElectronShell(electron, electron.shell - 1, 'keyboard');
                      } else if (
                        event.key === 'ArrowDown'
                        || event.key === 'ArrowRight'
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        updateElectronShell(electron, electron.shell + 1, 'keyboard');
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      data-particle={flavor.kind}
                      className={`atomic-particle flex items-center justify-center rounded-full border-2 border-white/75 text-xs font-bold text-white ${
                        motionEnabled ? 'transition-transform hover:scale-110' : ''
                      } ${isDragging ? 'scale-110 shadow-lg' : ''}`}
                      style={{
                        width: visualSize,
                        height: visualSize,
                        backgroundColor: flavor.color ?? shellColor,
                        fontSize: 16 * visualScaleCompensation,
                      }}
                    >
                      {flavor.symbol}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-1/2 top-full z-50 mt-1 max-w-40 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg group-hover/electron:opacity-100 group-focus-visible/electron:opacity-100 ${
                        motionEnabled ? 'transition-opacity' : ''
                      }`}
                      style={{ fontSize: 12 * visualScaleCompensation, lineHeight: 1.35, whiteSpace: 'normal', width: 160 * visualScaleCompensation }}
                    >
                      {label}
                    </span>
                  </button>
                );
              }) : null}

              <button
                type="button"
                data-molecule="true"
                data-molecule-id={molecule.id}
                data-minimum-screen-target={MINIMUM_TARGET_SIZE}
                className="absolute z-20 flex cursor-grab items-center justify-center rounded-full bg-transparent !p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: -(nucleusTargetSize / 2),
                  top: -(nucleusTargetSize / 2),
                  width: nucleusTargetSize,
                  height: nucleusTargetSize,
                }}
                aria-label={`${molecule.nucleus.domain} molecule, ${molecule.electrons.length} ${molecule.electrons.length === 1 ? 'task' : 'tasks'}${molecule.selected ? ', selected' : ''}. Press Enter to select and focus; use arrow keys to move the view-only position.`}
                aria-pressed={molecule.selected}
                aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight"
                onPointerDown={event => startMoleculeDrag(molecule, event)}
                onClick={(event) => {
                  if (shouldSuppressClick(`molecule:${molecule.id}`)) return;
                  selectMolecule(molecule.id, event.shiftKey);
                }}
                onKeyDown={(event) => {
                  if (moveMoleculeWithKeyboard(molecule, event)) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    selectMolecule(molecule.id, event.shiftKey);
                  }
                }}
              >
                <span
                  aria-hidden="true"
                  data-selected={molecule.selected}
                  className="atomic-nucleus flex items-center justify-center rounded-full border border-white/70 font-bold text-white"
                  style={{ width: nucleusVisualSize, height: nucleusVisualSize }}
                >
                  {[{ x: 13, y: 10 }, { x: 46, y: 15 }, { x: 5, y: 43 }, { x: 38, y: 46 }, { x: 30, y: 30 }].map((particle, index) => (
                    <span key={index} className="atomic-nucleon" data-kind={index % 2 ? 'neutron' : 'proton'}
                      style={{ left: `${particle.x}%`, top: `${particle.y}%` }} />
                  ))}
                </span>
                <span
                  aria-hidden="true"
                  className="atomic-nucleus-label pointer-events-none absolute rounded-full px-3 py-1 text-center text-xs font-semibold"
                  style={{ fontSize: 12 * visualScaleCompensation, lineHeight: 1.3,
                    top: nucleusTargetSize / 2 + Math.max(MAX_SHELL_RADIUS, showElectronControls ? 0 : 48 * visualScaleCompensation) + 8 * visualScaleCompensation,
                    width: 'max-content', maxWidth: 160 * visualScaleCompensation }}
                >
                  {molecule.nucleus.domain}
                </span>
              </button>

            </div>
          ))}
        </div>
      </div>

      {compactControls ? (
        <details
          name={panelGroup}
          data-panel
          data-testid="atomic-mobile-view-controls"
          className="absolute left-3 top-3 z-40 rounded-2xl border bg-card/95 text-card-foreground shadow-sm backdrop-blur-md"
        >
          <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {showElectronControls ? 'View' : 'Overview'}
          </summary>
          <div className="absolute left-0 top-14 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-md border bg-card/95 p-2 shadow-xl backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 bg-background/90"><Atom className="h-3 w-3" aria-hidden="true" /> Life molecules</Badge>
              <Badge variant="secondary" aria-live="polite">
                {motionStatus}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">{atomicControlCards}</div>
          </div>
        </details>
      ) : (
        <div
          data-panel
          data-testid="atomic-desktop-view-controls"
          className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-9rem)] flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 bg-background/90"><Atom className="h-3 w-3" aria-hidden="true" /> Life molecules</Badge>
            <Badge variant="secondary" aria-live="polite">
              {motionStatus}
            </Badge>
          </div>
          {atomicControlCards}
        </div>
      )}

      <AtomicTaskNavigator
        panelGroup={panelGroup}
        bubbles={bubbles}
        onOpenTask={(bubble) => onBubbleSelect?.(bubble)}
        onHorizonChange={(bubble, targetShell) => {
          const linkedElectron = atomicStateRef.current.molecules
            .flatMap(molecule => molecule.electrons)
            .find(electron => electron.originalBubble?.id === bubble.id);
          updateElectronShell(linkedElectron ?? {
            id: `task-${bubble.id}`,
            moleculeId: '',
            shell: shellIndexForBubble(bubble),
            angle: 0,
            canvasSlot: null,
            content: bubble.content || '',
            originalBubble: bubble,
          }, targetShell, 'keyboard');
        }}
      />

      {!showElectronControls && electronCount > 0 ? (
        <p data-testid="atomic-overview-hint" className="sr-only" role="status">
          Overview. Zoom in to move task electrons, or use the Tasks navigator.
        </p>
      ) : null}

      <div data-panel className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 right-3 z-30 flex items-end justify-between gap-2">
        <details name={panelGroup} className="relative max-w-[min(22rem,calc(100%-8rem))] rounded-2xl border bg-card/95 text-card-foreground shadow-sm backdrop-blur-md">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Info className="h-4 w-4" aria-hidden="true" /> How it works</summary>
          <div className="absolute bottom-14 left-0 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-2xl border bg-card p-4 text-sm shadow-lg" data-testid="atomic-metaphor-guide">
            <p><strong>Your life, connected.</strong> A nucleus is a life area you chose. Link one task to several areas to see a molecule form.</p>
            <ul className="space-y-2 text-xs">
              <li><strong>− Electrons:</strong> tasks and reminders; things you can act on.</li>
              <li><strong>+ Protons:</strong> thoughts; ideas with a little spark.</li>
              <li><strong>• Neutrons:</strong> memories and moods; context worth holding.</li>
            </ul>
            <p className="text-xs text-muted-foreground">A personal metaphor. Drag a particle to Today, Week, or Later. The highlighted ring shows where it will land. Hover or focus to steady the scene.</p>
            <p className="text-xs text-muted-foreground">Bonds show your confirmed connections. A shared task stays one task everywhere. Hover or focus it to trace its matching particles. Dragging a nucleus changes this view only.</p>
          </div>
        </details>
        <details name={panelGroup} className="relative max-w-[min(23rem,55%)] rounded-2xl border bg-card/95 text-card-foreground shadow-sm backdrop-blur-md">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Link2 className="h-4 w-4" aria-hidden="true" /> Connections ({moleculeBonds.length})</summary>
          <div className="absolute bottom-14 right-0 max-h-[min(50vh,24rem)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-card p-3 shadow-lg" data-testid="atomic-connections-panel">
            {moleculeBonds.length === 0 ? <p className="p-2 text-sm text-muted-foreground">Open a task and add more than one life connection. Its areas will be joined here.</p> : (
              <ul aria-label="Shared tasks connecting life areas" className="space-y-3">
                {moleculeBonds.map(bond => <li key={bond.id}>
                  <p className="px-2 text-xs font-semibold text-muted-foreground">{bond.from.nucleus.domain} ↔ {bond.to.nucleus.domain}</p>
                  {bond.tasks.map(task => <button key={task.id} type="button" onClick={() => onBubbleSelect?.(task)}
                    className="min-h-11 w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open ${task.content || 'Untitled task'}, shared by ${bond.from.nucleus.domain} and ${bond.to.nucleus.domain}`}>
                    {task.content || 'Untitled task'}
                  </button>)}
                </li>)}
              </ul>
            )}
          </div>
        </details>
      </div>
      {atomicState.molecules.length === 0 ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Atom className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Make room for connections</h2>
          <p className="mt-2 text-sm text-muted-foreground">Add a bubble, then choose the life areas it touches. Your first nucleus appears here. A task linked to two areas brings them together.</p>
        </div>
      </div> : null}
    </div>
  );
};
