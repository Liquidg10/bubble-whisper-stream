/**
 * Theme Hooks - Convenience hooks for theme functionality
 * Re-exports and additional utilities for theme management
 */

export { 
  useTheme, 
  useThemeBehavior, 
  useMotionPreference 
} from '@/themes/provider';

// Re-export types for convenience
export type { 
  Theme, 
  ThemeTokens, 
  ThemeBehaviorFlags 
} from '@/themes/ThemeTypes';