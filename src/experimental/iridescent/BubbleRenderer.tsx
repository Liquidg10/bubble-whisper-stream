import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useBubbleStore } from '@/stores/bubbleStore';
import { useTheme } from '@/hooks/use-theme';
import { useTouchGestures } from '@/hooks/useTouchGestures';
import { useLODSystem } from '@/hooks/useLODSystem';
import { Bubble } from '@/types/bubble';
import { BubbleCanvasProps } from '@/themes/ThemeTypes';
import { MergeConfirmPortal } from '@/components/MergeConfirmPortal';

interface IridescentNode {
  id: number;
  x: number;
  y: number;
  r: number;
  label: string;
  type: string;
  glow: string;
}

// Utility functions
function overlapRatio(a: IridescentNode, b: IridescentNode): number {
  const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const sumR = a.r + b.r;
  if (d >= sumR) return 0;
  const overlap = sumR - d;
  const minArea = Math.PI * Math.min(a.r, b.r) ** 2;
  return (overlap * overlap) / minArea;
}

function dist(a: IridescentNode, b: IridescentNode): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function IridescentBubbleRenderer({ onBubbleSelect, onBubbleEdit, className }: BubbleCanvasProps) {
  const { bubbles, selectedBubbles, toggleSelection, clearSelection, mergeBubbles, undoLastMerge } = useBubbleStore();
  const { currentTheme } = useTheme();
  const { getLODConfig } = useLODSystem();
  const lodConfig = getLODConfig();
  
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [confirm, setConfirm] = useState<{ x: number; y: number; a: number; b: number } | null>(null);
  const [toast, setToast] = useState(false);
  const [lastMerge, setLastMerge] = useState<any>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Convert bubbles to nodes
  const nodes: IridescentNode[] = useMemo(() => {
    return bubbles.map((bubble, index) => ({
      id: parseInt(bubble.id) || index,
      x: bubble.x + 400, // Center in viewport
      y: bubble.y + 300,
      r: Math.max(20, bubble.size * 50),
      label: bubble.content?.slice(0, 20) + (bubble.content?.length > 20 ? '...' : '') || `${bubble.type} bubble`,
      type: bubble.type.toLowerCase(),
      glow: getGlowColor(bubble, currentTheme.tokens.auraMapping)
    }));
  }, [bubbles, currentTheme.tokens.auraMapping]);

  function getGlowColor(bubble: Bubble, auraMapping: any): string {
    const typeMap: Record<string, string> = {
      'thought': auraMapping?.rocky || '#8A4DFF',
      'task': auraMapping?.volcanic || '#FF7A00', 
      'memory': auraMapping?.icy || '#00FFA3',
      'mood': auraMapping?.cloudy || '#FF3FD4',
      'remindernote': auraMapping?.gas || '#00E5FF'
    };
    return typeMap[bubble.type.toLowerCase()] || typeMap['thought'];
  }

  const handlePointerDown = useCallback((nodeId: number, e: React.PointerEvent) => {
    e.preventDefault();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Bring selected bubble to front by updating z-order
    const updatedNodes = [...nodes];
    const nodeIndex = updatedNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex >= 0) {
      const [selectedNode] = updatedNodes.splice(nodeIndex, 1);
      updatedNodes.push(selectedNode);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDragOffset({
      x: e.clientX - rect.left - (node.x + node.r),
      y: e.clientY - rect.top - (node.y + node.r)
    });
    setDragging(nodeId);
  }, [nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    // Update bubble position in store
    const bubble = bubbles.find(b => parseInt(b.id) === dragging);
    if (!bubble) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;
    
    const updatedBubble = { ...bubble, x: newX, y: newY, updatedAt: Date.now() };
    useBubbleStore.getState().updateBubble(updatedBubble);
  }, [dragging, dragOffset, bubbles]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    
    const draggedNode = nodes.find(n => n.id === dragging);
    if (!draggedNode) {
      setDragging(null);
      return;
    }

    // Check for merge candidates
    const candidates = nodes.filter(n => n.id !== dragging && overlapRatio(draggedNode, n) > (currentTheme.behavior.mergeThreshold || 0.06));
    
      if (candidates.length > 0) {
        const closest = candidates.reduce((best, curr) => 
          dist(draggedNode, curr) < dist(draggedNode, best) ? curr : best
        );
        
        // Convert canvas coords to screen coords for portal
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (canvasRect) {
          const midX = (draggedNode.x + closest.x) / 2;
          const midY = (draggedNode.y + closest.y) / 2;
          
          const screenX = canvasRect.left + midX;
          const screenY = canvasRect.top + midY;
          
          setConfirm({ x: screenX, y: screenY, a: dragging, b: closest.id });
        }
      }
    
    setDragging(null);
  }, [dragging, nodes, currentTheme.behavior.mergeThreshold]);

  const handleMerge = useCallback(() => {
    if (!confirm) return;
    
    const bubbleA = bubbles.find(b => parseInt(b.id) === confirm.a);
    const bubbleB = bubbles.find(b => parseInt(b.id) === confirm.b);
    
    if (bubbleA && bubbleB) {
      const nodeA = nodes.find(n => n.id === confirm.a)!;
      const nodeB = nodes.find(n => n.id === confirm.b)!;
      
      setLastMerge({ 
        A: { ...bubbleA, x: nodeA.x - 400, y: nodeA.y - 300 }, 
        B: { ...bubbleB, x: nodeB.x - 400, y: nodeB.y - 300 },
        mergedId: bubbleA.id
      });
      
      mergeBubbles(bubbleA, bubbleB);
      setConfirm(null);
      setToast(true);
      
      setTimeout(() => {
        setToast(false);
        setLastMerge(null);
      }, 6000);
    }
  }, [confirm, bubbles, nodes, mergeBubbles]);

  const handleUndo = useCallback(() => {
    if (!lastMerge) return;
    undoLastMerge();
    setLastMerge(null);
    setToast(false);
  }, [lastMerge, undoLastMerge]);

  const handleBubbleClick = useCallback((nodeId: number) => {
    const bubble = bubbles.find(b => parseInt(b.id) === nodeId);
    if (bubble) {
      if (onBubbleSelect) {
        onBubbleSelect(bubble);
      }
      // Also toggle selection for the renderer
      toggleSelection(bubble.id);
    }
  }, [bubbles, onBubbleSelect, toggleSelection]);

  return (
    <div 
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden bg-universe ${className || ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ 
        background: 'var(--bg-universe)', 
        position: 'relative',
        touchAction: 'none'
      }}
    >
      {/* Render bubbles */}
      {nodes.map((node, index) => {
        const bubbleId = bubbles.find(b => parseInt(b.id) === node.id)?.id || '';
        const isSelected = selectedBubbles.has(bubbleId);
        return (
        <IridescentBubble
          key={node.id}
          {...node}
          selected={isSelected}
          onPointerDown={(e) => handlePointerDown(node.id, e)}
          onClick={() => handleBubbleClick(node.id)}
          phase={index}
          lod={!lodConfig.enableSpecular || dragging === node.id}
          zIndex={index}
        />
        );
      })}

      {/* Meniscus at intersections */}
        {(() => {
          const rings: JSX.Element[] = [];
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i], b = nodes[j];
              const ratio = overlapRatio(a, b);
              if (ratio > 0.05) {
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                const rr = Math.min(a.r, b.r) * 0.18;
                rings.push(
                  <div
                    key={`m-${a.id}-${b.id}`}
                    className="meniscus"
                    style={{
                      position: 'absolute',
                      left: mx - rr,
                      top: my - rr,
                      width: rr * 2,
                      height: rr * 2,
                      pointerEvents: 'none'
                    }}
                  />
                );
              }
            }
          }
          return rings;
        })()}

      {/* Merge confirmation portal */}
      <MergeConfirmPortal
        isOpen={!!confirm}
        screenPosition={confirm ? { x: confirm.x, y: confirm.y } : { x: 0, y: 0 }}
        onMerge={handleMerge}
        onCancel={() => setConfirm(null)}
        bubble1Label={confirm ? nodes.find(n => n.id === confirm.a)?.label || 'Bubble' : ''}
        bubble2Label={confirm ? nodes.find(n => n.id === confirm.b)?.label || 'Bubble' : ''}
      />

      {/* Undo toast */}
      {toast && lastMerge && (
        <div
          className="merge-pop"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 16,
            position: 'absolute'
          }}
        >
          <span style={{ color: '#fff', fontSize: 12, marginRight: 8 }}>
            Merged.
          </span>
          <button onClick={handleUndo} className="btn-cancel">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function IridescentBubble({
  x,
  y,
  r,
  label,
  glow,
  selected,
  onPointerDown,
  onClick,
  phase,
  lod,
  zIndex = 0
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  glow: string;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  phase: number;
  lod: boolean;
  zIndex?: number;
}) {
  const [cx, setCx] = useState(35);
  const [cy, setCy] = useState(28);
  const [hx, setHx] = useState(18);
  const [hy, setHy] = useState(12);
  const wrapRef = useRef<HTMLDivElement>(null);

  function handleMove(e: React.PointerEvent) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    setCx(20 + px * 0.6);
    setCy(18 + py * 0.5);
    setHx(10 + px * 0.6);
    setHy(8 + py * 0.5);
  }

  function handleLeave() {
    setCx(35);
    setCy(28);
    setHx(18);
    setHy(12);
  }

  const varStyle = {
    ['--cx' as any]: `${cx}%`,
    ['--cy' as any]: `${cy}%`,
    ['--hx' as any]: `${hx}%`,
    ['--hy' as any]: `${hy}%`
  } as React.CSSProperties;

  const floatDuration = 16 + ((phase % 5) * 2);
  const floatDelay = -((phase % 7) * 0.7);

  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        zIndex: zIndex
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div
        ref={wrapRef}
        className={`soap ${selected ? 'ring-selected' : ''} ${lod ? 'lod' : ''}`}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={{
          width: '100%',
          height: '100%',
          animation: `driftFloat ${floatDuration}s ease-in-out ${floatDelay}s infinite`,
          ...varStyle
        }}
      >
        <div
          className="soap-rim"
          style={{
            WebkitMask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            mask: 'radial-gradient(circle, transparent 66.2%, black 66.22%)',
            background: `conic-gradient(${glow} 0 130deg, rgba(255,255,255,.9) 180deg, ${glow} 230deg 360deg)`,
            position: 'absolute',
            inset: '-0.05%',
            borderRadius: '999px'
          }}
        />
        <div className="soap-core" />
        <div className="soap-spec a" />
        <div className="soap-spec b" />
        <div
          className="soap-aura"
          style={{
            boxShadow: `0 0 12px ${glow}40, inset 0 0 6px ${glow}20`
          }}
        />
      </div>
      {label && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,.85)',
            marginTop: 4
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}