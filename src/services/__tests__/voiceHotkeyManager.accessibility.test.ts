import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  voiceHotkeyManager,
  type VoiceHotkeyTarget,
} from '@/services/voiceHotkeyManager';

describe('VoiceHotkeyManager accessibility boundaries', () => {
  const onHotkeyPress = vi.fn();
  const onHotkeyRelease = vi.fn();
  let unregister: () => void;

  beforeEach(() => {
    onHotkeyPress.mockReset();
    onHotkeyRelease.mockReset();
    voiceHotkeyManager.setHotkey('Space');

    const target: VoiceHotkeyTarget = {
      id: 'accessibility-test-target',
      priority: 100,
      isVisible: () => true,
      isActive: () => true,
      onHotkeyPress,
      onHotkeyRelease,
    };
    unregister = voiceHotkeyManager.registerTarget(target);
  });

  afterEach(() => {
    unregister();
    document.body.replaceChildren();
  });

  it.each([
    ['Control', { ctrlKey: true }],
    ['Option', { altKey: true }],
    ['Command', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ])('does not open voice capture for %s+Space', (_label, modifier) => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
      ...modifier,
    }));

    expect(onHotkeyPress).not.toHaveBeenCalled();
    expect(voiceHotkeyManager.isHotkeyPressed()).toBe(false);
  });

  it('does not open voice capture when Caps Lock is the modifier', () => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
    });
    vi.spyOn(event, 'getModifierState').mockImplementation(
      (key) => key === 'CapsLock',
    );

    document.dispatchEvent(event);

    expect(onHotkeyPress).not.toHaveBeenCalled();
    expect(voiceHotkeyManager.isHotkeyPressed()).toBe(false);
  });

  it('does not open voice capture while typing', () => {
    const input = document.createElement('input');
    document.body.append(input);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
    }));

    expect(onHotkeyPress).not.toHaveBeenCalled();
  });

  it.each([
    ['button', '<button><span>Open task</span></button>', 'span'],
    ['link', '<a href="/tasks">Open tasks</a>', 'a'],
    ['select', '<select><option>Low</option></select>', 'select'],
    ['details summary', '<details><summary>All tasks</summary></details>', 'summary'],
    ['ARIA radio', '<div role="radio" tabindex="0">Low energy</div>', '[role="radio"]'],
  ])('leaves unmodified Space with the focused %s', (
    _label,
    markup,
    targetSelector,
  ) => {
    document.body.innerHTML = markup;
    const target = document.querySelector<HTMLElement>(targetSelector);
    expect(target).not.toBeNull();

    target?.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
    }));

    expect(onHotkeyPress).not.toHaveBeenCalled();
    expect(voiceHotkeyManager.isHotkeyPressed()).toBe(false);
  });

  it.each([
    ['ARIA modal', 'aria-modal', 'true'],
    ['Radix open state', 'data-state', 'open'],
  ])('does not open voice capture while an %s dialog is open', (
    _label,
    attribute,
    value,
  ) => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute(attribute, value);
    document.body.append(dialog);

    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
    }));

    expect(onHotkeyPress).not.toHaveBeenCalled();
  });

  it('preserves the unmodified Space press-and-release interaction', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      code: 'Space',
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      code: 'Space',
    }));

    expect(onHotkeyPress).toHaveBeenCalledTimes(1);
    expect(onHotkeyRelease).toHaveBeenCalledTimes(1);
    expect(voiceHotkeyManager.isHotkeyPressed()).toBe(false);
  });
});
