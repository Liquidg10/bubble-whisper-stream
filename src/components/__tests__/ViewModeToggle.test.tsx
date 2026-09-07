import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ViewModeToggle } from '../ViewModeToggle';

const store = vi.hoisted(() => ({ settings: { viewMode: 'bubble' }, setViewMode: vi.fn() }));
vi.mock('@/stores/bubbleStore', () => ({ useBubbleStore: () => store }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="view-path">{location.pathname}</output>;
}

function mountView(path: string) {
  render(<MemoryRouter initialEntries={[path]}><ViewModeToggle /><LocationProbe /></MemoryRouter>);
}

beforeEach(() => { store.settings.viewMode = 'bubble'; store.setViewMode.mockClear(); });

describe('Canvas view navigation', () => {
  it('returns to the canvas with the requested atomic mode from another view', () => {
    mountView('/list');
    expect(screen.getByRole('button', { name: 'List view mode' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Atomic view mode' }));
    expect(store.setViewMode).toHaveBeenCalledWith('atomic');
    expect(screen.getByTestId('view-path')).toHaveTextContent(/^\/$/);
  });

  it('keeps the canvas preference when opening another representation', () => {
    store.settings.viewMode = 'atomic';
    mountView('/');
    expect(screen.getByRole('button', { name: 'Atomic view mode' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Pinboard view mode' }));
    expect(screen.getByTestId('view-path')).toHaveTextContent('/pinboard');
    expect(store.setViewMode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pinboard view mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('recognizes the existing board alias', () => {
    mountView('/kankav');
    expect(screen.getByRole('button', { name: 'Kanban view mode' })).toHaveAttribute('aria-pressed', 'true');
  });
});
