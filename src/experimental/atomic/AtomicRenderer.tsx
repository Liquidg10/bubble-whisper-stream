/**
 * Complete Atomic/Molecular Canvas Renderer
 * Interactive physics simulation with draggable electrons, fusion/fission, photon pulses
 * NOW WITH STABLE ARCHITECTURE - No more orbital drift!
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bubble, BubbleType } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Undo2, Zap, RotateCcw, Home, Calendar, Clock, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useZoomStandard } from '@/hooks/useZoomStandard';
import * as atomicAdapter from './atomicAdapter';
import { CoordinateSystem, ViewportState } from './coordinateSystem';
import { 
  StableElectron, 
  StableMolecule, 
  calculateElectronScreenPosition, 
  determineShellFromDistance,
  updateElectronPhases,
  redistributeElectronsInShell
} from './stableElectrons';
import { EventSystem, EventSystemState } from './eventSystem';

// Stable atomic state - no more coordinate conflicts!
interface AtomicState {
  molecules: StableMolecule[];
  selectedMolecule: string | null;
  undoStack: StableMolecule[][];
}

// Domain presets
const DOMAIN_PRESETS = [
  { name: 'Work', emoji: '💼', color: '#3B82F6', nucleus: { protons: 6, neutrons: 6, domain: 'Work' }},
  { name: 'Personal', emoji: '🏠', color: '#10B981', nucleus: { protons: 4, neutrons: 5, domain: 'Personal' }},
  { name: 'Health', emoji: '⚕️', color: '#EF4444', nucleus: { protons: 8, neutrons: 8, domain: 'Health' }},
  { name: 'Learning', emoji: '📚', color: '#8B5CF6', nucleus: { protons: 5, neutrons: 6, domain: 'Learning' }},
  { name: 'Relationships', emoji: '💝', color: '#EC4899', nucleus: { protons: 7, neutrons: 7, domain: 'Relationships' }},
  { name: 'Finance', emoji: '💰', color: '#F59E0B', nucleus: { protons: 9, neutrons: 10, domain: 'Finance' }}
];

// Shell configuration with time horizons
const SHELL_CONFIG = [
  { name: 'Today', radius: 60, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 100, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 140, color: '#10B981', icon: Clock, maxElectrons: 32 }
];

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
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  
  // Motion control state
  const [motionEnabled, setMotionEnabled] = useState(!reducedMotion);
  
  // Draggable UI state
  const [domainCardPos, setDomainCardPos] = useState({ x: 0, y: 0 });
  const [timeHorizonPos, setTimeHorizonPos] = useState({ x: 0, y: 0 });
  
  // Stable atomic state
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecule: null,
    undoStack: []
  });
  
  // Viewport state for zoom/pan
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0, y: 0, scale: 1, width: 0, height: 0
  });

  // Initialize coordinate system and event system
  const coordinateSystemRef = useRef<CoordinateSystem>(new CoordinateSystem(viewport));
  const eventSystemRef = useRef<EventSystem>(new EventSystem());
  const [eventState, setEventState] = useState<EventSystemState>(eventSystemRef.current.getState());

  // Update coordinate system when viewport changes
  useEffect(() => {
    coordinateSystemRef.current.updateViewport(viewport);
  }, [viewport]);

  // Subscribe to event system changes
  useEffect(() => {
    return eventSystemRef.current.subscribe(setEventState);
  }, []);

  // Integrate zoom system properly
  const zoomSystem = useZoomStandard({
    onZoomChange: ({ scale, centerX, centerY }) => {
      setViewport(prev => ({
        ...prev,
        scale,
        x: centerX,
        y: centerY
      }));
    },
    getContainerRect: () => canvasRef.current?.getBoundingClientRect() || null
  });

  // Convert bubbles to stable molecules
  const convertBubblesToMolecules = useCallback(() => {
    if (!Array.isArray(bubbles) || bubbles.length === 0) return;
    
    const { classifyBubbleDomain } = atomicAdapter;
    
    // Group bubbles by domain
    const grouped = bubbles.reduce((acc: Record<string, Bubble[]>, bubble: Bubble) => {
      const domain = classifyBubbleDomain(bubble);
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(bubble);
      return acc;
    }, {} as Record<string, Bubble[]>);

    const molecules: StableMolecule[] = Object.entries(grouped).map(([domain, domainBubbles], index) => {
      const angle = (index / Object.keys(grouped).length) * 2 * Math.PI;
      const distance = 150 + Math.random() * 100;
      
      // Store position in world coordinates
      const worldPosition = {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance
      };
      
      const electrons: StableElectron[] = domainBubbles.map((bubble, electronIndex) => {
        // Determine shell based on time horizon tags
        let shell = 2; // default to "Later"
        if (bubble.tags?.some(tag => ['today', 'urgent', 'now'].includes(tag.name.toLowerCase()))) {
          shell = 0;
        } else if (bubble.tags?.some(tag => ['week', 'soon', 'this week'].includes(tag.name.toLowerCase()))) {
          shell = 1;
        }

        return {
          id: bubble.id,
          moleculeId: `mol-${domain}-${index}`,
          shell,
          baseAngle: (electronIndex / Math.max(1, domainBubbles.length)) * 2 * Math.PI,
          phase: Math.random() * 2 * Math.PI,
          content: bubble.content || '',
          type: bubble.type || 'Thought',
          originalBubble: bubble
        };
      });

      return {
        id: `mol-${domain}-${index}`,
        worldPosition,
        nucleus: {
          protons: Math.min(domainBubbles.length, 20),
          neutrons: Math.min(domainBubbles.length + 2, 22),
          domain
        },
        electrons,
        bonds: [],
        pulseActive: false,
        pulseType: null,
        selected: false
      };
    });

    setAtomicState(prev => ({ ...prev, molecules }));
  }, [bubbles]);

  // Initialize viewport and convert bubbles
  useEffect(() => {
    const updateViewport = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setViewport(prev => ({ ...prev, width: rect.width, height: rect.height }));
      }
    };
    
    updateViewport();
    convertBubblesToMolecules();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [convertBubblesToMolecules]);

  // Stable animation system - only updates phases, not positions
  const updateStableAnimation = useCallback((molecules: StableMolecule[]) => {
    if (eventSystemRef.current.shouldPreventAnimation()) {
      return molecules; // Don't animate during interactions
    }

    return molecules.map(mol => ({
      ...mol,
      electrons: updateElectronPhases(mol.electrons, 0.02)
    }));
  }, []);

  // Stable animation loop - no more conflicts!
  useEffect(() => {
    if (reducedMotion || !motionEnabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }
    
    const animate = () => {
      setAtomicState(prev => ({
        ...prev,
        molecules: updateStableAnimation(prev.molecules)
      }));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [reducedMotion, motionEnabled, updateStableAnimation]);

  // Clean event handlers using the event system
  const handleElectronDragStart = useCallback((electronId: string, originalShell: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    eventSystemRef.current.startElectronDrag(electronId, originalShell);
  }, []);

  const handleMoleculeDragStart = useCallback((moleculeId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    eventSystemRef.current.startMoleculeDrag(moleculeId, event.clientX, event.clientY);
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const currentEventState = eventSystemRef.current.getState();
    
    if (currentEventState.interaction.type === 'dragging-electron') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const screenPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const worldPos = coordinateSystemRef.current.screenToWorld(screenPos);
      
      // Find the molecule this electron belongs to
      const molecule = atomicState.molecules.find(mol => 
        mol.electrons.some(e => e.id === (currentEventState.interaction as any).electronId)
      );
      
      if (!molecule) return;
      
      const distance = coordinateSystemRef.current.worldDistance(worldPos, molecule.worldPosition);
      const currentShell = determineShellFromDistance(distance);
      const hoveredShell = currentShell;
      
      eventSystemRef.current.updateElectronDrag(currentShell, hoveredShell);
    } else if (currentEventState.interaction.type === 'dragging-molecule') {
      const deltaX = (event.clientX - (currentEventState.interaction as any).startX) / viewport.scale;
      const deltaY = (event.clientY - (currentEventState.interaction as any).startY) / viewport.scale;
      
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol =>
          mol.id === (currentEventState.interaction as any).moleculeId
            ? { 
                ...mol, 
                worldPosition: {
                  x: mol.worldPosition.x + deltaX,
                  y: mol.worldPosition.y + deltaY
                }
              }
            : mol
        )
      }));
    }
  }, [atomicState.molecules, viewport.scale]);

  const handleMouseUp = useCallback(() => {
    const currentEventState = eventSystemRef.current.getState();
    
    if (currentEventState.interaction.type === 'dragging-electron') {
      const result = eventSystemRef.current.endElectronDrag();
      if (!result) return;
      
      const { electronId, originalShell, currentShell } = result;
      
      if (currentShell !== null && currentShell !== originalShell) {
        // Update electron shell
        setAtomicState(prev => ({
          ...prev,
          undoStack: [...prev.undoStack.slice(-9), prev.molecules],
          molecules: prev.molecules.map(molecule => ({
            ...molecule,
            electrons: redistributeElectronsInShell(
              molecule.electrons.map(electron =>
                electron.id === electronId ? { ...electron, shell: currentShell } : electron
              ),
              currentShell
            )
          }))
        }));

        onTimeHorizonUpdate?.(electronId, originalShell, currentShell);
        
        const shellName = SHELL_CONFIG[currentShell]?.name || 'Unknown';
        toast({
          title: "Time horizon updated",
          description: `Moved to ${shellName}`,
          duration: 2000,
        });
      }
    } else if (currentEventState.interaction.type === 'dragging-molecule') {
      eventSystemRef.current.endMoleculeDrag();
    }
  }, [toast, onTimeHorizonUpdate]);

  // Global mouse event handlers
  useEffect(() => {
    const currentEventState = eventSystemRef.current.getState();
    
    if (currentEventState.interaction.type === 'dragging-electron' || 
        currentEventState.interaction.type === 'dragging-molecule') {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [eventState, handleMouseMove, handleMouseUp]);

  // Select molecule
  const handleMoleculeSelect = useCallback((moleculeId: string) => {
    setAtomicState(prev => ({
      ...prev,
      selectedMolecule: prev.selectedMolecule === moleculeId ? null : moleculeId,
      molecules: prev.molecules.map(mol => ({
        ...mol,
        selected: mol.id === moleculeId ? !mol.selected : false
      }))
    }));
  }, []);

  // Photon pulse effect
  const handlePhotonPulse = useCallback((moleculeId: string) => {
    setAtomicState(prev => ({
      ...prev,
      molecules: prev.molecules.map(mol =>
        mol.id === moleculeId ? { ...mol, pulseActive: true, pulseType: 'shell' } : mol
      )
    }));

    setTimeout(() => {
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol =>
          mol.id === moleculeId ? { ...mol, pulseActive: false, pulseType: null } : mol
        )
      }));
    }, 1000);
  }, []);

  // Fusion (merge molecules)
  const handleFusion = useCallback(() => {
    const selectedMols = atomicState.molecules.filter(mol => mol.selected);
    if (selectedMols.length !== 2) return;

    const [mol1, mol2] = selectedMols;
    onMoleculeMerge?.(mol1.id, mol2.id);

    const fusedMolecule: StableMolecule = {
      id: `${mol1.id}-${mol2.id}`,
      worldPosition: {
        x: (mol1.worldPosition.x + mol2.worldPosition.x) / 2,
        y: (mol1.worldPosition.y + mol2.worldPosition.y) / 2
      },
      nucleus: {
        protons: mol1.nucleus.protons + mol2.nucleus.protons,
        neutrons: mol1.nucleus.neutrons + mol2.nucleus.neutrons,
        domain: `${mol1.nucleus.domain}+${mol2.nucleus.domain}`
      },
      electrons: [...mol1.electrons, ...mol2.electrons],
      bonds: [...mol1.bonds, ...mol2.bonds],
      pulseActive: true,
      pulseType: 'bond',
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: [...prev.molecules.filter(mol => !mol.selected), fusedMolecule],
      selectedMolecule: null
    }));

    toast({
      title: "Fusion complete",
      description: "Molecules combined",
      duration: 2000,
    });
  }, [atomicState.molecules, toast, onMoleculeMerge]);

  // Fission (split molecule)
  const handleFission = useCallback((moleculeId: string) => {
    const molecule = atomicState.molecules.find(mol => mol.id === moleculeId);
    if (!molecule || molecule.electrons.length < 2) return;

    const midpoint = Math.floor(molecule.electrons.length / 2);
    const electrons1 = molecule.electrons.slice(0, midpoint);
    const electrons2 = molecule.electrons.slice(midpoint);

    const splitMolecules: StableMolecule[] = [
      {
        id: `${moleculeId}-A`,
        worldPosition: {
          x: molecule.worldPosition.x - 60,
          y: molecule.worldPosition.y - 60
        },
        nucleus: {
          protons: Math.ceil(molecule.nucleus.protons / 2),
          neutrons: Math.ceil(molecule.nucleus.neutrons / 2),
          domain: molecule.nucleus.domain + '-A'
        },
        electrons: electrons1,
        bonds: [],
        pulseActive: true,
        pulseType: 'shell',
        selected: false
      },
      {
        id: `${moleculeId}-B`,
        worldPosition: {
          x: molecule.worldPosition.x + 60,
          y: molecule.worldPosition.y + 60
        },
        nucleus: {
          protons: Math.floor(molecule.nucleus.protons / 2),
          neutrons: Math.floor(molecule.nucleus.neutrons / 2),
          domain: molecule.nucleus.domain + '-B'
        },
        electrons: electrons2,
        bonds: [],
        pulseActive: true,
        pulseType: 'shell',
        selected: false
      }
    ];

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: [...prev.molecules.filter(mol => mol.id !== moleculeId), ...splitMolecules]
    }));

    toast({
      title: "Fission complete",
      description: "Molecule split",
      duration: 2000,
    });
  }, [atomicState.molecules, toast]);

  // Undo last operation
  const handleUndo = useCallback(() => {
    if (atomicState.undoStack.length === 0) return;

    const previousState = atomicState.undoStack[atomicState.undoStack.length - 1];
    setAtomicState(prev => ({
      ...prev,
      molecules: previousState,
      undoStack: prev.undoStack.slice(0, -1),
      selectedMolecule: null
    }));

    toast({ title: "Undone", description: "Reverted to previous state", duration: 2000 });
  }, [atomicState.undoStack, toast]);

  // Quick add domain preset
  const handleQuickAdd = useCallback((preset: typeof DOMAIN_PRESETS[0]) => {
    onMoleculeCreate?.(preset.name);
    
    const angle = Math.random() * 2 * Math.PI;
    const distance = 150 + Math.random() * 100;
    const worldPosition = {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    };

    const newMolecule: StableMolecule = {
      id: `${preset.name}-${Date.now()}`,
      worldPosition,
      nucleus: preset.nucleus,
      electrons: [],
      bonds: [],
      pulseActive: true,
      pulseType: 'shell',
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: [...prev.molecules, newMolecule]
    }));
  }, [onMoleculeCreate]);

  // Center view
  const centerView = useCallback(() => {
    if (atomicState.molecules.length === 0) return;
    const bounds = atomicState.molecules.reduce(
      (acc, mol) => ({
        minX: Math.min(acc.minX, mol.worldPosition.x),
        maxX: Math.max(acc.maxX, mol.worldPosition.x),
        minY: Math.min(acc.minY, mol.worldPosition.y),
        maxY: Math.max(acc.maxY, mol.worldPosition.y)
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    
    setViewport(prev => ({
      ...prev,
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      scale: 1
    }));
  }, [atomicState.molecules]);

  // Motion control handlers
  const toggleMotion = useCallback(() => {
    setMotionEnabled(prev => !prev);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        toggleMotion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMotion]);

  const selectedCount = atomicState.molecules.filter(mol => mol.selected).length;

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Quantum Field Background */}
      <div 
        className="absolute inset-0"
        style={{
          background: highContrast 
            ? '#000000'
            : 'radial-gradient(ellipse at center, #0f0f23 0%, #020617 100%)',
        }}
      >
        {!reducedMotion && (
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `
                radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 40% 40%, rgba(120, 255, 198, 0.3) 0%, transparent 50%)
              `,
            }}
          />
        )}
      </div>

      {/* Motion Control */}
      <div className="absolute top-4 left-4 z-30">
        <div className="ui-overlay bg-background/80 backdrop-blur-sm border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant={motionEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggleMotion}
              className="w-20"
            >
              {motionEnabled ? '⏸️ Pause' : '▶️ Play'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Motion: {motionEnabled ? 'On' : 'Off'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Press spacebar to toggle
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: 'center center',
        }}
        onWheel={(e) => zoomSystem.handleWheelZoom(e, viewport.scale)}
      >
        {/* Render Molecules */}
        {atomicState.molecules.map(molecule => {
          const moleculeScreenPos = coordinateSystemRef.current.worldToScreen(molecule.worldPosition);
          
          return (
            <div
              key={molecule.id}
              className="absolute molecule-container"
              style={{
                left: moleculeScreenPos.x,
                top: moleculeScreenPos.y,
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
            >
            {/* Nucleus */}
            <div 
              className={`nucleus absolute w-16 h-16 rounded-full border-2 cursor-move transition-all hover:scale-110 ${
                molecule.selected ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-gray-400'
              }`}
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle, ${
                  DOMAIN_PRESETS.find(p => p.name === molecule.nucleus.domain)?.color || '#6B7280'
                }, #1F2937)`,
                zIndex: 20,
              }}
              onClick={() => handleMoleculeSelect(molecule.id)}
              onMouseDown={(e) => handleMoleculeDragStart(molecule.id, e)}
              role="button"
              tabIndex={0}
              aria-label={`${molecule.nucleus.domain} molecule: ${molecule.nucleus.protons} protons, ${molecule.nucleus.neutrons} neutrons, ${molecule.electrons.length} electrons`}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-xs font-bold">
                <div>{molecule.nucleus.protons}p</div>
                <div>{molecule.nucleus.neutrons}n</div>
              </div>
              
              {/* Pulse Effect */}
              {molecule.pulseActive && molecule.pulseType === 'shell' && !reducedMotion && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-cyan-400"
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 1 }}
                />
              )}
            </div>

            {/* Electron Shells */}
            {SHELL_CONFIG.map((shell, shellIndex) => {
              const electronsInShell = molecule.electrons.filter(e => e.shell === shellIndex);
              const isOverflow = electronsInShell.length > shell.maxElectrons;
              
              return (
                  <div
                    key={shellIndex}
                    className={`absolute rounded-full border transition-all ${
                      eventState.hoveredShell === shellIndex ? 'border-2 opacity-80' : 'border opacity-30'
                    }`}
                    style={{
                      width: shell.radius * 2,
                      height: shell.radius * 2,
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      borderColor: shell.color,
                    }}
                  >
                  {/* Shell Label */}
                  <div 
                    className="absolute text-xs text-gray-400 font-semibold"
                    style={{
                      top: -20,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {shell.name}
                  </div>
                  
                  {/* Shell capacity overflow indicator */}
                  {isOverflow && (
                    <div
                      className="absolute w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center"
                      style={{
                        top: -8,
                        right: shell.radius / 4,
                      }}
                      title={`Overflow: ${electronsInShell.length}/${shell.maxElectrons} electrons`}
                    >
                      !
                    </div>
                  )}
                </div>
              );
            })}

            {/* Electrons with stable positioning */}
            {molecule.electrons.map((electron) => {
              const shell = SHELL_CONFIG[electron.shell];
              if (!shell) return null;

              const electronScreenPos = calculateElectronScreenPosition(
                electron,
                molecule,
                coordinateSystemRef.current,
                motionEnabled
              );

              return (
                <div
                  key={electron.id}
                  className="electron absolute rounded-full cursor-grab transition-all hover:scale-125"
                  style={{
                    width: '6px',
                    height: '6px',
                    left: electronScreenPos.x - 3,
                    top: electronScreenPos.y - 3,
                    backgroundColor: shell.color,
                    boxShadow: `0 0 8px ${shell.color}`,
                    zIndex: 30,
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleElectronDragStart(electron.id, electron.shell, e);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBubbleSelect?.(electron.originalBubble!);
                  }}
                  title={`${electron.type}: ${electron.content.substring(0, 50)}...`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${electron.type} in ${shell.name}: ${electron.content}`}
                />
              );
            })}

            {/* Molecule Label */}
            <div 
              className="absolute text-white text-sm font-semibold text-center pointer-events-none"
              style={{
                top: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                minWidth: '100px',
              }}
            >
              {molecule.nucleus.domain}
              <div className="text-xs text-gray-400 mt-1">
                {molecule.electrons.length} electrons
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-20">
        <Button variant="outline" size="sm" onClick={centerView} className="bg-card/80 backdrop-blur-sm">
          <RotateCcw className="h-4 w-4" />
        </Button>
        {atomicState.undoStack.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleUndo} className="bg-card/80 backdrop-blur-sm">
            <Undo2 className="h-4 w-4" />
          </Button>
        )}
        {atomicState.selectedMolecule && (
          <Button
            variant="outline" size="sm"
            onClick={() => handlePhotonPulse(atomicState.selectedMolecule!)}
            className="bg-card/80 backdrop-blur-sm"
          >
            <Zap className="h-4 w-4" />
          </Button>
        )}
        {selectedCount === 2 && (
          <Button variant="outline" size="sm" onClick={handleFusion} className="bg-card/80 backdrop-blur-sm">
            Fusion
          </Button>
        )}
        {selectedCount === 1 && (
          <Button
            variant="outline" size="sm"
            onClick={() => {
              const selected = atomicState.molecules.find(mol => mol.selected);
              if (selected) handleFission(selected.id);
            }}
            className="bg-card/80 backdrop-blur-sm"
          >
            Fission
          </Button>
        )}
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-20">
        <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
          {atomicState.molecules.length} molecules
        </Badge>
        <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
          {atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0)} electrons
        </Badge>
        <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
          {Math.round(viewport.scale * 100)}% zoom
        </Badge>
        {reducedMotion && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            Reduced Motion
          </Badge>
        )}
        {eventState.interaction.type !== 'idle' && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            {eventState.interaction.type.replace('-', ' ')}
          </Badge>
        )}
      </div>

      {/* Accessibility: Screen Reader Info */}
      <div className="sr-only" aria-live="polite">
        {atomicState.selectedMolecule && (
          <div>Selected molecule: {atomicState.selectedMolecule}</div>
        )}
        {eventState.interaction.type === 'dragging-electron' && (
          <div>Dragging electron to {SHELL_CONFIG[eventState.hoveredShell || 0]?.name}</div>
        )}
      </div>
    </div>
  );
};

export default AtomicRenderer;