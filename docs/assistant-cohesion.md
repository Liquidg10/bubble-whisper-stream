# P18 - Assistant Cohesion Check

## Overview

The Assistant Cohesion Linter ensures that all user-facing UI displays the assistant as a unified voice, never exposing individual persona names like "Coach Autonomy", "Dr. Seligman", etc.

## Goals

- **Unified Assistant Voice**: Users see only "Assistant" or "I" in UI text
- **No Persona Leakage**: Internal persona system remains invisible to users
- **CI Integration**: Builds fail if persona names leak to UI
- **Developer Clarity**: Clear guidance on what's allowed where

## Implementation

### Lint Scripts

1. **TypeScript Utility**: `src/utils/assistantCohesionLint.ts`
   - Core linting logic with detailed violation detection
   - Configurable forbidden persona names and allowed file patterns

2. **CLI Script**: `scripts/lint-assistant-cohesion.js`
   - Executable script for CI/CD integration
   - Scans entire `src/` directory for violations

### Integration

Add to your CI pipeline:
```bash
npm run lint:cohesion
```

The lint script is automatically included in the main `lint` command.

### Allowed Files

Persona names are permitted in:
- `src/services/` - Internal business logic
- `src/types/` - Type definitions
- `src/components/settings/` - Settings panels
- `src/components/dev/` - Development tools
- Test files (`*.test.*`, `*.spec.*`)

### Forbidden Names

These persona names must not appear in user-facing UI:
- Coach Autonomy, Dr. Seligman, Dr. Anila, Sous-Chef, Dr. Rhea
- Friend, Coach, Scientist, FutureYou, Future You
- Glimmer, CBT, Persona

## Examples

### ❌ Wrong
```tsx
<Badge>{response.personaId === 'coach_autonomy' ? 'Coach Autonomy' : 'Assistant'}</Badge>
```

### ✅ Correct
```tsx
<Badge>Assistant</Badge>
```

### ❌ Wrong
```tsx
<p>Dr. Seligman suggests you try this approach...</p>
```

### ✅ Correct
```tsx
<p>I suggest you try this approach...</p>
```

## Architecture Notes

- **Internal Traces**: Services and logging can still use persona names for debugging
- **Progressive Disclosure**: Settings panels can expose persona controls to users who opt-in
- **Evidence-Based**: Persona system provides evidence-anchored guidance behind unified voice
- **Autonomy Preservation**: Users control activation without seeing complexity

## CI Behavior

- ✅ **Pass**: No persona names found in UI components
- ❌ **Fail**: Any persona name detected in user-facing text
- **Output**: Detailed violation report with file/line numbers
- **Fix Guidance**: Clear instructions on replacing persona names

## Maintenance

When adding new personas:
1. Add persona name to `FORBIDDEN_PERSONA_NAMES` arrays
2. Update allowed files if needed
3. Ensure internal services can still use persona names
4. Verify UI consistently shows "Assistant"