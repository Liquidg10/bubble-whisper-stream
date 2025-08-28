# Atomic View System Architecture

This directory contains the refactored Atomic View system, broken down into focused modules for better maintainability.

## Module Structure

### Core Modules

- **`atomicAdapter.ts`** - Main adapter that re-exports all atomic operations
- **`store.ts`** - Centralized bubble store access to reduce boilerplate
- **`timeHorizons.ts`** - Time horizon management (Today, Week, Later)
- **`molecules.ts`** - Molecule creation, merging, and splitting operations
- **`domainClassification.ts`** - Bubble domain classification logic
- **`positioning.ts`** - Optimal bubble positioning algorithms

### Supporting Files

- **`/types/atomic.ts`** - TimeHorizon enum and domain configurations
- **`/utils/logger.ts`** - Structured logging utility
- **`/utils/atomicHelpers.ts`** - Reusable utility functions

## Key Improvements

1. **Typed Constants**: Replaced hard-coded strings with `TimeHorizon` enum
2. **Focused Modules**: Each file has a single responsibility
3. **Centralized Store Access**: All store calls go through `store.ts`
4. **Structured Logging**: Replaced console.log with structured logger
5. **Reusable Utilities**: Common functions extracted to helpers

## Usage

Import operations from the main adapter:

```typescript
import { 
  createMoleculeFromDomain, 
  classifyBubbleDomain 
} from '@/experimental/atomic/atomicAdapter';

// Use canonical helpers directly for domain and horizon management
import { classifyDomain, getDomainEmoji } from '@/lib/classifyDomain';
import { getHorizon, setHorizon, moveBubbleToHorizon } from '@/lib/horizon';
```

All existing imports continue to work exactly as before.