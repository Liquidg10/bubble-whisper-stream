# Contributing to Bubble Whisper Stream

## Core Guardrails

### 🚫 Never Touch These
- **AppShell**: The main layout and navigation wrapper
- **Routing**: React Router setup in App.tsx
- **Global Providers**: Theme, Accessibility, FeatureFlags, QueryClient
- **Other Views**: Don't delete Bubble, Atomic, Timeline, Reminders, Settings views

### 🏁 Feature Flags (Required)
All new features MUST be behind a feature flag in `src/config/flags.ts`:

```typescript
export const flags = {
  atomicUnified: true,
  bubblesFinishing: true, 
  aiVision: true,
  joyPage: true,
  emailIngest: true,
  receiptsOCR: true
};
```

Toggle flags via localStorage: `localStorage.setItem('flags.joyPage', 'true')`

### 🧪 Dev Test Routes (Required)
All UI or performance changes must expose a dev test route:
- Pattern: `/dev/feature-name`
- Must show: FPS, Reduced-Motion state, enabled flags
- Must include: Clear "Back to App" link
- Access via Dev Menu (Ctrl/Cmd+Shift+D)

### ↩️ Undo System (Required)
All store writes must be undoable through global undo stack.

### ♿ Accessibility (Required)
- Respect `prefers-reduced-motion`
- Respect `prefers-contrast: high`
- All interactive elements accessible via keyboard
- Proper ARIA labels and roles

### 📸 Photo Guidelines
- Photos: isolated container + `<img>` only
- No `backdrop-filter` on image elements
- Type-colored rim must be visible above photo
- Lazy loading for performance

### 🎛️ Pan/Zoom Guidelines
- Single hook for all pan/zoom behavior
- Center-anchored zoom only
- Minimum pan threshold: 8px
- Consistent across all views

### ▶️ Motion Guidelines
- Explicit Play/Pause controls only
- Never toggle motion via click or pan
- Motion state clearly visible to user
- Respect reduced-motion preferences

## Development Workflow

1. **Create Feature Flag**: Add to `src/config/flags.ts`
2. **Build Behind Flag**: Wrap feature in flag check
3. **Create Dev Route**: Add test page under `/dev/`
4. **Add to Dev Menu**: Register route in dev menu
5. **Test Accessibility**: Verify reduced-motion and high-contrast
6. **Verify Undo**: Ensure all changes are reversible

## Dev Tools

### Dev Menu
- Access: `Ctrl/Cmd+Shift+D`
- Lists all `/dev/` routes
- Shows current system state

### Dev Logging
```typescript
import { devLog } from '@/devtools/devLog';
devLog('feature-name', data); // Only logs if DEBUG mode enabled
```

### Feature Flag Testing
```javascript
// Enable feature
localStorage.setItem('flags.featureName', 'true');

// Disable feature  
localStorage.setItem('flags.featureName', 'false');

// Check current flags
Object.keys(localStorage).filter(k => k.startsWith('flags.'));
```

## Performance Guidelines

- Target 60 FPS for single operations
- Target 45 FPS for multi-select operations
- Use Level of Detail (LOD) for complex scenes
- Monitor via Performance component
- Test on low-end devices

## Code Organization

- **Components**: Focused, single-responsibility
- **Hooks**: Reusable logic extraction
- **Services**: Business logic and data management
- **Utils**: Pure helper functions
- **Types**: Strong typing throughout

## Testing Strategy

- Unit tests for business logic
- Integration tests for user workflows
- Performance tests for stress scenarios
- Accessibility audits for all features
- Cross-browser compatibility checks

Remember: Better to build incrementally behind feature flags than to break existing functionality.