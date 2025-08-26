/**
 * Complete Atomic/Molecular Canvas Renderer
 * Interactive physics simulation with draggable electrons, fusion/fission, photon pulses
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bubble, BubbleType } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Undo2, Zap, RotateCcw, Home, Calendar, Clock, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as atomicAdapter from './atomicAdapter';

// Atomic state types
interface Electron {
  id: string;
  moleculeId: string;
  shell: number; // 0=Today, 1=Week, 2=Later
  angle: number;
  phase: number;
  content: string;
  type: BubbleType;
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
  bonds: string[];
  pulseActive: boolean;
  pulseType: 'shell' | 'bond' | null;
  selected: boolean;
}

interface AtomicState {
  molecules: Molecule[];
  selectedMolecule: string | null;
  draggedElectron: {
    electronId: string;
    originalShell: number;
    currentShell: number;
    dragX: number;
    dragY: number;
  } | null;
  undoStack: Molecule[][];
  hoveredShell: number | null;
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
  { name: 'Today', radius: 100, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 150, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 200, color: '#10B981', icon: Clock, maxElectrons: 32 }
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
  const [isDragging, setIsDragging] = useState(false);
  
  // Atomic state
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecule: null,
    draggedElectron: null,
    undoStack: [],
    hoveredShell: null
  });
  
  const [viewport, setViewport] = useState({
    x: 0, y: 0, scale: 1, width: 0, height: 0
  });

  // Convert bubbles to molecules using proper domain classification
  const convertBubblesToMolecules = useCallback(() => {
    if (!Array.isArray(bubbles) || bubbles.length === 0) return;
    
    // Import domain classification from adapter
    const { classifyBubbleDomain } = atomicAdapter;
    
    // Group bubbles by classified domain
    const grouped = bubbles.reduce((acc: Record<string, Bubble[]>, bubble: Bubble) => {
      const domain = classifyBubbleDomain(bubble);
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(bubble);
      return acc;
    }, {} as Record<string, Bubble[]>);

    const molecules: Molecule[] = Object.entries(grouped).map(([domain, domainBubbles], index) => {
      const angle = (index / Object.keys(grouped).length) * 2 * Math.PI;
      const distance = 250;
      const x = Math.cos(angle) * distance + (viewport.width / 2 || 400);
      const y = Math.sin(angle) * distance + (viewport.height / 2 || 300);
      
      const electrons: Electron[] = domainBubbles.map((bubble, electronIndex) => {
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
          angle: (electronIndex / Math.max(1, domainBubbles.length)) * 2 * Math.PI,
          phase: Math.random() * 2 * Math.PI,
          content: bubble.content || '',
          type: bubble.type || 'Thought',
          originalBubble: bubble
        };
      });

      return {
        id: `mol-${domain}-${index}`,
        x, y,
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
  }, [bubbles, viewport.width, viewport.height]);

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

  // Animation loop for orbital motion
  useEffect(() => {
    if (reducedMotion) return;
    
    const animate = () => {
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol => ({
          ...mol,
          electrons: mol.electrons.map(electron => ({
            ...electron,
            phase: electron.phase + 0.01
          }))
        }))
      }));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [reducedMotion]);

  // Handle electron drag start
  const handleElectronDragStart = useCallback((electronId: string, originalShell: number, event: React.MouseEvent) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setIsDragging(true);
    setAtomicState(prev => ({
      ...prev,
      draggedElectron: {
        electronId,
        originalShell,
        currentShell: originalShell,
        dragX: event.clientX - rect.left,
        dragY: event.clientY - rect.top
      }
    }));
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!atomicState.draggedElectron) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const dragX = event.clientX - rect.left;
    const dragY = event.clientY - rect.top;
    
    // Calculate which shell we're hovering over
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const distance = Math.sqrt((dragX - centerX) ** 2 + (dragY - centerY) ** 2);
    
    let hoveredShell = null;
    for (let i = 0; i < SHELL_CONFIG.length; i++) {
      const shell = SHELL_CONFIG[i];
      if (distance <= shell.radius + 20) {
        hoveredShell = i;
        break;
      }
    }
    
    setAtomicState(prev => ({
      ...prev,
      draggedElectron: prev.draggedElectron ? {
        ...prev.draggedElectron,
        dragX,
        dragY,
        currentShell: hoveredShell ?? prev.draggedElectron.originalShell
      } : null,
      hoveredShell
    }));
  }, [atomicState.draggedElectron]);

  // Handle mouse up (end drag)
  const handleMouseUp = useCallback(() => {
    if (!atomicState.draggedElectron) return;
    
    const { electronId, originalShell, currentShell } = atomicState.draggedElectron;
    
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    if (currentShell !== originalShell && currentShell !== null) {
      // Save state for undo
      setAtomicState(prev => ({
        ...prev,
        undoStack: [...prev.undoStack.slice(-9), prev.molecules],
        molecules: prev.molecules.map(molecule => ({
          ...molecule,
          electrons: molecule.electrons.map(electron =>
            electron.id === electronId ? { ...electron, shell: currentShell } : electron
          )
        })),
        draggedElectron: null,
        hoveredShell: null
      }));

      // Notify parent component
      onTimeHorizonUpdate?.(electronId, originalShell, currentShell);
      
      const shellName = SHELL_CONFIG[currentShell]?.name || 'Unknown';
      toast({
        title: "Time horizon updated",
        description: `Moved to ${shellName}`,
        duration: 2000,
      });
    } else {
      setAtomicState(prev => ({ ...prev, draggedElectron: null, hoveredShell: null }));
    }
  }, [atomicState.draggedElectron, toast, handleMouseMove]);

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

    const fusedMolecule: Molecule = {
      id: `${mol1.id}-${mol2.id}`,
      x: (mol1.x + mol2.x) / 2,
      y: (mol1.y + mol2.y) / 2,
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
      action: <Button variant="outline" size="sm" onClick={handleUndo}>Undo</Button>,
      duration: 8000,
    });
  }, [atomicState.molecules, toast]);

  // Fission (split molecule)
  const handleFission = useCallback((moleculeId: string) => {
    const molecule = atomicState.molecules.find(mol => mol.id === moleculeId);
    if (!molecule || molecule.electrons.length < 2) return;

    const midpoint = Math.floor(molecule.electrons.length / 2);
    const electrons1 = molecule.electrons.slice(0, midpoint);
    const electrons2 = molecule.electrons.slice(midpoint);

    const splitMolecules: Molecule[] = [
      {
        id: `${moleculeId}-A`,
        x: molecule.x - 60,
        y: molecule.y - 60,
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
        x: molecule.x + 60,
        y: molecule.y + 60,
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
      action: <Button variant="outline" size="sm" onClick={handleUndo}>Undo</Button>,
      duration: 8000,
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
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    const newMolecule: Molecule = {
      id: `${preset.name}-${Date.now()}`,
      x, y,
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
  }, []);

  // Center view
  const centerView = useCallback(() => {
    if (atomicState.molecules.length === 0) return;
    const bounds = atomicState.molecules.reduce(
      (acc, mol) => ({
        minX: Math.min(acc.minX, mol.x),
        maxX: Math.max(acc.maxX, mol.x),
        minY: Math.min(acc.minY, mol.y),
        maxY: Math.max(acc.maxY, mol.y)
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

      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab"
        style={{
          transform: `translate(${viewport.width / 2}px, ${viewport.height / 2}px) scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`,
          transformOrigin: '0 0',
        }}
      >
        {/* Render Molecules */}
        {atomicState.molecules.map(molecule => (
          <div
            key={molecule.id}
            className="absolute"
            style={{
              left: molecule.x,
              top: molecule.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Nucleus */}
            <div 
              className={`relative w-16 h-16 rounded-full border-2 cursor-pointer transition-all ${
                molecule.selected ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' : 'border-gray-400'
              }`}
              style={{
                background: `radial-gradient(circle, ${
                  DOMAIN_PRESETS.find(p => p.name === molecule.nucleus.domain)?.color || '#6B7280'
                }, #1F2937)`,
              }}
              onClick={() => handleMoleculeSelect(molecule.id)}
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
            {SHELL_CONFIG.map((shell, shellIndex) => (
              <div
                key={shellIndex}
                className={`absolute rounded-full border transition-all ${
                  atomicState.hoveredShell === shellIndex ? 'border-2 opacity-80' : 'border opacity-30'
                }`}
                style={{
                  width: shell.radius * 2,
                  height: shell.radius * 2,
                  left: -shell.radius,
                  top: -shell.radius,
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
              </div>
            ))}

            {/* Electrons */}
            {molecule.electrons.map((electron) => {
              const shell = SHELL_CONFIG[electron.shell];
              if (!shell) return null;

              const angle = electron.angle + (reducedMotion ? 0 : electron.phase);
              const x = Math.cos(angle) * shell.radius;
              const y = Math.sin(angle) * shell.radius;

              return (
                <div
                  key={electron.id}
                  className="absolute w-3 h-3 rounded-full cursor-grab transition-all hover:scale-125"
                  style={{
                    left: x - 6,
                    top: y - 6,
                    backgroundColor: shell.color,
                    boxShadow: `0 0 8px ${shell.color}`,
                    zIndex: 10,
                  }}
                  onMouseDown={(e) => handleElectronDragStart(electron.id, electron.shell, e)}
                  onClick={() => onBubbleSelect?.(electron.originalBubble!)}
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
        ))}

        {/* Dragged Electron Ghost */}
        {atomicState.draggedElectron && (
          <div
            className="absolute w-4 h-4 rounded-full bg-cyan-400 pointer-events-none z-50"
            style={{
              left: atomicState.draggedElectron.dragX - 8,
              top: atomicState.draggedElectron.dragY - 8,
              boxShadow: '0 0 12px #22D3EE',
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-20">
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

      {/* Domain Preset Cards */}
      <div className="absolute top-4 right-4 max-w-xs z-20">
        <Card className="p-3 bg-card/80 backdrop-blur-sm">
          <h3 className="text-sm font-semibold mb-2">Quick Add Domains</h3>
          <div className="grid grid-cols-2 gap-2">
            {DOMAIN_PRESETS.map(preset => (
              <Button
                key={preset.name}
                variant="outline" size="sm"
                onClick={() => handleQuickAdd(preset)}
                className="justify-start gap-2 h-auto p-2"
              >
                <span className="text-base">{preset.emoji}</span>
                <span className="text-xs">{preset.name}</span>
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Time Horizon Status */}
      <div className="absolute bottom-4 right-4 z-20">
        <Card className="p-2 bg-card/80 backdrop-blur-sm">
          <div className="text-xs font-semibold mb-2">Time Horizons</div>
          <div className="space-y-1">
            {SHELL_CONFIG.map((shell, index) => {
              const electronCount = atomicState.molecules.reduce(
                (sum, mol) => sum + mol.electrons.filter(e => e.shell === index).length, 0
              );
              return (
                <div key={index} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <shell.icon className="h-3 w-3" style={{ color: shell.color }} />
                    <span>{shell.name}</span>
                  </div>
                  <Badge variant="outline" style={{ borderColor: shell.color }}>
                    {electronCount}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-20">
        <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
          {atomicState.molecules.length} molecules
        </Badge>
        <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm">
          {atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0)} electrons
        </Badge>
        {reducedMotion && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            Reduced Motion
          </Badge>
        )}
        {isDragging && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            Dragging
          </Badge>
        )}
      </div>

      {/* Accessibility: Screen Reader Info */}
      <div className="sr-only" aria-live="polite">
        {atomicState.selectedMolecule && (
          <div>Selected molecule: {atomicState.selectedMolecule}</div>
        )}
        {atomicState.draggedElectron && (
          <div>Dragging electron to {SHELL_CONFIG[atomicState.draggedElectron.currentShell]?.name}</div>
        )}
      </div>
    </div>
  );
};

export default AtomicRenderer;