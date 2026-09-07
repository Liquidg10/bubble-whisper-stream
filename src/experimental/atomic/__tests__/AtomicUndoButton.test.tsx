import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AtomicUndoButton } from '../AtomicUndoButton';

function pointer(type: string, props: Partial<PointerEvent> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 30 });
  for (const [key, value] of Object.entries({ pointerType: 'touch', pointerId: 1, isPrimary: true, ...props })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}
function renderUndo() {
  const onActivate = vi.fn();
  const view = render(<AtomicUndoButton onActivate={onActivate}>Undo</AtomicUndoButton>);
  return { ...view, onActivate, button: screen.getByRole('button', { name: 'Undo' }) };
}

describe('AtomicUndoButton completed touch activation', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10, y: 10, left: 10, top: 10, right: 110, bottom: 54, width: 100, height: 44,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('activates a completed touch once without needing a browser click and ignores its later click', () => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    fireEvent(button, pointer('pointerup', { clientX: 44, clientY: 32 }));
    expect(onActivate).toHaveBeenCalledOnce();
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('keeps each fresh touch usable when earlier touches emitted no browser click', () => {
    const { button, onActivate } = renderUndo();
    for (const pointerId of [1, 2]) {
      fireEvent(button, pointer('pointerdown', { pointerId }));
      fireEvent(button, pointer('pointerup', { pointerId }));
    }
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it.each(['pointercancel', 'lostpointercapture'])('cancels after %s and does not accept its later click', type => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    fireEvent(button, pointer(type));
    fireEvent(button, pointer('pointerup'));
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'a swipe that returns to its start', moves: [{ clientX: 80, clientY: 30 }, { clientX: 40, clientY: 30 }], end: {} },
    { label: 'a release outside the button', moves: [], end: { clientX: 120, clientY: 30 } },
    { label: 'a long movement only reported at release', moves: [], end: { clientX: 60, clientY: 30 } },
    { label: 'leaving the button and returning', moves: [{ clientX: 40, clientY: 4 }, { clientX: 40, clientY: 30 }], end: {} },
  ])('does not activate for $label', ({ moves, end }) => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    moves.forEach(move => fireEvent(button, pointer('pointermove', move)));
    fireEvent(button, pointer('pointerup', end));
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('rejects a secondary finger anywhere in the document and mismatched releases', () => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    fireEvent(button, pointer('pointerup', { pointerId: 9, isPrimary: false }));
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent(document.body, pointer('pointerdown', { pointerId: 2, isPrimary: false }));
    fireEvent(document.body, pointer('pointerup', { pointerId: 2, isPrimary: false }));
    fireEvent(button, pointer('pointerup'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does not activate an orphan or non-primary release, or a button disabled during the touch', () => {
    const { button, onActivate, rerender } = renderUndo();
    fireEvent(button, pointer('pointerup'));
    fireEvent(button, pointer('pointerdown', { isPrimary: false }));
    fireEvent(button, pointer('pointerup', { isPrimary: false }));
    fireEvent(button, pointer('pointerdown'));
    rerender(<AtomicUndoButton onActivate={onActivate} disabled>Undo</AtomicUndoButton>);
    fireEvent(button, pointer('pointerup'));
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('retains normal mouse and assistive clicks after a touch with no compatibility click', () => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    fireEvent(button, pointer('pointerup'));
    fireEvent.click(button, { detail: 0 });
    expect(onActivate).toHaveBeenCalledTimes(2);
    fireEvent(button, pointer('pointerdown', { pointerType: 'mouse' }));
    fireEvent(button, pointer('pointerup', { pointerType: 'mouse' }));
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('keeps native Enter and Space activation', async () => {
    const { button, onActivate } = renderUndo();
    const user = userEvent.setup();
    button.focus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledOnce();
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation by an earlier handler and does not double-activate afterward', () => {
    const { button, onActivate } = renderUndo();
    fireEvent(button, pointer('pointerdown'));
    const release = pointer('pointerup');
    release.preventDefault();
    fireEvent(button, release);
    fireEvent.click(button, { detail: 1 });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('lets toast handlers receive the uncancelled pointer sequence without taking capture', () => {
    const onActivate = vi.fn();
    const ancestor = vi.fn();
    const capture = vi.fn();
    render(<div onPointerDown={ancestor} onPointerMove={ancestor} onPointerUp={ancestor}>
      <AtomicUndoButton onActivate={onActivate}>Undo</AtomicUndoButton>
    </div>);
    const button = screen.getByRole('button', { name: 'Undo' });
    Object.defineProperty(button, 'setPointerCapture', { value: capture });
    const events = [pointer('pointerdown'), pointer('pointermove', { clientX: 42 }), pointer('pointerup', { clientX: 42 })];
    events.forEach(event => fireEvent(button, event));
    expect(ancestor).toHaveBeenCalledTimes(3);
    expect(events.every(event => !event.defaultPrevented)).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledOnce();
  });
});
