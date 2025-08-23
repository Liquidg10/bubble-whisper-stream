/**
 * Theme System Types for Bubble Universe
 * Pluggable runtime theme switching with mobile-first design
 */

export interface ThemeTokens {
  // Core universe colors
  bgUniverse: string;          // Main background
  textPrimary: string;         // Primary text
  textSecondary: string;       // Secondary text
  
  // Iridescent accent trilogy
  accentVoid: string;          // Purple magic
  accentFlow: string;          // Cyan energy  
  accentGrowth: string;        // Green vitality
  
  // Emotional spectrum
  dangerSoft: string;          // Gentle alerts
  successGentle: string;       // Positive feedback
  warningGlow: string;         // Attention needed
  
  // Bubble states
  bubbleIdle: string;          // Resting state
  bubbleActive: string;        // Engaged state
  bubbleSelected: string;      // Selection highlight
  bubbleReminder: string;      // Reminder urgency
  
  // Rim styling policy
  rimPolicy: 'specular' | 'minimal';  // Type-colored vs single color
  rimColor?: string;           // Single color for minimal policy
  
  // Type-specific aura mapping
  auraMapping: {
    rocky: string;             // Rocky bubble aura
    gas: string;               // Gas bubble aura
    icy: string;               // Icy bubble aura
    volcanic: string;          // Volcanic bubble aura
    cloudy: string;            // Cloudy bubble aura
  };
  
  // Gradients
  gradientAurora: string;      // Main iridescent gradient
  gradientCanvas: string;      // Canvas background
  gradientBubble: string;      // Bubble surfaces
  gradientGentle: string;      // Subtle accents
  
  // Elevation & glow
  glowSoft: string;           // Subtle glow
  glowMedium: string;         // Medium glow
  glowStrong: string;         // Strong glow
  shadowDepth: string;        // Depth shadow
  
  // Motion & transitions
  transitionGentle: string;   // Standard transitions
  transitionBubble: string;   // Bubble animations
  transitionFlow: string;     // Flow animations
  
  // Spacing & layout
  spaceBubble: string;        // Bubble spacing
  spaceBreath: string;        // Breathing room
  radiusBubble: string;       // Bubble border radius
  radiusGentle: string;       // Standard border radius
  
  // Typography
  fontSizeWhisper: string;    // Smallest text
  fontSizeGentle: string;     // Small text
  fontSizeNatural: string;    // Body text
  fontSizeSpeak: string;      // Large text
  fontSizeCall: string;       // Heading text
  fontSizeShout: string;      // Display text
}

export interface ThemeBehaviorFlags {
  // Animation preferences
  parallaxEnabled: boolean;           // Enable parallax effects
  floatAmplitude: number;            // Float animation intensity (0-1)
  floatDurationRange: [number, number]; // Min/max float duration in ms
  
  // Interaction behavior
  mergeThreshold: number;            // Bubble merge distance threshold
  lodDuringDrag: boolean;           // Level-of-detail optimization during drag
  hapticsEnabled: boolean;          // Haptic feedback on supported devices
  
  // Performance flags
  enableBlur: boolean;              // Background blur effects
  enableGlow: boolean;              // Glow effects
  maxVisibleBubbles: number;        // Performance limit for visible bubbles
}

export interface Theme {
  // Metadata
  id: string;
  name: string;
  description: string;
  version: string;
  
  // Visual tokens
  tokens: ThemeTokens;
  
  // Behavior configuration
  behavior: ThemeBehaviorFlags;
  
  // Lifecycle hooks
  onApply?: (document: Document) => void;
  onRemove?: (document: Document) => void;
  
  // CSS class name for theme-specific styles
  className?: string;
}

export interface ThemeContextValue {
  currentTheme: Theme;
  themes: Theme[];
  setTheme: (themeId: string) => void;
  isLoading: boolean;
}

// Motion preference integration
export type MotionPreference = 'auto' | 'reduce' | 'no-preference';

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: string;
  storageKey?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}