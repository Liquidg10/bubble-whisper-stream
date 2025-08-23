# Theme System Documentation

## Overview

The Bubble Universe theme system provides runtime theme switching with a mobile-first design approach. The system is built on CSS custom properties and React context for seamless theme transitions without page reloads.

## Architecture

### Core Components

1. **Theme Types** (`src/themes/ThemeTypes.ts`)
   - Defines interfaces for themes, tokens, and behavior flags
   - Type-safe theme definitions with semantic token structure

2. **Theme Registry** (`src/themes/registry.ts`)
   - Singleton registry for theme management
   - Handles theme registration, retrieval, and validation

3. **Theme Provider** (`src/themes/provider.tsx`)
   - React context provider for theme state
   - CSS custom property injection and lifecycle management
   - localStorage persistence and SSR safety

4. **Theme Toggle** (`src/components/ThemeToggle.tsx`)
   - Mobile-first UI components for theme switching
   - Multiple variants: compact, detailed, dropdown

## Adding a New Theme

### Step 1: Create Theme Definition

Create a new file in `src/themes/definitions/your-theme.ts`:

```typescript
import type { Theme } from '../ThemeTypes';

export const yourTheme: Theme = {
  id: 'your-theme',
  name: 'Your Theme Name',
  description: 'Brief description of your theme',
  version: '1.0.0',
  className: 'theme-your-theme',
  
  tokens: {
    // Core colors (HSL values without hsl() wrapper)
    bgUniverse: '220 15% 7%',
    textPrimary: '210 20% 95%',
    textSecondary: '210 15% 75%',
    
    // Accent colors
    accentVoid: '255 62% 68%',
    accentFlow: '180 85% 50%',
    accentGrowth: '135 100% 75%',
    
    // ... other tokens (see existing themes for complete structure)
  },
  
  behavior: {
    parallaxEnabled: true,
    floatAmplitude: 0.8,
    floatDurationRange: [3000, 8000],
    // ... other behavior flags
  },
  
  onApply: (document) => {
    // Optional: Add theme-specific global styles
  },
  
  onRemove: (document) => {
    // Optional: Clean up theme-specific styles
  },
};
```

### Step 2: Register the Theme

In `src/themes/registry.ts`, import and register your theme:

```typescript
import { yourTheme } from './definitions/your-theme';

constructor() {
  // Register built-in themes
  this.register(iridescentSoapTheme);
  this.register(classicMinimalTheme);
  this.register(yourTheme); // Add your theme here
}
```

### Step 3: Add Theme Preview (Optional)

In `src/components/ThemeToggle.tsx`, add a preview style for your theme:

```typescript
// In the theme indicator section
theme.id === 'your-theme' && 'bg-your-custom-gradient'
```

## Token Structure

### Color Tokens

All colors use HSL values without the `hsl()` wrapper:
- `bgUniverse`: Main background color
- `textPrimary`: Primary text color
- `textSecondary`: Secondary text color
- `accentVoid`: Purple accent (primary brand)
- `accentFlow`: Cyan accent (flow/water metaphor)
- `accentGrowth`: Green accent (growth/life metaphor)

### Gradient Tokens

Gradients use full CSS gradient syntax:
```typescript
gradientAurora: `linear-gradient(135deg, 
  hsl(255 62% 68% / 0.8), 
  hsl(180 85% 50% / 0.8), 
  hsl(135 100% 75% / 0.8))`
```

### Spacing and Typography

- Use rem units for consistent scaling
- Follow the established scale for consistency
- Typography scale: whisper < gentle < natural < speak < call < shout

## Behavior Flags

### Animation Control

- `parallaxEnabled`: Enable/disable parallax effects
- `floatAmplitude`: Bubble float intensity (0-1)
- `floatDurationRange`: Min/max animation duration

### Performance Flags

- `enableBlur`: Background blur effects
- `enableGlow`: Glow/shadow effects
- `maxVisibleBubbles`: Performance optimization limit

### Interaction Behavior

- `mergeThreshold`: Distance for bubble merging
- `lodDuringDrag`: Level-of-detail during interactions
- `hapticsEnabled`: Device haptic feedback

## Motion Preferences

The system automatically respects `prefers-reduced-motion`:
- Disables animations when motion is reduced
- Overrides theme behavior flags appropriately
- Maintains functionality while reducing visual motion

## Mobile-First Design

### Touch Targets

- All interactive elements ≥44×44px
- No hover-only interactions
- Clear visual feedback for touch

### Responsive Behavior

- Compact theme toggle in header
- Detailed theme selection in settings
- Dropdown optimized for mobile viewports

## Performance Considerations

### Theme Switching

- Uses CSS custom properties for instant switching
- Minimal DOM manipulation
- Optional transition disabling during switch

### Memory Management

- Automatic cleanup of theme-specific styles
- Efficient theme registry caching
- Lifecycle hooks for resource management

## Testing

### Unit Tests

```typescript
// Theme registration
expect(() => themeRegistry.register(duplicateTheme)).toThrow();

// Theme persistence
persistTheme('test-theme');
expect(loadTheme()).toBe('test-theme');
```

### Integration Tests

- Theme switching updates CSS variables
- Motion preferences disable animations
- Mobile viewport maintains usability

### E2E Tests

- Theme persistence across page reloads
- Accessibility with keyboard navigation
- Performance during theme transitions

## Best Practices

### Theme Design

1. **Consistency**: Follow the established token structure
2. **Contrast**: Ensure sufficient color contrast ratios
3. **Semantics**: Use meaningful color relationships
4. **Performance**: Consider animation impact on performance

### Code Organization

1. **Separation**: Keep theme definitions in separate files
2. **Types**: Use TypeScript for type safety
3. **Naming**: Follow the established naming conventions
4. **Documentation**: Document custom behavior flags

### Accessibility

1. **Motion**: Respect motion preferences
2. **Contrast**: Test with high contrast preferences
3. **Focus**: Ensure proper focus management
4. **Screen Readers**: Provide meaningful labels

## Troubleshooting

### Common Issues

1. **FOUC (Flash of Unstyled Content)**
   - Ensure ThemeProvider wraps the entire app
   - Use SSR-safe initialization

2. **CSS Variables Not Updating**
   - Check HSL format (no `hsl()` wrapper in tokens)
   - Verify theme registration

3. **Mobile Touch Issues**
   - Ensure ≥44px touch targets
   - Remove hover-only interactions

4. **Performance Issues**
   - Reduce `maxVisibleBubbles` in theme behavior
   - Disable expensive effects for low-end devices

### Debug Tools

```typescript
// Check current theme
console.log(useTheme().currentTheme);

// List all themes
console.log(listThemes());

// Check CSS variables
console.log(getComputedStyle(document.documentElement).getPropertyValue('--bg-universe'));
```
