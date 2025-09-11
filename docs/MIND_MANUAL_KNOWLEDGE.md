# Mind Manual / Bubble OS — Project Knowledge Base

This file serves as the definitive project brain, capturing the unified vision, architecture, and implementation guidelines for Mind Manual / Bubble OS.

**⚠️ SOURCE OF TRUTH**: This file must exactly match the live codebase. Any drift between this knowledge and actual implementation will cause AI confusion and inconsistent edits.

## Core Identity

Mind Manual is a **neurodivergent-first productivity companion** that provides "stealth wellness" - improving mental health through ordinary task management without demanding separate self-improvement routines. It meets people where they are and helps with what they need anyway (tasks, calendar, email, money) while quietly learning and offering gentle, explainable assistance.

## Technical Philosophy

- **Local-first**: Data stays on device unless user opts for sync
- **Privacy-layered**: Surface/Context/Deep data with user controls
- **Explainable AI**: Every action has "Because..." explanations
- **Reversible actions**: All changes can be undone
- **Multi-device CRDT sync**: Conflict-free collaborative editing

## Unified Architecture

### Single Task Entity
All views (Bubble, Atomic, List, Kanban, Eisenhower, Calendar) operate on the same `Task` schema:

```typescript
interface Task {
  id: string;
  type: 'task' | 'thought' | 'memory' | 'mood' | 'reminder' | 'photo' | 'event';
  title: string;
  content?: string;
  completed: boolean;
  priority: number; // 0-100: feeds Bubble vertical position & Atomic shell defaults
  tags: Array<{id: string, name: string, emoji?: string, colorHex?: string}>;
  
  // View-specific positioning (namespaced to prevent coupling)
  view: {
    bubble?: {x: number, y: number, size: number, moodColor?: string};
    atomic?: {nucleus: string, shell: 'today'|'week'|'later', angle: number};
    kanban?: {boardId: string, columnId: string, order: number};
    list?: {order: number, groupKey?: string};
    matrix?: {urgency: 0|1|2|3, importance: 0|1|2|3, quadrant: number};
  };
}
```

**Critical**: View metadata is namespaced (`view.*`) to prevent cross-view coupling. Adapters MUST NOT write non-namespaced, view-specific fields. Never duplicate business logic across views.

### Stealth Wellness Engine
- Behavioral intelligence from usage patterns
- Timeline 2.0 with mood ribbons and completion heat bars
- Gentle interventions with rate limiting
- Crisis detection and safety protocols

### Auto-Write Ladder
Three-tier confidence system:
1. **Suggest** (<60%): Show chip with one-tap apply
2. **Draft** (60-85%): Create pending object, never auto-commit
3. **Auto-write** (>85%): Only for trivially reversible actions

Domain-specific rules prevent destructive actions (never auto-send email, careful with calendar invites, read-only financial data).

### Integration Strategy
- **Least privilege OAuth**: Start minimal, expand on demand
- **Proactive token renewal**: Handle expiry before it happens
- **Graceful degradation**: Fallback strategies for all services

## Development Standards

### Feature Flags (src/config/flags.ts)
```typescript
export const flags = {
  // Core
  atomicUnified: true,
  bubblesFinishing: true,
  aiVision: true,
  voiceCapture: true,
  realtimeVoice: true,
  joyPage: true,
  emailIngest: true,
  receiptsOCR: true,
  outliner: true,
  focusMode: true,
  prioritizer: true,
  sync: true,
  searchV2: true,
  ambientModes: true,
  budget: true,

  // CBT
  cbtAssist: false,
  cbtSilentObserve: true,
  cbtCrisisEnabled: true,
  cbtDevRoutes: process.env.NODE_ENV === 'development', // Environment-dependent

  // Auto-write / context
  autoWriteCalendar: false,
  autoWriteEmail: false,
  autoFinanceRead: false,
  autoFinanceInsights: false,
  contextEngine: false, // JIT suggestions; OFF by default
  autoWriteKillSwitch: false, // Hard global stop for any auto-commit

  // Voice Engine
  VOICE_ENGINE_UNIFIED: true,
  VOICE_SESSION_LOCK: true,
  VOICE_HOTKEY_UNIFIED: true,
  VOICE_ROUTER_UNIFIED: true,
  VOICE_DECISION_TRACE: true,
  VOICE_SETTINGS_UNIFIED: true,
  VOICE_FALLBACK_LADDER: false,
  VOICE_AUTO_COMMIT_DEFAULT: false,
  VOICE_CONFIDENCE_GATING: true,
  VOICE_DEV_ROUTE_ENABLED: process.env.NODE_ENV === 'development'
} as const;
```

**Flag Groups:**
- Auto-write features (calendar, email, finance) have kill switch protection
- CBT routes only available in development environment
- Voice features are mostly enabled with confidence gating
- Context engine disabled by default (explicit opt-in required)

### Accessibility & Performance Standards

**WCAG AA Requirements:**
```typescript
A11Y_REQUIRED = {
  tapTargetMin: 44,           // px
  reducedMotion: true,        // honor prefers-reduced-motion
  srLabels: true,             // e.g., "Task bubble: Pay rent by Friday"
  contrast: { normal: "≥4.5:1", large: "≥3:1" },
  keyboard: { allInteractive: true, escapeToClose: true }
}
```

**Performance Targets:**
```typescript
PERF_TARGETS = {
  fps: { singleDrag: 60, multiSelect: 55 },
  lodDrops: { disableFiltersBelowFps: 55, staticFallbackBelowFps: 45 }
}
```

**Axe-core Checklist:**
Required checks: `["color-contrast", "focus-visible", "aria-roles", "aria-label", "landmark", "keyboard"]`

### Decision Tracing
Every AI action must create a `DecisionTrace` with:
```typescript
interface DecisionTrace {
  id: string;
  timestamp: number;
  feature: string;
  signals: DecisionSignal[];
  confidence: number;
  decision: string;
  action: any;
  undoable: boolean;
  undoId?: string;
  becauseText: string;
}
```
**Note:** No `revertHook` - use `undoable` boolean and `undoId` for undo service integration.

## Privacy & Safety

### Privacy Layers
- **Surface**: Basic utility data
- **Context**: Pattern recognition data
- **Deep**: Full trace including sensitive content

### User Controls
- One-tap: Pause learning / Redact recent / Move to Deep
- Granular: Disable specific integrations or analysis
- Export: Full data export capability

### Crisis Safety
- Language pattern detection for risk
- Immediate nudge suppression
- Regional resource presentation
- Never diagnose or provide medical advice

## Rollout & Testing

### Shadow Mode Progression
- **Mood Engine**: log only → dev-only surface → suggest-only → full rollout (consent)
- **Auto-write**: silent scoring → show confidence in dev routes → Suggest → Draft → limited Auto (calendar only, green conditions)

### Watcher Health Monitoring
- Renew T−1 day before expiry
- Handle 410 Gone → bounded resync (−90d/+90d) 
- Fallback polling every 15 minutes on channel failures

### Minimal E2E Acceptance Criteria
- Timeline ribbons render with top "Because…" drivers
- Undo works for calendar draft creations
- Watcher renewal shows future expiration timestamp
- Email remains Draft-only; no `send` action ever auto-executes

## Voice & Tone

### Microcopy Standards
**Canonical Phrases** (use exactly):
- "Added to Calendar • Undo"
- "Draft ready • Review & Send"
- "Because: 3 snoozes after 10pm; 2 meetings overran"
- "Ready when you are."
- "We can pause this anytime."

**"Because..." Explanation Patterns**:
- Usage patterns: "Because you postponed budget notes twice"
- Context signals: "Because 3 meetings overran today"
- Time patterns: "Because tasks after 10pm get snoozed"

### Prompting Guardrails
- Use "Investigate but don't write code yet" for complex flows
- Feature Breakdown: create page → layout → connect data → logic/edge cases → test
- **Do not edit**: `/shared/Layout.tsx`, `src/integrations/supabase/**`, `supabase/migrations/**` unless explicitly required

**Avoid**: Guilt, shame, medical claims, urgency without context

## Business Context

### Target Market
- Primary: Neurodivergent individuals seeking low-friction productivity tools
- Secondary: Anyone wanting wellness through ordinary task management

### Revenue Model
- Freemium SaaS (basic free, advanced AI/integrations paid)
- Platform revenue from integration partnerships
- Enterprise wellness programs

### Competitive Differentiation
- Neurodivergent-first vs accessibility afterthought
- Stealth wellness vs explicit self-improvement
- Multiple view paradigms vs single interface
- Ethical AI with explainability vs black box

## Development Routes

### Dev Menu Access
- **Hotkey**: `Ctrl/Cmd + Shift + D`
- **Flag**: Controlled by environment (`process.env.NODE_ENV === 'development'`)

### Available Dev Routes (src/components/DevMenu.tsx)
```typescript
const devRoutes = [
  { path: '/dev/ai', name: 'AI Testing', description: 'Test AI services and responses' },
  { path: '/dev/atomic-basic', name: 'Atomic Basic', description: 'Basic atomic view functionality' },
  { path: '/dev/atomic-stress', name: 'Atomic Stress', description: 'Stress test atomic rendering' },
  { path: '/dev/atomic-unified', name: 'Atomic Unified', description: 'Unified atomic renderer testing' },
  { path: '/dev/auto-write-calendar', name: 'Auto Write Calendar', description: 'Calendar auto-write testing' },
  { path: '/dev/bubbles-basic', name: 'Bubbles Basic', description: 'Basic bubble functionality' },
  { path: '/dev/bubbles-stress', name: 'Bubbles Stress', description: 'Stress test bubble rendering' },
  { path: '/dev/budget', name: 'Budget Tools', description: 'Budget and financial tools testing' },
  { path: '/dev/cbt-e2e', name: 'CBT E2E', description: 'End-to-end CBT system testing' },
  { path: '/dev/cbt-metrics', name: 'CBT Metrics', description: 'CBT performance and usage metrics' },
  { path: '/dev/cbt-observer', name: 'CBT Observer', description: 'CBT conversation observer testing' },
  { path: '/dev/cbt-policy', name: 'CBT Policy', description: 'CBT policy engine testing' },
  { path: '/dev/calendar-sync-qa', name: 'Calendar Sync QA', description: 'Calendar synchronization quality assurance' },
  { path: '/dev/context-engine-qa', name: 'Context Engine QA', description: 'Context engine testing and QA' },
  { path: '/dev/email-compose', name: 'Email Compose', description: 'Email composition testing' },
  { path: '/dev/flags', name: 'Feature Flags', description: 'Feature flag management and testing' },
  { path: '/dev/focus', name: 'Focus Mode', description: 'Focus mode functionality testing' },
  { path: '/dev/gmail-intents-qa', name: 'Gmail Intents QA', description: 'Gmail intent classification QA' },
  { path: '/dev/health-dashboard', name: 'Health Dashboard', description: 'System health monitoring' },
  { path: '/dev/metrics-alerts', name: 'Metrics Alerts', description: 'Metrics and alerting system testing' },
  { path: '/dev/modes', name: 'Dev Modes', description: 'Various development modes and utilities' },
  { path: '/dev/photo-iridescent', name: 'Photo Iridescent', description: 'Iridescent photo rendering testing' },
  { path: '/dev/photo-test', name: 'Photo Test', description: 'Photo capture and processing testing' },
  { path: '/dev/plaid-recur', name: 'Plaid Recurring', description: 'Plaid recurring transaction testing' },
  { path: '/dev/policy-engine', name: 'Policy Engine', description: 'Policy decision engine testing' },
  { path: '/dev/prioritizer', name: 'Prioritizer', description: 'Task prioritization algorithm testing' },
  { path: '/dev/realtime-voice', name: 'Realtime Voice', description: 'Real-time voice processing testing' },
  { path: '/dev/receipts', name: 'Receipts', description: 'Receipt OCR and processing testing' },
  { path: '/dev/recurring-finance', name: 'Recurring Finance', description: 'Recurring financial transaction testing' },
  { path: '/dev/sync-basic', name: 'Sync Basic', description: 'Basic synchronization testing' },
  { path: '/dev/sync-diff', name: 'Sync Diff', description: 'Synchronization diff and conflict resolution' },
  { path: '/dev/temporal-reasoning', name: 'Temporal Reasoning', description: 'Time-based reasoning and scheduling' },
  { path: '/dev/vision', name: 'Vision', description: 'Computer vision and image analysis' },
  { path: '/dev/voice-first', name: 'Voice First', description: 'Voice-first interface testing' },
  { path: '/dev/voice-unified', name: 'Voice Unified', description: 'Unified voice engine testing' },
];
```

## Knowledge Drift Prevention

### Update Process
1. **Before editing this file**: Verify current state of referenced source files
2. **Critical source files to check**:
   - `src/config/flags.ts` - Feature flag definitions
   - `src/services/decisionTraceService.ts` - DecisionTrace interface
   - `src/components/DevMenu.tsx` - Development routes
   - `src/lib/horizon.ts` - Time horizon definitions
3. **After updates**: Test that AI prompts reference correct flags/interfaces
4. **Validation**: Run `yarn test` to ensure no integration breaks

### Knowledge Drift Checklist
- [ ] Feature flags match `src/config/flags.ts` exactly
- [ ] DecisionTrace interface matches service implementation
- [ ] Dev routes list matches DevMenu component
- [ ] Task schema reflects current unified implementation
- [ ] All boolean flags are actual booleans (no pseudo-values)
- [ ] Environment dependencies clearly documented
- [ ] Kill switch behavior explicitly described

This knowledge base must be kept in sync with the live codebase to prevent AI confusion and ensure consistent development practices.