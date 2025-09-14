# Test Infrastructure

## Overview
Critical test infrastructure for Mind Manual / Bubble OS testing and validation.

## Directory Structure

```
tests/
├── e2e/                    # End-to-end tests
│   ├── calendar-ai.spec.ts     # Calendar-AI integration tests
│   ├── masonry.spec.ts          # Masonry/Pinboard view tests
│   ├── task-creation.spec.ts    # Task creation workflows
│   └── dev-routes.spec.ts       # Dev route validation
├── integration/            # Integration tests
│   ├── auto-write.test.ts       # Auto-write ladder tests
│   ├── feature-flags.test.ts    # Feature flag gating tests
│   └── calendar-sync.test.ts    # Calendar sync tests
├── unit/                   # Unit tests
│   ├── adapters/               # View adapter tests
│   ├── services/               # Service layer tests
│   └── components/             # Component tests
└── fixtures/               # Test data and fixtures
    ├── tasks.json              # Sample task data
    ├── calendar-events.json    # Sample calendar data
    └── user-scenarios.json     # User journey scenarios
```

## Test Status

### ✅ Implemented
- None (all tests are missing)

### 🔶 Partial
- Test infrastructure setup (this file)

### ❌ Missing (Critical)
- All E2E tests for critical user journeys
- Integration tests for calendar-AI wiring
- Unit tests for view adapters
- Feature flag validation tests
- Performance regression tests

## Next Steps

1. **Create E2E tests** for calendar-AI integration
2. **Add integration tests** for auto-write features  
3. **Implement unit tests** for view adapters
4. **Add performance tests** for mobile optimization
5. **Create validation tests** for feature flag gating

## Test Commands

```bash
# Run all tests
npm run test

# Run E2E tests
npm run test:e2e

# Run integration tests  
npm run test:integration

# Run unit tests
npm run test:unit

# Run tests in watch mode
npm run test:watch
```

## Notes

- All tests must pass before production deployment
- E2E tests validate complete user journeys
- Integration tests ensure services work together
- Unit tests provide fast feedback during development