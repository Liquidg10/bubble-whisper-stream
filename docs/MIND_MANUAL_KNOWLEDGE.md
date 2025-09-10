# Mind Manual / Bubble OS — Project Knowledge Base

This file serves as the definitive project brain, capturing the unified vision, architecture, and implementation guidelines for Mind Manual / Bubble OS.

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
All views (Bubble, Atomic, List, Kanban, Eisenhower, Calendar) operate on the same `Task` schema with view-specific metadata in namespaced `view.*` properties. Never duplicate business logic across views.

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

### Feature Flags
All new features must be behind flags in `src/config/flags.ts`. Use `devRoutes` flag for development harnesses.

### Accessibility
- WCAG AA compliance minimum
- Respect `prefers-reduced-motion`
- Keyboard navigation throughout
- Screen reader friendly

### Performance
- ≥60 FPS single drag target
- ≥55 FPS multi-select target
- Level of Detail (LOD) systems for complex scenes
- Virtualization for large lists

### Decision Tracing
Every AI action must create a `DecisionTrace` with audit trail and working undo hook.

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

## Voice & Tone

**Microcopy Style**:
- "Ready when you are."
- "Because you postponed budget notes twice, want a 2-minute sketch?"
- "Added to Calendar • Undo"
- "Draft ready • Review & Send"
- "We can pause this anytime."

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

This knowledge base should be updated as the project evolves to maintain alignment between all development efforts.