import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import type { Bubble } from '@/types/bubble';
import { withBubbleDomainLinks } from '@/adapters/taskAdapter';
import { createUserDomainLink } from '@/domain/lifeDomains';
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
  domains: string[] = ['Work'],
): Bubble {
  const base: Bubble = {
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
  if (domains.length === 0) return base;
  return withBubbleDomainLinks(
    base,
    domains.map((domain, index) => createUserDomainLink(domain, {
      id: `${id}-domain-${index}`,
      now: 1,
    })),
    1,
  );
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
  const match = value.match(/calc\(50% ([+-]) ([\d.]+)px\)/);
  if (!match) throw new Error(`Atomic world offset is not readable: ${value}`);
  return Number(match[2]) * (match[1] === '-' ? -1 : 1);
}

function getWorldTranslation(worldLayer: HTMLElement): { x: number; y: number } {
  const match = worldLayer.style.transform.match(
    /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/,
  );
  if (!match) throw new Error('Atomic world layer does not expose translation');
  return { x: Number(match[1]), y: Number(match[2]) };
}

function worldToClient(
  point: { x: number; y: number },
  worldLayer: HTMLElement,
): { x: number; y: number } {
  const scale = getWorldScale(worldLayer);
  const translation = getWorldTranslation(worldLayer);
  return {
    x: (VIEWPORT_RECT.width / 2) + translation.x + (point.x * scale),
    y: (VIEWPORT_RECT.height / 2) + translation.y + (point.y * scale),
  };
}

function contrastWithWhite(rgb: string): number {
  const channels = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) return 0;
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return 1.05 / (luminance + 0.05);
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
      '[data-molecule-id="mol-work"]',
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
      bubble('work', 'Work meeting', 'today', ['Work']),
      bubble('personal', 'Home chore', 'today', ['Personal']),
      bubble('health', 'Doctor health appointment', 'today', ['Health']),
      bubble('learning', 'Study course', 'today', ['Learning']),
      bubble('relationships', 'Friend family dinner', 'today', ['Relationships']),
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
      clientX: 550,
      clientY: 300,
    }));

    expect(electron).toHaveStyle({ left: '132px' });
    fireEvent(viewport, pointerEvent('pointerup', {
      clientX: 550,
      clientY: 300,
    }));

    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('drag', 0, 2);
    expect(container.querySelector('[data-electron-id="elec-drag-work"]'))
      .toHaveAccessibleName(expect.stringContaining('Later horizon'));
  });

  it('projects only user-confirmed domain links and keeps each canonical task once in the navigator', async () => {
    const inferredOnly = bubble(
      'inferred-only',
      'Work meeting keyword should not assign meaning',
      'today',
      [],
    );
    const linkedAcrossLife = withBubbleDomainLinks(
      bubble('multi-linked', 'Call the school', 'today', []),
      [
        {
          ...createUserDomainLink('Family', { id: 'family-link', now: 1 }),
          domainId: '  family  ',
        },
        createUserDomainLink('Education', { id: 'education-link', now: 1 }),
      ],
      1,
    );
    const { container } = render(
      <AtomicRenderer bubbles={[inferredOnly, linkedAcrossLife]} reducedMotion />,
    );

    expect(await screen.findByRole('button', {
      name: /Family molecule, 1 task/,
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: /Education molecule, 1 task/,
    })).toBeVisible();
    expect(container.querySelector('[data-molecule-id="mol-family"]'))
      .toBeInTheDocument();
    expect(container.querySelector('[data-molecule-id="mol-  family  "]'))
      .not.toBeInTheDocument();
    expect(container.querySelector('[data-electron-id^="elec-inferred-only-"]'))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Tasks (2)'));
    const navigator = screen.getByRole('list', {
      name: 'Atomic tasks by life domain and time horizon',
    });
    expect(navigator.querySelectorAll('button')).toHaveLength(2);
    expect(within(navigator).getByText('No confirmed life-domain link'))
      .toBeVisible();
  });

  it('keeps dense sequential additions in fixed non-overlapping canvas slots', async () => {
    const firstSeven = Array.from({ length: 7 }, (_, index) => ({
      ...bubble(`dense-${index}`, `Dense task ${index + 1}`),
      createdAt: index + 1,
    }));
    const { container, rerender } = render(
      <AtomicRenderer bubbles={firstSeven} reducedMotion />,
    );
    await screen.findByRole('button', { name: /Dense task 7.*Today horizon/ });

    const positionOf = (id: string) => {
      const target = container.querySelector<HTMLElement>(
        `[data-electron-id="elec-${id}-work"]`,
      )!;
      return {
        x: Number.parseFloat(target.style.left),
        y: Number.parseFloat(target.style.top),
        width: Number.parseFloat(target.style.width),
      };
    };
    const before = firstSeven.map(task => positionOf(task.id));
    const eighth = {
      ...bubble('dense-7', 'Dense task 8'),
      createdAt: 8,
    };
    rerender(<AtomicRenderer bubbles={[...firstSeven, eighth]} reducedMotion />);
    await screen.findByRole('button', { name: /Dense task 8.*Today horizon/ });

    firstSeven.forEach((task, index) => {
      expect(positionOf(task.id)).toEqual(before[index]);
    });
    const positions = [...firstSeven, eighth].map(task => positionOf(task.id));
    positions.forEach((position, index) => {
      positions.slice(index + 1).forEach((other) => {
        const centerDistance = Math.hypot(
          position.x - other.x,
          position.y - other.y,
        );
        expect(centerDistance).toBeGreaterThanOrEqual(position.width - 0.01);
      });
    });
  });

  it('allocates a free destination slot for horizon moves and safely restores the prior slot on undo', async () => {
    const onTimeHorizonUpdate = vi.fn();
    const todayTasks = Array.from({ length: 7 }, (_, index) => ({
      ...bubble(`today-${index}`, `Today task ${index + 1}`),
      createdAt: index + 1,
    }));
    const weekAnchor = {
      ...bubble('week-anchor', 'Week anchor', 'week'),
      createdAt: 8,
    };
    const mover = {
      ...bubble('horizon-mover', 'Horizon mover', 'week'),
      createdAt: 9,
    };
    const { container } = render(
      <AtomicRenderer
        bubbles={[...todayTasks, weekAnchor, mover]}
        onTimeHorizonUpdate={onTimeHorizonUpdate}
        reducedMotion
      />,
    );
    const moverElectron = await screen.findByRole('button', {
      name: /Horizon mover.*Week horizon/,
    });

    const positionOf = (id: string) => {
      const target = container.querySelector<HTMLElement>(
        `[data-electron-id="elec-${id}-work"]`,
      )!;
      return {
        x: Number.parseFloat(target.style.left),
        y: Number.parseFloat(target.style.top),
        width: Number.parseFloat(target.style.width),
      };
    };
    const moverInitialPosition = positionOf(mover.id);
    const weekAnchorInitialPosition = positionOf(weekAnchor.id);

    fireEvent.keyDown(moverElectron, { key: 'ArrowLeft' });
    await waitFor(() => expect(moverElectron)
      .toHaveAccessibleName(expect.stringContaining('Today horizon')));

    const todayPositions = [...todayTasks, mover].map(task => positionOf(task.id));
    todayPositions.forEach((position, index) => {
      todayPositions.slice(index + 1).forEach((other) => {
        expect(Math.hypot(position.x - other.x, position.y - other.y))
          .toBeGreaterThanOrEqual(position.width - 0.01);
      });
    });
    expect(onTimeHorizonUpdate).toHaveBeenCalledWith(mover.id, 1, 0);

    const latestToast = toast.mock.calls[toast.mock.calls.length - 1][0];
    const undo = render(latestToast.action).getByRole('button', {
      name: 'Undo moving Horizon mover to Today',
    });
    fireEvent.click(undo);

    await waitFor(() => expect(moverElectron)
      .toHaveAccessibleName(expect.stringContaining('Week horizon')));
    expect(positionOf(mover.id)).toEqual(moverInitialPosition);
    expect(positionOf(weekAnchor.id)).toEqual(weekAnchorInitialPosition);
    expect(onTimeHorizonUpdate).toHaveBeenCalledWith(mover.id, 0, 1);
  });

  it('measures an electron drop from its owning molecule instead of a nearby domain', async () => {
    const onTimeHorizonUpdate = vi.fn();
    const { container } = render(
      <AtomicRenderer
        bubbles={[
          bubble('owning-work', 'Owning Work task', 'today', ['Work']),
          bubble('near-health', 'Nearby Health task', 'today', ['Health']),
        ]}
        onTimeHorizonUpdate={onTimeHorizonUpdate}
        reducedMotion
      />,
    );
    const worldLayer = await screen.findByTestId('atomic-world-layer');
    for (let count = 0; count < 12 && getWorldScale(worldLayer) < 0.9; count += 1) {
      fireEvent.click(screen.getByRole('button', {
        name: 'Zoom in on Atomic view',
      }));
    }
    const electron = await screen.findByRole('button', {
      name: /Owning Work task.*Today horizon/,
    });
    const workWrapper = electron.parentElement as HTMLElement;
    const healthMolecule = container.querySelector<HTMLElement>(
      '[data-molecule-id="mol-health"]',
    )!;
    const healthWrapper = healthMolecule.parentElement as HTMLElement;
    const startWorld = {
      x: getWorldOffset(workWrapper.style.left) + 64,
      y: getWorldOffset(workWrapper.style.top),
    };
    const healthWeekWorld = {
      x: getWorldOffset(healthWrapper.style.left) + 116,
      y: getWorldOffset(healthWrapper.style.top),
    };
    const start = worldToClient(startWorld, worldLayer);
    const end = worldToClient(healthWeekWorld, worldLayer);
    const viewport = screen.getByTestId('atomic-viewport');

    fireEvent(electron, pointerEvent('pointerdown', {
      clientX: start.x,
      clientY: start.y,
    }));
    fireEvent(viewport, pointerEvent('pointermove', {
      clientX: end.x,
      clientY: end.y,
    }));
    fireEvent(viewport, pointerEvent('pointerup', {
      clientX: end.x,
      clientY: end.y,
    }));

    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('owning-work', 0, 2);
  });

  it('keeps destructive molecule fusion disabled and truthfully labeled', async () => {
    const onMoleculeMerge = vi.fn();
    render(
      <AtomicRenderer
        bubbles={[
          bubble('fusion-work', 'Fusion Work task', 'today', ['Work']),
          bubble('fusion-health', 'Fusion Health task', 'today', ['Health']),
        ]}
        onMoleculeMerge={onMoleculeMerge}
        reducedMotion
      />,
    );

    const fuse = await screen.findByRole('button', {
      name: 'Fuse unavailable until a non-destructive confirmed molecule contract exists',
    });
    expect(fuse).toBeDisabled();
    fireEvent.click(fuse);
    expect(onMoleculeMerge).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Molecules fused',
    }));
  });

  it('shows task identity on hover or focus and uses sufficient default contrast', async () => {
    render(
      <AtomicRenderer
        bubbles={[bubble('identity', 'Budget review', 'week', ['Finance'])]}
        reducedMotion
      />,
    );
    const electron = await screen.findByRole('button', {
      name: /Budget review.*Week horizon/,
    });
    expect(electron).toHaveAttribute('title', 'Budget review');
    const visibleIdentity = within(electron).getByText('Budget review');
    expect(visibleIdentity).toHaveClass(
      'group-hover/electron:opacity-100',
      'group-focus-visible/electron:opacity-100',
    );
    const marker = electron.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
    expect(contrastWithWhite(marker.style.backgroundColor))
      .toBeGreaterThanOrEqual(4.5);
  });

  it('does not suppress the next intentional activation after pointer cancellation', async () => {
    const onBubbleSelect = vi.fn();
    render(
      <AtomicRenderer
        bubbles={[bubble('cancel-click', 'Cancel then open')]}
        onBubbleSelect={onBubbleSelect}
        reducedMotion
      />,
    );
    const electron = await screen.findByRole('button', {
      name: /Cancel then open.*Today horizon/,
    });
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(electron, pointerEvent('pointerdown', {
      clientX: 464,
      clientY: 300,
    }));
    fireEvent(viewport, pointerEvent('pointermove', {
      clientX: 550,
      clientY: 300,
    }));
    fireEvent(viewport, pointerEvent('pointercancel', {
      clientX: 550,
      clientY: 300,
    }));
    fireEvent.click(electron);

    expect(onBubbleSelect).toHaveBeenCalledOnce();
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
      clientX: 550,
      clientY: 300,
      pointerId: 51,
    }));
    fireEvent(viewport, pointerEvent('pointerup', {
      clientX: 550,
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
