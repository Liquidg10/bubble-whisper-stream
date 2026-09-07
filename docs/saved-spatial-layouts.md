# Saved layouts and spatial Atomic view

Atomic has two views of the same tasks. Flat view keeps the familiar two-dimensional rings. The optional 3D view uses Three.js WebGL2 with a perspective camera, three tilted orbital planes, lit particle spheres and confirmed connection curves. Flat view opens by default. The graphics engine loads only when 3D is requested.

## Arrange a space

Open **Layout** to select a life area and move it left, right, up, down, nearer or farther. Dragging a nucleus saves its position through the same layout contract. Nearer/farther changes depth, visible in 3D. Particle turn buttons and same-orbit dragging save the chosen open orbit slot. Moving a particle to another time horizon still awaits the existing strict canonical task save; the new layout never supplies the task's horizon.

Layout has a one-step Undo and an explicit Reset. Undo changes geometry only. Failed writes keep the previous displayed position and provide Retry. Reset can recover a corrupt or unsupported layout without changing any tasks. A stale whole-layout update is refused if another view saved a different arrangement; Retry loads that arrangement before another move.

Signed-in layouts are stored for the verified account in this browser's local storage. Guests use the current tab's session storage, surviving reload and view changes but not tab closure. Guest layouts are never copied into an account. Authentication loading, mismatched identities and account switches cannot expose or write the previous account's layout. Layouts do not sync between devices. Camera orientation and the Flat/3D choice are temporary view settings.

## Camera and motion

In 3D, drag empty space to turn the camera, scroll or pinch to zoom, or use the named turn/zoom/Fit buttons. Nucleus and particle drags use a plane through the picked object with its original grab offset. Pointer release uses the final pointer position; Escape, pointer cancellation or a changed source cancels the preview.

Optional particle motion starts off. Application and operating-system reduced-motion settings override Play. There is no camera damping or automatic camera rotation. A browser without WebGL2, an unavailable graphics chunk or a lost graphics context returns to Flat view with a notice and preserves the saved layout. Tasks and Layout provide ordinary controls for the same actions.

The engine caps visible particles at 320 and honors each shell's existing capacity. The Tasks navigator retains all canonical tasks, including unlinked or omitted particles. Bond curves remain backed by confirmed shared tasks or a selected confirmed task relationship. Spatial distance does not imply relationship strength or scientific atomic behavior.

## Implementation and evidence

- `atomicLayout.ts` validates versioned, bounded geometry and profile keys; `useAtomicLayout.ts` owns loading, verified browser writes, conflicts and retries.
- `AtomicRendererUnified.tsx` joins the layout with the current canonical task projection and retains the flat interaction path.
- `SpatialAtomicScene.tsx` owns disposable graphics resources, demand rendering, camera interaction and 3D drag previews; `spatialGeometry.ts` contains engine-independent geometry.
- `AtomicLayoutPanel.tsx` provides click/tap and keyboard alternatives; `AtomicSpatialBoundary.tsx` isolates optional graphics failures.
- Focused model/component tests and browser workflows are listed in [the verification matrix](saved-spatial-layouts-verification.md).

No database migration, cloud layout sync, new provider grant or backend change is part of this feature. Physical-device and participant evidence remain separate from Chromium browser and automated accessibility results.
