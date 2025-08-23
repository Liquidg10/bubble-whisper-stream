/**
 * GPU Performance Optimization Guidelines for Bubble Universe
 * 
 * This document provides best practices for maintaining smooth performance
 * on mobile devices, particularly iPhone Safari and mid-range Android Chrome.
 * 
 * TARGET PERFORMANCE:
 * - ≥60 FPS during single bubble drag operations
 * - ≥45-50 FPS during multi-select drag operations on mid-range devices
 * - Graceful degradation on low-end devices
 */

# Level of Detail (LOD) System

## LOD Levels
1. **High**: All effects enabled (desktop, high-end mobile)
2. **Medium**: Reduced refraction, specular effects (standard mobile)  
3. **Low**: Minimal effects, simplified shadows (mid-range mobile)
4. **Minimal**: Essential visuals only (low-end devices, battery saver)

## Automatic LOD Triggers
- **Device Detection**: GPU renderer, mobile user agent
- **Performance Monitoring**: Real-time FPS measurement
- **Interaction State**: Single drag vs multi-select vs idle
- **User Preference**: Manual Low Detail Mode toggle

# GPU-Friendly Implementation Guidelines

## CSS Transform Optimizations
```css
/* ✅ GPU-accelerated transforms */
transform: translate3d(x, y, 0) scale(1.05);
will-change: transform;

/* ❌ Avoid layout-triggering properties during animation */
left: 100px; /* triggers layout */
margin-left: 100px; /* triggers layout */
```

## Efficient Gradient Usage
```css
/* ✅ Simple gradients perform better */
background: linear-gradient(135deg, color1, color2);

/* ⚠️ Complex gradients impact performance */
background: radial-gradient(circle at 30% 30%, rgba(...), transparent 60%),
            linear-gradient(145deg, rgba(...), rgba(...));
```

## Animation Best Practices
```css
/* ✅ Use transform and opacity only during interactions */
.bubble-dragging {
  transform: translate3d(var(--x), var(--y), 0);
  transition: none; /* Disable transitions during drag */
}

/* ✅ Enable smooth transitions on release */
.bubble-idle {
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

# RequestAnimationFrame Batching

## Efficient Update Pattern
```typescript
class PerformanceManager {
  private pendingUpdates = new Set<() => void>();
  private rafId: number | null = null;

  scheduleUpdate(updateFn: () => void) {
    this.pendingUpdates.add(updateFn);
    
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        // Batch all updates in a single frame
        this.pendingUpdates.forEach(fn => fn());
        this.pendingUpdates.clear();
        this.rafId = null;
      });
    }
  }
}
```

# Layout Thrash Prevention

## Avoid These During Interactions:
- Reading `offsetWidth`, `offsetHeight`, `getBoundingClientRect()`
- Changing CSS properties that trigger layout (`width`, `height`, `padding`, `margin`)
- Adding/removing DOM nodes
- Changing CSS classes that affect layout

## Safe During Interactions:
- `transform` properties
- `opacity`
- `filter` (with caution)
- CSS custom properties that only affect `transform`/`opacity`

# Mobile-Specific Optimizations

## iOS Safari
- Limit simultaneous animations to 6-8 elements
- Use `will-change: transform` sparingly (remove after animation)
- Avoid `backdrop-filter` during interactions

## Android Chrome
- Reduce gradient complexity on lower-end devices
- Batch DOM reads to avoid style recalculation
- Use `transform3d` to force hardware acceleration

# Performance Monitoring

## Key Metrics to Track
```typescript
interface PerformanceMetrics {
  averageFPS: number;        // Target: >45 FPS
  frameDrops: number;        // Target: <5% of frames
  dragLatency: number;       // Target: <16ms
  memoryUsage: number;       // Monitor for leaks
}
```

## FPS Measurement
```typescript
function measureFPS() {
  const frameTimes: number[] = [];
  let lastTime = performance.now();
  
  function frame() {
    const now = performance.now();
    frameTimes.push(now - lastTime);
    lastTime = now;
    
    // Keep rolling window of 60 frames
    if (frameTimes.length > 60) {
      frameTimes.shift();
    }
    
    const avgFrameTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
    const fps = 1000 / avgFrameTime;
    
    requestAnimationFrame(frame);
  }
  
  requestAnimationFrame(frame);
}
```

# Debugging Performance Issues

## Chrome DevTools
1. **Performance Tab**: Record during bubble interactions
2. **Rendering Tab**: Enable "Paint flashing" and "Layout shift regions"
3. **Memory Tab**: Check for memory leaks during extended use

## Common Performance Bottlenecks
- Too many simultaneous CSS transitions
- Complex box-shadows during drag operations
- Frequent DOM queries during animations
- Memory leaks from event listeners
- Expensive React re-renders during interactions

# Testing Checklist

## Device Testing
- [ ] iPhone 12/13 Safari: 60 FPS single drag
- [ ] iPhone SE Safari: 45+ FPS single drag  
- [ ] Samsung Galaxy A52 Chrome: 45+ FPS single drag
- [ ] Low-end Android: Graceful degradation

## Interaction Testing
- [ ] Single bubble drag: Smooth throughout
- [ ] Multi-select (3-5 bubbles): Acceptable performance
- [ ] Quick gesture sequences: No frame drops
- [ ] Extended usage: No memory leaks

## Visual Quality Testing
- [ ] LOD transitions are subtle
- [ ] Essential features remain usable in minimal mode
- [ ] Visual feedback is immediate regardless of LOD level
