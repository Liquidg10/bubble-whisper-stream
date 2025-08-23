/**
 * Iridescent Soap Theme - The signature theme of Bubble Universe
 * High-contrast cosmic aesthetic with iridescent accents
 */

import type { Theme } from '../ThemeTypes';

export const iridescentSoapTheme: Theme = {
  id: 'iridescent-soap',
  name: 'Iridescent Soap',
  description: 'Cosmic bubbles floating in deep space with iridescent highlights',
  version: '1.0.0',
  className: 'theme-iridescent-soap',
  
  tokens: {
    // Core universe colors
    bgUniverse: '0 0% 0%',                 // Pure black #000
    textPrimary: '246 100% 98%',           // #F5F6FF
    textSecondary: '210 15% 75%',          // Gentle secondary #B6C0CC
    
    // Iridescent accent trilogy
    accentVoid: '255 62% 68%',             // Purple magic #7B5CFF
    accentFlow: '180 85% 50%',             // Cyan energy #2BD9D9
    accentGrowth: '135 100% 75%',          // Green vitality #7FFFA1
    
    // Emotional spectrum
    dangerSoft: '0 100% 70%',              // Gentle red #FF6B6B
    successGentle: '135 76% 60%',          // Life green #5BE37D
    warningGlow: '45 100% 68%',            // Amber warmth
    
    // Bubble states
    bubbleIdle: '240 30% 12%',             // rgba(20,20,30,0.55) equivalent
    bubbleActive: '240 25% 18%',           // Engaged state
    bubbleSelected: '255 62% 20%',         // Selection glow
    bubbleReminder: '0 60% 25%',           // Reminder urgency
    
    // Rim styling
    rimPolicy: 'specular' as const,        // Type-colored rim with specular segment
    
    // Type-specific aura mapping
    auraMapping: {
      rocky: '262 100% 60%',               // #8A4DFF
      gas: '180 100% 50%',                 // #00E5FF
      icy: '150 100% 64%',                 // #00FFA3
      volcanic: '24 100% 50%',             // #FF7A00
      cloudy: '300 100% 62%',              // #FF3FD4
    },
    
    // Gradients - Iridescent Magic
    gradientAurora: `linear-gradient(135deg, 
      hsl(255 62% 68% / 0.8), 
      hsl(180 85% 50% / 0.8), 
      hsl(135 100% 75% / 0.8))`,
    gradientCanvas: `radial-gradient(ellipse at center, 
      hsl(224 15% 7% / 0.9), 
      hsl(224 15% 7%))`,
    gradientBubble: `linear-gradient(145deg,
      hsl(210 20% 15% / 0.9),
      hsl(210 25% 25% / 0.7))`,
    gradientGentle: `linear-gradient(120deg,
      hsl(180 85% 50% / 0.3),
      hsl(135 100% 75% / 0.3))`,
    
    // Elevation & Glow
    glowSoft: '0 0 20px hsl(255 62% 68% / 0.3)',
    glowMedium: '0 0 40px hsl(180 85% 50% / 0.4)',
    glowStrong: '0 0 60px hsl(135 100% 75% / 0.5)',
    shadowDepth: '0 8px 32px hsl(224 15% 3% / 0.6)',
    
    // Motion & Transitions
    transitionGentle: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    transitionBubble: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    transitionFlow: 'all 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    
    // Spacing & Rhythm
    spaceBubble: '1.5rem',
    spaceBreath: '2.5rem',
    radiusBubble: '1.25rem',
    radiusGentle: '0.75rem',
    
    // Typography Scale
    fontSizeWhisper: '0.75rem',
    fontSizeGentle: '0.875rem',
    fontSizeNatural: '1rem',
    fontSizeSpeak: '1.125rem',
    fontSizeCall: '1.5rem',
    fontSizeShout: '2rem',
  },
  
  behavior: {
    // Animation preferences
    parallaxEnabled: true,
    floatAmplitude: 0.875,                 // ~14px amplitude
    floatDurationRange: [16000, 24000],    // 16-24s staggered
    
    // Interaction behavior
    mergeThreshold: 96,                    // Easy - 6% preview
    lodDuringDrag: true,                   // Reduce heavy visual layers
    hapticsEnabled: true,
    
    // Performance flags
    enableBlur: true,
    enableGlow: true,
    maxVisibleBubbles: 100,
    lowDetailMode: false,
  },
  
  onApply: (document) => {
    // Add theme-specific global styles if needed
    const style = document.createElement('style');
    style.id = 'iridescent-soap-theme-styles';
    style.textContent = `
      .theme-iridescent-soap .canvas-backdrop {
        background: var(--gradient-canvas);
      }
      
      .theme-iridescent-soap .bubble-glow {
        filter: drop-shadow(var(--glow-soft));
      }
      
      .theme-iridescent-soap .fab-aurora {
        background: var(--gradient-aurora);
        animation: aurora-shift 4s ease-in-out infinite;
      }
      
      @keyframes aurora-shift {
        0%, 100% { filter: hue-rotate(0deg); }
        50% { filter: hue-rotate(15deg); }
      }
    `;
    document.head.appendChild(style);
  },
  
  onRemove: (document) => {
    // Clean up theme-specific styles
    const style = document.getElementById('iridescent-soap-theme-styles');
    if (style) {
      style.remove();
    }
  },
};