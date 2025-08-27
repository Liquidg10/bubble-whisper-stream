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
  draggedMolecule: {
    moleculeId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
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
  { name: 'Today', radius: 140, color: '#EF4444', icon: Home, maxElectrons: 8 },
  { name: 'Week', radius: 200, color: '#F59E0B', icon: Calendar, maxElectrons: 18 },
  { name: 'Later', radius: 280, color: '#10B981', icon: Clock, maxElectrons: 32 }
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
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; initialViewportX?: number; initialViewportY?: number }>({ x: 0, y: 0 });
  
  // Motion control state
  const [motionEnabled, setMotionEnabled] = useState(!reducedMotion);
  const dragThreshold = 5; // pixels
  
  // Draggable UI state
  const [domainCardPos, setDomainCardPos] = useState({ x: 0, y: 0 });
  const [timeHorizonPos, setTimeHorizonPos] = useState({ x: 0, y: 0 });
  const [isDraggingUI, setIsDraggingUI] = useState<'domain' | 'time' | null>(null);
  
  // Atomic state
  const [atomicState, setAtomicState] = useState<AtomicState>({
    molecules: [],
    selectedMolecule: null,
    draggedElectron: null,
    draggedMolecule: null,
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
      const distance = 150 + Math.random() * 100; // More varied positioning
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      
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

  // Force-directed layout to prevent molecule overlap
  const applyMoleculeForces = useCallback((molecules: Molecule[]) => {
    const updatedMolecules = [...molecules];
    const repulsionStrength = 0.1;
    const minDistance = 120;

    for (let i = 0; i < updatedMolecules.length; i++) {
      for (let j = i + 1; j < updatedMolecules.length; j++) {
        const mol1 = updatedMolecules[i];
        const mol2 = updatedMolecules[j];
        
        const dx = mol2.x - mol1.x;
        const dy = mol2.y - mol1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance && distance > 0) {
          const force = (minDistance - distance) * repulsionStrength;
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          mol1.x -= normalizedDx * force;
          mol1.y -= normalizedDy * force;
          mol2.x += normalizedDx * force;
          mol2.y += normalizedDy * force;
          
          // Clamp to viewport bounds
          mol1.x = Math.max(-400, Math.min(400, mol1.x));
          mol1.y = Math.max(-300, Math.min(300, mol1.y));
          mol2.x = Math.max(-400, Math.min(400, mol2.x));
          mol2.y = Math.max(-300, Math.min(300, mol2.y));
        }
      }
    }
    
    return updatedMolecules;
  }, []);

  // Animation loop for orbital motion - controlled by motionEnabled
  useEffect(() => {
    if (reducedMotion || !motionEnabled) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }
    
    const animate = () => {
      setAtomicState(prev => {
        const updatedMolecules = prev.molecules.map(mol => ({
          ...mol,
          electrons: mol.electrons.map(electron => ({
            ...electron,
            phase: electron.phase + 0.01
          }))
        }));

        // Only apply collision forces occasionally and when not dragging to prevent visual jumping
        const shouldApplyForces = !prev.draggedMolecule && !prev.draggedElectron && Math.random() < 0.02; // 2% chance per frame, and not while dragging
        const finalMolecules = shouldApplyForces ? applyMoleculeForces(updatedMolecules) : updatedMolecules;

        return {
          ...prev,
          molecules: finalMolecules
        };
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [reducedMotion, motionEnabled, applyMoleculeForces]);

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
    
    // Event listeners are now handled centrally in the useEffect
  }, []);

  // Handle molecule drag start
  const handleMoleculeDragStart = useCallback((moleculeId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const molecule = atomicState.molecules.find(mol => mol.id === moleculeId);
    if (!molecule) return;
    
    // Store initial molecule position to calculate deltas properly
    setAtomicState(prev => ({
      ...prev,
      draggedMolecule: {
        moleculeId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        offsetY: 0
      }
    }));
    
    // Event listeners are now handled centrally in the useEffect
  }, [atomicState.molecules]);

  // Handle molecule mouse move during drag
  const handleMoleculeMouseMove = useCallback((event: MouseEvent) => {
    if (!atomicState.draggedMolecule) return;
    
    const deltaX = (event.clientX - atomicState.draggedMolecule.startX) / viewport.scale;
    const deltaY = (event.clientY - atomicState.draggedMolecule.startY) / viewport.scale;
    
    setAtomicState(prev => {
      if (!prev.draggedMolecule) return prev;
      
      const targetMolecule = prev.molecules.find(mol => mol.id === prev.draggedMolecule?.moleculeId);
      if (!targetMolecule) return prev;
      
      const newX = targetMolecule.x + deltaX - (prev.draggedMolecule.offsetX || 0);
      const newY = targetMolecule.y + deltaY - (prev.draggedMolecule.offsetY || 0);
      
      return {
        ...prev,
        draggedMolecule: {
          ...prev.draggedMolecule,
          offsetX: deltaX,
          offsetY: deltaY
        },
        molecules: prev.molecules.map(mol =>
          mol.id === prev.draggedMolecule?.moleculeId
            ? { ...mol, x: newX, y: newY }
            : mol
        )
      };
    });
  }, [atomicState.draggedMolecule, viewport.scale]);

  // Handle molecule mouse up (end drag)
  const handleMoleculeMouseUp = useCallback(() => {
    if (!atomicState.draggedMolecule) return;
    
    setAtomicState(prev => ({ ...prev, draggedMolecule: null }));
  }, [atomicState.draggedMolecule]);

  // Handle mouse move during electron drag
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!atomicState.draggedElectron) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const dragX = event.clientX - rect.left;
    const dragY = event.clientY - rect.top;
    
    // Calculate which shell we're hovering over relative to the molecule center
    const draggedElectron = atomicState.draggedElectron;
    const molecule = atomicState.molecules.find(mol => 
      mol.electrons.some(e => e.id === draggedElectron.electronId)
    );
    
    if (!molecule) return;
    
    // Calculate molecule screen position accounting for transforms
    const moleculeScreenX = molecule.x + viewport.width / 2;
    const moleculeScreenY = molecule.y + viewport.height / 2;
    
    // Convert drag position to world coordinates
    const worldDragX = (dragX - viewport.x) / viewport.scale - viewport.width / 2;
    const worldDragY = (dragY - viewport.y) / viewport.scale - viewport.height / 2;
    
    const distance = Math.sqrt((worldDragX - molecule.x) ** 2 + (worldDragY - molecule.y) ** 2);
    
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
  }, [atomicState.draggedElectron, atomicState.molecules, viewport]);

  // Handle mouse up (end drag)
  const handleMouseUp = useCallback(() => {
    if (!atomicState.draggedElectron) return;
    
    const { electronId, originalShell, currentShell } = atomicState.draggedElectron;
    
    setIsDragging(false);
    
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
  }, [atomicState.draggedElectron, toast, onTimeHorizonUpdate]);

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

  // Pan and zoom handlers with drag threshold
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't pan if clicking on UI overlays, electrons, or nuclei
    const target = e.target as HTMLElement;
    if (target.closest('.ui-overlay') || target.closest('.electron') || target.closest('.nucleus') || target.closest('.domain-preset-item')) {
      return;
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      initialViewportX: viewport.x,
      initialViewportY: viewport.y
    });
    e.preventDefault();
  }, [viewport.x, viewport.y]);

  const handleCanvasMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStart) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // Start panning only after threshold
    if (!isPanning && (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold)) {
      setIsPanning(true);
    }
    
    if (isPanning && dragStart.initialViewportX !== undefined && dragStart.initialViewportY !== undefined) {
      setViewport(prev => ({
        ...prev,
        x: dragStart.initialViewportX + deltaX,
        y: dragStart.initialViewportY + deltaY
      }));
    }
  }, [isPanning, dragStart, dragThreshold]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragStart({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(3, prev.scale * delta))
    }));
  }, []);

  // Draggable UI handlers
  const handleUIDragStart = (type: 'domain' | 'time', e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingUI(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleUIDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingUI) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    if (isDraggingUI === 'domain') {
      setDomainCardPos(prev => ({ x: prev.x + deltaX, y: prev.y - deltaY })); // Invert Y
    } else if (isDraggingUI === 'time') {
      setTimeHorizonPos(prev => ({ x: prev.x + deltaX, y: prev.y - deltaY })); // Invert Y
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDraggingUI, dragStart.x, dragStart.y]);

  const handleUIDragEnd = useCallback(() => {
    setIsDraggingUI(null);
  }, []);

  // Global mouse event handlers - consolidated to prevent conflicts
  useEffect(() => {
    const cleanup = () => {
      document.removeEventListener('mousemove', handleCanvasMouseMove);
      document.removeEventListener('mouseup', handleCanvasMouseUp);
      document.removeEventListener('mousemove', handleUIDrag);
      document.removeEventListener('mouseup', handleUIDragEnd);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMoleculeMouseMove);
      document.removeEventListener('mouseup', handleMoleculeMouseUp);
    };

    // Only add listeners when needed and avoid conflicts
    if (atomicState.draggedElectron) {
      // Electron dragging takes priority
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else if (atomicState.draggedMolecule) {
      // Molecule dragging takes priority
      document.addEventListener('mousemove', handleMoleculeMouseMove);
      document.addEventListener('mouseup', handleMoleculeMouseUp);
    } else if (isDraggingUI) {
      // UI dragging
      document.addEventListener('mousemove', handleUIDrag);
      document.addEventListener('mouseup', handleUIDragEnd);
    } else if ((dragStart.x !== 0 || dragStart.y !== 0)) {
      // Canvas panning only when no other dragging is active
      document.addEventListener('mousemove', handleCanvasMouseMove);
      document.addEventListener('mouseup', handleCanvasMouseUp);
    }
    
    return cleanup;
  }, [dragStart, isDraggingUI, atomicState.draggedElectron, atomicState.draggedMolecule, handleCanvasMouseMove, handleCanvasMouseUp, handleUIDrag, handleUIDragEnd, handleMouseMove, handleMouseUp, handleMoleculeMouseMove, handleMoleculeMouseUp]);

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
        className={`absolute inset-0 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: 'center center',
        }}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
      >
        {/* Molecular bonds (render behind molecules) */}
        {atomicState.molecules.map(molecule => {
          return atomicState.molecules
            .filter(otherMol => otherMol.id !== molecule.id)
            .map(otherMol => {
              // Check if molecules have shared domains/tags for bonding
              const hasSharedTags = molecule.nucleus.domain === otherMol.nucleus.domain ||
                Math.random() < 0.05; // Simple bonding logic for demo
              
              if (!hasSharedTags) return null;
              
              const distance = Math.sqrt(
                Math.pow(molecule.x - otherMol.x, 2) +
                Math.pow(molecule.y - otherMol.y, 2)
              );
              
              // Only show bonds for nearby molecules
              if (distance > 200) return null;
              
              return (
                <div
                  key={`bond-${molecule.id}-${otherMol.id}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: molecule.x + viewport.width / 2,
                    top: molecule.y + viewport.height / 2,
                    width: distance,
                    height: 2,
                    background: 'linear-gradient(90deg, hsl(var(--muted-foreground) / 0.3), transparent)',
                    transformOrigin: '0 50%',
                    transform: `rotate(${Math.atan2(otherMol.y - molecule.y, otherMol.x - molecule.x)}rad)`,
                    zIndex: 1,
                  }}
                />
              );
            });
        })}

        {/* Render Molecules */}
        {atomicState.molecules.map(molecule => {
          const totalElectrons = molecule.electrons.length;
          const isLOD = atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0) > 50;
          
          return (
            <div
              key={molecule.id}
              className="absolute molecule-container"
              style={{
                left: molecule.x + viewport.width / 2,
                top: molecule.y + viewport.height / 2,
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

            {/* Electron Shells with capacity indicators */}
            {SHELL_CONFIG.map((shell, shellIndex) => {
              const electronsInShell = molecule.electrons.filter(e => e.shell === shellIndex);
              const maxElectrons = shell.maxElectrons;
              const isOverflow = electronsInShell.length > maxElectrons;
              
              return (
                  <div
                    key={shellIndex}
                    className={`absolute rounded-full border transition-all ${
                      atomicState.hoveredShell === shellIndex ? 'border-2 opacity-80' : 'border opacity-30'
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
                      title={`Overflow: ${electronsInShell.length}/${maxElectrons} electrons`}
                    >
                      !
                    </div>
                  )}
                </div>
              );
            })}

            {/* Electrons with LOD optimization */}
            {molecule.electrons.map((electron) => {
              const shell = SHELL_CONFIG[electron.shell];
              if (!shell) return null;

              // Calculate consistent orbital position
              // Base angle from electron configuration, add phase only when motion is enabled
              const baseAngle = electron.angle;
              const phaseOffset = (motionEnabled && !reducedMotion) ? electron.phase : 0;
              const finalAngle = baseAngle + phaseOffset;
              
              const x = Math.cos(finalAngle) * shell.radius;
              const y = Math.sin(finalAngle) * shell.radius;

              // LOD: Simplify rendering for many electrons
              const totalElectrons = atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0);
              const isLODMode = totalElectrons > 50;
              const electronSize = isLODMode ? 2 : 3;
              const showGlow = !isLODMode;

              return (
                <div
                  key={electron.id}
                  className={`electron absolute rounded-full cursor-grab transition-all hover:scale-125 ${!isLODMode ? 'hover:brightness-125' : ''}`}
                  style={{
                    width: `${electronSize * 2}px`,
                    height: `${electronSize * 2}px`,
                    left: x - electronSize,
                    top: y - electronSize,
                    backgroundColor: shell.color,
                    boxShadow: showGlow ? `0 0 8px ${shell.color}` : 'none',
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

      {/* Domain Preset Cards - Draggable */}
      <div 
        className="absolute z-20 max-w-xs"
        style={{
          top: 16 + domainCardPos.y,
          right: 16 - domainCardPos.x,
          transform: isDraggingUI === 'domain' ? 'scale(1.02)' : 'scale(1)',
          transition: isDraggingUI === 'domain' ? 'none' : 'transform 0.2s',
        }}
      >
        <Card className="p-3 bg-card/90 backdrop-blur-sm border-2 hover:border-primary/50 transition-colors">
          <div 
            className="flex items-center gap-2 mb-2 cursor-move select-none"
            onMouseDown={(e) => handleUIDragStart('domain', e)}
          >
            <h3 className="text-sm font-semibold flex-1">Quick Add Domains</h3>
            <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-sm" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DOMAIN_PRESETS.map(preset => (
              <Button
                key={preset.name}
                variant="outline" size="sm"
                onClick={() => handleQuickAdd(preset)}
                className="justify-start gap-2 h-auto p-2 hover:scale-105 transition-transform"
              >
                <span className="text-base">{preset.emoji}</span>
                <span className="text-xs">{preset.name}</span>
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Time Horizon Status - Draggable */}
      <div 
        className="absolute z-20"
        style={{
          bottom: 16 + timeHorizonPos.y,
          right: 16 - timeHorizonPos.x,
          transform: isDraggingUI === 'time' ? 'scale(1.02)' : 'scale(1)',
          transition: isDraggingUI === 'time' ? 'none' : 'transform 0.2s',
        }}
      >
        <Card className="p-2 bg-card/90 backdrop-blur-sm border-2 hover:border-primary/50 transition-colors">
          <div 
            className="flex items-center gap-2 mb-2 cursor-move select-none"
            onMouseDown={(e) => handleUIDragStart('time', e)}
          >
            <div className="text-xs font-semibold flex-1">Time Horizons</div>
            <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-sm" />
              ))}
            </div>
          </div>
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

      {/* Status Bar with performance info */}
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
        {atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0) > 50 && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            LOD: Active
          </Badge>
        )}
        {reducedMotion && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            Reduced Motion
          </Badge>
        )}
        {(isDragging || isPanning) && (
          <Badge variant="outline" className="bg-card/80 backdrop-blur-sm">
            {isDragging ? 'Dragging' : 'Panning'}
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