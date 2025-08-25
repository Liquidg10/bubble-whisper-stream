/**
 * Atomic/Molecular Theme - Interactive atomic physics simulation
 * Transforms bubbles into molecules with nuclei, electron shells, and interactive electrons
 */

import type { Theme } from '../ThemeTypes';
import { AtomicMolecularCanvas } from '@/experimental/atomic';

export const atomicMolecularTheme: Theme = {
  id: 'atomic-molecular',
  name: 'Atomic Molecular',
  description: 'Interactive atomic physics with molecules, electron shells, and nuclear reactions',
  version: '1.0.0',
  className: 'theme-atomic-molecular',
  
  tokens: {
    // Deep space background
    bgUniverse: '220 15% 7%',               // Deep space #0b0f14
    textPrimary: '210 40% 93%',             // #EAF2FF
    textSecondary: '210 15% 75%',           // #9fb1c9
    
    // Atomic element colors
    accentVoid: '59 100% 49%',              // Proton gold #F5B301
    accentFlow: '180 100% 38%',             // Electron cyan #00C4B3
    accentGrowth: '273 100% 65%',           // Neutron purple #8B5CF6
    
    // Element states
    dangerSoft: '0 84% 60%',                // Nuclear decay red
    successGentle: '142 76% 36%',           // Stable isotope green
    warningGlow: '45 100% 51%',             // Fusion energy yellow
    
    // Molecule states
    bubbleIdle: '218 23% 11%',              // Molecule at rest
    bubbleActive: '220 25% 16%',            // Active orbital motion
    bubbleSelected: '273 100% 25%',         // Selected nucleus glow
    bubbleReminder: '45 100% 25%',          // Energy state transition
    
    // Atomic rim styling
    rimPolicy: 'specular' as const,         // Glowing nucleus with shell boundaries
    
    // Domain-specific atomic colors
    auraMapping: {
      rocky: '59 100% 49%',                 // Financial - Gold
      gas: '197 71% 52%',                   // Work - Blue
      icy: '142 76% 46%',                   // Health - Green
      volcanic: '334 84% 70%',              // Relationships - Pink
      cloudy: '273 100% 65%',               // Mental - Purple
    },
    
    // Atomic gradients
    gradientAurora: `radial-gradient(circle at 35% 35%, 
      hsl(59 100% 49% / 0.3), 
      hsl(180 100% 38% / 0.3), 
      hsl(273 100% 65% / 0.3))`,
    gradientCanvas: `radial-gradient(800px 500px at 20% 120%, 
      hsl(220 25% 8%), transparent 60%), 
      radial-gradient(900px 400px at 80% -10%, 
      hsl(218 30% 10%), transparent 60%), 
      hsl(218 23% 11%)`,
    gradientBubble: `radial-gradient(circle at 35% 35%, 
      #ffffff, var(--nucleus-color) 35%, #000000 85%)`,
    gradientGentle: `linear-gradient(120deg,
      hsl(180 100% 38% / 0.2),
      hsl(273 100% 65% / 0.2))`,
    
    // Nuclear effects
    glowSoft: '0 0 20px hsl(59 100% 49% / 0.3)',
    glowMedium: '0 0 40px hsl(180 100% 38% / 0.4)',
    glowStrong: '0 0 60px hsl(273 100% 65% / 0.5)',
    shadowDepth: '0 8px 32px hsl(220 15% 3% / 0.6)',
    
    // Orbital motion
    transitionGentle: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    transitionBubble: 'transform 200ms ease-out',
    transitionFlow: 'all 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    
    // Atomic spacing
    spaceBubble: '2rem',
    spaceBreath: '3rem',
    radiusBubble: '1.5rem',
    radiusGentle: '1rem',
    
    // Typography for atomic labels
    fontSizeWhisper: '0.75rem',
    fontSizeGentle: '0.875rem',
    fontSizeNatural: '1rem',
    fontSizeSpeak: '1.125rem',
    fontSizeCall: '1.5rem',
    fontSizeShout: '2rem',
  },
  
  behavior: {
    // Orbital animations
    parallaxEnabled: true,
    floatAmplitude: 0.5,                    // Gentle orbital motion
    floatDurationRange: [18000, 36000],     // Slower, scientific speeds
    
    // Nuclear interactions
    mergeThreshold: 0.08,                   // Fusion threshold - 8%
    lodDuringDrag: true,                    // Disable heavy effects during electron drag
    hapticsEnabled: true,
    
    // Performance for orbital rendering
    enableBlur: true,
    enableGlow: true,
    maxVisibleBubbles: 80,                  // Fewer for complex atomic rendering
    lowDetailMode: false,
  },
  
  // Custom atomic renderer
  components: {
    CanvasRenderer: AtomicMolecularCanvas
  },
  
  onApply: (document) => {
    const style = document.createElement('style');
    style.id = 'atomic-molecular-theme-styles';
    style.textContent = `
      .theme-atomic-molecular {
        font-synthesis-weight: none;
      }
      
      .theme-atomic-molecular * {
        box-sizing: border-box;
      }
      
      /* Atomic controls */
      .atomic-chip {
        padding: 6px 10px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.16);
        color: var(--text-primary);
        background: var(--bubble-idle);
        cursor: pointer;
        transition: var(--transition-gentle);
      }
      
      .atomic-chip:hover {
        filter: brightness(1.06);
      }
      
      .atomic-chip.on {
        outline: 2px solid hsl(var(--accent-flow));
        outline-offset: 2px;
      }
      
      .domain-card {
        padding: 8px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.16);
        background: var(--bubble-idle);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 12px;
        box-shadow: var(--shadow-depth);
        transition: var(--transition-gentle);
      }
      
      .domain-card:hover {
        filter: brightness(1.08);
      }
      
      /* Canvas styles */
      .atomic-canvas {
        position: relative;
        max-width: 1000px;
        height: 560px;
        margin: 14px auto 40px;
        border-radius: 16px;
        background: var(--gradient-canvas);
        box-shadow: var(--shadow-depth);
        overflow: hidden;
      }
      
      .atomic-grid {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(hsl(var(--accent-flow) / 0.1) 1px, transparent 1px);
        background-size: 22px 22px;
        opacity: 0.35;
      }
      
      /* Molecular bonds */
      .atomic-bonds {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      
      /* Molecule container */
      .molecule {
        position: absolute;
        cursor: pointer;
      }
      
      /* Nucleus */
      .nucleus {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        cursor: pointer;
        transition: var(--transition-bubble);
      }
      
      .nucleus.selected {
        outline: 2px solid hsl(var(--accent-flow));
        outline-offset: 3px;
      }
      
      /* Nuclear particles */
      .nucleus-particles .proton,
      .nucleus-particles .neutron {
        position: absolute;
        width: 10px;
        height: 10px;
        margin-left: -5px;
        margin-top: -5px;
        border-radius: 50%;
        pointer-events: none;
      }
      
      .proton {
        background: radial-gradient(circle, #fff, hsl(var(--accent-void)) 60%, hsl(var(--accent-void)));
        box-shadow: 0 2px 8px hsl(var(--accent-void) / 0.45);
      }
      
      .neutron {
        background: radial-gradient(circle, #fff, hsl(var(--accent-growth)) 60%, hsl(var(--accent-growth)));
        box-shadow: 0 2px 6px hsl(var(--accent-growth) / 0.45);
      }
      
      /* Electron shells */
      .electron-shell {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        border: 1.5px solid rgba(255,255,255,.18);
        border-radius: 999px;
        animation: orbital-rotation linear infinite;
      }
      
      .electron-shell:nth-child(2) { animation-duration: var(--orbit-speed-1, 18s); }
      .electron-shell:nth-child(3) { animation-duration: var(--orbit-speed-2, 26s); }
      .electron-shell:nth-child(4) { animation-duration: var(--orbit-speed-3, 36s); }
      
      @keyframes orbital-rotation {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }
      
      /* Electrons */
      .electron {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 8px;
        height: 8px;
        margin-left: -4px;
        margin-top: -4px;
        border-radius: 999px;
        background: hsl(var(--accent-flow));
        box-shadow: 0 0 10px hsl(var(--accent-flow));
        cursor: grab;
        transition: var(--transition-gentle);
      }
      
      .electron:active {
        cursor: grabbing;
      }
      
      /* Dragging ghost */
      .electron-drag-ghost {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: hsl(var(--accent-flow));
        box-shadow: 0 0 10px hsl(var(--accent-flow));
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 1000;
      }
      
      /* Molecule label */
      .molecule-label {
        position: absolute;
        left: 50%;
        top: calc(100% + 10px);
        transform: translateX(-50%);
        font-size: 12px;
        color: var(--text-primary);
        text-align: center;
        white-space: nowrap;
      }
      
      /* Toolbar */
      .molecule-toolbar {
        position: absolute;
        left: 50%;
        top: -10px;
        transform: translate(-50%, -100%);
        display: flex;
        gap: 6px;
        background: rgba(18,24,38,.9);
        border: 1px solid rgba(255,255,255,.12);
        padding: 6px;
        border-radius: 10px;
        box-shadow: var(--shadow-depth);
      }
      
      .toolbar-btn {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 8px;
        background: var(--bubble-idle);
        color: var(--text-primary);
        border: 1px solid rgba(255,255,255,.16);
        cursor: pointer;
        transition: var(--transition-gentle);
      }
      
      .toolbar-btn:hover {
        filter: brightness(1.08);
      }
      
      /* Photon effects */
      .photon-shell {
        position: absolute;
        border: 1.5px dashed currentColor;
        border-radius: 999px;
        transform: translate(-50%, -50%);
        animation: photon-pulse 1.8s ease-out forwards;
        pointer-events: none;
      }
      
      @keyframes photon-pulse {
        0% { opacity: 0.9; }
        100% { 
          opacity: 0; 
          transform: translate(-50%, -50%) scale(1.03); 
        }
      }
      
      .photon-bond {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: hsl(var(--accent-flow));
        filter: drop-shadow(0 0 6px currentColor);
        animation: photon-travel 1.8s linear forwards;
        offset-distance: 0%;
      }
      
      @keyframes photon-travel {
        to { 
          offset-distance: 100%; 
          opacity: 0; 
        }
      }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .electron-shell {
          animation: none;
        }
        
        .photon-shell,
        .photon-bond {
          animation: none;
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  },
  
  onRemove: (document) => {
    const style = document.getElementById('atomic-molecular-theme-styles');
    if (style) {
      style.remove();
    }
  },
};