import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import type { Bubble } from '@/types/bubble';
import { withBubbleDomainLinks } from '@/adapters/taskAdapter';
import { createUserDomainLink } from '@/domain/lifeDomains';
import { AtomicRenderer } from '../AtomicRendererUnified';
import * as motion from '@/lib/motion';

const toast = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: {
  user: null as { id: string } | null,
  session: null as { user: { id: string } } | null,
  loading: false,
} }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState.value }));

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
  options: { clientX: number; clientY: number; pointerId?: number; pointerType?: 'mouse' | 'touch' },
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
    pointerType: { value: options.pointerType ?? 'mouse' },
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
    authState.value = { user: null, session: null, loading: false };
    localStorage.clear();
    sessionStorage.clear();
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

  it.each(['mouse', 'touch'] as const)('previews the horizon and commits the final %s release with its off-center grab preserved', async pointerType => {
    const task = bubble('final-point', 'Release where my hand lands');
    const original = JSON.stringify(task);
    const onTimeHorizonUpdate = vi.fn();
    const { container } = render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Release where my hand lands.*Today horizon/ });
    const viewport = screen.getByTestId('atomic-viewport');
    const world = screen.getByTestId('atomic-world-layer');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in on Atomic view' }));
    const start = worldToClient({ x: 64, y: 0 }, world);
    const week = worldToClient({ x: 116, y: 0 }, world);
    const later = worldToClient({ x: 168, y: 0 }, world);
    const initial = { left: electron.style.left, top: electron.style.top };
    fireEvent(electron, pointerEvent('pointerdown', { clientX: start.x + 8, clientY: start.y - 4, pointerType }));
    expect(electron).toHaveStyle(initial);
    expect(screen.getByTestId('atomic-drag-feedback')).toHaveAttribute('data-target-horizon', 'today');
    fireEvent(viewport, pointerEvent('pointermove', { clientX: week.x + 8, clientY: week.y - 4, pointerType }));
    expect(screen.getByText('Release in Week')).toBeVisible();
    expect(container.querySelector('[data-drop-target="true"]')).toHaveAttribute('data-shell-index', '1');
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    // No move event reaches the final position before pointerup.
    fireEvent(viewport, pointerEvent('pointerup', { clientX: later.x + 8, clientY: later.y - 4, pointerType }));
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith(task.id, 0, 2);
    expect(electron).toHaveAccessibleName(expect.stringContaining('Later horizon'));
    expect(screen.queryByTestId('atomic-drag-feedback')).not.toBeInTheDocument();
    expect(JSON.stringify(task)).toBe(original);
  });

  it('recognizes a release-only drag but keeps tiny release jitter as a click', async () => {
    const onTimeHorizonUpdate = vi.fn();
    const onBubbleSelect = vi.fn();
    render(<AtomicRenderer bubbles={[bubble('release-only', 'Quick release')]} onTimeHorizonUpdate={onTimeHorizonUpdate} onBubbleSelect={onBubbleSelect} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Quick release.*Today horizon/ });
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 468, clientY: 303 }));
    fireEvent.click(electron);
    expect(onBubbleSelect).toHaveBeenCalledOnce();
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 568, clientY: 300 }));
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith('release-only', 0, 2);
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape', 'Cancel move'])('cancels with %s without saving and accepts the next drag', async cancellation => {
    const task = bubble('cancel-mode', 'A reversible move');
    const original = JSON.stringify(task);
    const onTimeHorizonUpdate = vi.fn();
    render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /A reversible move.*Today horizon/ });
    const viewport = screen.getByTestId('atomic-viewport');
    const initial = { left: electron.style.left, top: electron.style.top };
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300, pointerType: 'touch' }));
    fireEvent(viewport, pointerEvent('pointermove', { clientX: 568, clientY: 300, pointerType: 'touch' }));
    expect(screen.getByText('Release in Later')).toBeVisible();
    if (cancellation === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
    else if (cancellation === 'Cancel move') fireEvent.click(screen.getByRole('button', { name: cancellation }));
    else fireEvent(viewport, pointerEvent(cancellation, { clientX: 0, clientY: 0, pointerType: 'touch' }));
    expect(screen.queryByTestId('atomic-drag-feedback')).not.toBeInTheDocument();
    expect(electron).toHaveStyle(initial);
    expect(electron).toHaveAccessibleName(expect.stringContaining('Today horizon'));
    expect(screen.getByText('Move cancelled. Nothing changed.')).toHaveAttribute('aria-live', 'polite');
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(task)).toBe(original);
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 516, clientY: 300 }));
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith(task.id, 0, 1);
  });

  it('restores a cancelled nucleus and commits its actual release position without changing bubbles', async () => {
    const task = bubble('nucleus-release', 'Nucleus release');
    const original = JSON.stringify(task);
    render(<AtomicRenderer bubbles={[task]} reducedMotion />);
    const nucleus = await screen.findByRole('button', { name: /Work molecule, 1 task/ });
    const wrapper = nucleus.parentElement as HTMLElement;
    const initial = { left: wrapper.style.left, top: wrapper.style.top };
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(nucleus, pointerEvent('pointerdown', { clientX: 406, clientY: 304 }));
    fireEvent(viewport, pointerEvent('pointermove', { clientX: 456, clientY: 364 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(wrapper).toHaveStyle(initial);
    fireEvent(nucleus, pointerEvent('pointerdown', { clientX: 406, clientY: 304 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 486, clientY: 344 }));
    expect(getWorldOffset(wrapper.style.left)).toBe(80);
    expect(getWorldOffset(wrapper.style.top)).toBe(40);
    expect(JSON.stringify(task)).toBe(original);
  });

  it('explains full orbits before release and keeps the moved task reachable in the navigator', async () => {
    const task = bubble('full-drag', 'A full orbit destination', 'week');
    const occupied = Array.from({ length: 8 }, (_, index) => bubble(`occupied-${index}`, `Occupied ${index}`));
    const onTimeHorizonUpdate = vi.fn();
    const { container } = render(<AtomicRenderer bubbles={[...occupied, task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /A full orbit destination.*Week horizon/ });
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 516, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointermove', { clientX: 464, clientY: 300 }));
    expect(screen.getByText(/This orbit is full/)).toBeVisible();
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 464, clientY: 300 }));
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith(task.id, 1, 0);
    expect(container.querySelector('[data-electron-id="elec-full-drag-work"]')).not.toBeInTheDocument();
    const navigator = screen.getByTestId('atomic-task-navigator');
    fireEvent.click(within(navigator).getByText('Tasks (9)'));
    expect(within(navigator).getByRole('combobox', { name: 'Time horizon for A full orbit destination' })).toBeVisible();
  });

  it('finds dense or unlinked tasks by title or life area without changing their identities', async () => {
    const dense = Array.from({ length: 12 }, (_, index) => bubble(`search-${index}`, `Work task ${index + 1}`));
    const unlinked = bubble('search-unlinked', 'An unlinked thought', 'later', []);
    const untitled = bubble('search-untitled', '', 'later', []);
    const shared = bubble('search-shared', 'One shared action', 'today', ['Home', 'Health']);
    const tasks = [...dense, unlinked, shared, untitled];
    const original = JSON.stringify(tasks);
    const onTimeHorizonUpdate = vi.fn();
    const onBubbleSelect = vi.fn();
    render(<AtomicRenderer bubbles={tasks} onTimeHorizonUpdate={onTimeHorizonUpdate} onBubbleSelect={onBubbleSelect} reducedMotion />);
    const navigator = await screen.findByTestId('atomic-task-navigator');
    fireEvent.click(within(navigator).getByText('Tasks (15)'));
    expect(within(navigator).getAllByRole('combobox')).toHaveLength(15);
    const search = within(navigator).getByRole('searchbox', { name: 'Find a task in Atomic view' });
    fireEvent.change(search, { target: { value: 'task 12' } });
    expect(within(navigator).getAllByRole('combobox')).toHaveLength(1);
    fireEvent.change(within(navigator).getByRole('combobox'), { target: { value: '1' } });
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith('search-11', 0, 1);
    fireEvent.change(search, { target: { value: 'health' } });
    expect(within(navigator).getAllByRole('combobox')).toHaveLength(1);
    fireEvent.click(within(navigator).getByRole('button', { name: 'Open One shared action. Home, Health.' }));
    expect(onBubbleSelect).toHaveBeenLastCalledWith(shared);
    fireEvent.change(search, { target: { value: 'unlinked' } });
    fireEvent.click(within(navigator).getByRole('button', { name: /Open An unlinked thought/ }));
    expect(onBubbleSelect).toHaveBeenLastCalledWith(unlinked);
    fireEvent.change(search, { target: { value: 'untitled' } });
    expect(within(navigator).getByRole('button', { name: /Open Untitled task/ })).toBeVisible();
    fireEvent.change(search, { target: { value: 'missing phrase' } });
    expect(within(navigator).getByText('No matching tasks. Try a task or life area.')).toBeVisible();
    expect(JSON.stringify(tasks)).toBe(original);
  });

  it('waits for a shared task save before offering undo and guards all linked copies while pending', async () => {
    let resolveSave!: () => void;
    const onTimeHorizonUpdate = vi.fn(() => new Promise<void>(resolve => { resolveSave = resolve; }));
    const task = bubble('pending-shared', 'One save for all areas', 'today', ['Home', 'Work']);
    render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    fireEvent.click(await screen.findByRole('button', { name: /Home molecule, 1 task/ }));
    const home = await screen.findByRole('button', { name: /One save for all areas.*Home.*Today horizon/ });
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    const work = screen.getByRole('button', { name: /One save for all areas.*Work.*Week horizon/ });
    expect(home).toHaveAttribute('aria-busy', 'true');
    expect(work).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(work, { key: 'ArrowRight' });
    fireEvent(work, pointerEvent('pointerdown', { clientX: 500, clientY: 300 }));
    expect(screen.queryByTestId('atomic-drag-feedback')).not.toBeInTheDocument();
    const navigator = screen.getByTestId('atomic-task-navigator');
    fireEvent.click(within(navigator).getByText('Tasks (1)'));
    expect(within(navigator).getByRole('combobox')).toBeDisabled();
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith(task.id, 0, 1);
    expect(toast).not.toHaveBeenCalled();
    await act(async () => resolveSave());
    expect(home).toHaveAttribute('aria-busy', 'false');
    expect(within(navigator).getByRole('combobox')).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Moved to Week', action: expect.anything() }));
  });

  it('restores every shared particle and reports a rejected save without a success or undo', async () => {
    let rejectSave!: (error: Error) => void;
    const onTimeHorizonUpdate = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const task = bubble('failed-shared', 'Keep my original orbit', 'today', ['Home', 'Work']);
    const { container } = render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    fireEvent.click(await screen.findByRole('button', { name: /Home molecule, 1 task/ }));
    const home = await screen.findByRole('button', { name: /Keep my original orbit.*Home.*Today horizon/ });
    const work = screen.getByRole('button', { name: /Keep my original orbit.*Work.*Today horizon/ });
    const originalHome = { left: home.style.left, top: home.style.top };
    const originalWork = { left: work.style.left, top: work.style.top };
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    await act(async () => rejectSave(new Error('Storage write failed')));
    expect(home).toHaveStyle(originalHome);
    expect(work).toHaveStyle(originalWork);
    expect(home).toHaveAccessibleName(expect.stringContaining('Today horizon'));
    expect(work).toHaveAccessibleName(expect.stringContaining('Today horizon'));
    expect(container.querySelectorAll('[data-bond-id]')).toHaveLength(1);
    expect(toast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Move not saved', variant: 'destructive' }));
    expect(toast.mock.calls[0][0].action).toBeUndefined();
  });

  it('awaits undo persistence, guards repeated undo, and restores the saved horizon on undo failure', async () => {
    let rejectUndo!: (error: Error) => void;
    const onTimeHorizonUpdate = vi.fn<(...args: [string, number, number]) => void | Promise<void>>()
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectUndo = reject; }))
      .mockResolvedValueOnce(undefined);
    render(<AtomicRenderer bubbles={[bubble('undo-save', 'Undo a saved move')]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Undo a saved move.*Today horizon/ });
    fireEvent.keyDown(electron, { key: 'ArrowRight' });
    const savedPosition = { left: electron.style.left, top: electron.style.top };
    const undo = render(toast.mock.calls[0][0].action).getByRole('button', { name: 'Undo moving Undo a saved move to Week' });
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(onTimeHorizonUpdate).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Undo a saved move returned to Today.')).not.toBeInTheDocument();
    await act(async () => rejectUndo(new Error('Undo storage failed')));
    expect(electron).toHaveStyle(savedPosition);
    expect(electron).toHaveAccessibleName(expect.stringContaining('Week horizon'));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Move not saved' }));
    fireEvent.click(undo);
    await waitFor(() => expect(screen.getByText('Undo a saved move returned to Today.')).toBeInTheDocument());
    expect(onTimeHorizonUpdate).toHaveBeenNthCalledWith(3, 'undo-save', 1, 0);
    fireEvent.click(undo);
    expect(onTimeHorizonUpdate).toHaveBeenCalledTimes(3);
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

  it('shows bonds from confirmed shared tasks and opens the original task without merging', async () => {
    const onMoleculeMerge = vi.fn();
    const onBubbleSelect = vi.fn();
    const shared = bubble('shared', 'Walk home together', 'today', ['Health', 'Family']);
    const { container } = render(
      <AtomicRenderer bubbles={[shared, bubble('work-only', 'Work separately', 'today', ['Work'])]}
        onMoleculeMerge={onMoleculeMerge} onBubbleSelect={onBubbleSelect} reducedMotion />,
    );
    await screen.findByRole('button', { name: /Family molecule, 1 task/ });
    expect(container.querySelectorAll('[data-bond-id]')).toHaveLength(1);
    expect(container.querySelector('[data-bond-id]')).toHaveAttribute('data-shared-task-count', '1');
    expect(screen.queryByRole('button', { name: /Fuse|Split molecule/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Connections (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Open Walk home together, shared by Health and Family' }));
    expect(onBubbleSelect).toHaveBeenCalledWith(shared);
    expect(onMoleculeMerge).not.toHaveBeenCalled();
    expect(shared.x).toBe(10_000);
    expect(shared.y).toBe(-10_000);
  });

  it('shows one shared-task card with literal confirmed reasons instead of repeating domain pairs', async () => {
    const shared = withBubbleDomainLinks(bubble('meaning', 'Prepare for work', 'today', []), [
      { ...createUserDomainLink('Career', { id: 'career', now: 1 }), reason: 'I want to feel prepared.', strength: 'primary' },
      { ...createUserDomainLink('Home', { id: 'home', now: 1 }), reason: 'Protect our evening together.', strength: 'secondary' },
      { ...createUserDomainLink('Meaning', { id: 'meaning', now: 1 }), suggestionReason: 'This is only a keyword guess.' },
      { ...createUserDomainLink('Status', { id: 'pending', now: 1 }), userConfirmed: false, reason: 'Unconfirmed private interpretation.' },
    ], 1);
    const onEditConnections = vi.fn();
    const { container } = render(<AtomicRenderer bubbles={[shared]} onEditConnections={onEditConnections} reducedMotion />);
    await screen.findByRole('button', { name: /Career molecule/ });
    fireEvent.click(screen.getByText('Connections (3)'));
    const panel = screen.getByTestId('atomic-connections-panel');
    expect(container.querySelectorAll('[data-shared-task-id]')).toHaveLength(1);
    expect(within(panel).getByText('I want to feel prepared.')).toBeVisible();
    expect(within(panel).getByText('Protect our evening together.')).toBeVisible();
    expect(within(panel).getByText('Primary')).toBeVisible();
    expect(within(panel).getByText('Supporting')).toBeVisible();
    expect(within(panel).queryByText('This is only a keyword guess.')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Unconfirmed private interpretation.')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit connections for Prepare for work' }));
    expect(onEditConnections).toHaveBeenCalledExactlyOnceWith(shared);
  });

  it('traces matching visible overview particles without hover or data mutations and clears accessibly', async () => {
    const shared = bubble('touch-trace', 'One small action', 'today', ['Career', 'Home', 'Meaning']);
    const before = JSON.stringify(shared);
    const onTimeHorizonUpdate = vi.fn();
    const onBubbleSelect = vi.fn();
    const { container } = render(<AtomicRenderer bubbles={[shared]} onBubbleSelect={onBubbleSelect} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const world = screen.getByTestId('atomic-world-layer');
    await waitFor(() => expect(getWorldScale(world)).toBeLessThan(0.9));
    expect(container.querySelectorAll('[data-electron]')).toHaveLength(0);
    fireEvent.click(screen.getByText('Connections (3)'));
    fireEvent.click(screen.getByRole('button', { name: 'Trace One small action across its life areas' }));
    const clear = screen.getByRole('button', { name: 'Clear trace' });
    expect(clear).toHaveFocus();
    expect(screen.getByTestId('atomic-trace-status')).toHaveTextContent('One task, 3 life areas');
    expect(screen.getByTestId('atomic-molecule-bonds')).toHaveAttribute('data-traced-task-id', shared.id);
    expect(container.querySelectorAll('[data-shared-electron-thread]')).toHaveLength(2);
    const dots = [...container.querySelectorAll<HTMLElement>('[data-overview-particle]')];
    const anchors = [...container.querySelectorAll<SVGCircleElement>('[data-trace-anchor="particle"]')];
    expect(anchors).toHaveLength(3);
    dots.forEach((dot, index) => {
      const wrapper = dot.parentElement!;
      expect(Number(anchors[index].getAttribute('cx'))).toBeCloseTo(
        getWorldOffset(wrapper.style.left) + Number.parseFloat(dot.style.left) + Number.parseFloat(dot.style.width) / 2, 7);
      expect(Number(anchors[index].getAttribute('cy'))).toBeCloseTo(
        getWorldOffset(wrapper.style.top) + Number.parseFloat(dot.style.top) + Number.parseFloat(dot.style.height) / 2, 7);
    });
    fireEvent.click(clear);
    expect(container.querySelectorAll('[data-trace-anchor]')).toHaveLength(0);
    expect(screen.getByText('Connections (3)')).toHaveFocus();
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    expect(onBubbleSelect).not.toHaveBeenCalled();
    expect(JSON.stringify(shared)).toBe(before);
  });

  it('clears a pinned trace when an external edit removes its shared connections', async () => {
    const shared = bubble('updated-trace', 'A changing connection', 'today', ['Career', 'Home']);
    const { container, rerender } = render(<AtomicRenderer bubbles={[shared]} reducedMotion />);
    await screen.findByRole('button', { name: /Career molecule/ });
    fireEvent.click(screen.getByText('Connections (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Trace A changing connection across its life areas' }));
    expect(screen.getByRole('button', { name: 'Clear trace' })).toBeVisible();
    rerender(<AtomicRenderer bubbles={[bubble(shared.id, shared.content!, 'today', ['Home'])]} reducedMotion />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear trace' })).not.toBeInTheDocument());
    expect(container.querySelectorAll('[data-shared-electron-thread]')).toHaveLength(0);
  });

  it('offers every task to connect, including unlinked tasks, and forwards only the chosen identity', async () => {
    const unlinked = bubble('unlinked', 'An unlinked thought', 'today', []);
    const linked = bubble('linked', 'An existing connection', 'today', ['Home', 'Work']);
    const onEditConnections = vi.fn();
    const before = JSON.stringify([unlinked, linked]);
    render(<AtomicRenderer bubbles={[unlinked, linked]} onEditConnections={onEditConnections} reducedMotion />);
    await screen.findByRole('button', { name: /Home molecule/ });
    fireEvent.click(screen.getByText('Connections (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Connect a task' }));
    const picker = screen.getByRole('list', { name: 'Tasks available to connect' });
    expect(within(picker).getAllByRole('button')).toHaveLength(2);
    const search = screen.getByRole('searchbox', { name: 'Find a task to connect' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'unlinked' } });
    expect(within(picker).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(picker).getByRole('button', { name: 'Edit connections for An unlinked thought' }));
    expect(onEditConnections).toHaveBeenCalledExactlyOnceWith(unlinked);
    expect(JSON.stringify([unlinked, linked])).toBe(before);
  });

  it('makes the unlinked empty state actionable only when connection editing is available', async () => {
    const unlinked = bubble('only-unlinked', 'Something to connect', 'today', []);
    const { rerender } = render(<AtomicRenderer bubbles={[unlinked]} reducedMotion />);
    expect(screen.queryByRole('button', { name: 'Choose a task to connect' })).not.toBeInTheDocument();
    rerender(<AtomicRenderer bubbles={[unlinked]} onEditConnections={vi.fn()} reducedMotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a task to connect' }));
    expect(screen.getByRole('button', { name: 'Edit connections for Something to connect' })).toBeVisible();
  });

  it('keeps a paused orbit at its visible phase and starts dragging from that position', async () => {
    let step: (() => void) | undefined;
    vi.spyOn(motion, 'startAnimation').mockImplementation(callback => { step = callback; return () => {}; });
    vi.spyOn(motion, 'stopAnimation').mockImplementation(() => {});
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    render(<AtomicRenderer bubbles={[bubble('phase', 'Steady phase')]} />);
    const electron = await screen.findByRole('button', { name: /Steady phase.*Today horizon/ });
    const initialLeft = electron.style.left;
    fireEvent.click(screen.getByRole('button', { name: 'Play optional Atomic motion' }));
    act(() => { now += 40; step?.(); });
    expect(electron.style.left).not.toBe(initialLeft);
    const beforePause = { left: electron.style.left, top: electron.style.top };
    fireEvent.click(screen.getByRole('button', { name: 'Pause Atomic motion' }));
    expect(electron).toHaveStyle(beforePause);
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    expect(electron).toHaveStyle(beforePause);
  });

  it('retains the grab offset after zoom and pan and releases near the drop on the same orbit', async () => {
    const onTimeHorizonUpdate = vi.fn();
    render(<AtomicRenderer bubbles={[bubble('offset', 'Zoomed offset')]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Zoomed offset.*Today horizon/ });
    const world = screen.getByTestId('atomic-world-layer');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in on Atomic view' }));
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(viewport, pointerEvent('pointerdown', { clientX: 50, clientY: 50 }));
    fireEvent(viewport, pointerEvent('pointermove', { clientX: 85, clientY: 76 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 85, clientY: 76 }));
    const start = worldToClient({ x: 64, y: 0 }, world);
    const destination = worldToClient({ x: 0, y: 64 }, world);
    const initial = { left: electron.style.left, top: electron.style.top };
    fireEvent(electron, pointerEvent('pointerdown', { clientX: start.x + 9, clientY: start.y - 5 }));
    expect(electron).toHaveStyle(initial);
    fireEvent(viewport, pointerEvent('pointermove', { clientX: destination.x + 9, clientY: destination.y - 5 }));
    const beforeRelease = { left: electron.style.left, top: electron.style.top };
    fireEvent(viewport, pointerEvent('pointerup', { clientX: destination.x + 9, clientY: destination.y - 5 }));
    expect(Number.parseFloat(electron.style.left)).toBeCloseTo(Number.parseFloat(beforeRelease.left), 8);
    expect(Number.parseFloat(electron.style.top)).toBeCloseTo(Number.parseFloat(beforeRelease.top), 8);
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
  });

  it('keeps every linked electron on the same horizon and preserves the shared bond', async () => {
    const onTimeHorizonUpdate = vi.fn();
    const shared = bubble('linked-move', 'One action, two areas', 'today', ['Career', 'Home']);
    const { container } = render(<AtomicRenderer bubbles={[shared]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    fireEvent.click(await screen.findByRole('button', { name: /Career molecule, 1 task/ }));
    const career = await screen.findByRole('button', { name: /One action, two areas.*Career.*Today horizon/ });
    fireEvent.focus(career);
    expect(container.querySelectorAll('[data-shared-electron-thread]')).toHaveLength(1);
    fireEvent.keyDown(career, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /One action, two areas.*Home.*Week horizon/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-bond-id]')).toHaveLength(1);
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith(shared.id, 0, 1);
    expect(shared.x).toBe(10_000);
    expect(shared.y).toBe(-10_000);
  });

  it('distinguishes actions, thoughts, and context with labeled particle flavors', async () => {
    const thought = { ...bubble('idea', 'A new idea', 'week'), type: 'Thought' as const };
    const memory = { ...bubble('remember', 'A memory', 'later'), type: 'Memory' as const };
    render(<AtomicRenderer bubbles={[bubble('action', 'An action'), thought, memory]} reducedMotion />);
    expect(await screen.findByRole('button', { name: /An action.*Electron/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A new idea.*Proton/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A memory.*Neutron/ })).toBeInTheDocument();
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
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 464, clientY: 300 }));
    fireEvent.click(electron);

    expect(onBubbleSelect).toHaveBeenCalledOnce();
  });

  it('suppresses the trailing native click after Escape while allowing the next intentional click', async () => {
    const onBubbleSelect = vi.fn();
    const onTimeHorizonUpdate = vi.fn();
    render(<AtomicRenderer bubbles={[bubble('escape-click', 'Cancel without opening')]} onBubbleSelect={onBubbleSelect} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Cancel without opening.*Today horizon/ });
    const viewport = screen.getByTestId('atomic-viewport');
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointermove', { clientX: 516, clientY: 300 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 516, clientY: 300 }));
    fireEvent.click(electron);
    expect(onBubbleSelect).not.toHaveBeenCalled();
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    fireEvent(electron, pointerEvent('pointerdown', { clientX: 464, clientY: 300 }));
    fireEvent(viewport, pointerEvent('pointerup', { clientX: 464, clientY: 300 }));
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
      'Work position saved. Kept in this tab.',
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
      'Work position saved. Kept in this tab.',
    )).toHaveAttribute('aria-live', 'polite');

    fireEvent.keyDown(molecule, { key: 'ArrowDown', shiftKey: true });
    expect((getWorldOffset(wrapper.style.top) - initialY) * scale)
      .toBeCloseTo(1, 8);
    expect(screen.getByText(
      'Work position saved. Kept in this tab.',
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
  it('restores a committed nucleus and same-orbit particle position on remount without changing task coordinates', async () => {
    const task = bubble('saved-placement', 'Remember my arrangement');
    const onTimeHorizonUpdate = vi.fn();
    const first = render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const nucleus = await screen.findByRole('button', { name: /^Work molecule/ });
    fireEvent.keyDown(nucleus, { key: 'ArrowRight' });
    const world = screen.getByTestId('atomic-world-layer');
    const electron = screen.getByRole('button', { name: /Remember my arrangement.*Today horizon/ });
    const start = worldToClient({ x: 74, y: 0 }, world);
    const end = worldToClient({ x: 10, y: 64 }, world);
    fireEvent(electron, pointerEvent('pointerdown', { clientX: start.x, clientY: start.y }));
    fireEvent(screen.getByTestId('atomic-viewport'), pointerEvent('pointerup', { clientX: end.x, clientY: end.y }));
    const saved = JSON.parse(sessionStorage.getItem('mind-manual:atomic-layout:v1:guest')!);
    expect(saved.molecules.work).toEqual({ x: 10, y: 0, z: 0 });
    expect(saved.orbits[JSON.stringify(['work', task.id])].angle).toBeCloseTo(Math.PI / 2);
    const orbitPosition = { left: electron.style.left, top: electron.style.top };
    first.unmount();
    render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const restoredNucleus = await screen.findByRole('button', { name: /^Work molecule/ });
    expect(restoredNucleus.parentElement).toHaveStyle({ left: 'calc(50% + 10px)' });
    expect(screen.getByRole('button', { name: /Remember my arrangement.*Today horizon/ })).toHaveStyle(orbitPosition);
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
    expect(task).toMatchObject({ x: 10_000, y: -10_000 });
  });

  it('does not let a saved orbit restore an outdated canonical horizon', async () => {
    sessionStorage.setItem('mind-manual:atomic-layout:v1:guest', JSON.stringify({ version: 1, scope: 'guest', updatedAt: 1,
      molecules: { work: { x: 0, y: 0, z: 48 } },
      orbits: { [JSON.stringify(['work', 'changed-horizon'])]: { domainId: 'work', taskId: 'changed-horizon', shell: 'today', angle: Math.PI } },
    }));
    render(<AtomicRenderer bubbles={[bubble('changed-horizon', 'A newer horizon', 'later')]} reducedMotion />);
    expect(await screen.findByRole('button', { name: /A newer horizon.*Later horizon/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /A newer horizon.*Today horizon/ })).not.toBeInTheDocument();
  });

  it('returns the visible nucleus and orbit to defaults when a failed layout reset succeeds on Retry', () => {
    const key = 'mind-manual:atomic-layout:v1:guest';
    const task = bubble('retry-reset', 'Reset recovery task');
    const canonicalBefore = JSON.stringify(task);
    sessionStorage.setItem(key, JSON.stringify({ version: 1, scope: 'guest', updatedAt: 1,
      molecules: { work: { x: 120, y: -80, z: 48 } },
      orbits: { [JSON.stringify(['work', task.id])]: { domainId: 'work', taskId: task.id, shell: 'today', angle: Math.PI } },
    }));
    const onTimeHorizonUpdate = vi.fn();
    render(<AtomicRenderer bubbles={[task]} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const nucleus = screen.getByRole('button', { name: /^Work molecule/ });
    const electron = screen.getByRole('button', { name: /Reset recovery task.*Today horizon/ });
    fireEvent.click(screen.getByLabelText('Arrange molecule layout', { selector: 'button' }));
    const panel = within(screen.getByTestId('atomic-layout-panel'));
    const position = screen.getByTestId('atomic-layout-position');
    expect(position).toHaveAttribute('data-z', '48');
    expect(nucleus.parentElement).toHaveStyle({ left: 'calc(50% + 120px)' });
    expect(parseFloat(electron.style.left) + parseFloat(electron.style.width) / 2).toBeCloseTo(-64);

    vi.spyOn(sessionStorage, 'removeItem').mockImplementationOnce(() => { throw new Error('Storage unavailable'); });
    fireEvent.click(panel.getByLabelText('Reset molecule layout', { selector: 'button' }));
    expect(sessionStorage.getItem(key)).not.toBeNull();
    expect(position).toHaveAttribute('data-z', '48');
    fireEvent.click(panel.getByText(/Retry.*layout/i, { selector: 'button' }));

    // Layout writes and fireEvent's React updates are synchronous; inspect the
    // verified result directly without waiting on unrelated popover positioning.
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(position).toHaveAttribute('data-x', '0');
    expect(position).toHaveAttribute('data-y', '0');
    expect(position).toHaveAttribute('data-z', '0');
    expect(parseFloat(electron.style.left) + parseFloat(electron.style.width) / 2).toBeCloseTo(64);
    expect(parseFloat(electron.style.top) + parseFloat(electron.style.height) / 2).toBeCloseTo(0);
    expect(JSON.stringify(task)).toBe(canonicalBefore);
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
  });

  it('applies external removal of saved positions while retaining another particle placement and canonical horizons', () => {
    const key = 'mind-manual:atomic-layout:v1:guest';
    const removed = bubble('external-removed', 'Removed saved position');
    const retained = bubble('external-retained', 'Retained saved position');
    const tasks = [removed, retained];
    const canonicalBefore = JSON.stringify(tasks);
    const retainedOrbit = { domainId: 'work', taskId: retained.id, shell: 'today', angle: Math.PI / 2 };
    const retainedKey = JSON.stringify(['work', retained.id]);
    sessionStorage.setItem(key, JSON.stringify({ version: 1, scope: 'guest', updatedAt: 1,
      molecules: { work: { x: 120, y: -80, z: 48 } },
      orbits: {
        [JSON.stringify(['work', removed.id])]: { domainId: 'work', taskId: removed.id, shell: 'today', angle: Math.PI },
        [retainedKey]: retainedOrbit,
      },
    }));
    const onTimeHorizonUpdate = vi.fn();
    render(<AtomicRenderer bubbles={tasks} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const nucleus = screen.getByRole('button', { name: /^Work molecule/ });
    const removedElectron = screen.getByRole('button', { name: /Removed saved position.*Today horizon/ });
    const retainedElectron = screen.getByRole('button', { name: /Retained saved position.*Today horizon/ });
    const retainedPosition = { left: parseFloat(retainedElectron.style.left), top: parseFloat(retainedElectron.style.top) };
    expect(nucleus.parentElement).toHaveStyle({ left: 'calc(50% + 120px)' });

    act(() => {
      sessionStorage.setItem(key, JSON.stringify({ version: 1, scope: 'guest', updatedAt: 2,
        molecules: {}, orbits: { [retainedKey]: retainedOrbit },
      }));
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });

    expect(nucleus.parentElement).toHaveStyle({ left: 'calc(50% + 0px)', top: 'calc(50% + 0px)' });
    expect(parseFloat(removedElectron.style.left) + parseFloat(removedElectron.style.width) / 2).toBeCloseTo(64);
    expect(parseFloat(removedElectron.style.top) + parseFloat(removedElectron.style.height) / 2).toBeCloseTo(0);
    expect(parseFloat(retainedElectron.style.left)).toBeCloseTo(retainedPosition.left, 8);
    expect(parseFloat(retainedElectron.style.top)).toBeCloseTo(retainedPosition.top, 8);
    expect(JSON.stringify(tasks)).toBe(canonicalBefore);
    expect(onTimeHorizonUpdate).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)('ignores an old account\'s pending horizon %s after auth loading and a new account layout', async (outcome) => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const nextOwner = '22222222-2222-4222-8222-222222222222';
    const key = (id: string) => `mind-manual:atomic-layout:v1:account:${id}`;
    const stored = (id: string, x: number) => JSON.stringify({ version: 1, scope: `account:${id}`, updatedAt: 1,
      molecules: { work: { x, y: 0, z: 48 } }, orbits: {},
    });
    localStorage.setItem(key(owner), stored(owner, 120));
    localStorage.setItem(key(nextOwner), stored(nextOwner, 240));
    const nextSavedBefore = localStorage.getItem(key(nextOwner));
    authState.value = { user: { id: owner }, session: { user: { id: owner } }, loading: false };
    let resolveSave!: () => void;
    let rejectSave!: (error: Error) => void;
    const save = new Promise<void>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
    const onTimeHorizonUpdate = vi.fn(() => save);
    const initialTasks = [bubble('account-move', 'Account task', 'today')];
    const view = render(<AtomicRenderer bubbles={initialTasks} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Account task.*Today horizon/ });
    fireEvent.keyDown(electron, { key: 'ArrowRight' });
    expect(onTimeHorizonUpdate).toHaveBeenCalledWith('account-move', 0, 1);
    expect(screen.getByRole('button', { name: /Account task.*Week horizon/ })).toHaveAttribute('aria-busy', 'true');

    authState.value = { ...authState.value, loading: true };
    view.rerender(<AtomicRenderer bubbles={initialTasks} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    expect(screen.getByRole('button', { name: /^Work molecule/ }).parentElement).toHaveStyle({ left: 'calc(50% + 0px)' });
    const nextTasks = [bubble('account-move', 'Account task', 'later')];
    const canonicalBefore = JSON.stringify(nextTasks);
    authState.value = { user: { id: nextOwner }, session: { user: { id: nextOwner } }, loading: false };
    view.rerender(<AtomicRenderer bubbles={nextTasks} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    expect(screen.getByRole('button', { name: /^Work molecule/ }).parentElement).toHaveStyle({ left: 'calc(50% + 240px)' });
    expect(screen.getByRole('button', { name: /Account task.*Later horizon/ })).toHaveAttribute('aria-busy', 'false');
    toast.mockClear();

    await act(async () => {
      if (outcome === 'success') resolveSave(); else rejectSave(new Error('Old account save unavailable'));
      await save.catch(() => undefined);
    });

    expect(screen.getByRole('button', { name: /Account task.*Later horizon/ })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: /^Work molecule/ }).parentElement).toHaveStyle({ left: 'calc(50% + 240px)' });
    expect(localStorage.getItem(key(nextOwner))).toBe(nextSavedBefore);
    expect(sessionStorage.getItem('mind-manual:atomic-layout:v1:guest')).toBeNull();
    expect(JSON.stringify(nextTasks)).toBe(canonicalBefore);
    expect(toast).not.toHaveBeenCalled();
  });


  it('does not issue a late toast or layout write when a pending horizon save resolves after unmount', async () => {
    const key = 'mind-manual:atomic-layout:v1:guest';
    const existing = JSON.stringify({ version: 1, scope: 'guest', updatedAt: 1,
      molecules: { work: { x: 72, y: 18, z: 24 } }, orbits: {},
    });
    sessionStorage.setItem(key, existing);
    let resolveSave!: () => void;
    const save = new Promise<void>(resolve => { resolveSave = resolve; });
    const onTimeHorizonUpdate = vi.fn(() => save);
    const tasks = [bubble('unmounted-move', 'Leave while saving', 'today')];
    const canonicalBefore = JSON.stringify(tasks);
    const view = render(<AtomicRenderer bubbles={tasks} onTimeHorizonUpdate={onTimeHorizonUpdate} reducedMotion />);
    const electron = await screen.findByRole('button', { name: /Leave while saving.*Today horizon/ });
    fireEvent.keyDown(electron, { key: 'ArrowRight' });
    expect(onTimeHorizonUpdate).toHaveBeenCalledExactlyOnceWith('unmounted-move', 0, 1);
    expect(screen.getByRole('button', { name: /Leave while saving.*Week horizon/ })).toHaveAttribute('aria-busy', 'true');
    view.unmount();
    toast.mockClear();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => { resolveSave(); await save; });
    expect(toast).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(existing);
    expect(JSON.stringify(tasks)).toBe(canonicalBefore);
  });

});
