/**
 * Complete Atomic/Molecular Canvas Renderer
 * Interactive physics simulation with draggable electrons, fusion/fission, photon pulses
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bubble, BubbleType } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Undo2, Zap, RotateCcw, Home, Calendar, Clock, Plus, ZoomIn, ZoomOut, RotateCcw as FitIcon, Play, Pause } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { HorizonFlashLabel } from '@/components/HorizonFlashLabel';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import { viewportMemoryService } from '@/services/viewportMemoryService';

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
  const performanceRef = useRef({ frameCount: 0, lastTime: performance.now(), fps: 60 });
  
  // Motion control state - explicit Play/Pause
  const [motionEnabled, setMotionEnabled] = useState(!reducedMotion);
  const rafIdRef = useRef<number | null>(null);
  
  // Performance and debugging state
  const [currentFPS, setCurrentFPS] = useState(60);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Horizon flash label state
  const [flashLabel, setFlashLabel] = useState<{
    isVisible: boolean;
    horizonName: string;
    position: { x: number; y: number };
  }>({
    isVisible: false,
    horizonName: '',
    position: { x: 0, y: 0 }
  });
  
  // Draggable UI state with handles
  const [domainCardPos, setDomainCardPos] = useState({ x: 0, y: 0 });
  const [timeHorizonPos, setTimeHorizonPos] = useState({ x: 0, y: 0 });
  const [dragUIState, setDragUIState] = useState<{ isDragging: boolean; element: string | null }>({
    isDragging: false,
    element: null
  });
  
  // Canvas viewport state with viewport memory service integration
  const [viewport, setViewport] = useState({
    x: 0, y: 0, scale: 1, width: 0, height: 0
  });
  
  // Save viewport on changes
  useEffect(() => {
    viewportMemoryService.saveViewport('atomic', {
      x: viewport.x,
      y: viewport.y,
      scale: viewport.scale
    });
  }, [viewport.x, viewport.y, viewport.scale]);
  
  // Restore viewport on mount
  useEffect(() => {
    const restored = viewportMemoryService.restoreViewport('atomic');
    if (restored) {
      setViewport(prev => ({
        ...prev,
        x: restored.x,
        y: restored.y,
        scale: restored.scale
      }));
      console.log('🧪 Restored atomic viewport:', restored);
    }
  }, []);
  
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

  // Simple zoom functions
  const zoomIn = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      scale: Math.min(prev.scale * 1.2, 3)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      scale: Math.max(prev.scale / 1.2, 0.1)
    }));
  }, []);

  const resetZoom = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      scale: 1
    }));
  }, []);

  const handleWheelZoom = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    setViewport(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(prev.scale * zoomFactor, 3))
    }));
  }, []);

  // Collision detection and repulsion system
  const applyMoleculeRepulsion = useCallback((molecules: Molecule[]): Molecule[] => {
    return molecules.map(mol => {
      let adjustedX = mol.x;
      let adjustedY = mol.y;
      
      molecules.forEach(otherMol => {
        if (mol.id === otherMol.id) return;
        
        const dx = mol.x - otherMol.x;
        const dy = mol.y - otherMol.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = 180; // Minimum distance between molecule centers
        
        if (distance < minDistance && distance > 0) {
          const force = (minDistance - distance) * 0.1;
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          adjustedX += normalizedDx * force;
          adjustedY += normalizedDy * force;
        }
      });
      
      return { ...mol, x: adjustedX, y: adjustedY };
    });
  }, []);

  // Convert bubbles to molecules with smart positioning
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
        // Golden ratio spiral positioning to avoid overlaps
        const angle = index * 2.39996; // Golden angle
        const radius = Math.sqrt(index + 1) * 60;
        
        moleculeMap.set(moleculeId, {
          id: moleculeId,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
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
    
    // Apply repulsion to prevent overlaps
    const molecules = Array.from(moleculeMap.values());
    return applyMoleculeRepulsion(molecules);
  }, [applyMoleculeRepulsion]);

  // Initialize viewport and convert bubbles - ONLY use real bubbles from store
  useEffect(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setViewport(prev => ({
        ...prev,
        width: rect.width,
        height: rect.height
      }));
    }
    
    // Only convert actual bubbles from the store, no test/sample data
    const molecules = convertBubblesToMolecules(bubbles || []);
    setAtomicState(prev => ({ ...prev, molecules }));
    
    console.log(`🧪 Atomic view: ${bubbles?.length || 0} bubbles → ${molecules.length} molecules`);
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

  // Enhanced motion control with performance monitoring
  const startAnimation = useCallback(() => {
    if (rafIdRef.current !== null) return;
    setMotionEnabled(true);
    
    const addDebugLog = (message: string) => {
      setDebugLog(prev => [`${new Date().toLocaleTimeString()}: ${message}`, ...prev.slice(0, 9)]);
    };
    
    addDebugLog('Animation started');
    
    const loop = () => {
      if (!motionEnabled) return;
      
      // Performance monitoring
      const now = performance.now();
      performanceRef.current.frameCount++;
      
      if (now - performanceRef.current.lastTime >= 1000) {
        const fps = (performanceRef.current.frameCount * 1000) / (now - performanceRef.current.lastTime);
        performanceRef.current.fps = fps;
        setCurrentFPS(fps);
        performanceRef.current.frameCount = 0;
        performanceRef.current.lastTime = now;
      }
      
      // Apply LOD based on performance and reduced motion
      const shouldReduceEffects = performanceRef.current.fps < 45 || reducedMotion;
      const phaseIncrement = shouldReduceEffects ? 0.01 : 0.02;
      
      setAtomicState(prev => ({
        ...prev,
        molecules: prev.molecules.map(mol => ({
          ...mol,
          electrons: mol.electrons.map(electron => ({
            ...electron,
            phase: electron.phase + phaseIncrement
          }))
        }))
      }));
      
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
  }, [motionEnabled, reducedMotion]);

  const stopAnimation = useCallback(() => {
    setMotionEnabled(false);
    setDebugLog(prev => [`${new Date().toLocaleTimeString()}: Animation stopped`, ...prev.slice(0, 9)]);
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const toggleMotion = useCallback(() => {
    if (motionEnabled) {
      stopAnimation();
    } else {
      startAnimation();
    }
  }, [motionEnabled, startAnimation, stopAnimation]);

  // Auto-start animation if enabled and not in reduced motion
  useEffect(() => {
    if (motionEnabled && !reducedMotion && !atomicState.dragState.isDragging) {
      startAnimation();
    } else {
      stopAnimation();
    }
    
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [reducedMotion, atomicState.dragState.isDragging, startAnimation, stopAnimation]);

  // Keyboard shortcut for spacebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        toggleMotion();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleMotion]);

  // Event handlers
  const handleElectronDragStart = useCallback((electron: Electron, event: React.MouseEvent) => {
    event.stopPropagation();
    setDebugLog(prev => [`${new Date().toLocaleTimeString()}: Electron drag started - ${electron.content.slice(0, 20)}...`, ...prev.slice(0, 9)]);
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

  const [panThreshold] = useState(8); // pixels before panning starts
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number } | null>(null);

  const handleCanvasDragStart = useCallback((event: React.MouseEvent) => {
    // Only start canvas drag if clicking on empty space
    if (event.target === event.currentTarget) {
      setPanStartPos({ x: event.clientX, y: event.clientY });
    }
  }, []);

  const handleCanvasPanCheck = useCallback((event: MouseEvent) => {
    if (!panStartPos || atomicState.dragState.isDragging) return;
    
    const deltaX = event.clientX - panStartPos.x;
    const deltaY = event.clientY - panStartPos.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > panThreshold) {
      setAtomicState(prev => ({
        ...prev,
        dragState: {
          isDragging: true,
          type: 'canvas',
          lastMousePos: { x: event.clientX, y: event.clientY }
        }
      }));
      setPanStartPos(null);
    }
  }, [panStartPos, panThreshold, atomicState.dragState.isDragging]);

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
          
          // Log shell calculation for debugging
          if (targetShell !== electron.shell) {
            setDebugLog(prev => [
              `${new Date().toLocaleTimeString()}: Shell transition - distance: ${distance.toFixed(1)}, shell: ${targetShell}`, 
              ...prev.slice(0, 9)
            ]);
          }
          
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
    } else if (atomicState.dragState.type === 'canvas') {
      // Handle canvas panning
      setViewport(prev => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      setAtomicState(prev => ({
        ...prev,
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
        
        const shellNames = ['Today', 'Week', 'Later'];
        
        // Show horizon flash label
        const horizonName = shellNames[electron.shell];
        const parentMolecule = atomicState.molecules.find(m => m.electrons.some(e => e.id === electronId));
        if (parentMolecule) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const molCenterX = parentMolecule.x * viewport.scale + viewport.width / 2 + viewport.x;
            const molCenterY = parentMolecule.y * viewport.scale + viewport.height / 2 + viewport.y;
            
            setFlashLabel({
              isVisible: true,
              horizonName,
              position: { x: molCenterX + rect.left, y: molCenterY + rect.top }
            });
            
            // Hide after 1 second
            setTimeout(() => {
              setFlashLabel(prev => ({ ...prev, isVisible: false }));
            }, 1000);
          }
        }
        
        // Add to cross-view undo system
        crossViewUndoService.addEntry({
          view: 'atomic',
          type: 'drag',
          data: { electronId, fromShell: originalShell, toShell: electron.shell },
          description: `Moved electron to ${horizonName} horizon`
        });
        
        toast({
          title: `Moved to ${shellNames[electron.shell]}`,
          description: `"${electron.content.slice(0, 30)}${electron.content.length > 30 ? '...' : ''}"`,
          action: (
            <Button variant="outline" size="sm" onClick={() => {
              // Undo functionality - restore original shell
              onTimeHorizonUpdate(electron.originalBubble?.id || '', electron.shell, originalShell);
              toast({ title: "Undone", description: `Moved back to ${shellNames[originalShell]}` });
            }}>
              Undo
            </Button>
          )
        });
        
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
    setPanStartPos(null);
  }, [atomicState.dragState, atomicState.molecules, onTimeHorizonUpdate, toast]);

  // Attach global mouse events
  useEffect(() => {
    if (atomicState.dragState.isDragging || panStartPos) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mousemove', handleCanvasPanCheck);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mousemove', handleCanvasPanCheck);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [atomicState.dragState.isDragging, panStartPos, handleMouseMove, handleCanvasPanCheck, handleMouseUp]);

  // Additional handlers
  const handleMoleculeSelect = useCallback((molecule: Molecule, event?: React.MouseEvent) => {
    const isShiftClick = event?.shiftKey;
    
    setAtomicState(prev => {
      if (isShiftClick) {
        // Shift+click: toggle selection while keeping others selected
        return {
          ...prev,
          molecules: prev.molecules.map(mol => ({
            ...mol,
            selected: mol.id === molecule.id ? !mol.selected : mol.selected
          }))
        };
      } else {
        // Regular click: select only this molecule (clear others)
        const newSelected = prev.selectedMolecule === molecule.id ? null : molecule.id;
        return {
          ...prev,
          selectedMolecule: newSelected,
          molecules: prev.molecules.map(mol => ({
            ...mol,
            selected: mol.id === molecule.id ? !mol.selected : false
          }))
        };
      }
    });
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

  // toggleMotion is already defined above

  const handleZoomToFit = useCallback(() => {
    if (atomicState.molecules.length === 0) return;
    
    const padding = 100;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    atomicState.molecules.forEach(mol => {
      minX = Math.min(minX, mol.x - 150);
      maxX = Math.max(maxX, mol.x + 150);
      minY = Math.min(minY, mol.y - 150);
      maxY = Math.max(maxY, mol.y + 150);
    });
    
    const contentBounds = {
      width: maxX - minX,
      height: maxY - minY
    };
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scaleX = (rect.width - padding * 2) / contentBounds.width;
    const scaleY = (rect.height - padding * 2) / contentBounds.height;
    const newScale = Math.max(0.1, Math.min(Math.min(scaleX, scaleY), 3));

    setViewport(prev => ({
      ...prev,
      scale: newScale
    }));
  }, [atomicState.molecules]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        toggleMotion();
      } else if ((event.key === '+' || event.key === '=') && !event.repeat) {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-' && !event.repeat) {
        event.preventDefault();
        zoomOut();
      } else if (event.key === '0' && !event.repeat) {
        event.preventDefault();
        resetZoom();
      } else if (event.key === 'f' && !event.repeat) {
        event.preventDefault();
        handleZoomToFit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleMotion, zoomIn, zoomOut, resetZoom, handleZoomToFit]);

  return (
    <div className={`relative w-full h-full bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 overflow-hidden ${className}`}>
      {/* Quantum field background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.1),transparent_30%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_40%)]" />
      </div>

      {/* Motion controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
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
        onWheel={handleWheelZoom}
        onMouseDown={handleCanvasDragStart}
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

            {/* Nucleus with accessibility */}
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
              onClick={(e) => handleMoleculeSelect(molecule, e)}
              role="button"
              tabIndex={0}
              aria-label={`${molecule.nucleus.domain} molecule with ${molecule.nucleus.protons} protons and ${molecule.electrons.length} electrons. ${molecule.selected ? 'Selected.' : 'Click to select.'}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleMoleculeSelect(molecule);
                }
              }}
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

            {/* Electrons with accessibility */}
            {molecule.electrons.map((electron) => {
              const shell = SHELL_CONFIG[electron.shell];
              const electronMotion = reducedMotion ? 0 : (motionEnabled ? electron.phase : 0);
              const angle = electron.angle + electronMotion;
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
                  role="button"
                  tabIndex={0}
                  aria-label={`Electron: ${electron.content}. Currently in ${shell.name} shell. Drag to move between time horizons.`}
                  title={electron.content}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onBubbleSelect && electron.originalBubble) {
                        onBubbleSelect(electron.originalBubble);
                      }
                    }
                  }}
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

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <div className="flex flex-col gap-1 bg-black/20 backdrop-blur-sm border border-white/20 rounded-lg p-1">
          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomToFit}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
            title="Zoom to Fit (F)"
          >
            <FitIcon className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetZoom}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
            title="Reset Zoom (0)"
          >
            1:1
          </Button>
        </div>
      </div>

      {/* Control buttons */}
      <div className="absolute bottom-32 right-4 z-10 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={centerView}
          className="bg-black/20 backdrop-blur-sm border-white/20"
          title="Center View"
        >
          <Home className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={atomicState.undoStack.length === 0}
          className="bg-black/20 backdrop-blur-sm border-white/20"
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handlePhotonPulse('shell')}
          className="bg-black/20 backdrop-blur-sm border-white/20"
          title="Photon Pulse"
        >
          <Zap className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFusion}
          className="bg-black/20 backdrop-blur-sm border-white/20"
          title="Fuse Molecules"
        >
          🔗
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFission}
          className="bg-black/20 backdrop-blur-sm border-white/20"
          title="Split Molecule"
        >
          ⚡
        </Button>
      </div>

      {/* Status display with motion control - Moved to top right to avoid domain controls */}
      <div className="absolute top-4 right-4 mr-20 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleMotion}
          className="bg-black/20 backdrop-blur-sm border-white/20 text-white hover:bg-white/10"
          title="Toggle Motion (Space)"
        >
          {motionEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Badge variant={motionEnabled ? "default" : "outline"} className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Motion: {motionEnabled ? 'ON' : 'OFF'}
        </Badge>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Molecules: {atomicState.molecules.length}
        </Badge>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          Electrons: {atomicState.molecules.reduce((sum, mol) => sum + mol.electrons.length, 0)}
        </Badge>
        <Badge variant="outline" className="bg-black/20 backdrop-blur-sm border-white/20 text-white">
          FPS: {currentFPS.toFixed(1)}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="bg-black/20 backdrop-blur-sm border-white/20 text-white hover:bg-white/10"
          title="Toggle Debug Panel"
        >
          🐛
        </Button>
        {(() => {
          const selectedCount = atomicState.molecules.filter(mol => mol.selected).length;
          return selectedCount > 0 && (
            <Badge variant="outline" className="bg-green-500/20 backdrop-blur-sm border-green-400/50 text-green-300">
              Selected: {selectedCount}
            </Badge>
          );
        })()}
        {atomicState.dragState.isDragging && (
          <Badge variant="outline" className="bg-yellow-500/20 backdrop-blur-sm border-yellow-400/50 text-yellow-300">
            Dragging: {atomicState.dragState.type}
          </Badge>
        )}
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <Card className="absolute top-20 right-4 w-80 max-h-60 bg-black/20 backdrop-blur-sm border-white/20 p-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-white font-medium">Debug Log</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDebugLog([])}
              className="text-white hover:bg-white/10 h-6 px-2"
            >
              Clear
            </Button>
          </div>
          <div className="space-y-1 text-xs text-white/80 max-h-40 overflow-y-auto font-mono">
            {debugLog.length === 0 ? (
              <div className="text-white/50">No debug events...</div>
            ) : (
              debugLog.map((log, i) => (
                <div key={i} className="break-words">{log}</div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Domain quick-add with drag handle - Moved to bottom left to avoid overlap */}
      <Card className="absolute bottom-4 left-4 mt-16 bg-black/20 backdrop-blur-sm border-white/20 p-2">
        <div className="flex items-center gap-2">
          <div 
            className="cursor-move text-white/50 hover:text-white p-1"
            onMouseDown={(e) => {
              setDragUIState({ isDragging: true, element: 'domain' });
              e.preventDefault();
            }}
            title="Drag to move this panel"
          >
            ⋮⋮
          </div>
          <div className="flex gap-1"
            style={{
              transform: `translate(${domainCardPos.x}px, ${domainCardPos.y}px)`
            }}
          >
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
        </div>
      </Card>

      {/* Time Horizons legend with drag handle */}
      <Card className="absolute top-20 left-4 bg-black/20 backdrop-blur-sm border-white/20 p-3"
        style={{
          transform: `translate(${timeHorizonPos.x}px, ${timeHorizonPos.y}px)`
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div 
            className="cursor-move text-white/50 hover:text-white p-1"
            onMouseDown={(e) => {
              setDragUIState({ isDragging: true, element: 'timeHorizon' });
              e.preventDefault();
            }}
            title="Drag to move this panel"
          >
            ⋮⋮
          </div>
          <h3 className="text-white font-medium">Time Horizons</h3>
        </div>
        <div className="space-y-1">
          {SHELL_CONFIG.map((shell, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-white">
              <div 
                className="w-3 h-3 rounded-full border"
                style={{ backgroundColor: shell.color, borderColor: shell.color }}
              />
              <span>{shell.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Accessibility */}
      <div className="sr-only" aria-live="polite">
        {atomicState.dragState.isDragging && 
          `Dragging ${atomicState.dragState.type}. Current position updated.`}
      </div>

      {/* Interaction Help */}
      {(() => {
        const selectedCount = atomicState.molecules.filter(mol => mol.selected).length;
        return selectedCount === 0 && (
          <div className="absolute bottom-4 left-4 text-white/60 text-xs max-w-xs z-10">
            <div>🖱️ Click + drag: Pan canvas</div>
            <div>🔬 Molecules: Click to select, Shift+click for multi-select</div>
            <div>⚛️ Electrons: Drag between shells</div>
            <div>🔗 Fusion: Select 2 molecules, then click fuse button</div>
            <div>⌨️ Shortcuts: Space (motion), +/- (zoom), F (fit), 0 (reset)</div>
          </div>
        );
      })()}

      {/* Horizon Flash Label */}
      <HorizonFlashLabel
        isVisible={flashLabel.isVisible}
        horizonName={flashLabel.horizonName}
        position={flashLabel.position}
        onComplete={() => setFlashLabel(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
};