/**
 * Atomic/Molecular Canvas Renderer
 * Complete interactive mock with electrons, fusion/fission, photon pulses
 * LOD-friendly animations, accessibility support
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble, BubbleType } from '@/types/bubble';
import { BubbleCanvasProps } from '@/themes/ThemeTypes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Undo2, Zap, Plus, RotateCcw, Home, Calendar, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

// Atomic state types
interface Electron {
  id: string;
  moleculeId: string;
  shell: number; // 0=Today, 1=Week, 2=Later
  angle: number;
  phase: number;
  content: string;
  type: BubbleType;
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
  bonds: string[]; // Connected molecule IDs
  pulseActive: boolean;
  pulseType: 'shell' | 'bond' | null;
}

interface AtomicState {
  molecules: Molecule[];
  selectedMolecule: string | null;
  draggedElectron: {
    electronId: string;
    originalShell: number;
    currentShell: number;
  } | null;
  undoStack: Molecule[][];
}

// Domain presets for quick molecule creation
const DOMAIN_PRESETS = [
  { 
    name: 'Work', 
    emoji: '💼', 
    color: '#3B82F6',
    nucleus: { protons: 6, neutrons: 6, domain: 'Work' }
  },
  { 
    name: 'Personal', 
    emoji: '🏠', 
    color: '#10B981',
    nucleus: { protons: 4, neutrons: 5, domain: 'Personal' }
  },
  { 
    name: 'Health', 
    emoji: '⚕️', 
    color: '#EF4444',
    nucleus: { protons: 8, neutrons: 8, domain: 'Health' }
  },
  { 
    name: 'Learning', 
    emoji: '📚', 
    color: '#8B5CF6',
    nucleus: { protons: 5, neutrons: 6, domain: 'Learning' }
  },
  { 
    name: 'Relationships', 
    emoji: '💝', 
    color: '#EC4899',
    nucleus: { protons: 7, neutrons: 7, domain: 'Relationships' }
  },
  { 
    name: 'Finance', 
    emoji: '💰', 
    color: '#F59E0B',
    nucleus: { protons: 9, neutrons: 10, domain: 'Finance' }
  }
];

// Shell configuration
const SHELL_CONFIG = [
  { name: 'Today', radius: 120, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 180, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 240, color: '#10B981', icon: Clock, maxElectrons: 32 }
];

export default function AtomicRenderer({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  console.log('AtomicRenderer component loaded');
  const { bubbles, settings, selectedBubbles, mergeBubbles, undoLastMerge } = useBubbleStore();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Accessibility settings
  const reducedMotion = settings.reducedMotion || false;
  const highContrast = settings.highContrast || false;
  
  // Atomic state
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecule: null,
    draggedElectron: null,
    undoStack: []
  });
  
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    scale: 1,
    width: 0,
    height: 0
  });

  // Convert bubbles to molecules
  const convertBubblesToMolecules = useCallback(() => {
    const grouped = bubbles.reduce((acc, bubble) => {
      // Group by tags or domain (simplified)
      const domain = bubble.tags?.[0]?.name || 'General';
      if (!acc[domain]) {
        acc[domain] = [];
      }
      acc[domain].push(bubble);
      return acc;
    }, {} as Record<string, Bubble[]>);

    const molecules: Molecule[] = Object.entries(grouped).map(([domain, bubbles], index) => {
      // Position molecules in a rough grid
      const angle = (index / Object.keys(grouped).length) * 2 * Math.PI;
      const distance = 300;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      
      // Convert bubbles to electrons
      const electrons: Electron[] = bubbles.map((bubble, electronIndex) => ({
        id: bubble.id,
        moleculeId: domain,
        shell: electronIndex % 3, // Distribute across shells
        angle: (electronIndex / bubbles.length) * 2 * Math.PI,
        phase: Math.random() * 2 * Math.PI,
        content: bubble.content || '',
        type: bubble.type || 'Thought'
      }));

      return {
        id: domain,
        x,
        y,
        nucleus: {
          protons: Math.min(bubbles.length, 20),
          neutrons: Math.min(bubbles.length + 2, 22),
          domain
        },
        electrons,
        bonds: [],
        pulseActive: false,
        pulseType: null
      };
    });

    setAtomicState(prev => ({ ...prev, molecules }));
  }, [bubbles]);

  // Initialize molecules from bubbles
  useEffect(() => {
    convertBubblesToMolecules();
  }, [convertBubblesToMolecules]);

  // Initialize viewport
  useEffect(() => {
    const updateViewport = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setViewport(prev => ({
          ...prev,
          width: rect.width,
          height: rect.height
        }));
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Handle electron drag between shells
  const handleElectronDragStart = useCallback((electronId: string, originalShell: number) => {
    setAtomicState(prev => ({
      ...prev,
      draggedElectron: {
        electronId,
        originalShell,
        currentShell: originalShell
      }
    }));
  }, []);

  const handleElectronDragEnd = useCallback((targetShell: number) => {
    if (!atomicState.draggedElectron) return;

    const { electronId, originalShell } = atomicState.draggedElectron;
    
    if (targetShell !== originalShell) {
      // Save state for undo
      setAtomicState(prev => ({
        ...prev,
        undoStack: [...prev.undoStack.slice(-9), prev.molecules], // Keep last 10 states
        molecules: prev.molecules.map(molecule => ({
          ...molecule,
          electrons: molecule.electrons.map(electron =>
            electron.id === electronId
              ? { ...electron, shell: targetShell }
              : electron
          )
        })),
        draggedElectron: null
      }));

      // Show time horizon feedback
      const shellName = SHELL_CONFIG[targetShell]?.name || 'Unknown';
      toast({
        title: "Time horizon updated",
        description: `Moved to ${shellName}`,
        duration: 2000,
      });
    } else {
      setAtomicState(prev => ({ ...prev, draggedElectron: null }));
    }
  }, [atomicState.draggedElectron, toast]);

  // Fusion (merge molecules)
  const handleFusion = useCallback((mol1Id: string, mol2Id: string) => {
    const mol1 = atomicState.molecules.find(m => m.id === mol1Id);
    const mol2 = atomicState.molecules.find(m => m.id === mol2Id);
    
    if (!mol1 || !mol2) return;

    // Save state for undo
    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: prev.molecules
        .filter(m => m.id !== mol1Id && m.id !== mol2Id)
        .concat({
          id: `${mol1Id}-${mol2Id}`,
          x: (mol1.x + mol2.x) / 2,
          y: (mol1.y + mol2.y) / 2,
          nucleus: {
            protons: mol1.nucleus.protons + mol2.nucleus.protons,
            neutrons: mol1.nucleus.neutrons + mol2.nucleus.neutrons,
            domain: `${mol1.nucleus.domain}+${mol2.nucleus.domain}`
          },
          electrons: [...mol1.electrons, ...mol2.electrons],
          bonds: [...new Set([...mol1.bonds, ...mol2.bonds])],
          pulseActive: true,
          pulseType: 'bond'
        })
    }));

    toast({
      title: "Fusion complete",
      description: "Molecules combined",
      action: (
        <Button variant="outline" size="sm" onClick={handleUndo}>
          Undo
        </Button>
      ),
      duration: 8000,
    });
  }, [atomicState.molecules, toast]);

  // Fission (split molecule)
  const handleFission = useCallback((moleculeId: string) => {
    const molecule = atomicState.molecules.find(m => m.id === moleculeId);
    if (!molecule || molecule.electrons.length < 2) return;

    // Save state for undo
    const midpoint = Math.floor(molecule.electrons.length / 2);
    const electrons1 = molecule.electrons.slice(0, midpoint);
    const electrons2 = molecule.electrons.slice(midpoint);

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: prev.molecules
        .filter(m => m.id !== moleculeId)
        .concat([
          {
            id: `${moleculeId}-A`,
            x: molecule.x - 50,
            y: molecule.y - 50,
            nucleus: {
              protons: Math.ceil(molecule.nucleus.protons / 2),
              neutrons: Math.ceil(molecule.nucleus.neutrons / 2),
              domain: molecule.nucleus.domain + '-A'
            },
            electrons: electrons1,
            bonds: [],
            pulseActive: true,
            pulseType: 'shell'
          },
          {
            id: `${moleculeId}-B`,
            x: molecule.x + 50,
            y: molecule.y + 50,
            nucleus: {
              protons: Math.floor(molecule.nucleus.protons / 2),
              neutrons: Math.floor(molecule.nucleus.neutrons / 2),
              domain: molecule.nucleus.domain + '-B'
            },
            electrons: electrons2,
            bonds: [],
            pulseActive: true,
            pulseType: 'shell'
          }
        ])
    }));

    toast({
      title: "Fission complete",
      description: "Molecule split",
      action: (
        <Button variant="outline" size="sm" onClick={handleUndo}>
          Undo
        </Button>
      ),
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
      undoStack: prev.undoStack.slice(0, -1)
    }));

    toast({
      title: "Undone",
      description: "Reverted to previous state",
      duration: 2000,
    });
  }, [atomicState.undoStack, toast]);

  // Add new molecule from domain preset
  const handleQuickAdd = useCallback((preset: typeof DOMAIN_PRESETS[0]) => {
    const angle = Math.random() * 2 * Math.PI;
    const distance = 200 + Math.random() * 100;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    const newMolecule: Molecule = {
      id: `${preset.name}-${Date.now()}`,
      x,
      y,
      nucleus: preset.nucleus,
      electrons: [],
      bonds: [],
      pulseActive: true,
      pulseType: 'shell'
    };

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: [...prev.molecules, newMolecule]
    }));
  }, []);

  // Photon pulse effect
  const handlePhotonPulse = useCallback((moleculeId: string) => {
    setAtomicState(prev => ({
      ...prev,
      molecules: prev.molecules.map(mol =>
        mol.id === moleculeId
          ? { ...mol, pulseActive: true, pulseType: 'shell' }
          : mol
      )
    }));

    setTimeout(() => {
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol =>
          mol.id === moleculeId
            ? { ...mol, pulseActive: false, pulseType: null }
            : mol
        )
      }));
    }, 1000);
  }, []);

  // Center view on molecules
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

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setViewport(prev => ({
      ...prev,
      x: centerX,
      y: centerY,
      scale: 1
    }));
  }, [atomicState.molecules]);

  return (
    <div className={`relative w-full h-full overflow-hidden ${highContrast ? 'high-contrast' : ''} ${className}`}>
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
        className="absolute inset-0"
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
              className={`relative w-20 h-20 rounded-full border-2 cursor-pointer transition-all ${
                atomicState.selectedMolecule === molecule.id 
                  ? 'border-yellow-400 shadow-lg shadow-yellow-400/50' 
                  : 'border-gray-400'
              }`}
              style={{
                background: `radial-gradient(circle, ${
                  DOMAIN_PRESETS.find(p => p.name === molecule.nucleus.domain)?.color || '#6B7280'
                }, #1F2937)`,
              }}
              onClick={() => setAtomicState(prev => ({ 
                ...prev, 
                selectedMolecule: prev.selectedMolecule === molecule.id ? null : molecule.id 
              }))}
            >
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                {molecule.nucleus.protons}p
                <br />
                {molecule.nucleus.neutrons}n
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
                className="absolute rounded-full border border-gray-600 opacity-30"
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
            {molecule.electrons.map((electron, electronIndex) => {
              const shell = SHELL_CONFIG[electron.shell];
              if (!shell) return null;

              const angle = electron.angle + (reducedMotion ? 0 : Date.now() * 0.001 + electron.phase);
              const x = Math.cos(angle) * shell.radius;
              const y = Math.sin(angle) * shell.radius;

              return (
                <div
                  key={electron.id}
                  className="absolute w-4 h-4 rounded-full cursor-pointer transition-all"
                  style={{
                    left: x - 8,
                    top: y - 8,
                    backgroundColor: shell.color,
                    boxShadow: `0 0 10px ${shell.color}`,
                    zIndex: 10,
                  }}
                  onClick={() => onBubbleSelect?.(bubbles.find(b => b.id === electron.id)!)}
                  onMouseDown={() => handleElectronDragStart(electron.id, electron.shell)}
                  title={`${electron.type}: ${electron.content.substring(0, 50)}...`}
                >
                  {/* Electron Trail */}
                  {!reducedMotion && (
                    <div 
                      className="absolute w-2 h-2 rounded-full opacity-50"
                      style={{
                        backgroundColor: shell.color,
                        left: -4,
                        top: -4,
                        transform: `translate(${-Math.cos(angle) * 10}px, ${-Math.sin(angle) * 10}px)`,
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Molecule Label */}
            <div 
              className="absolute text-white text-sm font-semibold text-center"
              style={{
                top: 50,
                left: '50%',
                transform: 'translateX(-50%)',
                minWidth: '120px',
              }}
            >
              {molecule.nucleus.domain}
              <div className="text-xs text-gray-400 mt-1">
                {molecule.electrons.length} electrons
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-20">
        <Button
          variant="outline"
          size="sm"
          onClick={centerView}
          className="bg-card/80 backdrop-blur-sm"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        {atomicState.undoStack.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            className="bg-card/80 backdrop-blur-sm"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        )}
        {atomicState.selectedMolecule && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePhotonPulse(atomicState.selectedMolecule!)}
            className="bg-card/80 backdrop-blur-sm"
          >
            <Zap className="h-4 w-4" />
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
                variant="outline"
                size="sm"
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
        {highContrast && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            High Contrast
          </Badge>
        )}
      </div>

      {/* Time Horizon Indicators */}
      <div className="absolute bottom-4 right-4 z-20">
        <Card className="p-2 bg-card/80 backdrop-blur-sm">
          <div className="text-xs font-semibold mb-2">Time Horizons</div>
          <div className="space-y-1">
            {SHELL_CONFIG.map((shell, index) => {
              const electronCount = atomicState.molecules.reduce(
                (sum, mol) => sum + mol.electrons.filter(e => e.shell === index).length,
                0
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

      {/* Accessibility: Screen Reader Info */}
      <div className="sr-only" aria-live="polite">
        {atomicState.selectedMolecule && (
          <div>
            Selected molecule: {atomicState.selectedMolecule}
          </div>
        )}
      </div>
    </div>
  );
}