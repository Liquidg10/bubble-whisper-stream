// Shared motion control state machine
// Provides explicit Play/Pause control with Reduced Motion support

let rafId: number | null = null;
let motionEnabled = true; // Enable motion by default
let currentStepFn: (() => void) | null = null;
let listeners: Set<(enabled: boolean) => void> = new Set();

// Check for reduced motion preference
const getReducedMotionPreference = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Listen for reduced motion changes
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
motionQuery.addEventListener('change', (e) => {
  if (e.matches && motionEnabled) {
    // Force stop motion when reduced motion is enabled
    stopAnimation();
  }
});

function notifyListeners() {
  listeners.forEach(listener => listener(motionEnabled));
}

export function startAnimation(stepFn: () => void): void {
  // Don't start if reduced motion is preferred
  if (getReducedMotionPreference()) {
    return;
  }

  // Stop any existing animation
  stopAnimation();
  
  motionEnabled = true;
  currentStepFn = stepFn;
  
  const animate = () => {
    if (motionEnabled && currentStepFn) {
      currentStepFn();
      rafId = requestAnimationFrame(animate);
    }
  };
  
  rafId = requestAnimationFrame(animate);
  notifyListeners();
}

export function stopAnimation(): void {
  motionEnabled = false;
  currentStepFn = null;
  
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  
  notifyListeners();
}

export function toggleAnimation(): void {
  if (motionEnabled) {
    stopAnimation();
  } else if (currentStepFn) {
    startAnimation(currentStepFn);
  }
}

export function isMotionEnabled(): boolean {
  return motionEnabled && !getReducedMotionPreference();
}

export function isReducedMotionPreferred(): boolean {
  return getReducedMotionPreference();
}

// Subscribe to motion state changes
export function subscribeToMotionState(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  
  // Immediately call with current state
  listener(motionEnabled);
  
  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

// Keyboard handling for spacebar
export function setupGlobalKeyboardHandler(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space' && !event.repeat) {
      // Only handle if focus is not on an input/textarea/contenteditable
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );
      
      if (!isInputFocused) {
        event.preventDefault();
        toggleAnimation();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}