import { useEffect, useRef } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';

type OwnedPointerHandlers = 'onClick' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp'
  | 'onPointerCancel' | 'onLostPointerCapture';
interface Props extends Omit<ButtonProps, OwnedPointerHandlers> {
  onActivate: () => void;
}
interface TouchGesture {
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
}
const TAP_SLOP = 8;

function inside(button: HTMLButtonElement, x: number, y: number) {
  const bounds = button.getBoundingClientRect();
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/** Complete touch Undo even when the browser omits its compatibility click. */
export function AtomicUndoButton({ onActivate, disabled, onKeyDown, ...props }: Props) {
  const gesture = useRef<TouchGesture | null>(null);
  const consumedTouch = useRef(false);

  useEffect(() => {
    // A second finger may land outside this button. Leave capture and swipe
    // handling with the browser/toast, but never turn that gesture into Undo.
    const cancelForAdditionalTouch = (event: PointerEvent) => {
      if (gesture.current && event.pointerType === 'touch' && event.pointerId !== gesture.current.pointerId) {
        gesture.current.cancelled = true;
      }
    };
    document.addEventListener('pointerdown', cancelForAdditionalTouch, true);
    return () => document.removeEventListener('pointerdown', cancelForAdditionalTouch, true);
  }, []);

  return <Button {...props} disabled={disabled}
    onPointerDown={event => {
      if (event.pointerType === 'touch' && !event.isPrimary) {
        if (gesture.current) gesture.current.cancelled = true;
        return;
      }
      // A new physical gesture cannot inherit suppression from an earlier tap
      // whose browser click never arrived.
      consumedTouch.current = false;
      gesture.current = null;
      if (disabled || event.defaultPrevented || event.pointerType !== 'touch' || event.button !== 0
        || !inside(event.currentTarget, event.clientX, event.clientY)) return;
      gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, cancelled: false };
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.cancelled ||= Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > TAP_SLOP
        || !inside(event.currentTarget, event.clientX, event.clientY);
    }}
    onPointerUp={event => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      gesture.current = null;
      // Mark it before invoking application code; a synchronous save must not
      // allow this touch's subsequent browser click to activate a second time.
      consumedTouch.current = true;
      if (disabled || event.defaultPrevented || current.cancelled || event.pointerType !== 'touch' || !event.isPrimary
        || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > TAP_SLOP
        || !inside(event.currentTarget, event.clientX, event.clientY)) return;
      onActivate();
    }}
    onPointerCancel={event => {
      if (gesture.current?.pointerId !== event.pointerId) return;
      gesture.current = null;
      consumedTouch.current = true;
    }}
    onLostPointerCapture={event => {
      if (gesture.current?.pointerId !== event.pointerId) return;
      gesture.current = null;
      consumedTouch.current = true;
    }}
    onKeyDown={event => {
      // Keyboard/assistive activation retains the native button semantics.
      if (event.key === 'Enter' || event.key === ' ') consumedTouch.current = false;
      onKeyDown?.(event);
    }}
    onClick={event => {
      if (disabled || event.defaultPrevented) return;
      if (event.detail !== 0 && consumedTouch.current) {
        consumedTouch.current = false;
        return;
      }
      onActivate();
    }}
  />;
}
