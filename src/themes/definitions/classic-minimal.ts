/**
 * Classic Minimal Theme - Clean, high-contrast alternative
 * Focused on clarity and reduced visual complexity
 */

import type { Theme } from '../ThemeTypes';

export const classicMinimalTheme: Theme = {
  id: 'classic-minimal',
  name: 'Classic Minimal',
  description: 'Clean, high-contrast design focused on clarity and simplicity',
  version: '1.0.0',
  className: 'theme-classic-minimal',
  
  tokens: {
    // Core universe colors
    bgUniverse: '213 40% 8%',              // Deep navy #0B0F14
    textPrimary: '220 100% 94%',           // #EAF2FF
    textSecondary: '0 0% 70%',             // Clear gray #B3B3B3
    
    // Minimal accent palette - focused blues and grays
    accentVoid: '220 100% 60%',            // Clean blue #3366FF
    accentFlow: '200 100% 55%',            // Cyan blue #0099FF
    accentGrowth: '120 60% 50%',           // Muted green #40CC40
    
    // Emotional spectrum - clear and direct
    dangerSoft: '0 85% 60%',               // Clear red #E53E3E
    successGentle: '120 60% 50%',          // Success green #40CC40
    warningGlow: '45 95% 55%',             // Amber warning #FF9500
    
    // Bubble states - subtle and clean
    bubbleIdle: '215 25% 15%',             // #111826 equivalent
    bubbleActive: '215 30% 20%',           // Slightly lighter
    bubbleSelected: '220 100% 25%',        // Selected blue
    bubbleReminder: '0 85% 25%',           // Reminder red
    
    // Rim styling
    rimPolicy: 'minimal' as const,         // Single color, subtle
    rimColor: '210 20% 56%',               // #8AA0B3
    
    // Type-specific aura mapping - minimal/none
    auraMapping: {
      rocky: '0 0% 0%',                    // No aura
      gas: '0 0% 0%',                      // No aura
      icy: '0 0% 0%',                      // No aura
      volcanic: '0 0% 0%',                 // No aura
      cloudy: '0 0% 0%',                   // No aura
    },
    
    // Gradients - minimal and clean
    gradientAurora: `linear-gradient(135deg, 
      hsl(220 100% 60% / 0.6), 
      hsl(200 100% 55% / 0.6))`,
    gradientCanvas: `linear-gradient(180deg, 
      hsl(0 0% 4%), 
      hsl(0 0% 6%))`,
    gradientBubble: `linear-gradient(145deg,
      hsl(0 0% 18% / 0.9),
      hsl(0 0% 25% / 0.7))`,
    gradientGentle: `linear-gradient(120deg,
      hsl(200 100% 55% / 0.2),
      hsl(120 60% 50% / 0.2))`,
    
    // Elevation & Glow - subtle shadows
    glowSoft: '0 0 15px hsl(220 100% 60% / 0.2)',
    glowMedium: '0 0 25px hsl(200 100% 55% / 0.3)',
    glowStrong: '0 0 35px hsl(120 60% 50% / 0.4)',
    shadowDepth: '0 4px 24px hsl(0 0% 0% / 0.8)',
    
    // Motion & Transitions - slightly faster
    transitionGentle: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
    transitionBubble: 'transform 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    transitionFlow: 'all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    
    // Spacing & Rhythm - tighter spacing
    spaceBubble: '1.25rem',
    spaceBreath: '2rem',
    radiusBubble: '1rem',
    radiusGentle: '0.5rem',
    
    // Typography Scale - slightly smaller
    fontSizeWhisper: '0.7rem',
    fontSizeGentle: '0.8rem',
    fontSizeNatural: '0.95rem',
    fontSizeSpeak: '1.05rem',
    fontSizeCall: '1.35rem',
    fontSizeShout: '1.8rem',
  },
  
  behavior: {
    // Animation preferences - reduced motion
    parallaxEnabled: false,
    floatAmplitude: 0.375,                 // 6px amplitude
    floatDurationRange: [18000, 26000],    // 18-26s gentle
    
    // Interaction behavior - more precise
    mergeThreshold: 120,                   // Standard - 10% preview
    lodDuringDrag: false,                  // No special LOD
    hapticsEnabled: false,
    
    // Performance flags - optimized
    enableBlur: false,
    enableGlow: false,
    maxVisibleBubbles: 150,
    lowDetailMode: false,
  },
  
  onApply: (document) => {
    // Add theme-specific global styles
    const style = document.createElement('style');
    style.id = 'classic-minimal-theme-styles';
    style.textContent = `
      .theme-classic-minimal .canvas-backdrop {
        background: var(--gradient-canvas);
      }
      
      .theme-classic-minimal .bubble-surface {
        border: 1px solid hsl(0 0% 30%);
        backdrop-filter: none;
      }
      
      .theme-classic-minimal .fab-minimal {
        background: hsl(220 100% 60%);
        box-shadow: 0 2px 8px hsl(0 0% 0% / 0.3);
      }
      
      .theme-classic-minimal .minimap {
        border: 1px solid hsl(0 0% 30%);
        background: hsl(0 0% 8% / 0.95);
      }
    `;
    document.head.appendChild(style);
  },
  
  onRemove: (document) => {
    // Clean up theme-specific styles
    const style = document.getElementById('classic-minimal-theme-styles');
    if (style) {
      style.remove();
    }
  },
};