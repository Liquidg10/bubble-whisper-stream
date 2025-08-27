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
import { useZoomStandard } from '@/hooks/useZoomStandard';
import * as atomicAdapter from './atomicAdapter';

// Atomic structures
interface Electron {
  id: string;
  moleculeId: string;
  shell: number;
  angle: number;
  phase: number;
  content: string;
  type: string;
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
  dragState: {
    isDragging: boolean;
    type: 'electron' | 'molecule' | 'canvas' | null;
    electronId?: string;
    moleculeId?: string;
    lastMousePos?: { x: number; y: number };
    hoveredShell?: number;
  };
  undoStack: Molecule[][];
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
  
  // Canvas viewport state
  const [viewport, setViewport] = useState({
    x: 0, y: 0, scale: 1, width: 0, height: 0
  });
  
  // Atomic state
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecule: null,
    dragState: {
      isDragging: false,
      type: null
    },
    undoStack: []
  });

  // Initialize zoom behavior
  const zoomControls = useZoomStandard({
    onZoomChange: (state) => {
      setViewport(prev => ({
        ...prev,
        scale: state.scale,
        x: state.centerX,
        y: state.centerY
      }));
    },
    getContainerRect: () => canvasRef.current?.getBoundingClientRect() || null
  });

  // Convert bubbles to molecules
  const convertBubblesToMolecules = useCallback((bubbles: Bubble[]): Molecule[] => {
    const moleculeMap = new Map<string, Molecule>();
    
    bubbles.forEach((bubble, index) => {
      const tagStrings = bubble.tags?.map(tag => typeof tag === 'string' ? tag : tag.name || '').filter(Boolean) || [];
      const domain = tagStrings.find(tag => DOMAIN_PRESETS.some(preset => preset.name.toLowerCase() === tag.toLowerCase()))?.toLowerCase() || 'personal';
      const domainPreset = DOMAIN_PRESETS.find(p => p.name.toLowerCase() === domain) || DOMAIN_PRESETS[1];
      
      const shell = tagStrings.includes('today') ? 0 : 
                   tagStrings.includes('week') ? 1 : 2;
      
      const moleculeId = `mol-${domain}-${Math.floor(index / 8)}`;
      
      if (!moleculeMap.has(moleculeId)) {
        moleculeMap.set(moleculeId, {
          id: moleculeId,
          x: (index % 4) * 300 + Math.random() * 100 - 50,
          y: Math.floor(index / 4) * 300 + Math.random() * 100 - 50,
          nucleus: domainPreset.nucleus,
          electrons: [],
          bonds: [],
          pulseActive: false,
          pulseType: null,
          selected: false
        });
      }
      
      const molecule = moleculeMap.get(moleculeId)!;
      const electronCount = molecule.electrons.length;
      
      molecule.electrons.push({
        id: `${moleculeId}-e${electronCount}`,
        moleculeId: moleculeId,
        shell,
        angle: (electronCount * 0.8) % (2 * Math.PI),
        phase: Math.random() * Math.PI * 2,
        content: bubble.content,
        type: bubble.type,
        originalBubble: bubble
      });
    });
    
    return Array.from(moleculeMap.values());
  }, []);

  // Initialize viewport and convert bubbles
  useEffect(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setViewport(prev => ({
        ...prev,
        width: rect.width,
        height: rect.height
      }));
    }
    
    const molecules = convertBubblesToMolecules(bubbles);
    setAtomicState(prev => ({ ...prev, molecules }));
  }, [bubbles, convertBubblesToMolecules]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setViewport(prev => ({
          ...prev,
          width: rect.width,
          height: rect.height
        }));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animation loop
  const updateAnimation = useCallback(() => {
    setAtomicState(prev => ({
      ...prev,
      molecules: prev.molecules.map(mol => ({
        ...mol,
        electrons: mol.electrons.map(electron => ({
          ...electron,
          phase: electron.phase + 0.02
        }))
      }))
    }));
  }, []);

  useEffect(() => {
    if (motionEnabled && !reducedMotion && !atomicState.dragState.isDragging) {
      const animate = () => {
        updateAnimation();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [motionEnabled, reducedMotion, atomicState.dragState.isDragging, updateAnimation]);

  // Event handlers
  const handleElectronDragStart = useCallback((electron: Electron, event: React.MouseEvent) => {
    event.stopPropagation();
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

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!atomicState.dragState.isDragging) return;
    
    const deltaX = event.clientX - (atomicState.dragState.lastMousePos?.x || 0);
    const deltaY = event.clientY - (atomicState.dragState.lastMousePos?.y || 0);
    
    if (atomicState.dragState.type === 'electron') {
      // Handle electron shell transitions
      const electronId = atomicState.dragState.electronId;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || !electronId) return;
      
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol => {
          const electron = mol.electrons.find(e => e.id === electronId);
          if (!electron) return mol;
          
          const molCenterX = mol.x * viewport.scale + viewport.width / 2 + viewport.x;
          const molCenterY = mol.y * viewport.scale + viewport.height / 2 + viewport.y;
          
          const distance = Math.sqrt(
            Math.pow(mouseX - molCenterX, 2) + 
            Math.pow(mouseY - molCenterY, 2)
          ) / viewport.scale;
          
          let targetShell = 2;
          if (distance < 80) targetShell = 0;
          else if (distance < 120) targetShell = 1;
          
          return {
            ...mol,
            electrons: mol.electrons.map(e => 
              e.id === electronId ? { ...e, shell: targetShell } : e
            )
          };
        }),
        dragState: {
          ...prev.dragState,
          lastMousePos: { x: event.clientX, y: event.clientY },
          hoveredShell: Math.min(2, Math.floor((Math.sqrt(deltaX * deltaX + deltaY * deltaY)) / 60))
        }
      }));
    } else if (atomicState.dragState.type === 'molecule') {
      // Handle molecule dragging
      const moleculeId = atomicState.dragState.moleculeId;
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol => 
          mol.id === moleculeId ? {
            ...mol,
            x: mol.x + deltaX / viewport.scale,
            y: mol.y + deltaY / viewport.scale
          } : mol
        ),
        dragState: {
          ...prev.dragState,
          lastMousePos: { x: event.clientX, y: event.clientY }
        }
      }));
    }
  }, [atomicState.dragState, viewport]);

  const handleMouseUp = useCallback(() => {
    if (atomicState.dragState.type === 'electron' && atomicState.dragState.electronId) {
      const electronId = atomicState.dragState.electronId;
      const electron = atomicState.molecules
        .flatMap(mol => mol.electrons)
        .find(e => e.id === electronId);
      
      if (electron && onTimeHorizonUpdate) {
        const tagStrings = electron.originalBubble?.tags?.map(tag => typeof tag === 'string' ? tag : tag.name || '').filter(Boolean) || [];
        const originalShell = tagStrings.includes('today') ? 0 : 
                            tagStrings.includes('week') ? 1 : 2;
        onTimeHorizonUpdate(electron.originalBubble?.id || '', originalShell, electron.shell);
      }
    }
    
    setAtomicState(prev => ({
      ...prev,
      dragState: {
        isDragging: false,
        type: null,
        hoveredShell: undefined
      }
    }));
  }, [atomicState.dragState, atomicState.molecules, onTimeHorizonUpdate]);

  // Attach global mouse events
  useEffect(() => {
    if (atomicState.dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [atomicState.dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Additional handlers
  const handleMoleculeSelect = useCallback((molecule: Molecule) => {
    setAtomicState(prev => ({
      ...prev,
      selectedMolecule: prev.selectedMolecule === molecule.id ? null : molecule.id,
      molecules: prev.molecules.map(mol => ({
        ...mol,
        selected: mol.id === molecule.id ? !mol.selected : false
      }))
    }));
  }, []);

  const handlePhotonPulse = useCallback((type: 'shell' | 'bond') => {
    const selectedMol = atomicState.molecules.find(mol => mol.selected);
    if (!selectedMol) {
      toast({ title: "Select a molecule first", variant: "destructive" });
      return;
    }

    setAtomicState(prev => ({
      ...prev,
      molecules: prev.molecules.map(mol => 
        mol.id === selectedMol.id ? {
          ...mol,
          pulseActive: true,
          pulseType: type
        } : mol
      )
    }));

    setTimeout(() => {
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol => 
          mol.id === selectedMol.id ? {
            ...mol,
            pulseActive: false,
            pulseType: null
          } : mol
        )
      }));
    }, 1000);
  }, [atomicState.molecules, toast]);

  const handleFusion = useCallback(() => {
    const selectedMolecules = atomicState.molecules.filter(mol => mol.selected);
    if (selectedMolecules.length !== 2) {
      toast({ title: "Select exactly 2 molecules to fuse", variant: "destructive" });
      return;
    }

    const [molA, molB] = selectedMolecules;
    
    // Save state for undo
    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack, prev.molecules]
    }));

    const fusedMolecule: Molecule = {
      id: `fused-${molA.id}-${molB.id}`,
      x: (molA.x + molB.x) / 2,
      y: (molA.y + molB.y) / 2,
      nucleus: {
        protons: molA.nucleus.protons + molB.nucleus.protons,
        neutrons: molA.nucleus.neutrons + molB.nucleus.neutrons,
        domain: `${molA.nucleus.domain}+${molB.nucleus.domain}`
      },
      electrons: [...molA.electrons, ...molB.electrons],
      bonds: [...molA.bonds, ...molB.bonds, `${molA.id}-${molB.id}`],
      pulseActive: false,
      pulseType: null,
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      molecules: [
        ...prev.molecules.filter(mol => mol.id !== molA.id && mol.id !== molB.id),
        fusedMolecule
      ],
      selectedMolecule: null
    }));

    if (onMoleculeMerge) {
      onMoleculeMerge(molA.id, molB.id);
    }

    toast({ title: "Molecules fused successfully!" });
  }, [atomicState.molecules, onMoleculeMerge, toast]);

  const handleFission = useCallback(() => {
    const selectedMol = atomicState.molecules.find(mol => mol.selected);
    if (!selectedMol || selectedMol.electrons.length < 2) {
      toast({ title: "Select a molecule with at least 2 electrons", variant: "destructive" });
      return;
    }

    // Save state for undo
    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack, prev.molecules]
    }));

    const splitPoint = Math.ceil(selectedMol.electrons.length / 2);
    const electronGroupA = selectedMol.electrons.slice(0, splitPoint);
    const electronGroupB = selectedMol.electrons.slice(splitPoint);

    const molA: Molecule = {
      id: `${selectedMol.id}-A`,
      x: selectedMol.x - 50,
      y: selectedMol.y - 50,
      nucleus: {
        protons: Math.ceil(selectedMol.nucleus.protons / 2),
        neutrons: Math.ceil(selectedMol.nucleus.neutrons / 2),
        domain: selectedMol.nucleus.domain
      },
      electrons: electronGroupA,
      bonds: [],
      pulseActive: false,
      pulseType: null,
      selected: false
    };

    const molB: Molecule = {
      id: `${selectedMol.id}-B`,
      x: selectedMol.x + 50,
      y: selectedMol.y + 50,
      nucleus: {
        protons: Math.floor(selectedMol.nucleus.protons / 2),
        neutrons: Math.floor(selectedMol.nucleus.neutrons / 2),
        domain: selectedMol.nucleus.domain
      },
      electrons: electronGroupB,
      bonds: [],
      pulseActive: false,
      pulseType: null,
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      molecules: [
        ...prev.molecules.filter(mol => mol.id !== selectedMol.id),
        molA,
        molB
      ],
      selectedMolecule: null
    }));

    toast({ title: "Molecule split successfully!" });
  }, [atomicState.molecules, toast]);

  const handleUndo = useCallback(() => {
    if (atomicState.undoStack.length === 0) return;
    
    const previousState = atomicState.undoStack[atomicState.undoStack.length - 1];
    setAtomicState(prev => ({
      ...prev,
      molecules: previousState,
      undoStack: prev.undoStack.slice(0, -1),
      selectedMolecule: null
    }));
  }, [atomicState.undoStack]);

  const handleQuickAdd = useCallback((domain: string) => {
    const preset = DOMAIN_PRESETS.find(p => p.name === domain);
    if (!preset) return;

    const newMolecule: Molecule = {
      id: `quick-${Date.now()}`,
      x: Math.random() * 200 - 100,
      y: Math.random() * 200 - 100,
      nucleus: preset.nucleus,
      electrons: [],
      bonds: [],
      pulseActive: false,
      pulseType: null,
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      molecules: [...prev.molecules, newMolecule]
    }));

    if (onMoleculeCreate) {
      onMoleculeCreate(domain);
    }
  }, [onMoleculeCreate]);

  const centerView = useCallback(() => {
    if (atomicState.molecules.length === 0) return;
    
    const avgX = atomicState.molecules.reduce((sum, mol) => sum + mol.x, 0) / atomicState.molecules.length;
    const avgY = atomicState.molecules.reduce((sum, mol) => sum + mol.y, 0) / atomicState.molecules.length;
    
    setViewport(prev => ({
      ...prev,
      x: -avgX,
      y: -avgY
    }));
  }, [atomicState.molecules]);

  const toggleMotion = useCallback(() => {
    setMotionEnabled(prev => !prev);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        toggleMotion();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleMotion]);

  return (
    <div className={`relative w-full h-full bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 overflow-hidden ${className}`}>
      {/* Quantum field background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.1),transparent_30%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_40%)]" />
      </div>

      {/* Motion controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Button
          variant={motionEnabled ? "default" : "outline"}
          size="sm"
          onClick={toggleMotion}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          {motionEnabled ? "⏸️ Pause" : "▶️ Play"}
        </Button>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Motion: {motionEnabled ? "ON" : "OFF"}
        </Badge>
      </div>

      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: 'center'
        }}
        onWheel={(e) => zoomControls.handleWheelZoom(e, viewport.scale)}
      >
        {/* Molecules */}
        {atomicState.molecules.map((molecule) => (
          <div
            key={molecule.id}
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
                    borderStyle: molecule.pulseActive && molecule.pulseType === 'shell' ? 'solid' : 'dashed'
                  }}
                >
                  {/* Shell capacity indicator */}
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-white/60">
                    {electronsInShell.length}/{shell.maxElectrons}
                  </div>
                </div>
              );
            })}

            {/* Nucleus */}
            <div
              className={`relative w-12 h-12 rounded-full border-2 border-white/50 cursor-move
                ${molecule.selected ? 'bg-yellow-500/80 shadow-lg shadow-yellow-500/50' : 'bg-blue-500/80'}
                transition-all duration-200 hover:scale-110`}
              onMouseDown={(e) => handleMoleculeDragStart(molecule, e)}
              onClick={() => handleMoleculeSelect(molecule)}
            >
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                {molecule.nucleus.protons}p
                <br />
                {molecule.nucleus.neutrons}n
              </div>
              
              {/* Domain indicator */}
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-white font-medium">
                {molecule.nucleus.domain}
              </div>
            </div>

            {/* Electrons */}
            {molecule.electrons.map((electron) => {
              const shell = SHELL_CONFIG[electron.shell];
              const angle = electron.angle + (motionEnabled ? electron.phase : 0);
              const x = Math.cos(angle) * shell.radius;
              const y = Math.sin(angle) * shell.radius;

              return (
                <div
                  key={electron.id}
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
                    if (onBubbleSelect && electron.originalBubble) {
                      onBubbleSelect(electron.originalBubble);
                    }
                  }}
                  title={electron.content}
                >
                  <div className="absolute inset-0 rounded-full animate-pulse opacity-50" 
                       style={{ backgroundColor: shell.color }} />
                </div>
              );
            })}

            {/* Molecule label */}
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 text-center">
              <div className="text-white text-sm font-medium">
                {molecule.nucleus.domain}
              </div>
              <div className="text-white/60 text-xs">
                {molecule.electrons.length} electrons
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Control buttons */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={centerView}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          <Home className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={atomicState.undoStack.length === 0}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePhotonPulse('shell')}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          <Zap className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFusion}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          🔗
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFission}
          className="bg-black/20 backdrop-blur-sm border-white/20"
        >
          ⚡
        </Button>
      </div>

      {/* Status display */}
      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Molecules: {atomicState.molecules.length}
        </Badge>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Electrons: {atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0)}
        </Badge>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Zoom: {Math.round(viewport.scale * 100)}%
        </Badge>
        {atomicState.dragState.isDragging && (
          <Badge variant="outline" className="bg-yellow-500/20 backdrop-blur-sm border-yellow-400/50 text-yellow-300">
            Dragging: {atomicState.dragState.type}
          </Badge>
        )}
      </div>

      {/* Domain quick-add */}
      <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/20 backdrop-blur-sm border-white/20 p-2">
        <div className="flex gap-1">
          {DOMAIN_PRESETS.slice(0, 4).map((preset) => (
            <Button
              key={preset.name}
              variant="ghost"
              size="sm"
              onClick={() => handleQuickAdd(preset.name)}
              className="text-white hover:bg-white/10"
              title={`Add ${preset.name} molecule`}
            >
              {preset.emoji}
            </Button>
          ))}
        </div>
      </Card>

      {/* Accessibility */}
      <div className="sr-only" aria-live="polite">
        {atomicState.dragState.isDragging && 
          `Dragging ${atomicState.dragState.type}. Current position updated.`}
      </div>
    </div>
  );
};