import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { Bubble } from '@/types/bubble';
import { AtomicRenderer } from '../AtomicRendererUnified';

const toast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

const VIEWPORT_RECT = {
  x: 0,
  y: 0,
  top: 0,
  right: 800,
  bottom: 600,
  left: 0,
  width: 800,
  height: 600,
  toJSON: () => ({}),
} as DOMRect;

function defaultMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function bubble(
  id: string,
  content: string,
  horizon: 'today' | 'week' | 'later' = 'today',
): Bubble {
  return {
    id,
    type: 'Task',
    content,
    createdAt: 1,
    updatedAt: 1,
    x: 10_000,
    y: -10_000,
    size: 0.8,
    tags: [{ id: `${id}-${horizon}`, name: horizon }],
  };
}

function pointerEvent(
  type: string,
  options: { clientX: number; clientY: number; pointerId?: number },
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: 'mouse' },
  });
  return event;
}

function getWorldScale(worldLayer: HTMLElement): number {
  const match = worldLayer.style.transform.match(/scale\(([^)]+)\)/);
  if (!match) throw new Error('Atomic world layer does not expose a scale');
  return Number(match[1]);
}

function getWorldOffset(value: string): number {
  const match = value.match(/calc\(50% \+ (-?[\d.]+)px\)/);
  if (!match) throw new Error(`Atomic world offset is not readable: ${value}`);
  return Number(match[1]);
}

describe('AtomicRenderer interaction geometry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.matchMedia).mockImplementation(defaultMatchMedia);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(VIEWPORT_RECT);
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => true),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete HTMLElement.prototype.setPointerCapture;
    delete HTMLElement.prototype.releasePointerCapture;
    delete HTMLElement.prototype.hasPointerCapture;
  });

  it('uses a stationary viewport, transformed world, and view-local domain layout', async () => {
    const task = bubble('work', 'Work task today');
    const { container } = render(
      <AtomicRenderer bubbles={[task]} reducedMotion />,
    );

    const viewport = screen.getByRole('region', {
      name: 'Atomic view (experimental)',
    });
    const worldLayer = await screen.findByTestId('atomic-world-layer');
    const moleculeWrapper = container.querySelector(
      '[data-molecule-id="mol-Work"]',
    )?.parentElement as HTMLElement;

    expect(viewport.style.transform).toBe('');
    expect(worldLayer.style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(moleculeWrapper).toHaveStyle({
      left: 'calc(50% + 0px)',
      top: 'calc(50% + 0px)',
    });
    expect(screen.getByRole('button', {
      name: /Work task today.*Today horizon/,
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: /Work molecule, 1 task/,
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Motion disabled by reduced-motion preference',
    })).toBeDisabled();
  });

  it('keeps orbit motion off by default and makes it an explicit choice', async () => {
    render(<AtomicRenderer bubbles={[bubble('still', 'Work stable task')]} />);

    const play = await screen.findByRole('button', {
      name: 'Play optional Atomic motion',
    });
    expect(play).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Motion off by default')).toBeVisible();

    fireEvent.click(play);
    expect(screen.getByRole('button', {
      name: 'Pause Atomic motion',
    })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses an accessible overview at fit and exposes 44px electron targets only at a workable zoom', async () => {
    const tasks = [
      bubble('work', 'Work meeting'),
      bubble('personal', 'Home chore'),
      bubble('health', 'Doctor health appointment'),
      bubble('learning', 'Study course'),
      bubble('relationships', 'Friend family dinner'),
    ];
    const { container } = render(
      <AtomicRenderer bubbles={tasks} reducedMotion />,
    );
    const worldLayer = await screen.findByTestId('atomic-world-layer');

    await waitFor(() => {
      expect(getWorldScale(worldLayer)).toBeLessThan(1);
      expect(container.querySelectorAll('[data-electron]')).toHaveLength(0);
    });
    expect(screen.getByTestId('atomic-overview-hint')).toHaveTextContent(
      'Overview. Zoom in to move task electrons, or use the Tasks navigator.',
    );

    fireEvent.click(screen.getByText('Tasks (5)'));
    expect(screen.getByRole('list', {
      name: 'Atomic tasks by life domain and time horizon',
    }).querySelectorAll('button')).toHaveLength(5);

    const assertMinimumScreenTargets = () => {
      const scale = getWorldScale(worldLayer);
      container.querySelectorAll<HTMLElement>(
        '[data-electron], [data-molecule]',
      ).forEach((target) => {
        expect(target.dataset.minimumScreenTarget).toBe('44');
        expect(Number.parseFloat(target.style.width) * scale)
          .toBeGreaterThanOrEqual(43.99);
        expect(Number.parseFloat(target.style.height) * scale)
          .toBeGreaterThanOrEqual(43.99);
      });
    };

    assertMinimumScreenTargets();
    for (let count = 0; count < 12; count += 1) {
      fireEvent.click(screen.getByRole('button', {
        name: 'Zoom in on Atomic view',
      }));
      if (getWorldScale(worldLayer) >= 0.9) break;
    }
    await waitFor(() => {
      expect(getWorldScale(worldLayer)).toBeGreaterThanOrEqual(0.9);
      expect(container.querySelectorAll('[data-electron]')).toHaveLength(5);
    });
    assertMinimumScreenTargets();

    for (let count = 0; count < 20; count += 1) {
      fireEvent.click(screen.getByRole('button', {
        name: 'Zoom out of Atomic view',
      }));
    }
    await waitFor(() => expect(getWorldScale(worldLayer)).toBe(0.14));
    expect(container.querySelectorAll('[data-electron]')).toHaveLength(0);
    assertMinimumScreenTargets();
  });

  it('uses compact controls in a short landscape canvas', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        ...VIEWPORT_RECT,
        right: 844,
        bottom: 300,
        width: 844,
        height: 300,
      });

    render(<AtomicRenderer bubbles={[bubble('wide', 'Work wide task')]} />);

    const compactControls = await screen.findByTestId(
      'atomic-mobile-view-controls',
    );
    expect(compactControls.querySelector('summary')).toBeVisible();
    expect(screen.queryByTestId('atomic-desktop-view-controls'))
      .not.toBeInTheDocument();
  });

  it('tracks an electron at the absolute pointer and hit-tests its shell in world coordinates', async () => {
    const onTimeHorizonUpdate = vi.fn();
    const { container } = render(
      <AtomicRenderer
        bubbles={[bubble('drag', 'Work drag target')]}
        onTimeHorizonUpdate={onTimeHorizonUpdate}
        reducedMotion
      />,
    );
    const electron = await screen.findByRole('button', {
      name: /Work drag target.*Today horizon/,
    });
    const viewport = screen.getByRole('region', {
      name: 'Atomic view (experimental)',
    });

    fireEvent(electron, pointerEvent('pointerdown', {
      clientX: 460,
      clientY: 300,
    }));
    fireEvent(viewport, pointerEvent('pointermove', {
      clientX: 530,
      clientY: 300,
    }));

    expect(electron).toHaveStyle({ left: '108px' });
    fireEvent(viewport, pointerEvent('pointerup', {
      clientX: 530,
      clientY: 300,
    }));

    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('drag', 0, 2);
    expect(container.querySelector('[data-electron-id="elec-drag"]'))
      .toHaveAccessibleName(expect.stringContaining('Later horizon'));
  });

  it('keeps an object drag owned by the pointer that started it', async () => {
    const onTimeHorizonUpdate = vi.fn();
    render(
      <AtomicRenderer
        bubbles={[bubble('owned', 'Work owned drag')]}
        onTimeHorizonUpdate={onTimeHorizonUpdate}
        reducedMotion
      />,
    );
    const electron = await screen.findByRole('button', {
      name: /Work owned drag.*Today horizon/,
    });
    const viewport = screen.getByRole('region', {
      name: 'Atomic view (experimental)',
    });

    fireEvent(electron, pointerEvent('pointerdown', {
      clientX: 460,
      clientY: 300,
      pointerId: 51,
    }));
    fireEvent(electron, pointerEvent('pointerdown', {
      clientX: 460,
      clientY: 300,
      pointerId: 52,
    }));
    fireEvent(viewport, pointerEvent('pointermove', {
      clientX: 530,
      clientY: 300,
      pointerId: 51,
    }));
    fireEvent(viewport, pointerEvent('pointerup', {
      clientX: 530,
      clientY: 300,
      pointerId: 51,
    }));

    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('owned', 0, 2);
  });

  it('treats sub-eight-pixel pointer jitter as a molecule selection, not a move', async () => {
    render(
      <AtomicRenderer
        bubbles={[bubble('steady', 'Work steady target')]}
        reducedMotion
      />,
    );
    const molecule = await screen.findByRole('button', {
      name: /Work molecule, 1 task/,
    });
    const moleculeWrapper = molecule.parentElement as HTMLElement;
    const initialLeft = moleculeWrapper.style.left;
    const initialTop = moleculeWrapper.style.top;

    fireEvent(molecule, pointerEvent('pointerdown', {
      clientX: 400,
      clientY: 300,
    }));
    fireEvent(molecule, pointerEvent('pointermove', {
      clientX: 406,
      clientY: 304,
    }));
    fireEvent(molecule, pointerEvent('pointerup', {
      clientX: 406,
      clientY: 304,
    }));
    fireEvent.click(molecule);

    expect(moleculeWrapper.style.left).toBe(initialLeft);
    expect(moleculeWrapper.style.top).toBe(initialTop);
    expect(molecule).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens and moves tasks and selects and moves molecules from the keyboard', async () => {
    const onBubbleSelect = vi.fn();
    const onTimeHorizonUpdate = vi.fn();
    render(
      <AtomicRenderer
        bubbles={[bubble('keyboard', 'Work keyboard target')]}
        onBubbleSelect={onBubbleSelect}
        onTimeHorizonUpdate={onTimeHorizonUpdate}
        reducedMotion
      />,
    );
    const electron = await screen.findByRole('button', {
      name: /Work keyboard target.*Today horizon/,
    });

    fireEvent.keyDown(electron, { key: 'ArrowRight' });
    fireEvent.keyDown(electron, { key: 'Enter' });
    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('keyboard', 0, 1);
    expect(onBubbleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'keyboard' }),
    );

    const molecule = screen.getByRole('button', {
      name: /Work molecule, 1 task/,
    });
    fireEvent.keyDown(molecule, { key: 'Enter' });
    expect(molecule).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(molecule, { key: 'ArrowRight' });
    expect(screen.getByText(
      'Work molecule moved right 10 pixels. This view-only position is not saved.',
    )).toHaveAttribute('aria-live', 'polite');
  });

  it('moves molecules by consistent screen pixels at overview scale', async () => {
    render(
      <AtomicRenderer
        bubbles={[bubble('keyboard-scale', 'Work scale target')]}
        reducedMotion
      />,
    );
    const worldLayer = await screen.findByTestId('atomic-world-layer');
    for (let count = 0; count < 20; count += 1) {
      fireEvent.click(screen.getByRole('button', {
        name: 'Zoom out of Atomic view',
      }));
    }
    await waitFor(() => expect(getWorldScale(worldLayer)).toBe(0.14));

    const molecule = screen.getByRole('button', {
      name: /Work molecule, 1 task/,
    });
    const wrapper = molecule.parentElement as HTMLElement;
    const scale = getWorldScale(worldLayer);
    const initialX = getWorldOffset(wrapper.style.left);
    const initialY = getWorldOffset(wrapper.style.top);

    fireEvent.keyDown(molecule, { key: 'ArrowRight' });
    expect((getWorldOffset(wrapper.style.left) - initialX) * scale)
      .toBeCloseTo(10, 8);
    expect(screen.getByText(
      'Work molecule moved right 10 pixels. This view-only position is not saved.',
    )).toHaveAttribute('aria-live', 'polite');

    fireEvent.keyDown(molecule, { key: 'ArrowDown', shiftKey: true });
    expect((getWorldOffset(wrapper.style.top) - initialY) * scale)
      .toBeCloseTo(1, 8);
    expect(screen.getByText(
      'Work molecule moved down 1 pixel. This view-only position is not saved.',
    )).toHaveAttribute('aria-live', 'polite');
  });

  it('honors the operating-system reduced-motion preference and keeps hook order stable across empty/data rerenders', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      ...defaultMatchMedia(query),
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    const { container, rerender } = render(
      <AtomicRenderer bubbles={[]} />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    expect(screen.getByRole('button', {
      name: 'Motion disabled by reduced-motion preference',
    })).toBeDisabled();

    rerender(<AtomicRenderer bubbles={[bubble('cold', 'Work cold load')]} />);
    expect(await screen.findByRole('button', {
      name: /Work cold load.*Today horizon/,
    })).toBeVisible();
    rerender(<AtomicRenderer bubbles={[]} />);
    await waitFor(() => {
      expect(container.querySelectorAll('[data-electron]')).toHaveLength(0);
    });
  });

  it('has no automated violations in the experimental renderer surface', async () => {
    const { container } = render(
      <AtomicRenderer
        bubbles={[bubble('axe', 'Work accessible task')]}
        reducedMotion
      />,
    );
    await screen.findByRole('button', {
      name: /Work accessible task.*Today horizon/,
    });
    const result = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
