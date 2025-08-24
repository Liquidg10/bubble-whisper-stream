# Changelog

All notable changes to Bubble Universe will be documented in this file.

## [Phase 2] - 2024-12-XX - Intelligence Layer

### Added

#### Core Intelligence Features
- **CBT Thought Check**: Guided journaling to challenge cognitive spirals
  - Non-clinical, supportive prompts
  - Distortion identification (9 common patterns)
  - Evidence gathering and balanced reframing
  - Optional TTS "read back kindly" feature
  - Integration via right-click context menu on bubbles

- **Self-Compassion Glimmers**: Context-aware gentle nudges
  - 4 tone options: Future-You, Trusted Friend, Gentle Coach, Neutral Scientist
  - Frequency caps and quiet hours respected
  - Triggered by patterns (overwhelm, consistency, quiet periods)
  - Optional TTS delivery with explainable "Because..." reasons

- **Adaptive Reminder Engine 2.0**: Rule-based learning system
  - Learns from snooze reasons and timing patterns
  - Fatigue guard prevents overwhelm
  - "Because..." explanations for all adaptations
  - Quick adjustment component when needed
  - Respects quiet hours with level caps

#### Accessibility & Settings
- **AccessibilityProvider**: Comprehensive a11y system
  - Dyslexia-friendly fonts and spacing
  - High contrast and reduced motion
  - Screen reader announcements
  - System preference detection

- **FeatureFlags**: Granular control system
  - Per-feature toggles (CBT, Glimmers, Adaptive Reminders)
  - Debug mode and performance monitoring flags
  - Persistent settings with localStorage backup

#### Privacy & Transparency
- **Consent Service**: Layered permission system
  - Surface/Context/Deep data layer toggles
  - Biometric gating for sensitive features
  - Transparent data usage explanations
  - Revocation and audit logging

- **Explainability Service**: Clear reasoning for all AI actions
  - "Because..." pills on notifications
  - Data source transparency
  - Confidence indicators and reasoning chains

#### Quality of Life
- **Monthly Review**: Self-model maintenance
  - Diff view of pattern changes
  - Archive "That was then" outdated patterns
  - User-confirmed updates only

- **Quick Tour**: Interactive feature introduction
  - Step-by-step capability overview
  - Accessible with progress indicators
  - Available from Settings panel

### Enhanced

#### Existing Features
- **Bubble Canvas**: Added context menu integration for CBT flow
- **Settings**: Reorganized with intelligence controls and help section
- **Navigation**: Dynamic CBT tab when intelligence enabled
- **TTS Service**: Fixed property access and improved error handling

#### Performance
- **Testing Framework**: Comprehensive test suite
  - Unit tests for services (CBT, Glimmer, Adaptive Reminders)
  - Integration tests for complete flows
  - React Testing Library setup with proper mocks

- **Offline Support**: Graceful degradation
  - Offline detection with user-friendly alerts
  - All core features work without network
  - Data persistence and sync preparation

### Technical

#### Architecture
- **Service Layer**: Modular intelligence services
  - CBTService: Distortion detection and reframe suggestions
  - GlimmerService: Pattern-based notification generation
  - AdaptiveReminderService: Rule-based scheduling adjustments
  - ExplainabilityService: Human-readable AI reasoning
  - ConsentService: Privacy-first permission management

#### Data Schema
- **CBT Entries**: Thought, distortions, evidence, reframes
- **Glimmers**: Tone, message, cause, delivery method
- **Pattern Hints**: Confidence-based user model updates
- **Self-Model Audits**: Change tracking with user confirmation

#### Performance
- **LOD System**: Level-of-detail optimization during interactions
- **Memory Management**: Efficient state management with cleanup
- **Animation Optimization**: Reduced motion compliance
- **Batched Operations**: Efficient rule processing (<50ms)

### Developer Experience
- **TypeScript**: Strict mode compliance throughout
- **Testing**: Vitest + React Testing Library
- **Documentation**: Comprehensive feature guides and API docs
- **Feature Flags**: Easy A/B testing and gradual rollouts

### Privacy & Ethics
- **Local-First**: All intelligence processing on-device
- **Anti-Shame**: Replaced all guilt-inducing language
- **Explainable**: Every AI decision includes reasoning
- **Consent-Driven**: Granular opt-in for sensitive features
- **Audit Trail**: Complete change history with user control

---

## [Phase 1] - 2024-11-XX - Foundation

### Added
- Mobile-first Bubble Canvas with multi-touch support
- Radial Quick-Capture (voice/text/sketch/photo)
- Timeline & Self-Model journaling
- Progressive Reminders (L1→L3) with snooze reasons
- Voice playback (generic TTS)
- Local-first encrypted storage
- High-contrast iridescent design system
- Accessibility foundation (dyslexia-friendly, reduced-motion)
- Theme system with iridescent and minimal variants