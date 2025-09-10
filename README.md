# Mind Manual / Bubble OS — Ultimate Site-Wide Knowledge Prompt (v5)

## 0) Context & North Star

**Who we're building for**: Neurodivergent-first productivity companion that provides "stealth wellness" - improving mental health through ordinary task management without demanding separate self-improvement routines.

**Core positioning**: Meet people where they are. Help with what they need anyway (tasks, calendar, email, money). Learn quietly from usage patterns and offer gentle, explainable assistance. No commitment pressure - works whether used as simple task list or full life optimization system.

**Voice**: Calm, compassionate, non-judgmental. Short paths, progressive disclosure, always undoable, always explainable ("Because..."). Never moralize or create shame.

**Technical philosophy**: Local-first, privacy-layered, explainable AI, reversible actions, multi-device CRDT sync.

## 1) Product Architecture (Unified Task + Multiple Views)

**Single Source of Truth**: One `Task` entity powers all visualization paradigms:

```typescript
interface Task {
  // Core fields (never duplicate across views)
  id: string; // UUID
  type: 'task' | 'thought' | 'memory' | 'mood' | 'reminder' | 'photo' | 'event';
  title: string;
  content?: string;
  completed: boolean;
  priority: number; // 0-100 percentage
  tags: Array<{id: string, name: string, emoji?: string, colorHex?: string}>;
  
  // Temporal
  createdAt: number;
  updatedAt: number;
  due?: number;
  start?: number;
  end?: number;
  
  // Integration metadata
  integrations?: {
    calendar?: {eventId: string, calendarId: string};
    email?: {messageId: string, threadId: string};
    financial?: {transactionId: string, amount: number, merchant: string};
    plaid?: {accountId: string, categoryId: string};
  };
  
  // View-specific positioning (namespaced)
  view: {
    bubble?: {x: number, y: number, size: number, moodColor?: string};
    atomic?: {nucleus: string, shell: 'today'|'week'|'later', angle: number};
    kanban?: {boardId: string, columnId: string, order: number};
    list?: {order: number, groupKey?: string};
    matrix?: {urgency: 0|1|2|3, importance: 0|1|2|3, quadrant: number};
  };
  
  // Behavioral analytics (consent-gated)
  behavior?: {
    interactions: number;
    completionTime?: number;
    rescheduleCount: number;
    emotionalContext?: 'positive' | 'neutral' | 'negative';
    lastInteraction: number;
  };
}
```

**View Adapters** (never duplicate business logic):
- **Bubble**: Vertical position ≈ priority/recency; size ≈ urgency; color ≈ category/mood; physics for gentle floating
- **Atomic**: Nucleus = life domain; shells = time horizon; compound molecules = related tasks
- **List**: Linear execution focus; keyboard-first; filters/sorting
- **Kanban**: Column-based workflows; drag-and-drop state changes  
- **Eisenhower**: Urgency/importance quadrants for quick triage
- **Calendar**: Time-bound tasks as events (via Auto-Write Ladder only)

## 2) Stealth Wellness Engine

**Behavioral Intelligence** (all consent-gated):
- Passive signals: completion patterns, time-of-day energy, reschedule frequency, calendar load
- Mood inference: optional sentiment from text analysis (explicit opt-in only)
- Context awareness: location patterns, meeting density, email overwhelm
- Crisis detection: language patterns suggesting self-harm/severe distress

**Timeline 2.0**:
- Daily mood ribbons with "Because..." explanations
- Completion/energy heat bars  
- Joy highlights and accomplishment celebrations
- Progressive milestone recognition

**Gentle Interventions**:
- CBT-informed thought pattern recognition (existing system)
- Overwhelm detection → suggest breaking tasks down
- Avoidance patterns → offer smallest next steps
- Achievement recognition → meaningful acknowledgments

**Rate limiting**: Max 1-2 nudges/day; respect snooze/decline patterns; quiet hours.

## 3) Auto-Write Ladder (Confidence + Consent Gates)

**Three-tier system**:
1. **Suggest** (<60% confidence): Show inline chip with one-tap apply
2. **Draft** (60-85% confidence): Create pending object, never auto-commit
3. **Auto-write** (>85% + green conditions): Only for trivially reversible, low-risk actions

**Domain-specific rules**:

**Calendar**:
- Auto-write: Self-owned calendars, <14 days, clear datetime/location, no invitees
- Draft: External attendees, ambiguous timing, work calendar (unless whitelisted)
- Always: Idempotent event IDs, "Added to Calendar • Undo" toast

**Email**:
- Never auto-send, ever
- Draft only: Confident intent + known recipient + clear content
- Always: "Review & Send" step, subject from user wording

**Finance**:
- Read-only analytics only (unless explicit upgrade)
- Receipt OCR → auto-categorize with confidence scores
- Budget alerts: suggestive ("Groceries +18% vs avg"), never directive

## 4) Integration Architecture (Least Privilege)

**OAuth Strategy**: Incremental authorization - start minimal, expand only on user request

**Google Calendar**:
- Push notifications with proper renewal (T-1 day before expiry)
- Handle 410 Gone → resync window (-90d/+90d) → re-watch
- Fallback to polling on channel failures

**Gmail**:
- Prefer readonly/metadata scopes for parsing
- Watch expiration tracking with proactive renewal
- Restricted scopes require additional verification

**Plaid**:
- Link flow → exchange token on server → encrypt storage
- Label all data as read-only unless user explicitly upgrades
- Token rotation per Plaid guidelines

**Receipt Processing**:
- Photo/email receipt → OCR → merchant/category extraction
- Confidence scoring → user confirmation for low-confidence
- Item-level tracking for detailed spending insights

## 5) Privacy & Safety Architecture

**Privacy Layers**:
- **Surface**: Basic utility data (titles, due dates)
- **Context**: Pattern recognition data (habits, preferences)  
- **Deep**: Full trace including sensitive content

**User Controls**:
- One-tap: Pause learning / Redact last N days / Move to Deep layer
- Granular: Disable specific integrations or analysis types
- Export: Full data export in standard formats

**Crisis Safety**:
- Risk language detection → disable all nudges → present regional resources
- Never diagnose or provide medical advice
- Escalation protocols for severe distress indicators

**CBT Integration** (existing system):
- Invisible until helpful
- Gentle reframing suggestions in natural conversation
- Consent-gated logging with auto-purge after 30 days
- Crisis protocol overrides all other behaviors

## 6) Accessibility & Performance (Non-negotiables)

**Accessibility**:
- Tap targets ≥44px (web) / ≥44pt (iOS) / ≥48dp (Android)
- Full keyboard navigation: Tab/Shift-Tab, Enter/Space activate, arrows nudge
- Screen reader labels: "Task bubble: Pay rent by Friday"
- Respect `prefers-reduced-motion` → disable animations/orbits
- WCAG AA contrast across all themes

**Performance**:
- Target ≥60 FPS single drag, ≥55 FPS multi-select
- LOD (Level of Detail): Drop filters/effects during interaction, restore on idle
- CRDT sync for conflict-free multi-device usage
- Virtualization for large task lists

**Themes**:
- **Iridescent**: Layered rendering (z5 specular → z4 glass → z3 rim → z2 aura → z1 content)
- **Classic Minimal**: Solid rims, gentle animations, calmer merge thresholds
- Token system via CSS variables/Tailwind

## 7) Voice & Realtime

**Unified Voice Engine**:
- Single hotkey (Space/Cmd+M) with audio session locking
- Fallback ladder: Web Speech → Whisper → Realtime API
- Grammar patterns: "Add task...", "Set reminder...", "Schedule meeting..."
- Confidence gating with read-back confirmation

**Voice Processing**:
- Intent classification → Auto-Write Ladder application
- "Added 'Dentist Tue 3pm' to Personal • Undo?" confirmation
- Hands-free task creation and completion

## 8) Engineering Guardrails

**Feature Flags** (all new features gated):
```typescript
flags: {
  cbtAssist: boolean;
  cbtSilentObserve: boolean; 
  cbtCrisisEnabled: boolean;
  moodEngine: boolean;
  timelineV2: boolean;
  voiceEngineUnified: boolean;
  autoWriteCalendar: boolean;
  autoWriteEmail: boolean;
  plaidReadOnly: boolean;
  devRoutes: boolean;
}
```

**Decision Tracing**: Every AI action writes audit trail:
```typescript
interface DecisionTrace {
  id: string;
  input: any;
  rules: string[];
  output: any;
  confidence: number;
  timestamp: number;
  becauseText: string;
  revertHook: () => void;
}
```

**Dev Routes** (behind flags.devRoutes):
- `/dev/mood` - Mood engine testing
- `/dev/watch-health` - Integration renewal status  
- `/dev/cbt` - CBT system diagnostics
- `/dev/jit` - Performance monitoring

**Security**:
- Never persist OAuth secrets in logs
- Encrypt tokens at rest
- Rotate credentials per provider guidelines
- Idempotency for all external writes

## 9) Current Implementation Status

**✅ Completed**:
- Sophisticated CBT system with crisis detection
- Google Calendar/Gmail integration with push notifications
- Plaid financial integration
- Bubble visualization with physics
- Voice capture and processing
- Comprehensive settings and privacy controls
- Atomic view proof-of-concept

**🚧 In Progress**:
- Unified task data model migration
- View adapter architecture
- Mood & behavior engine Phase A
- Timeline 2.0 with ribbons

**📋 Next Phase**:
- Task Card component as universal editor
- Multi-view state synchronization
- Auto-Write Ladder implementation
- Receipt processing pipeline

## 10) Microcopy Style Guide

**Tone**: Warm, supportive, never demanding
- "Ready when you are."
- "Because you postponed budget notes twice, want a 2-minute sketch?"
- "Added to Calendar • Undo"
- "Draft ready • Review & Send"
- "We can pause this anytime."

**Avoid**: Guilt, shame, medical claims, urgency without context

## 11) Acceptance Criteria (Every PR Must Pass)

1. **Unified Data**: All views read/write same Task entity; no duplicate business logic
2. **Explainability**: Every AI action has DecisionTrace with working undo
3. **Auto-Write Compliance**: Confidence thresholds enforced; email never auto-sends
4. **Accessibility**: axe-core clean; keyboard navigable; motion preferences respected
5. **Performance**: Measured FPS targets; LOD functional under load
6. **Privacy**: Pause/Redact/Deep controls working; no secrets in logs
7. **Integration Health**: Watchers renew before expiry; handle 410 gracefully
8. **Feature Gating**: New capabilities behind flags; dev routes accessible
9. **Testing**: Unit (adapters), integration (watchers/undo), e2e (user journeys)

## 12) Business Model Context

**Revenue Streams**:
- Freemium SaaS (basic task management free, advanced AI/integrations paid)
- Platform revenue from integration partnerships
- Enterprise wellness programs

**Competitive Differentiation**:
- Neurodivergent-first design vs accessibility afterthought
- Stealth wellness vs explicit self-improvement apps
- Multiple view paradigms vs single interface lock-in
- Ethical AI with full explainability vs black box algorithms

---

**Built with**: Vite, TypeScript, React, shadcn-ui, Tailwind CSS, Supabase

Visit the [Lovable Project](https://lovable.dev/projects/8d3041fb-8df4-4afe-87e4-b56a10af1d00) to continue development.