import { afterEach, describe, expect, it } from 'vitest';
import {
  isMotionEnabled,
  setupGlobalKeyboardHandler,
  startAnimation,
  stopAnimation,
  toggleAnimation,
} from '../motion';

afterEach(() => {
  document.body.innerHTML = '';
  if (!isMotionEnabled()) toggleAnimation();
});

describe('shared motion intent', () => {
  it('keeps a pause decision when a new view registers its animation', () => {
    stopAnimation();
    const unregister = startAnimation(() => undefined);
    expect(isMotionEnabled()).toBe(false);
    toggleAnimation();
    expect(isMotionEnabled()).toBe(true);
    unregister();
  });

  it.each(['button', 'select', 'input', 'textarea', 'summary'])(
    'leaves Space available to focused %s controls',
    (tag) => {
      const remove = setupGlobalKeyboardHandler();
      const control = document.createElement(tag);
      control.tabIndex = 0;
      document.body.append(control);
      control.focus();
      const event = new KeyboardEvent('keydown', {
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      control.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(isMotionEnabled()).toBe(true);
      remove();
    },
  );

  it('still toggles motion from the canvas background', () => {
    const remove = setupGlobalKeyboardHandler();
    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(isMotionEnabled()).toBe(false);
    remove();
  });
});
