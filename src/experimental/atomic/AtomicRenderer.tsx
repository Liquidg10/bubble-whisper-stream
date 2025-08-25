import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useBubbleStore } from "@/stores/bubbleStore";
import { useThemeBehavior, useMotionPreference } from "@/hooks/use-theme";
import type { Bubble } from "@/types/bubble";

// Molecule data structure for atomic visualization
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
};

// Photon effects for visual feedback
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

interface AtomicMolecularCanvasProps {
  onBubbleSelect?: (bubble: Bubble) => void;
  onBubbleEdit?: (bubble: Bubble) => void;
  className?: string;
}

export function AtomicMolecularCanvas({ onBubbleSelect, onBubbleEdit, className }: AtomicMolecularCanvasProps) {
  const {
    bubbles,
    selectedBubbles,
    toggleSelection,
    mergeBubbles,
    undoLastMerge,
    updateBubble
  } = useBubbleStore();
  
  const behavior = useThemeBehavior();
  const prefersReducedMotion = useMotionPreference();
  
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [mode, setMode] = useState<"idle" | "fuse">("idle");
  const [photons, setPhotons] = useState<Photon[]>([]);
  const [dragElectron, setDragElectron] = useState<{
    molId: string;
    fromShell: number;
    angle: number;
    x: number;
    y: number;
  } | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<Molecule[] | null>(null);
  
  // Ring sizes for electron shells (Today/Week/Later)
  const RING_SIZES = [1.15, 1.45, 1.75];

  // Convert bubbles to molecules
  useEffect(() => {
    const newMolecules: Molecule[] = bubbles.map(bubble => {
      const domain = getDomainFromType(bubble.type);
      const atomicProps = getAtomicProperties(domain);
      
      // Map bubble scheduling to electron shells
      const shells = [0, 0, 0];
      const totalElectrons = Math.min(8, Math.max(1, bubble.tags?.length || 1));
      
      // Distribute electrons based on reminder/completion status
      if (bubble.reminderId) {
        shells[0] = totalElectrons; // Today - has reminder
      } else if (bubble.completed) {
        shells[2] = totalElectrons; // Later - completed
      } else {
        shells[1] = totalElectrons; // Week - active
      }
      
      return {
        id: bubble.id,
        label: bubble.content.substring(0, 20) + (bubble.content.length > 20 ? '...' : ''),
        x: bubble.x,
        y: bubble.y,
        radius: Math.max(40, Math.min(80, bubble.size * 0.8)),
        nucleus: atomicProps.nucleus,
        shell: atomicProps.shell,
        bond: atomicProps.bond,
        protons: atomicProps.protons,
        neutrons: atomicProps.neutrons,
        shells,
      };
    });
    
    setMolecules(newMolecules);
  }, [bubbles]);

  // Handle molecule selection
  const handleMoleculeSelect = useCallback((moleculeId: string) => {
    const bubble = bubbles.find(b => b.id === moleculeId);
    if (!bubble) return;
    
    if (mode === "fuse") {
      // Handle fusion mode
      const selectedMol = molecules.find(m => selectedBubbles.has(m.id));
      const targetMol = molecules.find(m => m.id === moleculeId);
      
      if (selectedMol && targetMol && selectedMol.id !== targetMol.id) {
        // Trigger fusion
        undoRef.current = molecules.slice();
        triggerBondPulse(selectedMol, targetMol, selectedMol.bond);
        
        // Merge the actual bubbles
        const selectedBubble = bubbles.find(b => b.id === selectedMol.id);
        const targetBubble = bubbles.find(b => b.id === targetMol.id);
        if (selectedBubble && targetBubble) {
          mergeBubbles(selectedBubble, targetBubble);
        }
        setMode("idle");
      } else {
        toggleSelection(moleculeId);
      }
    } else {
      toggleSelection(moleculeId);
      onBubbleSelect?.(bubble);
    }
  }, [mode, selectedBubbles, molecules, bubbles, toggleSelection, mergeBubbles, onBubbleSelect]);

  // Trigger visual effects
  const triggerGlimmer = useCallback((moleculeId: string) => {
    const molecule = molecules.find(m => m.id === moleculeId);
    if (!molecule || prefersReducedMotion) return;
    
    const photon: Photon = {
      id: crypto.randomUUID(),
      kind: "shell",
      color: molecule.shell,
      cx: molecule.x,
      cy: molecule.y,
      r: molecule.radius * 1.45,
      dur: 1800
    };
    
    setPhotons(prev => [...prev, photon]);
    setTimeout(() => {
      setPhotons(prev => prev.filter(p => p.id !== photon.id));
    }, photon.dur + 1200);
  }, [molecules, prefersReducedMotion]);

  const triggerBondPulse = useCallback((molA: Molecule, molB: Molecule, color: string) => {
    if (prefersReducedMotion) return;
    
    const path = `M ${molA.x} ${molA.y} Q ${(molA.x + molB.x) / 2} ${(molA.y + molB.y) / 2} ${molB.x} ${molB.y}`;
    const photon: Photon = {
      id: crypto.randomUUID(),
      kind: "bond",
      color,
      path
    };
    
    setPhotons(prev => [...prev, photon]);
    setTimeout(() => {
      setPhotons(prev => prev.filter(p => p.id !== photon.id));
    }, 1800);
  }, [prefersReducedMotion]);

  // Handle electron dragging for rescheduling
  const startElectronDrag = useCallback((molId: string, shellIndex: number, angle: number, e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setDragElectron({
      molId,
      fromShell: shellIndex,
      angle,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handleCanvasMove = useCallback((e: React.PointerEvent) => {
    if (!dragElectron || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setDragElectron(prev => prev ? ({
      ...prev,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }) : prev);
  }, [dragElectron]);

  const handleCanvasUp = useCallback(() => {
    if (!dragElectron) return;
    
    const molecule = molecules.find(m => m.id === dragElectron.molId);
    if (!molecule) {
      setDragElectron(null);
      return;
    }
    
    // Calculate which ring the electron was dropped on
    const dx = dragElectron.x - molecule.x;
    const dy = dragElectron.y - molecule.y;
    const dist = Math.hypot(dx, dy);
    
    const radii = RING_SIZES.map(s => molecule.radius * s);
    let nearestRing = 0;
    let bestDiff = Infinity;
    
    for (let i = 0; i < radii.length; i++) {
      const diff = Math.abs(dist - radii[i]);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearestRing = i;
      }
    }
    
    // Update bubble state based on ring (electron energy level)
    const bubble = bubbles.find(b => b.id === molecule.id);
    if (bubble && nearestRing !== dragElectron.fromShell) {
      // Ring 0 (innermost) = high priority/reminder
      // Ring 1 (middle) = active work
      // Ring 2 (outermost) = completed/archived
      if (nearestRing === 0) {
        // Move to high priority - increase size
        updateBubble({ ...bubble, size: Math.min(1, bubble.size + 0.1) });
      } else if (nearestRing === 2) {
        // Move to low priority - mark completed
        updateBubble({ ...bubble, completed: true });
      }
    }
    
    setDragElectron(null);
  }, [dragElectron, molecules, bubbles, updateBubble]);

  // Quick add domain molecules
  const quickAddMolecule = useCallback((domain: string) => {
    undoRef.current = molecules.slice();
    
    // This would create a new bubble with domain-specific properties
    // For now, just trigger a visual effect
    console.log(`Quick add ${domain} molecule`);
  }, [molecules]);

  const undo = useCallback(() => {
    if (undoRef.current) {
      undoLastMerge();
      undoRef.current = null;
      setMode("idle");
    }
  }, [undoLastMerge]);

  return (
    <div className={`atomic-molecular-theme ${className || ''}`}>
      {/* Header Controls */}
      <div style={{ 
        position: "sticky", 
        top: 0, 
        zIndex: 10, 
        background: "linear-gradient(180deg, rgba(11,15,20,.95), rgba(11,15,20,.6))", 
        borderBottom: "1px solid rgba(255,255,255,.08)" 
      }}>
        <div style={{ 
          maxWidth: 1100, 
          margin: "0 auto", 
          padding: "12px 16px", 
          display: "flex", 
          alignItems: "center", 
          gap: 12 
        }}>
          <div 
            aria-hidden 
            style={{ 
              height: 24, 
              width: 24, 
              borderRadius: 12, 
              background: "radial-gradient(circle at 30% 30%, #fff, hsl(var(--accent-flow)), hsl(var(--accent-growth)))", 
              boxShadow: "0 6px 18px var(--shadow-depth)" 
            }} 
          />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            Atomic Molecular Universe
          </h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: 'center' }}>
            <button className="atomic-chip" onClick={undo} title="Undo last fusion/fission">
              Undo
            </button>
          </div>
        </div>
      </div>

      {/* Quick Domain Cards */}
      <div style={{
        maxWidth: 1100, 
        margin: '8px auto', 
        padding: '0 16px', 
        display: 'flex', 
        gap: 10, 
        flexWrap: 'wrap'
      }}>
        {["Financial", "Parenting", "Mental", "Work", "Home", "Relationships"].map(domain => (
          <button 
            key={domain} 
            className="domain-card" 
            onClick={() => quickAddMolecule(domain)}
          >
            {domain}
          </button>
        ))}
      </div>

      {/* Main Canvas */}
      <div 
        ref={canvasRef}
        className="atomic-canvas"
        onPointerMove={handleCanvasMove}
        onPointerUp={handleCanvasUp}
      >
        <div className="atomic-grid" aria-hidden />

        {/* Molecular Bonds */}
        <svg className="atomic-bonds" viewBox="0 0 1000 560" preserveAspectRatio="none">
          <defs>
            <filter id="atomic-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="c"/>
              <feMerge>
                <feMergeNode in="c"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {molecules.length > 1 && molecules.map((m, i) => 
            molecules.slice(i + 1).map(n => {
              const distance = Math.hypot(m.x - n.x, m.y - n.y);
              if (distance < 200) { // Only show bonds for nearby molecules
                return (
                  <path 
                    key={`${m.id}-${n.id}`} 
                    d={`M ${m.x} ${m.y} Q ${(m.x + n.x) / 2} ${(m.y + n.y) / 2} ${n.x} ${n.y}`}
                    stroke={m.bond} 
                    strokeWidth={2} 
                    fill="none" 
                    opacity={0.65} 
                    filter="url(#atomic-glow)" 
                  />
                );
              }
              return null;
            })
          )}
        </svg>

        {/* Photon Effects */}
        {photons.map(photon => 
          photon.kind === 'shell' ? (
            <div 
              key={photon.id} 
              className="photon-shell" 
              style={{ 
                left: photon.cx, 
                top: photon.cy, 
                width: (photon.r || 0) * 2, 
                height: (photon.r || 0) * 2, 
                borderColor: `${photon.color}AA`,
                animationDuration: `${photon.dur || 1200}ms`
              }}
            />
          ) : (
            <div 
              key={photon.id} 
              className="photon-bond" 
              style={{ 
                offsetPath: `path('${photon.path}')`,
                background: photon.color 
              }} 
            />
          )
        )}

        {/* Molecules */}
        {molecules.map(molecule => (
          <MoleculeComponent
            key={molecule.id}
            molecule={molecule}
            selected={selectedBubbles.has(molecule.id)}
            ringSizes={RING_SIZES}
            onClick={() => handleMoleculeSelect(molecule.id)}
            onGlimmer={() => triggerGlimmer(molecule.id)}
            onStartElectronDrag={startElectronDrag}
            reducedMotion={prefersReducedMotion}
          />
        ))}

        {/* Electron Drag Ghost */}
        {dragElectron && (
          <div 
            className="electron-drag-ghost" 
            style={{ 
              left: dragElectron.x, 
              top: dragElectron.y 
            }} 
          />
        )}
      </div>

      {/* Footer Toolbar */}
      <div style={{
        maxWidth: 1100, 
        margin: '0 auto', 
        padding: '8px 16px', 
        display: 'flex', 
        gap: 8, 
        alignItems: 'center'
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mode:</span>
        <button 
          className={`atomic-chip ${mode === 'idle' ? 'on' : ''}`} 
          onClick={() => setMode('idle')}
        >
          Select
        </button>
        <button 
          className={`atomic-chip ${mode === 'fuse' ? 'on' : ''}`} 
          onClick={() => setMode('fuse')}
        >
          Fuse
        </button>
        <span style={{ 
          marginLeft: 'auto', 
          fontSize: 12, 
          color: 'var(--text-secondary)' 
        }}>
          Tip: Drag electrons between rings to reschedule (Today/Week/Later).
        </span>
      </div>
    </div>
  );
}

// Molecule Component
interface MoleculeComponentProps {
  molecule: Molecule;
  selected: boolean;
  ringSizes: number[];
  onClick: () => void;
  onGlimmer: () => void;
  onStartElectronDrag: (molId: string, shell: number, angle: number, e: React.PointerEvent) => void;
  reducedMotion: boolean;
}

function MoleculeComponent({ 
  molecule, 
  selected, 
  ringSizes, 
  onClick, 
  onGlimmer, 
  onStartElectronDrag,
  reducedMotion
}: MoleculeComponentProps) {
  return (
    <div 
      className="molecule" 
      style={{ 
        left: molecule.x - molecule.radius, 
        top: molecule.y - molecule.radius, 
        width: molecule.radius * 2, 
        height: molecule.radius * 2 
      }}
    >
      {/* Nucleus */}
      <div 
        className={`nucleus ${selected ? 'selected' : ''}`} 
        style={{ 
          background: `radial-gradient(circle at 35% 35%, #ffffff, ${molecule.nucleus} 35%, #000000 85%)`,
          boxShadow: `0 10px 24px var(--shadow-depth), 0 0 0 1px ${molecule.shell}55 inset`
        }} 
        onClick={onClick} 
      />
      
      {/* Nuclear Particles */}
      <div className="nucleus-particles" aria-hidden>
        {Array.from({ length: molecule.protons + molecule.neutrons }).map((_, i) => {
          const isProton = i < molecule.protons;
          const angle = (i / (molecule.protons + molecule.neutrons)) * Math.PI * 2;
          const dist = molecule.radius * 0.3;
          const x = Math.cos(angle) * dist;
          const y = Math.sin(angle) * dist;
          
          return (
            <div 
              key={i} 
              className={isProton ? "proton" : "neutron"} 
              style={{ 
                left: `calc(50% + ${x}px)`, 
                top: `calc(50% + ${y}px)` 
              }} 
            />
          );
        })}
      </div>

      {/* Electron Shells */}
      {molecule.shells.map((electronCount, shellIndex) => (
        <ElectronShell
          key={shellIndex}
          moleculeId={molecule.id}
          shellIndex={shellIndex}
          shellColor={molecule.shell}
          radius={molecule.radius * ringSizes[shellIndex]}
          electronCount={electronCount}
          onStartDrag={onStartElectronDrag}
          reducedMotion={reducedMotion}
        />
      ))}
      
      {/* Label */}
      <div className="molecule-label">{molecule.label}</div>
      
      {/* Toolbar */}
      {selected && (
        <div className="molecule-toolbar" role="toolbar">
          <button className="toolbar-btn" onClick={onGlimmer} title="Trigger photon">
            Photon
          </button>
        </div>
      )}
    </div>
  );
}

// Electron Shell Component
interface ElectronShellProps {
  moleculeId: string;
  shellIndex: number;
  shellColor: string;
  radius: number;
  electronCount: number;
  onStartDrag: (molId: string, shell: number, angle: number, e: React.PointerEvent) => void;
  reducedMotion: boolean;
}

function ElectronShell({ 
  moleculeId, 
  shellIndex, 
  shellColor, 
  radius, 
  electronCount, 
  onStartDrag,
  reducedMotion
}: ElectronShellProps) {
  const electrons = Array.from({ length: electronCount });
  const animationDuration = reducedMotion ? '0s' : `${18 + shellIndex * 8}s`;
  
  return (
    <div 
      className="electron-shell" 
      style={{ 
        width: radius * 2, 
        height: radius * 2, 
        borderColor: `${shellColor}AA`,
        animationDuration
      }}
    >
      {electrons.map((_, i) => {
        const angle = (i / Math.max(1, electronCount)) * 360;
        return (
          <div
            key={i}
            className="electron"
            style={{ 
              transform: `translate(-50%, calc(-50% - ${radius}px)) rotate(${angle}deg)` 
            }}
            onPointerDown={(e) => onStartDrag(moleculeId, shellIndex, angle, e)}
            title="Drag to another ring to reschedule"
          />
        );
      })}
    </div>
  );
}

// Helper functions
function getDomainFromType(type: string): string {
  // Map bubble types to atomic domains
  const typeMapping: Record<string, string> = {
    thought: 'Mental',
    task: 'Work',
    memory: 'Personal',
    reminder: 'Home',
    emotion: 'Mental'
  };
  
  return typeMapping[type] || 'Work';
}

function getAtomicProperties(domain: string) {
  const domainProperties: Record<string, {
    nucleus: string;
    shell: string;
    bond: string;
    protons: number;
    neutrons: number;
  }> = {
    Financial: {
      nucleus: 'hsl(59 100% 49%)',   // Gold
      shell: 'hsl(180 100% 38%)',    // Cyan
      bond: 'hsl(45 100% 51%)',      // Yellow
      protons: 3,
      neutrons: 2
    },
    Work: {
      nucleus: 'hsl(197 71% 52%)',   // Blue
      shell: 'hsl(45 100% 60%)',     // Orange
      bond: 'hsl(197 71% 65%)',      // Light blue
      protons: 3,
      neutrons: 2
    },
    Mental: {
      nucleus: 'hsl(273 100% 65%)',  // Purple
      shell: 'hsl(180 100% 66%)',    // Cyan
      bond: 'hsl(273 100% 75%)',     // Light purple
      protons: 2,
      neutrons: 2
    },
    Home: {
      nucleus: 'hsl(142 76% 46%)',   // Green
      shell: 'hsl(334 84% 70%)',     // Pink
      bond: 'hsl(142 76% 56%)',      // Light green
      protons: 2,
      neutrons: 3
    },
    Personal: {
      nucleus: 'hsl(334 84% 70%)',   // Pink
      shell: 'hsl(45 100% 60%)',     // Orange
      bond: 'hsl(334 84% 80%)',      // Light pink
      protons: 2,
      neutrons: 2
    },
    Relationships: {
      nucleus: 'hsl(334 84% 70%)',   // Pink
      shell: 'hsl(45 100% 60%)',     // Orange
      bond: 'hsl(334 84% 80%)',      // Light pink
      protons: 2,
      neutrons: 2
    }
  };
  
  return domainProperties[domain] || domainProperties.Work;
}