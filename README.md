# Bubble OS - Phase 2: Intelligence Layer

A compassionate cognitive companion built for neurodivergent minds. Phase 2 introduces gentle, explainable intelligence that remains local-first and completely optional.

## 🧠 Phase 2 Features

### CBT Thought Check
- **Guided journaling** to transform spiraling thoughts into balanced perspectives
- **Non-clinical approach** with supportive, shame-free language
- **Step-by-step flow**: Capture thought → identify patterns → examine evidence → reframe
- **Voice playback** with compassionate tones for comfort

### Self-Compassion Glimmers
- **Gentle nudges** triggered by behavioral patterns
- **Four tone options**: Future-You, Trusted Friend, Gentle Coach, Neutral Scientist
- **Smart timing** with frequency caps and quiet hours
- **Transparent explanations** for every suggestion

### Adaptive Reminders 2.0
- **Learning system** that adapts to your snooze patterns
- **Fatigue guard** prevents reminder burnout
- **"Because..." explanations** for every adjustment
- **Context-aware scheduling** based on energy patterns

### Enhanced Self-Model v2
- **Layered privacy**: Surface, Context, and Deep layers with biometric protection
- **Monthly reviews** with diff views and archival options
- **Audit trails** for all model changes
- **Pattern decay** to prevent outdated assumptions

## 🛠 Technical Architecture

### Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: Zustand with IndexedDB persistence
- **Accessibility**: WCAG 2.1 AA compliant, dyslexia-friendly
- **Performance**: 60+ FPS target with Level-of-Detail optimizations

### Key Services
- `CBTService`: Thought check flows and pattern recognition
- `GlimmerService`: Context-aware notification system
- `AdaptiveReminderService`: Rule-based learning engine
- `ExplainabilityService`: Transparent AI explanations
- `BiometricService`: Secure access for sensitive data

### Privacy & Ethics
- **Local-first**: All processing happens on-device
- **Encrypted storage**: AES-256 encryption for sensitive data
- **Explicit consent**: Granular permissions per feature
- **Data ownership**: Export and delete capabilities
- **No tracking**: Zero telemetry or analytics

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## 🎛 Feature Flags

Features can be toggled via Settings or localStorage:

```javascript
// Enable/disable features
localStorage.setItem('featureFlags', JSON.stringify({
  cbtEnabled: true,
  glimmersEnabled: true,
  adaptiveRemindersEnabled: true,
  performanceMonitoringEnabled: false
}));
```

## ♿ Accessibility Features

- **Dyslexia support**: OpenDyslexic font, increased spacing
- **Screen reader compatible**: Full ARIA support and semantic HTML
- **Keyboard navigation**: Complete app navigation without mouse
- **High contrast mode**: Enhanced visibility options
- **Reduced motion**: Respects system preferences
- **Voice navigation**: TTS integration throughout

## 🔧 Configuration

### Environment Variables
```bash
# Feature toggles (optional)
VITE_CBT_ENABLED=true
VITE_GLIMMERS_ENABLED=true
VITE_ADAPTIVE_REMINDERS_ENABLED=true

# Performance monitoring
VITE_PERFORMANCE_MONITORING=false
```

### Theme Customization
Themes are defined in `src/themes/definitions/`. The app includes:
- **Iridescent Soap**: High-contrast bubbles with subtle animations
- **Classic Minimal**: Clean, accessible design with reduced motion

---

**Original Project**: Built with Vite, TypeScript, React, shadcn-ui, and Tailwind CSS.

Visit the [Lovable Project](https://lovable.dev/projects/8d3041fb-8df4-4afe-87e4-b56a10af1d00) to continue development.
