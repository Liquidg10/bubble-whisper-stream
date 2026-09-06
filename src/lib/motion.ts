// Shared motion control state machine
// Multiple animation steps register concurrently; one shared rAF loop drives them all.
// Global Play/Pause (spacebar / MotionController) pauses every step at once.
import { calmModeService } from '@/services/calmModeService';

let rafId: number | null = null;
let motionEnabled = true; // global play/pause
const steps = new Set<() => void>();
const listeners = new Set<(enabled: boolean) => void>();

const getReducedMotionPreference = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || calmModeService.getAnimationPreferences().reduceMotion;

function notifyListeners() {
  listeners.forEach((listener) => listener(isMotionEnabled()));
}

function tick() {
  if (!motionEnabled || steps.size === 0 || getReducedMotionPreference()) {
    rafId = null;
    return;
  }
  steps.forEach((step) => step());
  rafId = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (rafId === null && motionEnabled && steps.size > 0 && !getReducedMotionPreference()) {
    rafId = requestAnimationFrame(tick);
  }
}

// Pause the loop when the OS switches to reduced motion; resume when it switches back.
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function reconcileMotionPreference() {
  if (getReducedMotionPreference()) {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  } else {
    ensureLoop();
  }
  notifyListeners();
}
motionQuery.addEventListener('change', reconcileMotionPreference);
window.addEventListener('calmModeChange', reconcileMotionPreference);

// Register a step without changing the user's play/pause decision across views.
export function startAnimation(stepFn: () => void): () => void {
  steps.add(stepFn);
  if (!getReducedMotionPreference()) {
    ensureLoop();
  }
  return () => stopAnimation(stepFn);
}

// With a stepFn: unregister just that step (per-canvas cleanup).
// With no argument: global pause (keeps registered steps so motion can resume).
export function stopAnimation(stepFn?: () => void): void {
  if (stepFn) {
    steps.delete(stepFn);
    if (steps.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    return;
  }
  motionEnabled = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  notifyListeners();
}

export function toggleAnimation(): void {
  if (motionEnabled) {
    stopAnimation();
  } else {
    motionEnabled = true;
    ensureLoop();
    notifyListeners();
  }
}

export function isMotionEnabled(): boolean {
  return motionEnabled && !getReducedMotionPreference();
}

export function isReducedMotionPreferred(): boolean {
  return getReducedMotionPreference();
}

export function subscribeToMotionState(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  listener(isMotionEnabled());
  return () => { listeners.delete(listener); };
}

export function setupGlobalKeyboardHandler(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space' && !event.repeat) {
      const activeElement = document.activeElement;
      const isInteractiveFocused = activeElement?.closest(
        'input, textarea, select, button, a, summary, [contenteditable="true"], [role="button"], [role="checkbox"], [role="switch"], [role="slider"], [role="tab"], [role="menuitem"]',
      );
      if (!isInteractiveFocused && !event.defaultPrevented) {
        event.preventDefault();
        toggleAnimation();
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}
