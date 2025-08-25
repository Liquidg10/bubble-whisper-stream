import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useBubbleStore } from "@/stores/bubbleStore";
import { useZoomStandard } from "@/hooks/useZoomStandard";
import { Bubble } from "@/types/bubble";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Eye, Move, Atom } from "lucide-react";

// Clean domain color mappings
const DOMAIN_COLORS = {
  Financial: { nucleus: "#F5B301", shell: "#00C4B3", bond: "#FFD166" },
  Parenting: { nucleus: "#14B8A6", shell: "#8B5CF6", bond: "#22D3EE" },
  Mental: { nucleus: "#8B5CF6", shell: "#22D3EE", bond: "#C084FC" },
  Work: { nucleus: "#3B82F6", shell: "#F59E0B", bond: "#60A5FA" },
  Home: { nucleus: "#10B981", shell: "#F472B6", bond: "#34D399" },
  Relationships: { nucleus: "#F472B6", shell: "#F59E0B", bond: "#FB7185" },
  Misc: { nucleus: "#6B7280", shell: "#9CA3AF", bond: "#D1D5DB" }
};

// View modes for different organizational perspectives
type ViewMode = "group" | "time" | "importance";
type ZoomLevel = "overview" | "cluster" | "detail";

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
  bubbleId: string;
  domain: string;
  opened: boolean;
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
  const { bubbles, settings } = useBubbleStore();
  
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("group");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("overview");
  const [selectedMolecule, setSelectedMolecule] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "fuse">("select");
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  
  const [viewport, setViewport] = useState({
    scale: 1,
    centerX: 0,
    centerY: 0,
    offsetX: 0,
    offsetY: 0
  });

  // Ring configuration for time horizons
  const RING_SIZES = [1.2, 1.5, 1.8]; // Today, Week, Later

  // Domain classification
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
    
    return "Misc";
  }, []);

  // Convert bubbles to molecules with clean positioning
  const convertBubblesToMolecules = useCallback((): Molecule[] => {
    // Group bubbles by domain
    const domainGroups = bubbles.reduce((acc, bubble) => {
      const domain = classifyDomain(bubble);
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(bubble);
      return acc;
    }, {} as Record<string, Bubble[]>);

    const molecules: Molecule[] = [];
    const domains = Object.keys(domainGroups);
    
    // Clean positioning - arrange domains in a circle
    domains.forEach((domain, domainIndex) => {
      const bubbleGroup = domainGroups[domain];
      const colors = DOMAIN_COLORS[domain as keyof typeof DOMAIN_COLORS] || DOMAIN_COLORS.Misc;
      
      // Position domain centers in a circle
      const angle = (domainIndex / domains.length) * Math.PI * 2;
      const centerX = 500 + Math.cos(angle) * 200;
      const centerY = 300 + Math.sin(angle) * 150;
      
      // If multiple bubbles in domain, cluster them around center
      bubbleGroup.forEach((bubble, bubbleIndex) => {
        const subAngle = (bubbleIndex / Math.max(1, bubbleGroup.length - 1)) * Math.PI * 2;
        const subRadius = bubbleGroup.length > 1 ? 60 : 0;
        
        const x = centerX + Math.cos(subAngle) * subRadius;
        const y = centerY + Math.sin(subAngle) * subRadius;

        // Calculate electron distribution based on time sensitivity
        const todayTasks = bubble.tags?.filter(t => 
          t.name.toLowerCase().includes("today") || 
          t.name.toLowerCase().includes("urgent")
        ).length || 1;
        
        const weekTasks = bubble.tags?.filter(t => 
          t.name.toLowerCase().includes("week") || 
          t.name.toLowerCase().includes("soon")
        ).length || 2;
        
        const laterTasks = bubble.tags?.filter(t => 
          t.name.toLowerCase().includes("later") || 
          t.name.toLowerCase().includes("someday")
        ).length || 1;

        molecules.push({
          id: `mol-${bubble.id}`,
          label: domain,
          x, y,
          radius: 50,
          nucleus: colors.nucleus,
          shell: colors.shell,
          bond: colors.bond,
          protons: Math.min(5, Math.max(2, Math.floor((bubble.content?.length || 10) / 10))),
          neutrons: Math.min(5, Math.max(2, bubble.tags?.length || 2)),
          shells: [todayTasks, weekTasks, laterTasks],
          bubbleId: bubble.id,
          domain,
          opened: false
        });
      });
    });

    return molecules;
  }, [bubbles, classifyDomain]);

  // Update molecules when bubbles change
  useEffect(() => {
    const newMolecules = convertBubblesToMolecules();
    setMolecules(newMolecules);
  }, [bubbles, convertBubblesToMolecules]);

  // Zoom system
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
    
    // Update zoom level based on scale
    if (state.scale < 0.7) setZoomLevel("overview");
    else if (state.scale < 2) setZoomLevel("cluster");
    else setZoomLevel("detail");
  }, []);

  const { zoomIn, zoomOut, handleWheelZoom, resetZoom, zoomToFit } = useZoomStandard({
    onZoomChange: handleZoomChange,
    getContainerRect,
    config: { minScale: 0.3, maxScale: 4.0, smoothZoom: !settings.reducedMotion }
  });

  // Handle molecule selection
  const handleMoleculeClick = useCallback((moleculeId: string) => {
    const molecule = molecules.find(m => m.id === moleculeId);
    if (!molecule) return;

    if (zoomLevel === "detail") {
      // In detail view, open nucleus
      setMolecules(prev => prev.map(m => 
        m.id === moleculeId ? { ...m, opened: !m.opened } : m
      ));
    } else {
      setSelectedMolecule(moleculeId);
      onBubbleSelect?.(molecule.bubbleId);
      
      // Zoom to molecule if in overview
      if (zoomLevel === "overview") {
        const rect = getContainerRect();
        if (rect) {
          const targetScale = 2.0;
          handleZoomChange({
            scale: targetScale,
            centerX: molecule.x,
            centerY: molecule.y
          });
        }
      }
    }
  }, [molecules, zoomLevel, onBubbleSelect, getContainerRect, handleZoomChange]);

  // Render nucleus with particles
  const renderNucleus = useCallback((molecule: Molecule) => {
    const particles = [];
    const total = molecule.protons + molecule.neutrons;
    const bubble = bubbles.find(b => b.id === molecule.bubbleId);
    
    // If bubble has photo and nucleus is large enough, show photo thumbnail
    if (bubble?.imageUri && molecule.radius >= 40) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <div 
            className="rounded-full overflow-hidden border border-white/20"
            style={{ 
              width: molecule.radius * 0.8,
              height: molecule.radius * 0.8
            }}
          >
            <img 
              src={bubble.imageUri} 
              alt="Bubble photo"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      );
    }
    
    if (molecule.opened && zoomLevel === "detail") {
      // Show individual particles when nucleus is opened in detail view
      for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2;
        const radius = molecule.radius * 0.3;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const isProton = i < molecule.protons;
        
        particles.push(
          <div
            key={i}
            className={`absolute w-2 h-2 rounded-full ${
              isProton 
                ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]' 
                : 'bg-gray-300 shadow-[0_0_6px_rgba(156,163,175,0.4)]'
            }`}
            style={{
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        );
      }
    }
    
    return particles;
  }, [zoomLevel, bubbles]);

  // Render electron shells
  const renderShells = useCallback((molecule: Molecule) => {
    return molecule.shells.map((electronCount, shellIndex) => {
      const shellRadius = molecule.radius * RING_SIZES[shellIndex];
      const electrons = [];
      
      for (let i = 0; i < electronCount; i++) {
        const angle = (i / Math.max(1, electronCount)) * 360;
        electrons.push(
          <div
            key={`${shellIndex}-${i}`}
            className="absolute w-2 h-2 rounded-full cursor-move"
            style={{
              background: molecule.shell,
              boxShadow: `0 0 8px ${molecule.shell}`,
              transform: `translate(-50%, calc(-50% - ${shellRadius}px)) rotate(${angle}deg)`,
              animation: settings.reducedMotion ? 'none' : `spin ${18 + shellIndex * 8}s linear infinite`
            }}
          />
        );
      }
      
      return (
        <div
          key={shellIndex}
          className="absolute border border-opacity-30 rounded-full"
          style={{
            width: shellRadius * 2,
            height: shellRadius * 2,
            borderColor: molecule.shell,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            animation: settings.reducedMotion ? 'none' : `spin ${18 + shellIndex * 8}s linear infinite reverse`
          }}
        >
          {electrons}
        </div>
      );
    });
  }, [settings.reducedMotion]);

  // Render bonds between molecules
  const renderBonds = useCallback(() => {
    const bonds = [];
    
    for (let i = 0; i < molecules.length; i++) {
      for (let j = i + 1; j < molecules.length; j++) {
        const mol1 = molecules[i];
        const mol2 = molecules[j];
        const distance = Math.hypot(mol1.x - mol2.x, mol1.y - mol2.y);
        
        // Show bonds between nearby molecules of related domains
        if (distance < 300) {
          bonds.push(
            <line
              key={`${mol1.id}-${mol2.id}`}
              x1={mol1.x}
              y1={mol1.y}
              x2={mol2.x}
              y2={mol2.y}
              stroke={mol1.bond}
              strokeWidth="2"
              opacity="0.3"
              filter="url(#glow)"
            />
          );
        }
      }
    }
    
    return bonds;
  }, [molecules]);

  const transform = `scale(${viewport.scale}) translate(${viewport.offsetX}px, ${viewport.offsetY}px)`;

  return (
    <div className={`relative w-full h-full bg-background ${className}`}>
      {/* Header Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-lg p-2 border">
          <span className="text-sm text-muted-foreground">View:</span>
          <Button
            variant={viewMode === "group" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("group")}
          >
            Group
          </Button>
          <Button
            variant={viewMode === "time" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("time")}
          >
            Time
          </Button>
          <Button
            variant={viewMode === "importance" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("importance")}
          >
            Priority
          </Button>
        </div>
        
        <div className="flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-lg p-2 border">
          <span className="text-sm text-muted-foreground">Mode:</span>
          <Button
            variant={mode === "select" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("select")}
          >
            Select
          </Button>
          <Button
            variant={mode === "fuse" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("fuse")}
          >
            Fuse
          </Button>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={() => zoomIn(viewport.scale)}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => zoomOut(viewport.scale)}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => resetZoom(viewport.scale)}>
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Zoom Level Indicator */}
      <div className="absolute bottom-4 left-4 z-10 bg-card/80 backdrop-blur-sm rounded-lg p-2 border">
        <div className="flex items-center gap-2 text-sm">
          <Atom className="w-4 h-4" />
          <span className="capitalize">{zoomLevel} View</span>
          <span className="text-muted-foreground">({Math.round(viewport.scale * 100)}%)</span>
        </div>
      </div>

      {/* Canvas */}
      <div 
        ref={containerRef}
        className="w-full h-full overflow-hidden relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
        onWheel={(e) => handleWheelZoom(e, viewport.scale)}
      >
        {/* Grid Background */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            transform
          }}
        />

        {/* SVG for bonds */}
        <svg 
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <g style={{ transform }}>
            {renderBonds()}
          </g>
        </svg>

        {/* Molecules */}
        <div 
          ref={canvasRef}
          className="absolute inset-0"
          style={{ transform }}
        >
          {molecules.map((molecule) => (
            <div
              key={molecule.id}
              className="absolute cursor-pointer"
              style={{
                left: molecule.x - molecule.radius,
                top: molecule.y - molecule.radius,
                width: molecule.radius * 2,
                height: molecule.radius * 2
              }}
              onClick={() => handleMoleculeClick(molecule.id)}
            >
              {/* Nucleus */}
              <div
                className={`absolute inset-0 rounded-full transition-all duration-300 ${
                  selectedMolecule === molecule.id ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent' : ''
                }`}
                style={{
                  background: `radial-gradient(circle at 35% 35%, #ffffff, ${molecule.nucleus} 35%, #000000 85%)`,
                  boxShadow: `0 0 20px ${molecule.nucleus}40, inset 0 0 0 1px ${molecule.shell}55`
                }}
              >
                {renderNucleus(molecule)}
              </div>

              {/* Electron Shells */}
              {renderShells(molecule)}

              {/* Label */}
              <div className="absolute left-1/2 top-full mt-2 transform -translate-x-1/2 text-xs text-white text-center whitespace-nowrap">
                {molecule.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-4 right-4 z-10 bg-card/80 backdrop-blur-sm rounded-lg p-2 border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{molecules.length} atoms</span>
          <span>Mode: {mode}</span>
          <span>View: {viewMode}</span>
        </div>
      </div>
    </div>
  );
}

// Utility function to generate IDs
function cryptoId(): string {
  return Math.random().toString(36).slice(2, 9);
}