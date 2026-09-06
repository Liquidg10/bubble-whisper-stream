# Living bubbles and connected molecules

Prepared September 6, 2026 on `codex/living-molecules`, based on canonical `origin/main` at `6f48ebf695a52660a131cbb788ef78b8fdd54da2`. The primary checkout and its untracked Supabase state were preserved. This is a frontend implementation and local verification receipt; no production release, provider action, database migration, or account grant was performed.

## Try it

Run `npm ci` and `npm run dev -- --host 127.0.0.1 --port 4180` from this checkout. Open the local canvas and choose **Start with 3 guide bubbles**, or create a task of your own. The guide examples are real editable local tasks, with explicit example links between Learning, Home and Wellbeing. The Guide button can reopen their instructions or add missing examples without overwriting existing ones.

- **Bubbles:** drag a bubble, or focus it and use arrow keys. The skin floats while the label and pointer target remain stable. Hover, focus, selection and dragging pause its decorative movement. Pause persists when switching views. Starting a new animation does not silently resume it.
- **Atomic:** a nucleus represents a confirmed life area. Actions are electrons, thoughts are protons, and memories/moods are neutrons. This is a personal metaphor rather than a literal physics simulation. Select a nucleus to explore its orbits; use Fit to return to the overview.
- **Connections:** bonds connect areas containing the same canonical task. Hovering or focusing that task reveals the matching copies. Changing its horizon updates every copy without creating another task. The Connections drawer provides the corresponding task list.
- **Time horizons:** drag an electron toward Today, Week or Later; it settles along a polar path close to the release point instead of taking a shortcut through the center. Task details also offer a labeled selector and editable notes.
- **Grow ideas:** choose an unfinished task to receive up to three local template suggestions. Edit the wording, choose which existing life links to carry forward, add a bubble, or dismiss it. Creation retains its source task id and supports undo. Suggestions do not call an AI provider or create tasks in the background.

## Layout and accessibility

Four primary destinations and a grouped More menu replace the crowded footer. Search and the assistant remain in the header; less common controls live under Quick tools. View switching uses normal layout flow. The canvas action dock occupies its own row so it cannot cover the task field. Settings uses a desktop sidebar and a mobile selector, retaining `?tab=` links and feature gates.

First use starts with a playable canvas rather than a blocking questionnaire. The optional existing personalization flow remains on other first-use routes and cancels stale asynchronous checks after navigation. Its seven-day lessons remain reachable in Guide. Starter saving uses one shared operation, reports partial failure, and retries only missing lessons.

Calm mode previously applied its default motion/contrast restrictions even when disabled. Those restrictions now follow the enabled switch, while independently chosen accessibility settings remain in force. Both the shared animation loop and bubble surfaces honor calm-mode changes. Operating-system reduced motion and app reduced motion still take precedence.

Initial layout and resize recovery are presentation-only. Deliberately moving one task preserves untouched tasks' positions; semantic priority and canonical coordinates are not rewritten to enlarge the visual targets. At normal zoom, bubbles have a 72px minimum visual diameter; zoomed interaction targets retain the existing 44px minimum.

## Scope and limits

- Existing unconfirmed life links remain suggestions. Only confirmed links create molecular membership or bonds.
- The obsolete destructive Fuse/Split controls and the shell's unsupported provider-connection counts were removed from the reachable UI. Integrations remain accessible through their actual settings page.
- Atomic remains experimental and retains its existing 19-area layout capacity. Dense views still use a task navigator rather than drawing every task at once.
- Rich shading is implemented with CSS and SVG, with no new renderer dependency or paid media generation. A callable Gamehorse tool was not available.
- Automated checks and anonymous local browser fixtures establish local behavior, not provider execution or clinical efficacy. Neurodivergent participant usability testing is still needed. Research, source dates, sample sizes, and limitations are recorded in [molecule-interaction-research.md](molecule-interaction-research.md).

## Verification

All gates passed locally. The final commit is recorded in the pull request and completion receipt. Gates run for this change:

- `npm run typecheck` and `npm run build`.
- `npm run lint:ratchet` and `npm run lint:cohesion:ratchet`, retaining inherited debt instead of changing baselines.
- `npm run test:vitest:ci`, including atom geometry, confirmed-domain membership, motion, starter persistence/retry, task details, shell navigation, onboarding cancellation, and existing provider-boundary tests.
- `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4180 npm run test:e2e:ci -- --workers=2`.
- `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4180 npm run test:a11y:ci -- --workers=2`.
- `npx playwright test --config tests/molecules/playwright.config.ts`: real IndexedDB creation, editable suggestions/undo, shared connections, task details and reload, desktop/mobile layouts, and untouched-position/caption geometry.

Results: 2,289 Vitest tests passed across 142 files, with 52 inherited skipped tests across 3 files; 20 release E2E checks passed; 14 accessibility checks passed; all 6 new desktop/mobile workflow and geometric checks passed. TypeScript and the production build passed. ESLint ratchet passed with 856 current errors against the 1,077 inherited baseline; cohesion ratchet passed with 162 findings against 203, including 19 passing scanner tests. Neither baseline was changed. After final caption spacing adjustments, all 55 iridescent unit checks and all 6 desktop/mobile checks passed again.

Browser fixtures use anonymous local data; Calendar test results remain explicitly synthetic. Existing build warnings about dynamic imports and repository lint debt are not new capability claims.
