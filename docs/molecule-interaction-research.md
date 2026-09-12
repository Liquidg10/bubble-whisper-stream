# Connected bubbles: interaction research

Research checked September 6, 2026. This document separates accessibility guidance, participant findings, and product hypotheses. None of the sources establishes that an atomic task layout treats ADHD, autism, or another condition. The app needs testing with people who have different access needs and preferences.

## 1. Stable controls, optional living surfaces

Keep saved coordinates, labels, and hit targets stable. Animate a separate visual surface with subtle, organic motion; pause ambient motion on hover, focus, selection, and drag. A user-initiated drop can have a short visual settling effect without moving the task again. Provide a readily reachable pause and honor both application and operating-system reduced-motion preferences.

W3C's cognitive accessibility guidance recommends stable controls, because unexpected movement can produce incorrect selections and disorientation. Its motion guidance supports disabling nonessential interaction animation. These are accessibility principles; the exact motion amplitudes and timings are product choices, not experimentally validated prescriptions.

- [Ensure Controls and Content Do Not Move Unexpectedly](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p01-unexpected-movement/) — first published April 29, 2021.
- [Animation from Interactions, WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) — explanatory document updated September 16, 2025; criterion level AAA.

## 2. Direct manipulation with an equivalent simple action

Dragging should preserve the original pointer offset, preview a destination, and release without a detour through the nucleus. Provide a click/tap alternative for moving between orbits or categories, as well as keyboard operation. Merely adding keyboard shortcuts is insufficient for someone using a touchscreen without a physical keyboard.

[Dragging Movements, WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — explanatory document updated August 10, 2026; criterion level AA. The criterion requires a single-pointer alternative to dragging unless dragging is essential. The orbit-preview and pointer-offset details are implementation hypotheses.

## 3. Connections should convey a relationship

A life area can be a nucleus, with actions around it and bonds between areas. One action can support several goals without becoming several duplicate tasks. Relationships should be named, for example: supports, depends on, or competes with. Show a readable legend and equivalent text in the task details so understanding the interface does not require familiarity with physics.

Goal Systems Theory describes relationships among goals and the means for reaching them, including multiple goals served by one action and conflicts among goals. It provides a conceptual basis for representing connections. It does not validate a molecular display, a particular particle vocabulary, or automatically inferred causal claims. The same research tradition includes results in which adding goals reduces the perceived usefulness of a shared means; more connections are not automatically more motivating.

- [Arie Kruglanski: Goals and Goal Systems](https://www.kruglanskiarie.com/goals-and-goal-systems) — researcher-authored explanation and original-paper index, including the 2002 theory and 2007 dilution model.

## 4. Personalization without a crowded shell

Provide a small, stable set of primary actions, a clear details area, simple labels, a calmer appearance option, and an accessible list view. Keep important navigation visible and place optional advanced controls behind a clearly named entry. Let users return easily to the full interface.

The AASPIRE research involved autistic contributors throughout design and evaluation. Its recommendations include predictable navigation, concrete icons paired with text, examples, and less decorative clutter. In its evaluation, 170 autistic users assessed the healthcare website. These results concern that website and do not isolate the effect of each recommendation or establish preferences shared by every autistic person.

- [Raymaker et al.: Development of the AASPIRE Web Accessibility Guidelines for Autistic Web Users](https://doi.org/10.1089/aut.2018.0020) — first published February 6, 2019.
- [W3C: Support Simplification](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o8p03-complexity/) — first published April 29, 2021.
- [Autistic Self Advocacy Network: One Idea Per Line](https://autisticadvocacy.org/resources-3/accessibility/easyread/) — community-authored guidance on understandable language and images, including working with self-advocates to evaluate them; publication date not stated on the inspected page.

## 5. Start by doing something small

A proposed introductory sequence is to move an example bubble, connect an action to two life areas, make a larger task smaller, and complete an example. Present one instruction at a time. Make examples removable, allow skipping, and preserve progress. This sequence is a product hypothesis rather than a validated intervention.

W3C recommends keeping necessary workflows short and making optional steps optional. In a qualitative study of an adult ADHD psychoeducation app, 14 interviewees described density and navigation issues and suggested staged learning and engaging visuals. Their preferences are useful input, not a representative community vote or proof that badges and streaks improve outcomes.

- [W3C: Make Short Critical Paths](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o5p02-short-paths/) — first published April 29, 2021.
- [Seery et al.: A one-stop shop](https://pmc.ncbi.nlm.nih.gov/articles/PMC11847728/) — February 4, 2025; real-world use data plus 14 interviews.

## 6. Suggestions should preserve agency

Offer a small number of suggestions with a short explanation and Add, Edit, and Dismiss actions. A request to make a task smaller should produce concrete editable steps. Automatic creation, if offered, should be a visible user setting with a clear history and undo. Avoid unsolicited map rearrangement and notifications while someone is using the canvas.

W3C supports user control over changing context and an easy return to the previous state. Recent exploratory research provides reasons to investigate spatial reminders and AI support, while leaving efficacy unsettled. In a 15-student AR/GenAI pilot, participants described planning and task-initiation benefits, but quantitative differences were not statistically significant. A separate qualitative project interviewed 22 ADHD-identifying adults and gathered reactions to speculative AI concepts from another 20; it highlights relational and emotional aspects of task management rather than demonstrating an AI product's effectiveness.

- [W3C: Let Users Control When the Content Moves or Changes](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o8p01-motion/) — first published April 29, 2021.
- [Parmar et al.: A user-centred approach to enhancing engagement and task management for ADHD students using AR and generative AI](https://link.springer.com/article/10.1007/s44217-026-01264-9) — February 19, 2026; exploratory pilot, n=15.
- [Chen et al.: Not Just Me and My To-Do List](https://arxiv.org/abs/2603.17258) — submitted March 18, 2026; revised April 20, 2026; repository identifies the preprint as accepted to CSCW 2026.

## Verification still needed

Test discovering a task, changing its orbit, explaining a bond, dismissing a suggestion, undoing a move, and returning after interruption. Include keyboard, touch, reduced motion, zoomed text, narrow screens, and motion-sensitive participants. Measure successful completion, accidental movement, ability to recover, and perceived effort. Collect preferences separately from task performance, and allow participants to choose a plain list.

An exact-name web search and the available tool catalog did not identify a callable game/3D engine named Gamehorse. This is a bounded discovery result, not a claim that no such product exists. No installation, external execution, or spending was performed for this research.
