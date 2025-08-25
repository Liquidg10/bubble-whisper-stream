/**
 * Enhanced Atomic Renderer with Zoom, Pan, Cross-Molecule Drag, and Smart Positioning
 * Features: Full viewport control, cross-molecule electron transfer, collision detection
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bubble, BubbleType } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { 
  Undo2, Zap, RotateCcw, Home, Calendar, Clock, Plus, 
  ZoomIn, ZoomOut, Move, Shuffle, Target, MousePointer2 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useZoomStandard } from '@/hooks/useZoomStandard';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { calculateDistance, getBubbleRadius } from '@/utils/collision';
import * as atomicAdapter from './atomicAdapter';

// Enhanced atomic state types
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
  isDragging?: boolean;
}

interface ViewportState {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

interface DragState {
  type: 'electron' | 'nucleus' | null;
  electronId?: string;
  moleculeId?: string;
  originalShell?: number;
  targetMoleculeId?: string;
  targetShell?: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface AtomicState {
  molecules: Molecule[];
  selectedMolecules: string[];
  dragState: DragState | null;
  undoStack: Molecule[][];
  hoveredShell: number | null;
  hoveredMolecule: string | null;
}

// Domain presets with enhanced positioning
const DOMAIN_PRESETS = [
  { name: 'Work', emoji: '💼', color: '#3B82F6', nucleus: { protons: 6, neutrons: 6, domain: 'Work' }},
  { name: 'Personal', emoji: '🏠', color: '#10B981', nucleus: { protons: 4, neutrons: 5, domain: 'Personal' }},
  { name: 'Health', emoji: '⚕️', color: '#EF4444', nucleus: { protons: 8, neutrons: 8, domain: 'Health' }},
  { name: 'Learning', emoji: '📚', color: '#8B5CF6', nucleus: { protons: 5, neutrons: 6, domain: 'Learning' }},
  { name: 'Relationships', emoji: '💝', color: '#EC4899', nucleus: { protons: 7, neutrons: 7, domain: 'Relationships' }},
  { name: 'Finance', emoji: '💰', color: '#F59E0B', nucleus: { protons: 9, neutrons: 10, domain: 'Finance' }}
];

// Enhanced shell configuration
const SHELL_CONFIG = [
  { name: 'Today', radius: 80, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 120, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 160, color: '#10B981', icon: Clock, maxElectrons: 32 }
];

interface EnhancedAtomicRendererProps {
  bubbles?: any[];
  onBubbleSelect?: (bubble: Bubble) => void;
  onTimeHorizonUpdate?: (bubbleId: string, fromRing: number, toRing: number) => void;
  onMoleculeCreate?: (domain: string) => void;
  onMoleculeMerge?: (aId: string, bId: string) => void;
  reducedMotion?: boolean;
  highContrast?: boolean;
  className?: string;
}

export const EnhancedAtomicRenderer: React.FC<EnhancedAtomicRendererProps> = ({ 
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
  
  // Enhanced state management
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecules: [],
    dragState: null,
    undoStack: [],
    hoveredShell: null,
    hoveredMolecule: null
  });
  
  const [viewport, setViewport] = useState<ViewportState>({
    x: 0, y: 0, scale: 1, width: 0, height: 0
  });

  const [isAutoArranging, setIsAutoArranging] = useState(false);

  // Zoom and pan functionality
  const getContainerRect = useCallback(() => {
    return canvasRef.current?.getBoundingClientRect() || null;
  }, []);

  const handleZoomChange = useCallback(({ scale, centerX, centerY }: any) => {
    setViewport(prev => ({ ...prev, scale, x: centerX, y: centerY }));
  }, []);

  const zoom = useZoomStandard({
    config: { minScale: 0.2, maxScale: 4, zoomSpeed: 1.3 },
    onZoomChange: handleZoomChange,
    getContainerRect
  });

  const pinchZoom = usePinchZoom({
    onZoom: (scale, center) => handleZoomChange({ scale, centerX: center.x, centerY: center.y }),
    onPan: (delta) => setViewport(prev => ({ 
      ...prev, 
      x: prev.x + delta.x, 
      y: prev.y + delta.y 
    })),
    minScale: 0.2,
    maxScale: 4,
    enabled: true
  });

  // Convert bubbles to molecules with smart positioning
  const convertBubblesToMolecules = useCallback(() => {
    if (!Array.isArray(bubbles)) return;
    
    const grouped = bubbles.reduce((acc: Record<string, any[]>, bubble: any) => {
      const domain = bubble.tags?.[0]?.name || 'General';
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(bubble);
      return acc;
    }, {} as Record<string, any[]>);

    const molecules: Molecule[] = Object.entries(grouped).map(([domain, domainBubbles], index) => {
      // Smart positioning with collision avoidance
      const position = findOptimalPosition(index, Object.keys(grouped).length);
      
      const electrons: Electron[] = (domainBubbles as any[]).map((bubble: any, electronIndex: number) => ({
        id: bubble.id,
        moleculeId: domain,
        shell: bubble.timeHorizon || electronIndex % 3,
        angle: (electronIndex / (domainBubbles as any[]).length) * 2 * Math.PI,
        phase: Math.random() * 2 * Math.PI,
        content: bubble.content || '',
        type: bubble.type || 'Thought',
        originalBubble: bubble
      }));

      return {
        id: `mol-${domain}-${index}`,
        x: position.x,
        y: position.y,
        nucleus: {
          protons: Math.min((domainBubbles as any[]).length, 20),
          neutrons: Math.min((domainBubbles as any[]).length + 2, 22),
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

  // Smart positioning algorithm
  const findOptimalPosition = useCallback((index: number, total: number) => {
    if (total <= 1) return { x: 0, y: 0 };
    
    // Use golden ratio spiral for optimal distribution
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angle = index * 2 * Math.PI / goldenRatio;
    const radius = Math.sqrt(index) * 120; // Adaptive radius
    
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }, []);

  // Collision detection for molecules
  const checkMoleculeCollisions = useCallback((molecules: Molecule[]) => {
    const collisions: Array<{mol1: Molecule, mol2: Molecule, distance: number}> = [];
    
    for (let i = 0; i < molecules.length; i++) {
      for (let j = i + 1; j < molecules.length; j++) {
        const mol1 = molecules[i];
        const mol2 = molecules[j];
        const distance = calculateDistance(mol1, mol2);
        const minDistance = 200; // Minimum safe distance between molecules
        
        if (distance < minDistance) {
          collisions.push({ mol1, mol2, distance });
        }
      }
    }
    
    return collisions;
  }, []);

  // Auto-arrange molecules to avoid overlaps
  const autoArrangeMolecules = useCallback(() => {
    setIsAutoArranging(true);
    
    setAtomicState(prev => {
      const newMolecules = [...prev.molecules];
      const collisions = checkMoleculeCollisions(newMolecules);
      
      if (collisions.length === 0) {
        setIsAutoArranging(false);
        return prev;
      }

      // Apply force-directed layout
      newMolecules.forEach((molecule, index) => {
        let forceX = 0;
        let forceY = 0;
        
        newMolecules.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          
          const distance = calculateDistance(molecule, other);
          const minDistance = 220;
          
          if (distance < minDistance && distance > 0) {
            const force = (minDistance - distance) / minDistance;
            const angle = Math.atan2(molecule.y - other.y, molecule.x - other.x);
            forceX += Math.cos(angle) * force * 50;
            forceY += Math.sin(angle) * force * 50;
          }
        });
        
        molecule.x += forceX;
        molecule.y += forceY;
      });
      
      return { ...prev, molecules: newMolecules, undoStack: [...prev.undoStack.slice(-9), prev.molecules] };
    });
    
    setTimeout(() => setIsAutoArranging(false), 1000);
    
    toast({
      title: "Auto-arrange complete",
      description: "Molecules repositioned to avoid overlaps",
      duration: 3000,
    });
  }, [checkMoleculeCollisions, toast]);

  // Enhanced drag handling for cross-molecule transfers
  const handleDragStart = useCallback((
    type: 'electron' | 'nucleus',
    id: string,
    event: React.MouseEvent
  ) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const startX = (event.clientX - rect.left - viewport.width / 2) / viewport.scale + viewport.x;
    const startY = (event.clientY - rect.top - viewport.height / 2) / viewport.scale + viewport.y;
    
    if (type === 'electron') {
      const electron = atomicState.molecules
        .flatMap(mol => mol.electrons)
        .find(e => e.id === id);
      
      if (electron) {
        setAtomicState(prev => ({
          ...prev,
          dragState: {
            type: 'electron',
            electronId: id,
            moleculeId: electron.moleculeId,
            originalShell: electron.shell,
            startX,
            startY,
            currentX: startX,
            currentY: startY
          }
        }));
      }
    } else {
      // Nucleus dragging
      setAtomicState(prev => ({
        ...prev,
        dragState: {
          type: 'nucleus',
          moleculeId: id,
          startX,
          startY,
          currentX: startX,
          currentY: startY
        },
        molecules: prev.molecules.map(mol => 
          mol.id === id ? { ...mol, isDragging: true } : mol
        )
      }));
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [atomicState.molecules, viewport]);

  // Enhanced mouse move handling
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !atomicState.dragState) return;
    
    const currentX = (event.clientX - rect.left - viewport.width / 2) / viewport.scale + viewport.x;
    const currentY = (event.clientY - rect.top - viewport.height / 2) / viewport.scale + viewport.y;
    
    setAtomicState(prev => {
      if (!prev.dragState) return prev;
      
      const newDragState = { ...prev.dragState, currentX, currentY };
      
      if (prev.dragState.type === 'electron') {
        // Check for target molecule and shell
        let targetMoleculeId: string | null = null;
        let targetShell: number | null = null;
        
        for (const molecule of prev.molecules) {
          const distanceToNucleus = calculateDistance(
            { x: currentX, y: currentY },
            { x: molecule.x, y: molecule.y }
          );
          
          // Check which shell we're hovering over
          for (let i = 0; i < SHELL_CONFIG.length; i++) {
            const shell = SHELL_CONFIG[i];
            if (distanceToNucleus <= shell.radius + 20 && distanceToNucleus >= shell.radius - 20) {
              targetMoleculeId = molecule.id;
              targetShell = i;
              break;
            }
          }
          
          if (targetMoleculeId) break;
        }
        
        newDragState.targetMoleculeId = targetMoleculeId || undefined;
        newDragState.targetShell = targetShell || undefined;
        
        return {
          ...prev,
          dragState: newDragState,
          hoveredMolecule: targetMoleculeId,
          hoveredShell: targetShell
        };
      } else {
        // Nucleus dragging - update molecule position
        return {
          ...prev,
          dragState: newDragState,
          molecules: prev.molecules.map(mol =>
            mol.id === prev.dragState?.moleculeId
              ? { ...mol, x: currentX, y: currentY }
              : mol
          )
        };
      }
    });
  }, [atomicState.dragState, viewport]);

  // Enhanced mouse up handling
  const handleMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    setAtomicState(prev => {
      if (!prev.dragState) return prev;
      
      const { dragState } = prev;
      let newMolecules = [...prev.molecules];
      
      if (dragState.type === 'electron') {
        // Handle electron transfer
        if (dragState.targetMoleculeId && dragState.targetShell !== undefined) {
          // Move electron to target molecule and shell
          newMolecules = newMolecules.map(mol => {
            if (mol.id === dragState.moleculeId) {
              // Remove electron from source molecule
              return {
                ...mol,
                electrons: mol.electrons.filter(e => e.id !== dragState.electronId)
              };
            } else if (mol.id === dragState.targetMoleculeId) {
              // Add electron to target molecule
              const electron = prev.molecules
                .find(m => m.id === dragState.moleculeId)?.electrons
                .find(e => e.id === dragState.electronId);
              
              if (electron) {
                return {
                  ...mol,
                  electrons: [...mol.electrons, {
                    ...electron,
                    moleculeId: mol.id,
                    shell: dragState.targetShell!,
                    angle: Math.random() * 2 * Math.PI
                  }]
                };
              }
            }
            return mol;
          });
          
          // Notify parent of time horizon change
          onTimeHorizonUpdate?.(dragState.electronId!, dragState.originalShell!, dragState.targetShell);
          
          toast({
            title: "Electron transferred",
            description: `Moved to ${SHELL_CONFIG[dragState.targetShell].name} shell`,
            duration: 2000,
          });
        }
      }
      
      // Reset drag state
      return {
        ...prev,
        molecules: newMolecules.map(mol => ({ ...mol, isDragging: false })),
        dragState: null,
        hoveredMolecule: null,
        hoveredShell: null,
        undoStack: dragState.type === 'electron' && dragState.targetMoleculeId 
          ? [...prev.undoStack.slice(-9), prev.molecules] 
          : prev.undoStack
      };
    });
  }, [handleMouseMove, onTimeHorizonUpdate, toast]);

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
            phase: electron.phase + 0.005 // Slower, more natural motion
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      zoom.cleanup();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [zoom]);

  // Other handlers (fusion, fission, undo, etc.) remain similar but enhanced...
  const handleFusion = useCallback(() => {
    const selectedMols = atomicState.molecules.filter(mol => 
      atomicState.selectedMolecules.includes(mol.id)
    );
    if (selectedMols.length !== 2) return;

    const [mol1, mol2] = selectedMols;
    onMoleculeMerge?.(mol1.id, mol2.id);

    // Enhanced fusion with better positioning
    const fusedMolecule: Molecule = {
      id: `fused-${Date.now()}`,
      x: (mol1.x + mol2.x) / 2,
      y: (mol1.y + mol2.y) / 2,
      nucleus: {
        protons: mol1.nucleus.protons + mol2.nucleus.protons,
        neutrons: mol1.nucleus.neutrons + mol2.nucleus.neutrons,
        domain: `${mol1.nucleus.domain}+${mol2.nucleus.domain}`
      },
      electrons: [...mol1.electrons, ...mol2.electrons].map((electron, index) => ({
        ...electron,
        moleculeId: `fused-${Date.now()}`,
        angle: (index / (mol1.electrons.length + mol2.electrons.length)) * 2 * Math.PI
      })),
      bonds: [...mol1.bonds, ...mol2.bonds],
      pulseActive: true,
      pulseType: 'bond',
      selected: false
    };

    setAtomicState(prev => ({
      ...prev,
      undoStack: [...prev.undoStack.slice(-9), prev.molecules],
      molecules: [...prev.molecules.filter(mol => !atomicState.selectedMolecules.includes(mol.id)), fusedMolecule],
      selectedMolecules: []
    }));

    toast({
      title: "Fusion complete",
      description: "Molecules combined successfully",
      duration: 3000,
    });
  }, [atomicState.molecules, atomicState.selectedMolecules, onMoleculeMerge, toast]);

  const centerView = useCallback(() => {
    if (atomicState.molecules.length === 0) return;
    
    const bounds = atomicState.molecules.reduce(
      (acc, mol) => ({
        minX: Math.min(acc.minX, mol.x - 200),
        maxX: Math.max(acc.maxX, mol.x + 200),
        minY: Math.min(acc.minY, mol.y - 200),
        maxY: Math.max(acc.maxY, mol.y + 200)
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    
    const contentBounds = {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY
    };
    
    zoom.zoomToFit(contentBounds, viewport.scale);
    setViewport(prev => ({ 
      ...prev, 
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    }));
  }, [atomicState.molecules, zoom, viewport.scale]);

  const handleUndo = useCallback(() => {
    if (atomicState.undoStack.length === 0) return;

    const previousState = atomicState.undoStack[atomicState.undoStack.length - 1];
    setAtomicState(prev => ({
      ...prev,
      molecules: previousState,
      undoStack: prev.undoStack.slice(0, -1),
      selectedMolecules: []
    }));

    toast({ title: "Undone", description: "Reverted to previous state", duration: 2000 });
  }, [atomicState.undoStack, toast]);

  // Calculate collisions for visual feedback
  const collisions = checkMoleculeCollisions(atomicState.molecules);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Enhanced Control Panel */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Zoom Controls */}
        <Card className="p-2 bg-background/80 backdrop-blur-sm">
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => zoom.zoomIn(viewport.scale)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => zoom.zoomOut(viewport.scale)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => zoom.resetZoom(viewport.scale)}>
              <Target className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={centerView}>
              <Home className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Action Controls */}
        <Card className="p-2 bg-background/80 backdrop-blur-sm">
          <div className="flex gap-1">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={autoArrangeMolecules}
              disabled={isAutoArranging}
            >
              <Shuffle className={`h-4 w-4 ${isAutoArranging ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleFusion}
              disabled={atomicState.selectedMolecules.length !== 2}
            >
              <Zap className="h-4 w-4" />
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleUndo}
              disabled={atomicState.undoStack.length === 0}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Status Panel */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div className="flex gap-2">
          <Badge variant="secondary">
            Scale: {(viewport.scale * 100).toFixed(0)}%
          </Badge>
          <Badge variant="secondary">
            Molecules: {atomicState.molecules.length}
          </Badge>
          {collisions.length > 0 && (
            <Badge variant="destructive">
              Collisions: {collisions.length}
            </Badge>
          )}
        </div>
        {atomicState.selectedMolecules.length > 0 && (
          <Badge variant="outline">
            Selected: {atomicState.selectedMolecules.length}
          </Badge>
        )}
      </div>

      {/* Main Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onWheel={(e) => zoom.handleWheelZoom(e, viewport.scale)}
        {...pinchZoom}
        style={{
          background: highContrast 
            ? '#000000'
            : 'radial-gradient(ellipse at center, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
        }}
      >
        {/* Quantum Field Background */}
        {!reducedMotion && (
          <div className="absolute inset-0 opacity-20">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-primary rounded-full animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 3}s`
                }}
              />
            ))}
          </div>
        )}

        {/* Molecules and Electrons */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${viewport.width / 2 + viewport.x * viewport.scale}px, ${viewport.height / 2 + viewport.y * viewport.scale}px) scale(${viewport.scale})`,
            transformOrigin: '0 0'
          }}
        >
          {atomicState.molecules.map((molecule) => (
            <motion.div
              key={molecule.id}
              className="absolute"
              style={{
                left: molecule.x - 200,
                top: molecule.y - 200,
                width: 400,
                height: 400
              }}
              animate={molecule.pulseActive ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.6, ease: "easeInOut" }}
            >
              {/* Collision Warning */}
              {collisions.some(c => c.mol1.id === molecule.id || c.mol2.id === molecule.id) && (
                <div className="absolute inset-0 border-2 border-destructive rounded-full animate-pulse opacity-50" />
              )}

              {/* Shell Rings */}
              {SHELL_CONFIG.map((shell, shellIndex) => (
                <div
                  key={shellIndex}
                  className={`absolute rounded-full border-2 transition-all duration-200 ${
                    atomicState.hoveredShell === shellIndex && atomicState.hoveredMolecule === molecule.id
                      ? 'border-primary shadow-lg shadow-primary/50'
                      : 'border-muted-foreground/20'
                  }`}
                  style={{
                    left: 200 - shell.radius,
                    top: 200 - shell.radius,
                    width: shell.radius * 2,
                    height: shell.radius * 2,
                    borderColor: shell.color + '40'
                  }}
                />
              ))}

              {/* Nucleus */}
              <div
                className={`absolute w-16 h-16 rounded-full cursor-move transition-all duration-200 ${
                  molecule.selected ? 'ring-2 ring-primary shadow-lg' : ''
                } ${
                  molecule.isDragging ? 'scale-110 shadow-xl' : ''
                }`}
                style={{
                  left: 192,
                  top: 192,
                  background: `radial-gradient(circle, ${DOMAIN_PRESETS.find(p => p.name === molecule.nucleus.domain)?.color || '#666'}, ${DOMAIN_PRESETS.find(p => p.name === molecule.nucleus.domain)?.color || '#666'}AA)`
                }}
                onMouseDown={(e) => handleDragStart('nucleus', molecule.id, e)}
                onClick={() => {
                  setAtomicState(prev => ({
                    ...prev,
                    selectedMolecules: prev.selectedMolecules.includes(molecule.id)
                      ? prev.selectedMolecules.filter(id => id !== molecule.id)
                      : [...prev.selectedMolecules, molecule.id]
                  }));
                }}
              >
                <div className="absolute inset-2 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                  {molecule.nucleus.domain.slice(0, 2)}
                </div>
              </div>

              {/* Electrons */}
              {molecule.electrons.map((electron) => {
                const shell = SHELL_CONFIG[electron.shell];
                if (!shell) return null;
                
                const x = 200 + Math.cos(electron.angle + electron.phase) * shell.radius;
                const y = 200 + Math.sin(electron.angle + electron.phase) * shell.radius;
                
                return (
                  <motion.div
                    key={electron.id}
                    className="absolute w-6 h-6 rounded-full cursor-grab active:cursor-grabbing shadow-lg transition-all duration-200 hover:scale-110"
                    style={{
                      left: x - 12,
                      top: y - 12,
                      background: `radial-gradient(circle, ${shell.color}, ${shell.color}CC)`,
                      border: '2px solid white',
                      zIndex: atomicState.dragState?.electronId === electron.id ? 1000 : 1
                    }}
                    onMouseDown={(e) => handleDragStart('electron', electron.id, e)}
                    whileHover={{ scale: 1.2 }}
                    animate={
                      atomicState.dragState?.electronId === electron.id
                        ? {
                            left: (atomicState.dragState.currentX - molecule.x) - 12,
                            top: (atomicState.dragState.currentY - molecule.y) - 12,
                            scale: 1.3
                          }
                        : {}
                    }
                  >
                    <div className="absolute inset-1 rounded-full bg-white/40" />
                  </motion.div>
                );
              })}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Domain Presets */}
      <div className="absolute bottom-4 left-4 z-10">
        <Card className="p-3 bg-background/80 backdrop-blur-sm">
          <div className="text-xs font-medium mb-2">Quick Add:</div>
          <div className="flex gap-2 flex-wrap">
            {DOMAIN_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                size="sm"
                variant="outline"
                onClick={() => onMoleculeCreate?.(preset.name)}
                className="h-8 px-2"
              >
                <span className="mr-1">{preset.emoji}</span>
                {preset.name}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Accessibility Announcements */}
      <div aria-live="polite" className="sr-only">
        {atomicState.dragState?.type === 'electron' && 
          `Moving electron ${atomicState.dragState.electronId} ${
            atomicState.dragState.targetMoleculeId ? `to ${atomicState.dragState.targetMoleculeId}` : ''
          }`
        }
        {isAutoArranging && "Auto-arranging molecules to avoid overlaps"}
      </div>
    </div>
  );
};

export default EnhancedAtomicRenderer;
