import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useBubbleStore } from "@/stores/bubbleStore";
import { useZoomStandard } from "@/hooks/useZoomStandard";
import { usePinchZoom } from "@/hooks/usePinchZoom";
import { useTouchGestures } from "@/hooks/useTouchGestures";
import { checkBubblesOverlapping, findMergeCandidates, calculateMidpoint } from "@/utils/collision";
import type { Bubble, BubbleType } from "@/types/bubble";
import { Button } from "@/components/ui/button";
import { Atom, ZoomIn, ZoomOut, RotateCcw, Shuffle, Eye, EyeOff } from "lucide-react";

// ==================================================
// Atomic / Molecular Theme — Enhanced with Bubble Integration
// - Maps bubbles to molecules with domain-specific styling
// - Full zoom/pan with touch and mouse support
// - Cross-molecule electron transfer
// - Collision detection and auto-arrangement
// - AI-powered content-aware positioning
// - Nucleus opening and particle visualization
// ==================================================

type Molecule = {
  id: string;
  label: string;
  x: number; 
  y: number; 
  radius: number;
  nucleus: string; 
  shell: string; 
  bond: string; 
  protons: number; 
  neutrons: number;
  shells: number[]; // electrons per ring: [today, week, later]
  bubbleId: string; // Link to original bubble
  domain: string; // Content domain classification
  opened: boolean; // Whether nucleus is opened to show particles
};

type Photon = { 
  id: string; 
  kind: "shell" | "bond"; 
  color: string; 
  cx?: number; 
  cy?: number; 
  r?: number; 
  dur?: number; 
  path?: string;
};

type ViewportState = {
  scale: number;
  centerX: number;
  centerY: number;
  offsetX: number;
  offsetY: number;
};

interface AtomicMolecularRendererProps {
  onBubbleSelect?: (bubbleId: string) => void;
  onBubbleEdit?: (bubbleId: string) => void;
  className?: string;
}

export default function AtomicMolecularRenderer({ 
  onBubbleSelect, 
  onBubbleEdit, 
  className = "" 
}: AtomicMolecularRendererProps) {
  const { 
    bubbles, 
    settings, 
    updateBubble, 
    addBubble, 
    deleteBubble,
    selectedBubbles,
    clearSelection
  } = useBubbleStore();

  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [mode, setMode] = useState<"idle" | "fuse" | "nucleus">("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const [photons, setPhotons] = useState<Photon[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({
    scale: 1,
    centerX: 500,
    centerY: 280,
    offsetX: 0,
    offsetY: 0
  });
  const [showParticles, setShowParticles] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);

  const undoRef = useRef<Molecule[] | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Enhanced accessibility settings
  const reducedMotion = settings.reducedMotion || false;
  const highContrast = settings.highContrast || false;

  // Ring configuration for time horizons
  const RING_SIZES = [1.15, 1.45, 1.75]; // Today, Week, Later
  const RING_LABELS = ["Today", "Week", "Later"];

  // Domain presets with colors matching design system
  const DOMAIN_PRESETS = useMemo(() => ({
    Financial: { nucleus: "hsl(var(--warning-glow))", shell: "hsl(var(--accent-flow))", bond: "hsl(var(--warning-glow))", radius: 62, protons: 3, neutrons: 2 },
    Parenting: { nucleus: "hsl(var(--accent-flow))", shell: "hsl(var(--accent-void))", bond: "hsl(var(--accent-flow))", radius: 60, protons: 2, neutrons: 3 },
    Mental: { nucleus: "hsl(var(--accent-void))", shell: "hsl(var(--accent-flow))", bond: "hsl(var(--accent-growth))", radius: 62, protons: 2, neutrons: 2 },
    Work: { nucleus: "hsl(var(--primary))", shell: "hsl(var(--warning-glow))", bond: "hsl(var(--primary))", radius: 64, protons: 3, neutrons: 2 },
    Home: { nucleus: "hsl(var(--success-gentle))", shell: "hsl(var(--danger-soft))", bond: "hsl(var(--success-gentle))", radius: 62, protons: 2, neutrons: 3 },
    Relationships: { nucleus: "hsl(var(--danger-soft))", shell: "hsl(var(--warning-glow))", bond: "hsl(var(--danger-soft))", radius: 60, protons: 2, neutrons: 2 },
    Default: { nucleus: "hsl(var(--accent-void))", shell: "hsl(var(--accent-flow))", bond: "hsl(var(--accent-growth))", radius: 58, protons: 2, neutrons: 2 }
  }), []);

  // Zoom and pan integration
  const getContainerRect = useCallback(() => {
    return containerRef.current?.getBoundingClientRect() || null;
  }, []);

  const handleZoomChange = useCallback((state: { scale: number; centerX: number; centerY: number }) => {
    setViewport(prev => ({
      ...prev,
      scale: state.scale,
      centerX: state.centerX,
      centerY: state.centerY
    }));
  }, []);

  const { zoomIn, zoomOut, handleWheelZoom, resetZoom, zoomToFit, cleanup } = useZoomStandard({
    onZoomChange: handleZoomChange,
    getContainerRect,
    config: { minScale: 0.2, maxScale: 4.0, smoothZoom: !reducedMotion }
  });

  // Convert bubbles to molecules with AI-powered domain classification
  const classifyDomain = useCallback((bubble: Bubble): string => {
    const content = (bubble.content || "").toLowerCase();
    const tags = bubble.tags?.map(t => t.name.toLowerCase()) || [];
    const allText = [content, ...tags].join(" ");

    if (allText.includes("money") || allText.includes("budget") || allText.includes("finance")) return "Financial";
    if (allText.includes("child") || allText.includes("parent") || allText.includes("family")) return "Parenting";
    if (allText.includes("anxiety") || allText.includes("mood") || allText.includes("mental")) return "Mental";
    if (allText.includes("work") || allText.includes("job") || allText.includes("career")) return "Work";
    if (allText.includes("home") || allText.includes("house") || allText.includes("chore")) return "Home";
    if (allText.includes("friend") || allText.includes("relationship") || allText.includes("social")) return "Relationships";
    
    return "Default";
  }, []);

  const convertBubblesToMolecules = useCallback((bubbles: Bubble[]): Molecule[] => {
    return bubbles.map((bubble, index) => {
      const domain = classifyDomain(bubble);
      const preset = DOMAIN_PRESETS[domain as keyof typeof DOMAIN_PRESETS] || DOMAIN_PRESETS.Default;
      
      // Smart positioning in golden ratio spiral to avoid overlaps
      const angle = index * 2.4; // Golden angle ≈ 137.5°
      const radius = Math.sqrt(index + 1) * 40;
      const x = 500 + Math.cos(angle) * radius;
      const y = 280 + Math.sin(angle) * radius;

      // Map time horizons to electron shells
      const todayTasks = bubble.tags?.filter(t => t.name.includes("today") || t.name.includes("urgent")).length || 1;
      const weekTasks = bubble.tags?.filter(t => t.name.includes("week") || t.name.includes("soon")).length || 1;
      const laterTasks = bubble.tags?.filter(t => t.name.includes("later") || t.name.includes("someday")).length || 1;

      return {
        id: `mol-${bubble.id}`,
        label: bubble.content?.slice(0, 20) + (bubble.content?.length > 20 ? "..." : "") || "Unnamed",
        x, y,
        radius: preset.radius,
        nucleus: preset.nucleus,
        shell: preset.shell,
        bond: preset.bond,
        protons: preset.protons,
        neutrons: preset.neutrons,
        shells: [todayTasks, weekTasks, laterTasks],
        bubbleId: bubble.id,
        domain,
        opened: false
      };
    });
  }, [classifyDomain, DOMAIN_PRESETS]);

  // Update molecules when bubbles change
  useEffect(() => {
    const newMolecules = convertBubblesToMolecules(bubbles);
    setMolecules(newMolecules);
  }, [bubbles, convertBubblesToMolecules]);

  // Drag state for electrons
  const [dragEl, setDragEl] = useState<null | {
    molId: string; 
    fromShell: number; 
    angle: number; 
    x: number; 
    y: number;
    targetMolId?: string;
  }>(null);

  // Enhanced electron drag system
  const startElectronDrag = useCallback((molId: string, shellIndex: number, angle: number, e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left - viewport.offsetX) / viewport.scale;
    const y = (e.clientY - rect.top - viewport.offsetY) / viewport.scale;
    
    setDragEl({ molId, fromShell: shellIndex, angle, x, y });
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [viewport]);

  const onCanvasMove = useCallback((e: React.PointerEvent) => {
    if (dragEl) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = (e.clientX - rect.left - viewport.offsetX) / viewport.scale;
      const y = (e.clientY - rect.top - viewport.offsetY) / viewport.scale;
      
      // Find target molecule for cross-molecule transfer
      const targetMol = molecules.find(m => {
        const dist = Math.hypot(x - m.x, y - m.y);
        return dist < m.radius * 2 && m.id !== dragEl.molId;
      });

      setDragEl(prev => prev ? { 
        ...prev, 
        x, y, 
        targetMolId: targetMol?.id 
      } : null);
    } else if (isPanning && lastPanPoint) {
      const deltaX = e.clientX - lastPanPoint.x;
      const deltaY = e.clientY - lastPanPoint.y;
      
      setViewport(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY
      }));
      
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }, [dragEl, isPanning, lastPanPoint, molecules, viewport]);

  const onCanvasUp = useCallback(() => {
    if (dragEl) {
      const sourceMol = molecules.find(m => m.id === dragEl.molId);
      if (!sourceMol) {
        setDragEl(null);
        return;
      }

      if (dragEl.targetMolId) {
        // Cross-molecule electron transfer
        const targetMol = molecules.find(m => m.id === dragEl.targetMolId);
        if (targetMol && sourceMol.shells[dragEl.fromShell] > 0) {
          setMolecules(prev => prev.map(m => {
            if (m.id === sourceMol.id) {
              const shells = [...m.shells];
              shells[dragEl.fromShell] -= 1;
              return { ...m, shells };
            }
            if (m.id === targetMol.id) {
              const shells = [...m.shells];
              shells[0] += 1; // Add to "today" shell of target
              return { ...m, shells };
            }
            return m;
          }));

          triggerBondPulse(sourceMol, targetMol, sourceMol.bond);
        }
      } else {
        // Same-molecule shell transfer
        const dx = dragEl.x - sourceMol.x;
        const dy = dragEl.y - sourceMol.y;
        const dist = Math.hypot(dx, dy);
        const radii = RING_SIZES.map(s => sourceMol.radius * s);
        
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < radii.length; i++) {
          const diff = Math.abs(dist - radii[i]);
          if (diff < best) {
            best = diff;
            nearest = i;
          }
        }

        const fromIdx = dragEl.fromShell;
        const toIdx = nearest;
        
        if (fromIdx !== toIdx && sourceMol.shells[fromIdx] > 0) {
          setMolecules(prev => prev.map(m => {
            if (m.id !== sourceMol.id) return m;
            const shells = [...m.shells];
            shells[fromIdx] -= 1;
            shells[toIdx] += 1;
            return { ...m, shells };
          }));
        }
      }
    }
    
    setDragEl(null);
    setIsPanning(false);
    setLastPanPoint(null);
  }, [dragEl, molecules]);

  // Pan handling
  const startPanning = useCallback((e: React.PointerEvent) => {
    if (mode === "idle" && !dragEl) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }, [mode, dragEl]);

  // Collision detection and auto-arrangement
  const checkMoleculeCollisions = useCallback(() => {
    const overlapping: Array<{ mol1: Molecule; mol2: Molecule }> = [];
    
    for (let i = 0; i < molecules.length; i++) {
      for (let j = i + 1; j < molecules.length; j++) {
        const mol1 = molecules[i];
        const mol2 = molecules[j];
        const dist = Math.hypot(mol1.x - mol2.x, mol1.y - mol2.y);
        const minDist = (mol1.radius + mol2.radius) * 1.5; // Buffer space
        
        if (dist < minDist) {
          overlapping.push({ mol1, mol2 });
        }
      }
    }
    
    return overlapping;
  }, [molecules]);

  const autoArrangeMolecules = useCallback(() => {
    undoRef.current = molecules.slice();
    
    // Force-directed layout algorithm
    const newMolecules = molecules.map(m => ({ ...m }));
    const iterations = 50;
    const repulsionStrength = 2000;
    const damping = 0.8;
    
    for (let iter = 0; iter < iterations; iter++) {
      newMolecules.forEach((mol, i) => {
        let fx = 0, fy = 0;
        
        // Repulsion from other molecules
        newMolecules.forEach((other, j) => {
          if (i === j) return;
          
          const dx = mol.x - other.x;
          const dy = mol.y - other.y;
          const dist = Math.hypot(dx, dy) || 1;
          const force = repulsionStrength / (dist * dist);
          
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });
        
        // Attraction to center
        const centerX = 500, centerY = 280;
        const toCenterX = centerX - mol.x;
        const toCenterY = centerY - mol.y;
        const centerDist = Math.hypot(toCenterX, toCenterY);
        
        if (centerDist > 200) {
          fx += toCenterX * 0.1;
          fy += toCenterY * 0.1;
        }
        
        // Apply forces with damping
        mol.x += fx * damping * 0.1;
        mol.y += fy * damping * 0.1;
        
        // Keep within bounds
        mol.x = Math.max(mol.radius, Math.min(1000 - mol.radius, mol.x));
        mol.y = Math.max(mol.radius, Math.min(560 - mol.radius, mol.y));
      });
    }
    
    setMolecules(newMolecules);
  }, [molecules]);

  // Photon effects
  const triggerGlimmer = useCallback((mId: string) => {
    const m = molecules.find(x => x.id === mId);
    if (!m) return;
    
    const ph: Photon = { 
      id: cryptoId(), 
      kind: "shell", 
      color: m.shell, 
      cx: m.x, 
      cy: m.y, 
      r: m.radius * 1.45, 
      dur: reducedMotion ? 0 : 1800 
    };
    
    setPhotons(p => [...p, ph]);
    setTimeout(() => setPhotons(p => p.filter(x => x.id !== ph.id)), (ph.dur || 0) + 1200);
  }, [molecules, reducedMotion]);

  const triggerBondPulse = useCallback((a: Molecule, b: Molecule, color: string) => {
    const d = bondPathD(a, b, 0.25);
    const ph: Photon = { id: cryptoId(), kind: "bond", color, path: d };
    
    setPhotons(p => [...p, ph]);
    setTimeout(() => setPhotons(p => p.filter(x => x.id !== ph.id)), 1800);
  }, []);

  // Selection and interaction handlers
  const onSelect = useCallback((id: string) => {
    const molecule = molecules.find(m => m.id === id);
    if (!molecule) return;

    if (mode === "fuse") {
      if (!selected) {
        setSelected(id);
        return;
      }
      if (selected === id) {
        setSelected(null);
        return;
      }
      
      // Perform fusion
      const molA = molecules.find(m => m.id === selected);
      const molB = molecules.find(m => m.id === id);
      if (molA && molB) {
        undoRef.current = molecules.slice();
        const merged = fuseMolecules(molA, molB);
        setMolecules(ms => ms.filter(m => m.id !== molA.id && m.id !== molB.id).concat(merged));
        setSelected(merged.id);
        setMode("idle");
        triggerBondPulse(molA, molB, merged.bond);
      }
    } else if (mode === "nucleus") {
      // Toggle nucleus opened state
      setMolecules(prev => prev.map(m => 
        m.id === id ? { ...m, opened: !m.opened } : m
      ));
    } else {
      setSelected(id);
      onBubbleSelect?.(molecule.bubbleId);
    }
  }, [mode, selected, molecules, onBubbleSelect]);

  const onFission = useCallback((id: string) => {
    const mol = molecules.find(m => m.id === id);
    if (!mol) return;
    
    undoRef.current = molecules.slice();
    const [molA, molB] = fissionMolecule(mol);
    setMolecules(ms => ms.filter(m => m.id !== id).concat(molA, molB));
    setSelected(null);
  }, [molecules]);

  const undo = useCallback(() => {
    if (undoRef.current) {
      setMolecules(undoRef.current);
      undoRef.current = null;
      setSelected(null);
      setMode("idle");
    }
  }, []);

  // Quick add molecules
  const quickAdd = useCallback((domain: keyof typeof DOMAIN_PRESETS) => {
    undoRef.current = molecules.slice();
    
    // Create new bubble first
    const bubbleContent = `New ${domain} bubble`;
    const newBubble: Partial<Bubble> = {
      id: cryptoId(),
      content: bubbleContent,
      type: "Task" as BubbleType,
      x: 0,
      y: 0,
      tags: [{ name: domain.toLowerCase(), emoji: "🔮" }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    addBubble(newBubble as Bubble);
  }, [molecules, addBubble, DOMAIN_PRESETS]);

  // Cleanup effects
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Transform for viewport
  const transform = `scale(${viewport.scale}) translate(${viewport.offsetX / viewport.scale}px, ${viewport.offsetY / viewport.scale}px)`;

  return (
    <div className={`relative w-full h-full min-h-[600px] bg-universe-bg text-text-primary overflow-hidden ${className}`}>
      {/* Header Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-card/80 backdrop-blur-sm rounded-lg p-2 border border-border">
        <Button
          variant={mode === "idle" ? "default" : "secondary"}
          size="sm"
          onClick={() => setMode("idle")}
          className="h-8"
        >
          Select
        </Button>
        <Button
          variant={mode === "fuse" ? "default" : "secondary"}
          size="sm"
          onClick={() => { setMode("fuse"); setSelected(null); }}
          className="h-8"
        >
          Fuse
        </Button>
        <Button
          variant={mode === "nucleus" ? "default" : "secondary"}
          size="sm"
          onClick={() => { setMode("nucleus"); setSelected(null); }}
          className="h-8"
        >
          <Atom className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-card/80 backdrop-blur-sm rounded-lg p-1 border border-border">
        <Button variant="ghost" size="sm" onClick={() => zoomIn(viewport.scale)} className="h-8 w-8 p-0">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => zoomOut(viewport.scale)} className="h-8 w-8 p-0">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => resetZoom(viewport.scale)} className="h-8 w-8 p-0">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={autoArrangeMolecules} className="h-8 w-8 p-0">
          <Shuffle className="h-4 w-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowParticles(!showParticles)} 
          className="h-8 w-8 p-0"
        >
          {showParticles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      </div>

      {/* Quick Add Domain Cards */}
      <div className="absolute bottom-4 left-4 z-10 flex gap-2 flex-wrap max-w-md">
        {(Object.keys(DOMAIN_PRESETS) as Array<keyof typeof DOMAIN_PRESETS>).filter(d => d !== "Default").map(domain => (
          <Button
            key={domain}
            variant="secondary"
            size="sm"
            onClick={() => quickAdd(domain)}
            className="h-8 text-xs"
          >
            {domain}
          </Button>
        ))}
      </div>

      {/* Undo Button */}
      <div className="absolute bottom-4 right-4 z-10">
        <Button variant="outline" size="sm" onClick={undo} disabled={!undoRef.current}>
          Undo
        </Button>
      </div>

      {/* Main Canvas */}
      <div 
        ref={containerRef}
        className="relative w-full h-full"
        onWheel={(e) => handleWheelZoom(e, viewport.scale)}
        onPointerDown={startPanning}
      >
        <div
          ref={canvasRef}
          className="relative w-full h-full bg-gradient-canvas"
          style={{ transform }}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
        >
          {/* Grid Background */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `radial-gradient(hsl(var(--border)) 1px, transparent 1px)`,
              backgroundSize: '22px 22px'
            }}
          />

          {/* Bonds SVG */}
          <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 1000 560" preserveAspectRatio="none">
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="c"/>
                <feMerge>
                  <feMergeNode in="c"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {molecules.length > 1 && molecules.map((m, i) => 
              molecules.slice(i + 1).map(n => (
                <path 
                  key={`${m.id}-${n.id}`} 
                  d={bondPathD(m, n, 0.25)} 
                  stroke={m.bond} 
                  strokeWidth={2} 
                  fill="none" 
                  opacity={0.65} 
                  filter="url(#glow)" 
                />
              ))
            )}
          </svg>

          {/* Photons */}
          {photons.map(p => p.kind === 'shell' ? (
            <div 
              key={p.id} 
              className="absolute border-2 border-dashed rounded-full pointer-events-none animate-pulse"
              style={{ 
                left: (p.cx || 0) - (p.r || 0), 
                top: (p.cy || 0) - (p.r || 0), 
                width: (p.r || 0) * 2, 
                height: (p.r || 0) * 2, 
                borderColor: p.color,
                animationDuration: `${(p.dur || 1200)}ms`
              }}
            />
          ) : (
            <div 
              key={p.id} 
              className="absolute w-2 h-2 rounded-full pointer-events-none"
              style={{ background: p.color }}
            />
          ))}

          {/* Molecules */}
          {molecules.map(molecule => (
            <MoleculeComponent
              key={molecule.id}
              molecule={molecule}
              selected={selected === molecule.id}
              showParticles={showParticles}
              reducedMotion={reducedMotion}
              ringSizes={RING_SIZES}
              ringLabels={RING_LABELS}
              onClick={() => onSelect(molecule.id)}
              onGlimmer={() => triggerGlimmer(molecule.id)}
              onSplit={() => onFission(molecule.id)}
              onStartDrag={startElectronDrag}
            />
          ))}

          {/* Drag Ghost */}
          {dragEl && (
            <div 
              className="absolute w-3 h-3 rounded-full bg-accent-void shadow-glow-soft pointer-events-none"
              style={{ 
                left: dragEl.x - 6, 
                top: dragEl.y - 6,
                boxShadow: dragEl.targetMolId ? 'var(--glow-strong)' : 'var(--glow-soft)'
              }}
            />
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-card/80 backdrop-blur-sm border-t border-border p-2">
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>Mode: {mode} | Scale: {Math.round(viewport.scale * 100)}%</span>
          <span>Molecules: {molecules.length} | Electrons: {molecules.reduce((sum, m) => sum + m.shells.reduce((a, b) => a + b, 0), 0)}</span>
        </div>
      </div>
    </div>
  );
}

// Molecule Component
function MoleculeComponent({ 
  molecule, 
  selected, 
  showParticles,
  reducedMotion,
  ringSizes, 
  ringLabels,
  onClick, 
  onGlimmer, 
  onSplit, 
  onStartDrag 
}: { 
  molecule: Molecule; 
  selected: boolean; 
  showParticles: boolean;
  reducedMotion: boolean;
  ringSizes: number[];
  ringLabels: string[];
  onClick: () => void; 
  onGlimmer: () => void; 
  onSplit: () => void; 
  onStartDrag: (molId: string, shell: number, angleDeg: number, e: React.PointerEvent) => void; 
}) {
  return (
    <div 
      className="absolute"
      style={{ 
        left: molecule.x - molecule.radius, 
        top: molecule.y - molecule.radius, 
        width: molecule.radius * 2, 
        height: molecule.radius * 2 
      }}
    >
      {/* Nucleus */}
      <div 
        className={`absolute inset-0 rounded-full cursor-pointer transition-all duration-200 ${
          selected ? 'ring-2 ring-accent-void ring-offset-2 ring-offset-transparent' : ''
        }`}
        style={{ 
          background: `radial-gradient(circle at 35% 35%, #ffffff, ${molecule.nucleus} 35%, #000000 85%)`,
          boxShadow: `var(--shadow-depth), 0 0 0 1px ${molecule.shell}55 inset`
        }}
        onClick={onClick}
      />

      {/* Nucleus Particles */}
      {showParticles && molecule.opened && renderParticles(molecule.protons, molecule.neutrons, molecule.radius)}

      {/* Electron Shells */}
      {molecule.shells.map((count, i) => (
        <OrbitShell
          key={i}
          molId={molecule.id}
          shellIndex={i}
          shellColor={molecule.shell}
          radius={molecule.radius * ringSizes[i]}
          count={count}
          label={ringLabels[i]}
          speedVar={reducedMotion ? '0s' : `${18 + i * 8}s`}
          onStartDrag={onStartDrag}
        />
      ))}

      {/* Label */}
      <div className="absolute left-1/2 top-full mt-2 transform -translate-x-1/2 text-xs text-center whitespace-nowrap">
        {molecule.label}
      </div>

      {/* Toolbar for selected molecule */}
      {selected && (
        <div className="absolute left-1/2 bottom-full mb-2 transform -translate-x-1/2 flex gap-1 bg-card/90 backdrop-blur-sm rounded-lg p-1 border border-border">
          <Button variant="ghost" size="sm" onClick={onGlimmer} className="h-6 px-2 text-xs">
            Photon
          </Button>
          <Button variant="ghost" size="sm" onClick={onSplit} className="h-6 px-2 text-xs">
            Split
          </Button>
        </div>
      )}
    </div>
  );
}

// Orbit Shell Component
function OrbitShell({ 
  molId, 
  shellIndex, 
  shellColor, 
  radius, 
  count, 
  label,
  speedVar, 
  onStartDrag 
}: { 
  molId: string; 
  shellIndex: number; 
  shellColor: string; 
  radius: number; 
  count: number; 
  label: string;
  speedVar: string; 
  onStartDrag: (molId: string, shell: number, angleDeg: number, e: React.PointerEvent) => void; 
}) {
  const electrons = Array.from({ length: count });
  
  return (
    <div 
      className="absolute left-1/2 top-1/2 border-2 border-dashed rounded-full animate-spin"
      style={{ 
        width: radius * 2, 
        height: radius * 2, 
        borderColor: `${shellColor}66`,
        animationDuration: speedVar,
        transform: 'translate(-50%, -50%)',
        animationDirection: shellIndex % 2 === 0 ? 'normal' : 'reverse'
      }}
    >
      {electrons.map((_, i) => {
        const angle = (i / Math.max(1, count)) * 360;
        return (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full cursor-grab active:cursor-grabbing"
            style={{ 
              background: shellColor,
              boxShadow: `0 0 10px ${shellColor}`,
              left: '50%',
              top: '50%',
              transform: `translate(-50%, calc(-50% - ${radius}px)) rotate(${angle}deg)`,
              transformOrigin: `0 ${radius}px`
            }}
            onPointerDown={(e) => onStartDrag(molId, shellIndex, angle, e)}
            title={`${label} (${count} electrons)`}
          />
        );
      })}
    </div>
  );
}

// Utility Functions
function cryptoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function bondPathD(a: Molecule, b: Molecule, k: number): string {
  const mx = a.x, my = a.y, nx = b.x, ny = b.y;
  const cx = (mx + nx) / 2 + (ny - my) * k;
  const cy = (my + ny) / 2 + (mx - nx) * k;
  return `M ${mx} ${my} Q ${cx} ${cy} ${nx} ${ny}`;
}

function renderParticles(protons: number, neutrons: number, r: number): JSX.Element {
  const dots: JSX.Element[] = [];
  const total = protons + neutrons;
  
  // Simple RNG for consistent particle placement
  function sfc32(a: number, b: number, c: number, d: number) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b << 9); a >>>= 0;
      b = (c + (c << 3)) | 0; b >>>= 0;
      c = (c << 21) | (c >>> 11); c >>>= 0;
      d = (d + 1) | 0; d >>>= 0;
      t = (t + d) | 0;
      c = (c + t) | 0; c >>>= 0;
      return (t >>> 0) / 4294967296;
    };
  }
  
  const rng = sfc32(1337, 42, 7, 23);
  
  for (let i = 0; i < total; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = (rng() * 0.35 + 0.05) * r;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const isProton = i < protons;
    
    dots.push(
      <div 
        key={i} 
        className={`absolute w-2.5 h-2.5 rounded-full ${
          isProton 
            ? 'bg-gradient-to-br from-white via-yellow-200 to-warning-glow shadow-glow-soft' 
            : 'bg-gradient-to-br from-white via-slate-300 to-slate-600'
        }`}
        style={{ 
          left: `calc(50% + ${x}px)`, 
          top: `calc(50% + ${y}px)`,
          transform: 'translate(-50%, -50%)'
        }} 
      />
    );
  }
  
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {dots}
    </div>
  );
}

function fuseMolecules(A: Molecule, B: Molecule): Molecule {
  const id = cryptoId();
  const x = (A.x + B.x) / 2;
  const y = (A.y + B.y) / 2;
  const label = `${A.label} + ${B.label}`;
  const protons = A.protons + B.protons;
  const neutrons = A.neutrons + B.neutrons;
  const shellsLen = Math.max(A.shells.length, B.shells.length);
  const shells: number[] = [];
  
  for (let i = 0; i < shellsLen; i++) {
    shells.push((A.shells[i] || 0) + (B.shells[i] || 0));
  }
  
  const radius = Math.max(A.radius, B.radius) + 6;
  
  return { 
    id, 
    label, 
    x, 
    y, 
    radius, 
    nucleus: A.nucleus, 
    shell: A.shell, 
    bond: A.bond, 
    protons, 
    neutrons, 
    shells,
    bubbleId: A.bubbleId, // Keep first bubble's ID
    domain: A.domain,
    opened: false
  };
}

function fissionMolecule(M: Molecule): [Molecule, Molecule] {
  const id1 = cryptoId();
  const id2 = cryptoId();
  const halfP = Math.max(1, Math.floor(M.protons / 2));
  const halfN = Math.max(1, Math.floor(M.neutrons / 2));
  const offset = 28;
  
  const A: Molecule = { 
    ...M, 
    id: id1, 
    label: M.label + " A", 
    x: M.x - offset, 
    protons: halfP, 
    neutrons: halfN, 
    shells: M.shells.map(v => Math.max(0, Math.floor(v / 2))),
    opened: false
  };
  
  const B: Molecule = { 
    ...M, 
    id: id2, 
    label: M.label + " B", 
    x: M.x + offset, 
    protons: M.protons - halfP, 
    neutrons: M.neutrons - halfN, 
    shells: M.shells.map((v, i) => v - (A.shells[i] || 0)),
    opened: false
  };
  
  return [A, B];
}
