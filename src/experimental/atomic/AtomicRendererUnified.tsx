/**
 * Unified Atomic Renderer - Single source of truth for atomic view
 * Features: unified interactions, shell snapping with undo, multi-select, motion control
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bubble } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  Undo2, Zap, RotateCcw, Home, Calendar, Clock, Plus, 
  ZoomIn, ZoomOut, Move, Shuffle, Target, MousePointer2,
  Play, Pause
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePanZoom } from '@/hooks/usePanZoom';
import { startAnimation, stopAnimation, toggleAnimation, isMotionEnabled, subscribeToMotionState } from '@/lib/motion';
import { classifyDomain, getAllDomains } from '@/lib/classifyDomain';
import { getHorizon, getHorizonDisplayName, ringIndexToHorizon } from '@/lib/horizon';
import { calculateMoleculePositions } from '@/experimental/atomic/positioning';
import { useMoleculePositionPersistence } from '@/hooks/useMoleculePositionPersistence';
import { hapticsService } from '@/services/haptics';
import { TaskCard, TaskCardConfigs } from '@/components/TaskCard';

// Atomic structures
interface Electron {
  id: string;
  moleculeId: string;
  shell: number; // 0=today, 1=week, 2=later
  angle: number;
  phase: number;
  content: string;
  originalBubble?: Bubble;
}

interface Molecule {
  id: string;
  x: number;
  y: number;
  nucleus: {
    protons: number;
    neutrons: number;
    domain: string;
  };
  electrons: Electron[];
  selected: boolean;
  pulseActive: boolean;
}

interface AtomicState {
  molecules: Molecule[];
  selectedMolecules: string[];
  dragState: {
    isDragging: boolean;
    type?: 'electron' | 'molecule';
    electronId?: string;
    moleculeId?: string;
    lastMousePos?: { x: number; y: number };
    hoveredShell?: number;
    originalShell?: number; // Store the electron's starting shell
    dragOffset?: { x: number; y: number }; // Visual drag offset
    currentMousePos?: { x: number; y: number }; // Real-time mouse position
    dragStartPos?: { x: number; y: number }; // Initial drag position for absolute positioning
  };
  undoStack: AtomicState[];
}

// Domain configuration using canonical classification
const DOMAIN_PRESETS = getAllDomains().map((domain, index) => ({
  name: domain,
  color: ['#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#F59E0B', '#6B7280'][index] || '#6B7280',
  nucleus: { protons: index + 3, neutrons: index + 3, domain }
}));

// Shell configuration mapped to horizons
const SHELL_CONFIG = [
  { name: 'Today', radius: 60, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 100, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 140, color: '#10B981', icon: Clock, maxElectrons: 32 }
];

// Animation configuration
const ANIMATION_CONFIG = {
  ELECTRON_SPEED: 0.012, // Balanced electron orbit speed
  SHELL_SPEED_MULTIPLIERS: [1.2, 1.0, 0.8], // Today faster, Later slower
  MAX_ELECTRONS_FOR_FAST_ANIMATION: 50 // Reduce speed further with many electrons
};

interface AtomicRendererProps {
  bubbles?: Bubble[];
  onBubbleSelect?: (bubble: Bubble) => void;
  onTimeHorizonUpdate?: (bubbleId: string, fromRing: number, toRing: number) => void;
  onMoleculeCreate?: (domain: string) => void;
  onMoleculeMerge?: (aId: string, bId: string) => void;
  reducedMotion?: boolean;
  highContrast?: boolean;
  className?: string;
}

export const AtomicRenderer: React.FC<AtomicRendererProps> = ({ 
  bubbles = [], 
  onBubbleSelect, 
  onTimeHorizonUpdate,
  onMoleculeCreate,
  onMoleculeMerge,
  reducedMotion = false,
  highContrast = false,
  className 
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { updateDomainBubblesPosition, lockPosition, unlockPosition } = useMoleculePositionPersistence();
  
  // Animation performance cache
  const animationRef = useRef<{ electronCount?: number }>();
  
  // State management
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecules: [],
    dragState: {
      isDragging: false,
      type: null
    },
    undoStack: []
  });
  
  const [viewport, setViewport] = useState({ width: 800, height: 600, scale: 1, x: 0, y: 0 });
  const [motionState, setMotionState] = useState(isMotionEnabled());
  const [animationStep, setAnimationStep] = useState(0);

  // Pan/zoom setup
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
    getContainerRect: () => canvasRef.current?.getBoundingClientRect() || null,
    onStateChange: (state) => {
      setViewport(prev => ({
        ...prev,
        x: state.x,
        y: state.y,
        scale: state.scale
      }));
    }
  });

  // Convert an absolute screen point to canvas world coordinates.
  // Must mirror the render transform: translate(pan) scale(scale) with transformOrigin: center.
  const screenToWorld = useCallback((screenX: number, screenY: number, rect: DOMRect) => {
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: cx + (screenX - rect.left - cx - panZoomState.x) / panZoomState.scale,
      y: cy + (screenY - rect.top - cy - panZoomState.y) / panZoomState.scale,
    };
  }, [panZoomState.x, panZoomState.y, panZoomState.scale]);

  // Debounced molecule converter to prevent rapid re-conversions
  const debouncedConvertRef = useRef<NodeJS.Timeout>();
  const lastConversionRef = useRef<Bubble[]>([]);
  
  const convertBubblesToMolecules = useCallback((inputBubbles: Bubble[]): Molecule[] => {
    // Position tolerance - ignore tiny changes
    const POSITION_TOLERANCE = 5;
    
    // Check if we need to rebuild at all
    const bubblesChanged = inputBubbles.length !== lastConversionRef.current.length ||
      inputBubbles.some((bubble, i) => {
        const lastBubble = lastConversionRef.current[i];
        if (!lastBubble) return true;
        
        const positionChanged = Math.abs((bubble.x || 0) - (lastBubble.x || 0)) > POSITION_TOLERANCE ||
                               Math.abs((bubble.y || 0) - (lastBubble.y || 0)) > POSITION_TOLERANCE;
        return bubble.id !== lastBubble.id || 
               bubble.content !== lastBubble.content ||
               positionChanged;
      });
    
    if (!bubblesChanged && atomicState.molecules.length > 0) {
      // Return existing molecules with preserved animation state
      return atomicState.molecules;
    }
    
    lastConversionRef.current = inputBubbles;
    const moleculeMap = new Map<string, Molecule>();
    
    // Preserve existing molecule positions and animation states
    const existingMolecules = new Map<string, Molecule>();
    atomicState.molecules.forEach(mol => {
      existingMolecules.set(mol.id, mol);
    });
    
    // Step 1: Collect all unique domains first
    const uniqueDomains = [...new Set(inputBubbles.map(bubble => classifyDomain(bubble)))];
    
    // Step 2: Calculate global positions for new domains only
    const newDomains = uniqueDomains.filter(domain => !existingMolecules.has(`mol-${domain}`));
    const globalPositions = newDomains.length > 0 ? calculateMoleculePositions(newDomains) : [];
    const domainPositionMap = new Map<string, { x: number; y: number }>();
    
    newDomains.forEach((domain, index) => {
      const position = globalPositions[index];
      if (position) {
        domainPositionMap.set(domain, { x: position.x, y: position.y });
      }
    });

    inputBubbles.forEach((bubble, index) => {
      const domain = classifyDomain(bubble);
      const domainPreset = DOMAIN_PRESETS.find(p => p.name === domain) || DOMAIN_PRESETS[0];
      const horizon = getHorizon(bubble);
      const shellIndex = horizon ? ['today', 'week', 'later'].indexOf(horizon) : 0;

      let molecule = moleculeMap.get(domain);
      if (!molecule) {
        // Check if we have an existing molecule to preserve
        const existingMolecule = existingMolecules.get(`mol-${domain}`);
        
        if (existingMolecule) {
          // Preserve existing molecule position and state
          molecule = {
            ...existingMolecule,
            electrons: [] // Will be rebuilt below
          };
        } else {
          // Create new molecule with calculated position
          let finalPosition = domainPositionMap.get(domain);
          
          // Check if bubble has a stored position that doesn't conflict
          const domainBubbles = inputBubbles.filter(b => classifyDomain(b) === domain);
          const representativeBubble = domainBubbles[0];
          
          if (representativeBubble && representativeBubble.x && representativeBubble.y) {
            const storedPosition = { x: representativeBubble.x, y: representativeBubble.y };
            
            // Only use stored position if no conflicts
            const hasConflict = Array.from(domainPositionMap.values()).some(pos => {
              const distance = Math.hypot(storedPosition.x - pos.x, storedPosition.y - pos.y);
              return distance < 350;
            });
            
            if (!hasConflict) {
              finalPosition = storedPosition;
            }
          }
          
          if (!finalPosition) {
            finalPosition = { x: 600, y: 375 };
          }
          
          molecule = {
            id: `mol-${domain}`,
            x: finalPosition.x,
            y: finalPosition.y,
            nucleus: domainPreset.nucleus,
            electrons: [],
            selected: false,
            pulseActive: false
          };
        }
        
        moleculeMap.set(domain, molecule);
      }

      // Add electron with horizon-based shell assignment
      const existingElectron = existingMolecules.get(`mol-${domain}`)?.electrons.find(e => e.id === `elec-${bubble.id}`);
      const electronsInShell = molecule.electrons.filter(e => e.shell === shellIndex).length;
      const angleStep = (2 * Math.PI) / Math.max(6, electronsInShell + 1);
      
      const electron: Electron = {
        id: `elec-${bubble.id}`,
        moleculeId: molecule.id,
        shell: existingElectron?.shell ?? shellIndex, // Use horizon-based shell, not adjusted
        angle: existingElectron?.angle ?? (electronsInShell * angleStep + Math.random() * 0.1),
        phase: existingElectron?.phase ?? Math.random() * 2 * Math.PI,
        content: bubble.content || '',
        originalBubble: bubble
      };

      molecule.electrons.push(electron);
    });

    return Array.from(moleculeMap.values());
  }, [atomicState.molecules]);

  // Optimized molecule update - immediate during idle, skip during drag
  useEffect(() => {
    // Skip conversion during drag operations to maintain animation smoothness
    if (atomicState.dragState.isDragging) return;
    
    // Remove debounce for immediate responsiveness
    setAtomicState(prev => ({
      ...prev,
      molecules: convertBubblesToMolecules(bubbles)
    }));
  }, [bubbles, convertBubblesToMolecules, atomicState.dragState.isDragging]);

  // Motion control
  useEffect(() => {
    const unsubscribe = subscribeToMotionState(setMotionState);
    return unsubscribe;
  }, []);

  // Optimized animation loop - cache electron count during drag
  useEffect(() => {
    if (!motionState || reducedMotion) return;

    // Only recalculate electron count when not dragging
    const totalElectrons = atomicState.dragState.isDragging 
      ? (animationRef.current?.electronCount || 50) // Use cached value during drag
      : atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0);
    
    const speedMultiplier = totalElectrons > ANIMATION_CONFIG.MAX_ELECTRONS_FOR_FAST_ANIMATION ? 0.5 : 1.0;

    // Cache the electron count for drag operations
    if (!atomicState.dragState.isDragging) {
      if (!animationRef.current) animationRef.current = {};
      animationRef.current.electronCount = totalElectrons;
    }

    const animate = () => {
      setAnimationStep(prev => prev + (ANIMATION_CONFIG.ELECTRON_SPEED * speedMultiplier));
    };

    startAnimation(animate);

    return () => {
      stopAnimation(animate);
    };
  }, [motionState, reducedMotion, atomicState.molecules, atomicState.dragState.isDragging]);

  // Unified drag start handler for both mouse and touch
  const getEventCoordinates = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in event) {
      const touch = event.touches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }, []);

  // Drag handlers with unified event handling
  const handleElectronDragStart = useCallback((electron: Electron, event: React.MouseEvent | React.TouchEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    console.log('Electron drag start:', {
      electronId: electron.id,
      currentShell: electron.shell,
      shellName: SHELL_CONFIG[electron.shell]?.name
    });
    
    const coords = getEventCoordinates(event);
    
    // Haptic feedback for touch interactions
    if ('touches' in event && hapticsService.isAvailable()) {
      hapticsService.trigger('light');
    }
    
    // Calculate the electron's current orbital position to use as drag start reference
    const shell = SHELL_CONFIG[electron.shell];
    const electronMotion = reducedMotion ? 0 : electron.phase + (animationStep * 0.3);
    const angle = electron.angle + electronMotion;
    const electronOrbitalX = Math.cos(angle) * shell.radius;
    const electronOrbitalY = Math.sin(angle) * shell.radius;
    
    setAtomicState(prev => ({
      ...prev,
      dragState: {
        isDragging: true,
        type: 'electron',
        electronId: electron.id,
        lastMousePos: coords,
        currentMousePos: coords,
        originalShell: electron.shell,
        dragStartPos: { x: electronOrbitalX, y: electronOrbitalY }, // Store electron's orbital position
        dragOffset: { x: electronOrbitalX, y: electronOrbitalY } // Start with current orbital position
      }
    }));
  }, [getEventCoordinates, reducedMotion, animationStep]);

  const handleMoleculeDragStart = useCallback((molecule: Molecule, event: React.MouseEvent | React.TouchEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    // Lock position during selection/drag to prevent oscillations
    lockPosition(molecule.id);
    
    const coords = getEventCoordinates(event);
    
    // Haptic feedback for touch interactions
    if ('touches' in event && hapticsService.isAvailable()) {
      hapticsService.trigger('light');
    }
    
    // Prevent position updates during drag
    setAtomicState(prev => ({
      ...prev,
      dragState: {
        isDragging: true,
        type: 'molecule',
        moleculeId: molecule.id,
        lastMousePos: coords
      }
    }));
  }, [lockPosition, getEventCoordinates]);

  // Global mouse and touch handlers
  useEffect(() => {
    const getEventCoords = (event: MouseEvent | TouchEvent) => {
      if ('touches' in event) {
        const touch = event.touches[0];
        return { x: touch.clientX, y: touch.clientY };
      }
      return { x: event.clientX, y: event.clientY };
    };

    const handleDragMove = (event: MouseEvent | TouchEvent) => {
      if (!atomicState.dragState.isDragging) return;
      
      // Prevent default for touch to avoid scrolling
      if ('touches' in event) {
        event.preventDefault();
      }
      
      const coords = getEventCoords(event);
      const deltaX = coords.x - (atomicState.dragState.lastMousePos?.x || 0);
      const deltaY = coords.y - (atomicState.dragState.lastMousePos?.y || 0);
      
      if (atomicState.dragState.type === 'electron') {
        // Handle electron shell snapping
        const electronId = atomicState.dragState.electronId;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !electronId) return;
        
        // Transform coordinates to account for pan/zoom
        const { x: mouseX, y: mouseY } = screenToWorld(coords.x, coords.y, rect);

        // Calculate drag offset for visual feedback
        const { x: startMouseX, y: startMouseY } = screenToWorld(atomicState.dragState.lastMousePos?.x || 0, atomicState.dragState.lastMousePos?.y || 0, rect);
        const dragOffsetX = mouseX - startMouseX;
        const dragOffsetY = mouseY - startMouseY;
        
        // Store drag offset for visual feedback only - no shell updates during drag
        setAtomicState(prev => ({
          ...prev,
          dragState: {
            ...prev.dragState,
            lastMousePos: coords,
            currentMousePos: coords,
            dragOffset: { x: dragOffsetX, y: dragOffsetY }
          }
        }));
      } else if (atomicState.dragState.type === 'molecule') {
        // Handle molecule dragging
        const moleculeId = atomicState.dragState.moleculeId;
        if (!moleculeId) return;

        setAtomicState(prev => ({
          ...prev,
          molecules: prev.molecules.map(mol => {
            if (mol.id === moleculeId) {
              const newX = mol.x + deltaX / viewport.scale;
              const newY = mol.y + deltaY / viewport.scale;
              
              // Queue position update for after drag ends
              return { ...mol, x: newX, y: newY };
            }
            return mol;
          }),
          dragState: {
            ...prev.dragState,
            lastMousePos: coords
          }
        }));
      }
    };

    const handleDragEnd = () => {
      if (!atomicState.dragState.isDragging) return;

      // Handle electron shell snapping with undo and toast
      if (atomicState.dragState.type === 'electron' && atomicState.dragState.electronId) {
        const electronId = atomicState.dragState.electronId;
        const electron = atomicState.molecules
          .flatMap(m => m.electrons)
          .find(e => e.id === electronId);
        
        if (electron?.originalBubble && onTimeHorizonUpdate) {
          const originalShell = atomicState.dragState.originalShell ?? electron.shell;
          
          // Calculate final shell based on drag physics - where the electron actually is
          const rect = canvasRef.current?.getBoundingClientRect();
          let targetShell = originalShell; // Default to no change
          
          if (rect && atomicState.dragState.currentMousePos) {
            const { x: mouseX, y: mouseY } = screenToWorld(atomicState.dragState.currentMousePos.x, atomicState.dragState.currentMousePos.y, rect);
            
            // Find the closest molecule to determine final shell
            let minDistance = Infinity;
            let closestMolecule = null;
            
            for (const mol of atomicState.molecules) {
              const distance = Math.sqrt((mouseX - mol.x) ** 2 + (mouseY - mol.y) ** 2);
              if (distance < minDistance) {
                minDistance = distance;
                closestMolecule = mol;
              }
            }
            
            if (closestMolecule) {
              // Use distance to determine shell - pure physics
              if (minDistance <= 80) {
                targetShell = 0; // Today shell
              } else if (minDistance <= 120) {
                targetShell = 1; // Week shell  
              } else {
                targetShell = 2; // Later shell
              }
            }
          }
          const originalHorizon = ringIndexToHorizon(originalShell);
          const targetHorizon = ringIndexToHorizon(targetShell);
          
          console.log('Electron drop:', {
            bubbleId: electron.originalBubble.id,
            originalShell,
            originalShellName: SHELL_CONFIG[originalShell]?.name,
            targetShell,
            targetShellName: SHELL_CONFIG[targetShell]?.name,
            willUpdate: originalShell !== targetShell
          });
          
          if (originalShell !== targetShell) {
            // Update the electron's shell in the atomic state
            setAtomicState(prevState => ({
              ...prevState,
              molecules: prevState.molecules.map(mol => ({
                ...mol,
                electrons: mol.electrons.map(e => 
                  e.id === electronId ? { ...e, shell: targetShell } : e
                )
              }))
            }));
            
            // Call the horizon update callback
            onTimeHorizonUpdate(electron.originalBubble.id, originalShell, targetShell);
            
            // Haptic feedback for successful shell change
            if (hapticsService.isAvailable()) {
              hapticsService.trigger('medium');
            }
            
            // Show toast with undo
            toast({
              title: `Moved to ${getHorizonDisplayName(targetHorizon)}`,
              description: `Bubble moved from ${SHELL_CONFIG[originalShell]?.name || 'unassigned'} to ${SHELL_CONFIG[targetShell]?.name}`,
              action: (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Revert shell change in atomic state
                    setAtomicState(prevState => ({
                      ...prevState,
                      molecules: prevState.molecules.map(mol => ({
                        ...mol,
                        electrons: mol.electrons.map(e => 
                          e.id === electronId ? { ...e, shell: originalShell } : e
                        )
                      }))
                    }));
                    // Call the horizon update callback for undo
                    onTimeHorizonUpdate(electron.originalBubble!.id, targetShell, originalShell);
                  }}
                >
                  Undo
                </Button>
              )
            });
          }
        }
      }

      // Handle molecule position persistence after drag ends
      if (atomicState.dragState.moleculeId) {
        const draggedMolecule = atomicState.molecules.find(m => m.id === atomicState.dragState.moleculeId);
        if (draggedMolecule) {
          // Update bubble position after drag completes
          updateDomainBubblesPosition(draggedMolecule.electrons, draggedMolecule.x, draggedMolecule.y);
        }
        unlockPosition(atomicState.dragState.moleculeId);
      }

      // Reset drag state
      setAtomicState(prev => ({
        ...prev,
        dragState: {
          isDragging: false,
          type: null,
          hoveredShell: null,
          lastMousePos: null
        }
      }));
    };

    if (atomicState.dragState.isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd);
      document.addEventListener('touchcancel', handleDragEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('touchcancel', handleDragEnd);
      };
    }
  }, [atomicState.dragState, viewport, onTimeHorizonUpdate, toast]);

  // Multi-select handling
  const handleMoleculeSelect = useCallback((moleculeId: string, isShiftClick: boolean = false) => {
    // Prevent selection during drag to avoid position conflicts
    if (atomicState.dragState.isDragging) {
      return;
    }

    setAtomicState(prev => {
      let newSelection: string[];
      
      if (isShiftClick) {
        if (prev.selectedMolecules.includes(moleculeId)) {
          newSelection = prev.selectedMolecules.filter(id => id !== moleculeId);
        } else {
          newSelection = [...prev.selectedMolecules, moleculeId];
        }
      } else {
        newSelection = [moleculeId];
      }
      
      return {
        ...prev,
        selectedMolecules: newSelection,
        molecules: prev.molecules.map(mol => ({
          ...mol,
          selected: newSelection.includes(mol.id)
        }))
      };
    });
  }, [atomicState.dragState.isDragging]);

  // Fusion handling (requires exactly 2 molecules)
  const handleFusion = useCallback(() => {
    if (atomicState.selectedMolecules.length !== 2) {
      toast({
        title: "Fusion Error",
        description: `Select exactly 2 molecules for fusion (currently ${atomicState.selectedMolecules.length} selected)`,
        variant: "destructive"
      });
      return;
    }

    const [aId, bId] = atomicState.selectedMolecules;
    onMoleculeMerge?.(aId, bId);
    
    setAtomicState(prev => ({
      ...prev,
      selectedMolecules: []
    }));

    toast({
      title: "Molecules Fused",
      description: "Two molecules have been combined successfully",
      action: (
        <Button variant="outline" size="sm" onClick={() => console.log('Undo fusion')}>
          Undo
        </Button>
      )
    });
  }, [atomicState.selectedMolecules, onMoleculeMerge, toast]);

  // Fission handling
  const handleFission = useCallback(() => {
    if (atomicState.selectedMolecules.length !== 1) {
      toast({
        title: "Fission Error",
        description: `Select exactly 1 molecule for fission (currently ${atomicState.selectedMolecules.length} selected)`,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Molecule Split",
      description: "Molecule has been split successfully",
      action: (
        <Button variant="outline" size="sm" onClick={() => console.log('Undo fission')}>
          Undo
        </Button>
      )
    });
  }, [atomicState.selectedMolecules, toast]);

  // Motion toggle
  const toggleMotion = useCallback(() => {
    toggleAnimation();
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-background ${className}`}>
      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          transform: `translate(${panZoomState.x}px, ${panZoomState.y}px) scale(${panZoomState.scale})`,
          transformOrigin: 'center',
          cursor
        }}
        onWheel={onWheel}
        onPointerDown={onPanStart}
        onPointerMove={onPanMove}
        onPointerUp={onPanEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Molecules */}
        {atomicState.molecules.map((molecule) => (
          <div
            key={molecule.id}
            data-molecule="true"
            className="absolute group"
            style={{
              left: molecule.x + viewport.width / 2,
              top: molecule.y + viewport.height / 2,
              transform: 'translate(-50%, -50%)'
            }}
          >
            {/* Electron shells */}
            {SHELL_CONFIG.map((shell, shellIndex) => {
              const electronsInShell = molecule.electrons.filter(e => e.shell === shellIndex);
              const isHovered = atomicState.dragState.hoveredShell === shellIndex;
              
              return (
                <div
                  key={shellIndex}
                  className={`absolute rounded-full border-2 transition-all duration-200 ${
                    isHovered ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-white/30'
                  }`}
                  style={{
                    width: shell.radius * 2,
                    height: shell.radius * 2,
                    borderColor: shell.color,
                    left: -shell.radius,
                    top: -shell.radius,
                    borderStyle: 'dashed'
                  }}
                >
                  {/* Shell capacity indicator */}
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-muted-foreground">
                    {electronsInShell.length}/{shell.maxElectrons}
                  </div>
                </div>
              );
            })}

            {/* Electrons */}
            {molecule.electrons.map((electron, electronIndex) => {
              const shell = SHELL_CONFIG[electron.shell];
              const shellSpeedMultiplier = ANIMATION_CONFIG.SHELL_SPEED_MULTIPLIERS[electron.shell] || 1.0;
              const electronMotion = reducedMotion ? 0 : electron.phase + (animationStep * shellSpeedMultiplier);
              const angle = electron.angle + electronMotion;
              
              const isDragging = atomicState.dragState.isDragging && 
                               atomicState.dragState.type === 'electron' && 
                               atomicState.dragState.electronId === electron.id;
              
              let x, y;
              
              if (isDragging && atomicState.dragState.dragOffset) {
                // During drag: use absolute positioning - completely override orbital calculations
                x = atomicState.dragState.dragOffset.x;
                y = atomicState.dragState.dragOffset.y;
              } else {
                // Normal orbital positioning
                const electronMotion = reducedMotion ? 0 : electron.phase + (animationStep * 0.3);
                const angle = electron.angle + electronMotion;
                x = Math.cos(angle) * shell.radius;
                y = Math.sin(angle) * shell.radius;
              }

              const isTaskBubble = electron.originalBubble?.type === 'Task';
              const electronSize = isTaskBubble && shell.radius > 80 ? 48 : 24;
              
              return (
                <div
                  key={electron.id}
                  data-electron="true"
                  className={`absolute cursor-move transition-transform duration-150 group-hover:shadow-lg
                    ${isDragging ? 'scale-125 shadow-lg shadow-yellow-400/50 z-50' : ''}
                    ${isTaskBubble ? 'hover:scale-110' : 'hover:scale-125'}`}
                  style={{
                    left: x - electronSize / 2,
                    top: y - electronSize / 2,
                    width: electronSize,
                    height: electronSize,
                    transform: isDragging ? 'scale(1.25)' : undefined,
                    zIndex: isDragging ? 1000 : undefined
                  }}
                  onMouseDown={(e) => handleElectronDragStart(electron, e)}
                  onTouchStart={(e) => handleElectronDragStart(electron, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (electron.originalBubble) {
                      onBubbleSelect?.(electron.originalBubble);
                    }
                  }}
                  title={`${electron.content.slice(0, 30)}${electron.content.length > 30 ? '...' : ''}`}
                >
                  {isTaskBubble && electronSize >= 48 ? (
                    /* Large task electrons show TaskCard */
                    <TaskCard
                      task={{
                        id: electron.originalBubble.id,
                        type: 'task',
                        title: electron.content || 'Untitled Task',
                        description: '',
                        completed: electron.originalBubble.completed || false,
                        priority: 50,
                        tags: electron.originalBubble.tags,
                        createdAt: electron.originalBubble.createdAt,
                        updatedAt: electron.originalBubble.updatedAt,
                        view: {}
                      }}
                      viewConfig={TaskCardConfigs.atomic}
                      onUpdate={(updatedTask) => {
                        // Handle task updates through atomic view
                        if (electron.originalBubble) {
                          const updatedBubble = {
                            ...electron.originalBubble,
                            content: updatedTask.title,
                            completed: updatedTask.completed,
                            tags: updatedTask.tags,
                            updatedAt: Date.now()
                          };
                          onBubbleSelect?.(updatedBubble);
                        }
                      }}
                      style={{ 
                        transform: 'scale(0.7)',
                        transformOrigin: 'center'
                      }}
                    />
                  ) : (
                    /* Regular electrons - simple visual representation */
                    <div
                      className={`w-full h-full rounded-full border-2 border-white flex items-center justify-center text-xs text-white font-bold`}
                      style={{
                        backgroundColor: shell.color,
                      }}
                    >
                      {isTaskBubble ? '✓' : electron.content.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Nucleus */}
            <div
              className={`absolute w-12 h-12 rounded-full border-2 border-white/50 cursor-move
                ${molecule.selected ? 'bg-yellow-500/80 shadow-lg shadow-yellow-500/50' : 'bg-blue-500/80'}
                transition-all duration-200 hover:scale-110`}
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }}
              onMouseDown={(e) => handleMoleculeDragStart(molecule, e)}
              onTouchStart={(e) => handleMoleculeDragStart(molecule, e)}
              onClick={(e) => {
                e.stopPropagation();
                handleMoleculeSelect(molecule.id, e.shiftKey);
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                {molecule.nucleus.protons}p
              </div>
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-center text-muted-foreground">
                {molecule.nucleus.domain}
              </div>
            </div>

            {/* Selection indicator */}
            {molecule.selected && (
              <div className="absolute -inset-4 rounded-full border-2 border-yellow-400 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* UI Controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <Card className="p-2">
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={toggleMotion}>
              {motionState ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={zoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={zoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={resetZoom}>
              <Target className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        <Card className="p-2">
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={handleFusion}>
              <Zap className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleFission}>
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline">
              <Undo2 className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Selection status */}
      {atomicState.selectedMolecules.length > 0 && (
        <div className="absolute top-4 right-4">
          <Badge variant="outline">
            {atomicState.selectedMolecules.length} selected
          </Badge>
        </div>
      )}

      {/* Time Horizons Legend */}
      <Card className="absolute bottom-24 right-4 p-3">
        <h3 className="text-sm font-medium mb-2">Time Horizons</h3>
        <div className="space-y-1">
          {SHELL_CONFIG.map((shell, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full border"
                style={{ backgroundColor: shell.color }}
              />
              <span>{shell.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Draggable overlays with pointer-events handling */}
      <style>{`
        [data-panel] {
          pointer-events: auto;
        }
        [data-panel] > * {
          pointer-events: none;
        }
        [data-panel] button {
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
};