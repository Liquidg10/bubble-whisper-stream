import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SpatialAtomicScene, type SpatialMolecule } from '../SpatialAtomicScene';
import { fitSpatialCamera, orbitSpatialCamera, visibleSpatialElectrons, zoomSpatialCamera } from '../spatialGeometry';

const gpu = vi.hoisted(() => ({ fail: false, renderFails: false, render: vi.fn(), dispose: vi.fn(), setSize: vi.fn(), pixelRatio: vi.fn() }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    constructor() { if (gpu.fail) throw new Error('Synthetic unavailable context'); }
    setPixelRatio = gpu.pixelRatio; setSize = gpu.setSize; setClearColor = vi.fn(); dispose = gpu.dispose;
    render = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => { if (gpu.renderFails) throw new Error('Synthetic GPU failure'); scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); gpu.render(scene, camera); };
  } };
});

const molecule = (id = 'area'): SpatialMolecule => ({ id, label: 'Creativity', position: { x: 0, y: 0, z: 0 },
  electrons: [{ id: 'particle', taskId: 'task', label: 'Draw a shape', shell: 0, angle: 0.8 }] });
const bounds = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) };
const props = () => ({ molecules: [molecule()], bonds: [], onMoveMolecule: vi.fn(), onMoveElectron: vi.fn(), onSelectTask: vi.fn(), onSelectMolecule: vi.fn(), onUnavailable: vi.fn() });
let scheduled = new Map<number, FrameRequestCallback>(); let nextId = 1;
const captureDescriptors = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name)] as const);
function flushFrame(time = 16) { act(() => { const current = [...scheduled]; scheduled.clear(); for (const [, callback] of current) callback(time); }); }
function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: 'mouse' }, isPrimary: { value: true } });
  act(() => canvas.dispatchEvent(event));
}
function center(selector: string): { x: number; y: number } {
  const element = document.querySelector<HTMLElement>(selector)!;
  return { x: Number(element.dataset.screenX), y: Number(element.dataset.screenY) };
}

beforeEach(() => {
  vi.clearAllMocks(); gpu.fail = false; gpu.renderFails = false; scheduled = new Map(); nextId = 1;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(bounds);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = nextId++; scheduled.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => scheduled.delete(id));
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn(); HTMLCanvasElement.prototype.releasePointerCapture = vi.fn(); HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [name, descriptor] of captureDescriptors) {
    if (descriptor) Object.defineProperty(HTMLCanvasElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, name);
  }
});

describe('demand-driven WebGL lifecycle', () => {
  it('renders a real perspective scene once by default with no perpetual frame loop', () => {
    render(<SpatialAtomicScene {...props()} />); flushFrame();
    expect(screen.getByTestId('atomic-spatial-scene')).toHaveAttribute('data-renderer-status', 'ready');
    expect(gpu.render).toHaveBeenCalledOnce(); expect(scheduled.size).toBe(0);
    const [scene, camera] = gpu.render.mock.calls[0];
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    const spheres: THREE.Mesh[] = []; scene.traverse((object: THREE.Object3D) => { if (object instanceof THREE.Mesh && object.geometry instanceof THREE.SphereGeometry) spheres.push(object); });
    expect(spheres.length).toBeGreaterThanOrEqual(9);
    expect(screen.getByRole('button', { name: 'Creativity' })).toHaveAttribute('data-screen-x');
  });

  it('only continues orbit frames for explicit Play and stops under reduced motion', () => {
    const current = props(); const mounted = render(<SpatialAtomicScene {...current} />); flushFrame();
    mounted.rerender(<SpatialAtomicScene {...current} playing />); flushFrame(32); expect(scheduled.size).toBe(1);
    flushFrame(48); expect(scheduled.size).toBe(1);
    mounted.rerender(<SpatialAtomicScene {...current} playing reducedMotion />); flushFrame(64); expect(scheduled.size).toBe(0);
  });

  it('does not spin frames in a hidden document', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    render(<SpatialAtomicScene {...props()} playing />); flushFrame(); expect(scheduled.size).toBe(0);
  });

  it('keeps camera pose when molecule positions are committed and accepts explicit camera controls', () => {
    const current = props(); const camera = orbitSpatialCamera(fitSpatialCamera(current.molecules, 800 / 600), 0.5, 0.2);
    const mounted = render(<SpatialAtomicScene {...current} camera={camera} />); flushFrame();
    const initial = screen.getByTestId('atomic-spatial-scene').getAttribute('data-camera-position');
    mounted.rerender(<SpatialAtomicScene {...current} camera={camera} molecules={[{ ...molecule(), position: { x: 90, y: 20, z: 30 } }]} />); flushFrame();
    expect(screen.getByTestId('atomic-spatial-scene').getAttribute('data-camera-position')).toBe(initial);
    const turned = orbitSpatialCamera(camera, 0.25, 0);
    mounted.rerender(<SpatialAtomicScene {...current} camera={turned} />); flushFrame();
    expect(screen.getByTestId('atomic-spatial-scene').getAttribute('data-camera-position')).not.toBe(initial);
  });

  it('falls back cleanly when WebGL cannot be created', () => {
    gpu.fail = true; const current = props(); render(<SpatialAtomicScene {...current} />);
    expect(current.onUnavailable).toHaveBeenCalledWith('webgl-unavailable');
    expect(screen.getByTestId('atomic-spatial-scene')).toHaveAttribute('data-renderer-status', 'unavailable');
    expect(scheduled.size).toBe(0); expect(gpu.render).not.toHaveBeenCalled();
  });

  it('stops on context loss and releases resources on unmount', () => {
    const current = props(); const disposeGeometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const mounted = render(<SpatialAtomicScene {...current} playing />); flushFrame();
    fireEvent(screen.getByTestId('spatial-atomic-canvas'), new Event('webglcontextlost', { cancelable: true }));
    expect(current.onUnavailable).toHaveBeenCalledWith('context-lost'); expect(scheduled.size).toBe(0);
    mounted.unmount(); expect(gpu.dispose).toHaveBeenCalledOnce(); expect(disposeGeometry).toHaveBeenCalled();
    expect(scheduled.size).toBe(0);
  });

  it('falls back if rendering fails after initialization without queuing another frame', () => {
    const current = props(); render(<SpatialAtomicScene {...current} playing />); gpu.renderFails = true; flushFrame();
    expect(current.onUnavailable).toHaveBeenCalledWith('webgl-unavailable'); expect(scheduled.size).toBe(0);
  });

  it('retains static shared bond geometry while particles orbit', () => {
    const current = props(); current.molecules.push({ ...molecule('other'), position: { x: 360, y: 10, z: 100 }, electrons: [] });
    const bonds = [{ id: 'bond', fromMoleculeId: 'area', toMoleculeId: 'other' }];
    render(<SpatialAtomicScene {...current} bonds={bonds} playing />); flushFrame();
    const scene = gpu.render.mock.calls[0][0] as THREE.Scene;
    let tube: THREE.Mesh | undefined; scene.traverse(object => { if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TubeGeometry) tube = object; });
    const geometry = tube!.geometry; flushFrame(32); flushFrame(48); expect(tube!.geometry).toBe(geometry);
  });
});

describe('camera-plane object input and saved-state boundary', () => {
  it('preserves a nucleus grab offset after camera rotation and cancels without writes', () => {
    const current = props(); render(<SpatialAtomicScene {...current} camera={orbitSpatialCamera(fitSpatialCamera(current.molecules, 800 / 600), 0.5, 0.2)} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-molecule-label="area"]');
    pointer(canvas, 'pointerdown', start.x + 3, start.y + 2);
    pointer(canvas, 'pointermove', start.x + 43, start.y + 22); flushFrame();
    const moved = center('[data-molecule-label="area"]');
    expect(moved.x).toBeCloseTo(start.x + 40, 2); expect(moved.y).toBeCloseTo(start.y + 20, 2);
    fireEvent.keyDown(window, { key: 'Escape' }); flushFrame();
    expect(center('[data-molecule-label="area"]').x).toBeCloseTo(start.x, 2);
    expect(current.onMoveMolecule).not.toHaveBeenCalled(); expect(current.onMoveElectron).not.toHaveBeenCalled();
  });

  it('uses the final pointer-up coordinates and only saves the moved nucleus', async () => {
    const current = props(); render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-molecule-label="area"]');
    pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointerup', start.x + 70, start.y + 15);
    await act(async () => {});
    expect(current.onMoveMolecule).toHaveBeenCalledOnce(); expect(current.onMoveMolecule.mock.calls[0][0]).toBe('area');
    expect(current.onMoveMolecule.mock.calls[0][1].x).toBeGreaterThan(0); expect(current.onMoveElectron).not.toHaveBeenCalled();
  });

  it('opens a task on a tap, without treating it as a horizon change', async () => {
    const current = props(); render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-spatial-particle-id="particle"]');
    pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointerup', start.x, start.y); await act(async () => {});
    expect(current.onSelectTask).toHaveBeenCalledExactlyOnceWith('task'); expect(current.onMoveElectron).not.toHaveBeenCalled();
  });

  it('picks a small visible particle within its 44px target and identifies its flavor and horizon', async () => {
    const current = props(); current.molecules[0].electrons = [{ ...current.molecules[0].electrons[0], shell: 2, flavor: 'neutron' }];
    render(<SpatialAtomicScene {...current} camera={{ position: { x: 0, y: 0, z: 2000 }, target: { x: 0, y: 0, z: 0 } }} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-spatial-particle-id="particle"]');
    pointer(canvas, 'pointermove', start.x + 19, start.y); flushFrame();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Draw a shape · neutron · Later');
    pointer(canvas, 'pointerdown', start.x + 19, start.y); pointer(canvas, 'pointerup', start.x + 19, start.y); await act(async () => {});
    expect(current.onSelectTask).toHaveBeenCalledExactlyOnceWith('task'); expect(current.onMoveElectron).not.toHaveBeenCalled();
  });

  it('keeps particle and nucleus visual sizes readable when zoomed out', () => {
    const current = props(); render(<SpatialAtomicScene {...current} camera={zoomSpatialCamera(fitSpatialCamera(current.molecules, 800 / 600), 5)} />); flushFrame();
    const [scene, camera] = gpu.render.mock.calls[0] as [THREE.Scene, THREE.PerspectiveCamera];
    const sizes: { particle: boolean; diameter: number }[] = [];
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.userData.pick) return;
      const position = object.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse);
      const radius = object.getWorldScale(new THREE.Vector3()).x;
      const diameter = radius * 600 / (-position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      sizes.push({ particle: !!object.userData.pick.electronId, diameter });
    });
    expect(sizes.find(item => item.particle)!.diameter).toBeGreaterThanOrEqual(19.99);
    expect(Math.max(...sizes.filter(item => !item.particle).map(item => item.diameter))).toBeGreaterThanOrEqual(39.99);
  });

  it('does not select a pending particle through its expanded target', async () => {
    const current = props(); current.molecules[0].electrons = [{ ...current.molecules[0].electrons[0], shell: 2, pending: true }];
    render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-spatial-particle-id="particle"]');
    pointer(canvas, 'pointerdown', start.x + 19, start.y); pointer(canvas, 'pointerup', start.x + 19, start.y); await act(async () => {});
    expect(current.onSelectTask).not.toHaveBeenCalled(); expect(current.onMoveElectron).not.toHaveBeenCalled();
  });

  it('cancels a particle drag on lost capture and never starts a save', () => {
    const current = props(); render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-spatial-particle-id="particle"]');
    pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointermove', start.x + 45, start.y + 20);
    pointer(canvas, 'lostpointercapture', start.x + 45, start.y + 20); flushFrame();
    expect(current.onMoveElectron).not.toHaveBeenCalled(); expect(center('[data-spatial-particle-id="particle"]').x).toBeCloseTo(start.x, 2);
  });

  it('routes an actual particle drop through the canonical shell callback only', async () => {
    const current = props(); render(<SpatialAtomicScene {...current} camera={{ position: { x: 0, y: 0, z: 1000 }, target: { x: 0, y: 0, z: 0 } }} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-spatial-particle-id="particle"]');
    pointer(canvas, 'pointerdown', start.x + 3, start.y + 2); pointer(canvas, 'pointerup', start.x + 103, start.y + 22); await act(async () => {});
    expect(current.onMoveElectron).toHaveBeenCalledOnce();
    expect(current.onMoveElectron.mock.calls[0][0]).toMatchObject({ moleculeId: 'area', electronId: 'particle', taskId: 'task', fromShell: 0, shell: 2 });
    expect(Number.isFinite(current.onMoveElectron.mock.calls[0][0].angle)).toBe(true);
    expect(current.onMoveMolecule).not.toHaveBeenCalled(); expect(current.onSelectTask).not.toHaveBeenCalled();
    expect(current.molecules[0].electrons[0].shell).toBe(0);
  });

  it('restores the newest parent position after an outstanding save fails', async () => {
    const current = props(); let resolveMove: (result: boolean) => void = () => {};
    current.onMoveMolecule.mockImplementation(() => new Promise<boolean>(resolve => { resolveMove = resolve; }));
    const mounted = render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-molecule-label="area"]');
    pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointerup', start.x + 60, start.y + 10);
    mounted.rerender(<SpatialAtomicScene {...current} molecules={[{ ...molecule(), position: { x: -90, y: 0, z: 0 } }]} />);
    await act(async () => { resolveMove(false); }); flushFrame();
    expect(center('[data-molecule-label="area"]').x).toBeLessThan(start.x);
    expect(screen.getByRole('status')).toHaveTextContent('latest saved position'); expect(current.onMoveMolecule).toHaveBeenCalledOnce();
  });

  it('cancels an active drag if the source position changes externally', () => {
    const current = props(); const mounted = render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-molecule-label="area"]'); pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointermove', start.x + 20, start.y);
    mounted.rerender(<SpatialAtomicScene {...current} molecules={[{ ...molecule(), position: { x: 80, y: 90, z: 30 } }]} />);
    pointer(canvas, 'pointerup', start.x + 30, start.y); expect(current.onMoveMolecule).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('The item changed');
  });

  it.each(['false', 'throw'])('restores current props and reports %s save failure without a success claim', async failure => {
    const current = props();
    current.onMoveMolecule.mockImplementation(() => { if (failure === 'throw') throw new Error('Synthetic save failure'); return false; });
    render(<SpatialAtomicScene {...current} />); flushFrame();
    const canvas = screen.getByTestId('spatial-atomic-canvas') as HTMLCanvasElement;
    const start = center('[data-molecule-label="area"]'); pointer(canvas, 'pointerdown', start.x, start.y); pointer(canvas, 'pointerup', start.x + 60, start.y + 10);
    await act(async () => {}); flushFrame();
    expect(screen.getByRole('status')).toHaveTextContent('could not be saved'); expect(center('[data-molecule-label="area"]').x).toBeCloseTo(start.x, 2);
  });

  it('offers a visible life-area button that selects without dragging', () => {
    const current = props(); render(<SpatialAtomicScene {...current} />); flushFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Creativity' }));
    expect(current.onSelectMolecule).toHaveBeenCalledExactlyOnceWith('area'); expect(current.onMoveMolecule).not.toHaveBeenCalled();
  });
});

describe('bounded visible geometry', () => {
  it('honors shell capacities and the global cap without mutating source arrays', () => {
    const dense = Array.from({ length: 20 }, (_, index): SpatialMolecule => ({ ...molecule(String(index)), electrons: Array.from({ length: 70 }, (_, electron) => ({ id: `e${electron}`, taskId: `t${electron}`, label: 'Task', shell: (electron % 3) as 0 | 1 | 2, angle: electron })) }));
    const before = structuredClone(dense); const visible = visibleSpatialElectrons(dense);
    expect(visible).toHaveLength(320); expect(dense).toEqual(before);
    const first = visible.filter(item => item.molecule.id === '0'); expect([0, 1, 2].map(shell => first.filter(item => item.electron.shell === shell).length)).toEqual([8, 14, 21]);
  });
});
