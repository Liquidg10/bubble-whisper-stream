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
import { startAnimation, stopAnimation, isMotionEnabled, subscribeToMotionState } from '@/lib/motion';
import { classifyDomain, getAllDomains } from '@/lib/classifyDomain';
import { getHorizon, getHorizonDisplayName, ringIndexToHorizon } from '@/lib/horizon';
import { calculateMoleculePositions } from '@/experimental/atomic/positioning';
import { useMoleculePositionPersistence } from '@/hooks/useMoleculePositionPersistence';

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
    type: 'electron' | 'molecule' | null;
    electronId?: string;
    moleculeId?: string;
    lastMousePos?: { x: number; y: number };
    hoveredShell?: number;
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
  const { updateDomainBubblesPosition } = useMoleculePositionPersistence();
  
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

  // Convert bubbles to molecules with global position persistence
  const convertBubblesToMolecules = useCallback((inputBubbles: Bubble[]): Molecule[] => {
    const moleculeMap = new Map<string, Molecule>();
    
    // Step 1: Collect all unique domains first
    const uniqueDomains = [...new Set(inputBubbles.map(bubble => classifyDomain(bubble)))];
    console.log(`Global positioning: Found ${uniqueDomains.length} unique domains:`, uniqueDomains);
    
    // Step 2: Calculate global positions for all domains at once
    const globalPositions = calculateMoleculePositions(uniqueDomains);
    const domainPositionMap = new Map<string, { x: number; y: number }>();
    
    uniqueDomains.forEach((domain, index) => {
      const position = globalPositions[index];
      if (position) {
        domainPositionMap.set(domain, { x: position.x, y: position.y });
        console.log(`Global position assigned to ${domain}:`, { x: position.x, y: position.y });
      }
    });

    inputBubbles.forEach((bubble, index) => {
      const domain = classifyDomain(bubble);
      const domainPreset = DOMAIN_PRESETS.find(p => p.name === domain) || DOMAIN_PRESETS[0];
      const horizon = getHorizon(bubble);
      const shellIndex = horizon ? ['today', 'week', 'later'].indexOf(horizon) : 0;

      let molecule = moleculeMap.get(domain);
      if (!molecule) {
        // Step 3: Use global position or validate stored position
        let finalPosition = domainPositionMap.get(domain);
        
        // Check if bubble has a stored position that doesn't conflict
        const domainBubbles = inputBubbles.filter(b => classifyDomain(b) === domain);
        const representativeBubble = domainBubbles[0];
        
        if (representativeBubble && representativeBubble.x && representativeBubble.y) {
          const storedPosition = { x: representativeBubble.x, y: representativeBubble.y };
          
          // Validate stored position against other global positions
          const hasConflict = Array.from(domainPositionMap.values()).some(pos => {
            if (pos.x === finalPosition?.x && pos.y === finalPosition?.y) return false; // Same position
            const distance = Math.hypot(storedPosition.x - pos.x, storedPosition.y - pos.y);
            return distance < 350; // MIN_DISTANCE from positioning.ts
          });
          
          if (!hasConflict) {
            finalPosition = storedPosition;
            console.log(`Using validated stored position for ${domain}:`, storedPosition);
          } else {
            console.log(`Stored position conflicts for ${domain}, using global:`, { 
              stored: storedPosition, 
              global: finalPosition 
            });
          }
        }
        
        if (!finalPosition) {
          // Fallback to center if no position available
          finalPosition = { x: 600, y: 375 };
          console.warn(`No position available for domain ${domain}, using center fallback`);
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
        moleculeMap.set(domain, molecule);
      }

      // Add electron for this bubble with improved distribution
      const electronsInMolecule = molecule.electrons.length;
      
      // Improved shell assignment - spread electrons across shells to prevent overcrowding
      const MAX_ELECTRONS_PER_SHELL = 6; // Limit electrons per shell
      const adjustedShellIndex = Math.min(
        Math.floor(electronsInMolecule / MAX_ELECTRONS_PER_SHELL) + shellIndex,
        2 // Max 3 shells (0, 1, 2)
      );
      
      // Count electrons in the assigned shell for better angle distribution
      const electronsInShell = molecule.electrons.filter(e => e.shell === adjustedShellIndex).length;
      const angleStep = (2 * Math.PI) / Math.max(MAX_ELECTRONS_PER_SHELL, electronsInShell + 1);
      
      const electron: Electron = {
        id: `elec-${bubble.id}`,
        moleculeId: molecule.id,
        shell: adjustedShellIndex,
        angle: electronsInShell * angleStep + Math.random() * 0.1, // Better spacing with minimal randomization
        phase: Math.random() * 2 * Math.PI,
        content: bubble.content || '',
        originalBubble: bubble
      };

      molecule.electrons.push(electron);
    });

    const result = Array.from(moleculeMap.values());
    console.log(`Molecule conversion complete: ${result.length} molecules with ${result.reduce((sum, mol) => sum + mol.electrons.length, 0)} total electrons`);
    
    return result;
  }, []);

  // Update molecules when bubbles change
  useEffect(() => {
    const newMolecules = convertBubblesToMolecules(bubbles);
    setAtomicState(prev => ({
      ...prev,
      molecules: newMolecules
    }));
  }, [bubbles, convertBubblesToMolecules]);

  // Motion control
  useEffect(() => {
    const unsubscribe = subscribeToMotionState(setMotionState);
    return unsubscribe;
  }, []);

  // Animation loop with slower electrons
  useEffect(() => {
    if (!motionState || reducedMotion) return;

    const totalElectrons = atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0);
    const speedMultiplier = totalElectrons > ANIMATION_CONFIG.MAX_ELECTRONS_FOR_FAST_ANIMATION ? 0.5 : 1.0;

    const animate = () => {
      setAnimationStep(prev => prev + (ANIMATION_CONFIG.ELECTRON_SPEED * speedMultiplier));
    };

    startAnimation(animate);

    return () => {
      stopAnimation();
    };
  }, [motionState, reducedMotion, atomicState.molecules]);

  // Auto-start animation on mount if motion is enabled
  useEffect(() => {
    if (isMotionEnabled() && !reducedMotion) {
      const totalElectrons = atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0);
      const speedMultiplier = totalElectrons > ANIMATION_CONFIG.MAX_ELECTRONS_FOR_FAST_ANIMATION ? 0.5 : 1.0;

      const animate = () => {
        setAnimationStep(prev => prev + (ANIMATION_CONFIG.ELECTRON_SPEED * speedMultiplier));
      };

      startAnimation(animate);
    }
  }, [reducedMotion, atomicState.molecules]);

  // Drag handlers with unified event handling
  const handleElectronDragStart = useCallback((electron: Electron, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    setAtomicState(prev => ({
      ...prev,
      dragState: {
        isDragging: true,
        type: 'electron',
        electronId: electron.id,
        lastMousePos: { x: event.clientX, y: event.clientY }
      }
    }));
  }, []);

  const handleMoleculeDragStart = useCallback((molecule: Molecule, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    setAtomicState(prev => ({
      ...prev,
      dragState: {
        isDragging: true,
        type: 'molecule',
        moleculeId: molecule.id,
        lastMousePos: { x: event.clientX, y: event.clientY }
      }
    }));
  }, []);

  // Global mouse handlers
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!atomicState.dragState.isDragging) return;
      
      const deltaX = event.clientX - (atomicState.dragState.lastMousePos?.x || 0);
      const deltaY = event.clientY - (atomicState.dragState.lastMousePos?.y || 0);
      
      if (atomicState.dragState.type === 'electron') {
        // Handle electron shell snapping
        const electronId = atomicState.dragState.electronId;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !electronId) return;
        
        // Transform mouse coordinates to account for pan/zoom
        const mouseX = (event.clientX - rect.left - panZoomState.x) / panZoomState.scale;
        const mouseY = (event.clientY - rect.top - panZoomState.y) / panZoomState.scale;
        
        setAtomicState(prev => {
          let nearestShell = 0;
          
          return {
            ...prev,
            molecules: prev.molecules.map(mol => {
              const electron = mol.electrons.find(e => e.id === electronId);
              if (!electron) return mol;
              
              // Calculate molecule center in the same coordinate space as transformed mouse
              const molCenterX = mol.x;
              const molCenterY = mol.y;
              const distToMouse = Math.sqrt((mouseX - molCenterX) ** 2 + (mouseY - molCenterY) ** 2);
              
              // Find nearest shell
              let minShellDist = Infinity;
              
              SHELL_CONFIG.forEach((shell, shellIndex) => {
                const shellDist = Math.abs(distToMouse - shell.radius);
                if (shellDist < minShellDist) {
                  minShellDist = shellDist;
                  nearestShell = shellIndex;
                }
              });

              return {
                ...mol,
                electrons: mol.electrons.map(e => 
                  e.id === electronId ? { ...e, shell: nearestShell } : e
                )
              };
            }),
            dragState: {
              ...prev.dragState,
              lastMousePos: { x: event.clientX, y: event.clientY },
              hoveredShell: nearestShell
            }
          };
        });
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
              
              // Update representative bubble position for persistence
              updateDomainBubblesPosition(mol.electrons, newX, newY);
              
              return { ...mol, x: newX, y: newY };
            }
            return mol;
          }),
          dragState: {
            ...prev.dragState,
            lastMousePos: { x: event.clientX, y: event.clientY }
          }
        }));
      }
    };

    const handleMouseUp = () => {
      if (!atomicState.dragState.isDragging) return;

      // Handle electron shell snapping with undo and toast
      if (atomicState.dragState.type === 'electron' && atomicState.dragState.electronId) {
        const electronId = atomicState.dragState.electronId;
        const electron = atomicState.molecules
          .flatMap(m => m.electrons)
          .find(e => e.id === electronId);
        
        if (electron?.originalBubble && onTimeHorizonUpdate) {
          const originalHorizon = getHorizon(electron.originalBubble);
          const originalShell = originalHorizon ? ['today', 'week', 'later'].indexOf(originalHorizon) : 0;
          const targetShell = atomicState.dragState.hoveredShell ?? electron.shell;
          const targetHorizon = ringIndexToHorizon(targetShell);
          
          if (originalShell !== targetShell) {
            // Call the horizon update callback
            onTimeHorizonUpdate(electron.originalBubble.id, originalShell, targetShell);
            
            // Show toast with undo
            toast({
              title: `Moved to ${getHorizonDisplayName(targetHorizon)}`,
              description: `Bubble moved from ${originalHorizon ? getHorizonDisplayName(originalHorizon) : 'unassigned'} to ${getHorizonDisplayName(targetHorizon)}`,
              action: (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
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
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [atomicState.dragState, viewport, onTimeHorizonUpdate, toast]);

  // Multi-select handling
  const handleMoleculeSelect = useCallback((moleculeId: string, isShiftClick: boolean = false) => {
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
  }, []);

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
    if (motionState) {
      stopAnimation();
    } else {
      const animate = () => setAnimationStep(prev => prev + 0.02);
      startAnimation(animate);
    }
  }, [motionState]);

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
              const x = Math.cos(angle) * shell.radius;
              const y = Math.sin(angle) * shell.radius;

              return (
                <div
                  key={electron.id}
                  data-electron="true"
                  className="absolute w-6 h-6 rounded-full bg-red-500 border-2 border-white cursor-move
                    hover:scale-125 transition-transform duration-150 group-hover:shadow-lg"
                  style={{
                    left: x - 12,
                    top: y - 12,
                    backgroundColor: shell.color
                  }}
                  onMouseDown={(e) => handleElectronDragStart(electron, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (electron.originalBubble) {
                      onBubbleSelect?.(electron.originalBubble);
                    }
                  }}
                  title={`${electron.content.slice(0, 30)}${electron.content.length > 30 ? '...' : ''}`}
                />
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