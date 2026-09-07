import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  addSpatialPoints, closestSpatialOrbit, createSpatialDragPlane, fitSpatialCamera,
  isSpatialPoint, moveOnSpatialDragPlane, spatialOrbitPoint, subtractSpatialPoints,
  SPATIAL_FIELD_OF_VIEW, visibleSpatialElectrons,
  type SpatialCamera, type SpatialDragPlane, type SpatialPoint, type SpatialRay, type SpatialShell,
  type SpatialElectron, type SpatialMolecule, type SpatialBond, type SpatialElectronMove,
} from './spatialGeometry';
import './spatial-atomic.css';

export type { SpatialElectron, SpatialMolecule, SpatialBond, SpatialElectronMove } from './spatialGeometry';
type MoveResult = void | boolean | Promise<void | boolean>;
export interface SpatialAtomicSceneProps {
  molecules: readonly SpatialMolecule[];
  bonds: readonly SpatialBond[];
  camera?: SpatialCamera | null;
  playing?: boolean;
  reducedMotion?: boolean;
  onMoveMolecule: (id: string, position: SpatialPoint) => MoveResult;
  onMoveElectron: (move: SpatialElectronMove) => MoveResult;
  onSelectTask: (taskId: string) => void;
  onSelectMolecule?: (id: string) => void;
  onCameraChange?: (camera: SpatialCamera) => void;
  onUnavailable?: (reason: 'webgl-unavailable' | 'context-lost') => void;
}

const world = (point: SpatialPoint) => new THREE.Vector3(point.x, -point.y, point.z);
const appPoint = (point: THREE.Vector3): SpatialPoint => ({ x: point.x, y: -point.y, z: point.z });
const particleKey = (moleculeId: string, electronId: string) => JSON.stringify([moleculeId, electronId]);
const samePoint = (a: SpatialPoint, b: SpatialPoint) => a.x === b.x && a.y === b.y && a.z === b.z;
const shellNames = ['Today', 'Week', 'Later'];

interface Hit { moleculeId: string; electronId?: string }
interface Drag extends Hit {
  pointerId: number;
  startX: number;
  startY: number;
  original: SpatialPoint;
  current: SpatialPoint;
  moleculePosition: SpatialPoint;
  electron?: SpatialElectron;
  plane: SpatialDragPlane;
  moved: boolean;
}
interface Runtime {
  update: () => void;
  updateCamera: () => void;
  requestRender: () => void;
}

/** Real perspective scene. Rendering is demand-driven except explicitly enabled orbit motion. */
export function SpatialAtomicScene(props: SpatialAtomicSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const runtimeRef = useRef<Runtime | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const particleRefs = useRef(new Map<string, HTMLSpanElement>());
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [message, setMessage] = useState('');
  const [selection, setSelection] = useState<{ moleculeId?: string; taskId?: string }>({});
  const helpId = useId();
  const visible = visibleSpatialElectrons(props.molecules);
  const omitted = Math.max(0, props.molecules.reduce((count, molecule) => count + molecule.electrons.length, 0) - visible.length);

  useEffect(() => {
    const canvas = canvasRef.current; const host = hostRef.current;
    if (!canvas || !host) return;
    let disposed = false; let unavailable = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setStatus('unavailable');
      propsRef.current.onUnavailable?.('webgl-unavailable');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor('#edf4f0', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(SPATIAL_FIELD_OF_VIEW, 1, 0.5, 1_000_000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false; controls.autoRotate = false;
    controls.minDistance = 120; controls.maxDistance = 250_000;
    controls.minPolarAngle = 0.06; controls.maxPolarAngle = Math.PI - 0.06;
    controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.85;
    const hemisphere = new THREE.HemisphereLight('#f8fffd', '#789187', 2.6); scene.add(hemisphere);
    const key = new THREE.DirectionalLight('#fff6e8', 3.4); key.position.set(-500, 800, 1000); scene.add(key);
    const rim = new THREE.DirectionalLight('#bde7df', 2.1); rim.position.set(700, -100, -450); scene.add(rim);
    const content = new THREE.Group(); const bondGroup = new THREE.Group(); scene.add(content, bondGroup);
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const materials = new Map<string, THREE.MeshPhysicalMaterial>();
    const sharedGeometry = new Set<THREE.BufferGeometry>([sphere]);
    const sharedMaterials = new Set<THREE.Material>();
    const material = (color: string, flavor: string) => {
      const id = `${color}:${flavor}`;
      if (!materials.has(id)) {
        const value = new THREE.MeshPhysicalMaterial({ color, roughness: flavor === 'neutron' ? 0.32 : 0.2,
          metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.12,
          emissive: flavor === 'highlight' ? color : '#000000', emissiveIntensity: flavor === 'highlight' ? 0.24 : 0 });
        materials.set(id, value); sharedMaterials.add(value);
      }
      return materials.get(id)!;
    };
    const groups = new Map<string, THREE.Group>();
    const nuclei = new Map<string, THREE.Group>();
    const particles = new Map<string, { mesh: THREE.Mesh; molecule: SpatialMolecule; electron: SpatialElectron }>();
    const previousElectrons = new Map<string, { angle: number; shell: SpatialShell }>();
    const motionOffsets = new Map<string, number>();
    const renderedBonds: { bond: SpatialBond; mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>; start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    let hitObjects: THREE.Object3D[] = [];
    let pendingPreview: Drag | null = null;
    let drag: Drag | null = null;
    let frame = 0; let phase = 0; let lastFrame = 0;
    let hover = false; let hovered: Hit | undefined; let width = 1; let height = 1;
    let initialCamera = true;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function disposeGroup(group: THREE.Group) {
      group.traverse(object => {
        const drawable = object as THREE.Mesh;
        if (drawable.geometry && !sharedGeometry.has(drawable.geometry)) drawable.geometry.dispose();
        if (drawable.material) for (const value of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
          if (!sharedMaterials.has(value)) value.dispose();
        }
      });
      group.clear();
    }
    function snapshotCamera(): SpatialCamera { return { position: appPoint(camera.position), target: appPoint(controls.target) }; }
    function applyCamera(next: SpatialCamera) {
      if (!isSpatialPoint(next.position) || !isSpatialPoint(next.target) || world(next.position).distanceTo(world(next.target)) < 1) return;
      camera.position.copy(world(next.position)); controls.target.copy(world(next.target)); controls.update();
      camera.updateMatrixWorld(true);
    }
    function updateCamera() {
      if (propsRef.current.camera) { applyCamera(propsRef.current.camera); initialCamera = false; }
      else if (initialCamera) { applyCamera(fitSpatialCamera(propsRef.current.molecules, width / height)); initialCamera = false; }
      requestRender();
    }
    function makeSphere(color: string, radius: number, flavor: string, point: SpatialPoint, parent: THREE.Group): THREE.Mesh {
      const mesh = new THREE.Mesh(sphere, material(color, flavor)); mesh.scale.setScalar(radius); mesh.position.copy(world(point)); parent.add(mesh); return mesh;
    }
    function previewPosition() {
      const current = drag ?? pendingPreview;
      if (!current) return;
      if (current.electronId) {
        particles.get(particleKey(current.moleculeId, current.electronId))?.mesh.position.copy(world(subtractSpatialPoints(current.current, current.moleculePosition)));
      } else groups.get(current.moleculeId)?.position.copy(world(current.current));
    }
    function placeParticles() {
      // Cancelling a nucleus preview must restore its group, as well as its particles.
      for (const molecule of propsRef.current.molecules) groups.get(molecule.id)?.position.copy(world(molecule.position));
      for (const [id, item] of particles) {
        const angle = item.electron.angle + phase + (motionOffsets.get(id) ?? 0);
        item.mesh.position.copy(world(spatialOrbitPoint(item.electron.shell, angle)));
      }
      previewPosition();
    }
    function bondEndpoint(moleculeId: string, electronId?: string): THREE.Vector3 | undefined {
      if (electronId) return particles.get(particleKey(moleculeId, electronId))?.mesh.getWorldPosition(new THREE.Vector3());
      return groups.get(moleculeId)?.getWorldPosition(new THREE.Vector3());
    }
    function buildBonds() {
      disposeGroup(bondGroup); renderedBonds.length = 0; content.updateMatrixWorld(true);
      for (const bond of propsRef.current.bonds.slice(0, 512)) {
        const start = bondEndpoint(bond.fromMoleculeId, bond.fromElectronId);
        const end = bondEndpoint(bond.toMoleculeId, bond.toElectronId);
        if (!start || !end || start.distanceTo(end) < 0.01) continue;
        const midpoint = start.clone().add(end).multiplyScalar(0.5);
        midpoint.z += Math.min(55, start.distanceTo(end) * 0.13);
        const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
        const color = bond.kind === 'tradeoff' ? '#ba7287' : bond.kind === 'depends-on' ? '#bd913f' : '#6c9f95';
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, bond.highlighted ? 3.6 : 1.4, 5, false),
          new THREE.MeshStandardMaterial({ color, roughness: 0.45, transparent: true, opacity: bond.highlighted ? 0.98 : 0.4,
            emissive: color, emissiveIntensity: bond.highlighted ? 0.18 : 0 }));
        bondGroup.add(tube);
        renderedBonds.push({ bond, mesh: tube, start, end });
      }
    }
    function updateBondPositions(particlesOnly = false) {
      content.updateMatrixWorld(true);
      for (const item of renderedBonds) {
        if (particlesOnly && !item.bond.fromElectronId && !item.bond.toElectronId) continue;
        const start = bondEndpoint(item.bond.fromMoleculeId, item.bond.fromElectronId);
        const end = bondEndpoint(item.bond.toMoleculeId, item.bond.toElectronId);
        if (!start || !end) { item.mesh.visible = false; continue; }
        if (start.distanceToSquared(item.start) < 0.000001 && end.distanceToSquared(item.end) < 0.000001) continue;
        item.start = start; item.end = end; item.mesh.visible = true;
        const midpoint = start.clone().add(end).multiplyScalar(0.5); midpoint.z += Math.min(55, start.distanceTo(end) * 0.13);
        const geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, midpoint, end), 12, item.bond.highlighted ? 3.6 : 1.4, 5, false);
        item.mesh.geometry.dispose(); item.mesh.geometry = geometry;
      }
    }
    function update() {
      if (disposed || unavailable) return;
      const currentProps = propsRef.current;
      if (drag) {
        const molecule = currentProps.molecules.find(item => item.id === drag!.moleculeId);
        const electron = drag.electronId ? molecule?.electrons.find(item => item.id === drag!.electronId) : undefined;
        if (!molecule || !samePoint(molecule.position, drag.moleculePosition) || (drag.electron && (!electron || electron.pending || electron.shell !== drag.electron.shell || electron.angle !== drag.electron.angle))) {
          cancelDrag('The item changed. Its latest saved position is shown.');
        }
      }
      disposeGroup(content); groups.clear(); nuclei.clear(); particles.clear(); hitObjects = [];
      for (const molecule of currentProps.molecules) {
        if (!isSpatialPoint(molecule.position) || groups.has(molecule.id)) continue;
        const group = new THREE.Group(); group.position.copy(world(molecule.position)); content.add(group); groups.set(molecule.id, group);
        const nucleus = new THREE.Group(); group.add(nucleus); nuclei.set(molecule.id, nucleus);
        const nucleons = [[0, 0, 0], [10, 4, 6], [-10, -2, 5], [2, 12, -4], [-3, -11, -5], [6, -4, -12], [-6, 3, 12]];
        nucleons.forEach(([x, y, z], index) => {
          const proton = index % 2 === 0;
          const mesh = makeSphere(proton ? '#ca7486' : '#559989', 10, proton ? 'proton' : 'neutron', { x, y, z }, nucleus);
          mesh.userData.pick = { moleculeId: molecule.id }; hitObjects.push(mesh);
        });
        const tint = /^#[0-9a-f]{6}$/iu.test(molecule.color ?? '') ? molecule.color! : '#bad7cc';
        const membrane = new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({ color: tint, transparent: true,
          opacity: molecule.selected ? 0.4 : 0.2, roughness: 0.12, metalness: 0, clearcoat: 1, depthWrite: false }));
        membrane.scale.setScalar(28); membrane.userData.pick = { moleculeId: molecule.id }; nucleus.add(membrane); hitObjects.push(membrane);
        for (const shell of [0, 1, 2] as const) {
          const points = Array.from({ length: 97 }, (_, index) => world(spatialOrbitPoint(shell, index * Math.PI * 2 / 96)));
          const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
            color: ['#a36b7b', '#a88943', '#598f81'][shell], transparent: true, opacity: 0.78,
          }));
          group.add(loop);
        }
      }
      const alive = new Set<string>();
      for (const { molecule, electron } of visibleSpatialElectrons(currentProps.molecules)) {
        const group = groups.get(molecule.id); if (!group) continue;
        const id = particleKey(molecule.id, electron.id); alive.add(id);
        const previous = previousElectrons.get(id);
        if (previous && (previous.angle !== electron.angle || previous.shell !== electron.shell)) motionOffsets.set(id, -phase);
        previousElectrons.set(id, { angle: electron.angle, shell: electron.shell });
        const color = electron.flavor === 'proton' ? '#cd748b' : electron.flavor === 'neutron' ? '#57998c' : '#c79232';
        const mesh = makeSphere(electron.completed ? '#79a991' : color, electron.highlighted ? 11 : 8.5,
          electron.highlighted ? 'highlight' : electron.flavor ?? 'electron', spatialOrbitPoint(electron.shell, electron.angle), group);
        mesh.userData.pick = { moleculeId: molecule.id, electronId: electron.id };
        particles.set(id, { mesh, molecule, electron }); if (!electron.pending) hitObjects.push(mesh);
      }
      for (const id of previousElectrons.keys()) if (!alive.has(id)) { previousElectrons.delete(id); motionOffsets.delete(id); }
      placeParticles(); buildBonds(); requestRender();
    }
    function rayFor(event: { clientX: number; clientY: number }): SpatialRay {
      const bounds = canvas.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1, -(event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 + 1);
      camera.updateMatrixWorld(true); content.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera);
      return { origin: appPoint(raycaster.ray.origin), direction: appPoint(raycaster.ray.direction) };
    }
    function hitAt(event: { clientX: number; clientY: number }): Hit | undefined {
      rayFor(event);
      const exact = raycaster.intersectObjects(hitObjects, false)[0]?.object.userData.pick as Hit | undefined;
      if (exact) return exact;
      // A 44px target around each visible center preserves tap usability when zoomed out.
      // Check visibility along its own center ray so hidden particles cannot steal a pick.
      const bounds = canvas.getBoundingClientRect();
      const candidates: { hit: Hit; distance: number; depth: number }[] = [];
      const consider = (hit: Hit, point: THREE.Vector3) => {
        const projected = project(point);
        const distance = Math.hypot(projected.x - (event.clientX - bounds.left), projected.y - (event.clientY - bounds.top));
        if (!projected.visible || distance > 22) return;
        rayFor({ clientX: bounds.left + projected.x, clientY: bounds.top + projected.y });
        const front = raycaster.intersectObjects(hitObjects, false)[0]?.object.userData.pick as Hit | undefined;
        if (front && (front.moleculeId !== hit.moleculeId || front.electronId !== hit.electronId)) return;
        candidates.push({ hit, distance, depth: point.distanceToSquared(camera.position) });
      };
      for (const [moleculeId, group] of groups) consider({ moleculeId }, group.getWorldPosition(new THREE.Vector3()));
      for (const item of particles.values()) if (!item.electron.pending) consider({ moleculeId: item.molecule.id, electronId: item.electron.id }, item.mesh.getWorldPosition(new THREE.Vector3()));
      candidates.sort((a, b) => a.distance - b.distance || a.depth - b.depth);
      return candidates[0]?.hit;
    }
    function releaseCapture(pointerId: number) {
      try { if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId); } catch { /* Already released by the browser. */ }
    }
    function cancelDrag(announcement = 'Move cancelled. Nothing was saved.') {
      const current = drag; drag = null;
      if (!current) return;
      releaseCapture(current.pointerId); controls.enabled = !pendingPreview;
      placeParticles(); updateBondPositions(); requestRender(); if (!disposed) setMessage(announcement);
    }
    function moveDrag(event: PointerEvent) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = moveOnSpatialDragPlane(rayFor(event), drag.plane);
      if (!next || !isSpatialPoint(next)) return;
      drag.current = next;
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6;
      previewPosition(); updateBondPositions(); requestRender();
    }
    function down(event: PointerEvent) {
      if (disposed || unavailable || event.button !== 0 || drag || pendingPreview) return;
      const hit = hitAt(event); if (!hit) return;
      const molecule = propsRef.current.molecules.find(item => item.id === hit.moleculeId);
      const particle = hit.electronId ? particles.get(particleKey(hit.moleculeId, hit.electronId)) : undefined;
      if (!molecule || particle?.electron.pending) return;
      const original = particle ? appPoint(particle.mesh.getWorldPosition(new THREE.Vector3())) : { ...molecule.position };
      const plane = createSpatialDragPlane(rayFor(event), original, appPoint(camera.getWorldDirection(new THREE.Vector3())));
      if (!plane) return;
      // CSS touch-action owns touch manipulation. Keep its native event stream
      // intact so a later tap on an ordinary control can synthesize its click.
      if (event.pointerType !== 'touch') event.preventDefault();
      event.stopImmediatePropagation();
      controls.enabled = false; hover = true;
      drag = { ...hit, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        original, current: original, moleculePosition: { ...molecule.position }, electron: particle?.electron, plane, moved: false };
      setSelection({ moleculeId: hit.moleculeId, taskId: particle?.electron.taskId });
      setMessage(particle ? `Moving ${particle.electron.label}. Release near a shell, or press Escape to cancel.` : `Moving ${molecule.label} in the camera’s plane. Press Escape to cancel.`);
      try { canvas.setPointerCapture(event.pointerId); } catch { cancelDrag(); }
    }
    function move(event: PointerEvent) {
      if (disposed || unavailable) return;
      if (drag) {
        if (event.pointerType !== 'touch') event.preventDefault();
        event.stopImmediatePropagation(); moveDrag(event); return;
      }
      const next = hitAt(event); const changed = hovered?.moleculeId !== next?.moleculeId || hovered?.electronId !== next?.electronId;
      if (hover !== !!next || changed) { hovered = next; hover = !!next; requestRender(); }
    }
    async function up(event: PointerEvent) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.pointerType !== 'touch') event.preventDefault();
      event.stopImmediatePropagation();
      moveDrag(event); // Pointer-up may contain a final position with no pointermove.
      const current = drag; drag = null; releaseCapture(current.pointerId);
      if (!current.moved) {
        controls.enabled = true; placeParticles(); requestRender();
        if (current.electron) propsRef.current.onSelectTask(current.electron.taskId);
        else propsRef.current.onSelectMolecule?.(current.moleculeId);
        return;
      }
      pendingPreview = current; controls.enabled = false;
      let electronMove: SpatialElectronMove | undefined;
      if (current.electron && current.electronId) {
        const candidate = closestSpatialOrbit(subtractSpatialPoints(current.current, current.moleculePosition), current.electron.angle);
        current.current = addSpatialPoints(current.moleculePosition, candidate.position);
        electronMove = { moleculeId: current.moleculeId, electronId: current.electronId, taskId: current.electron.taskId,
          fromShell: current.electron.shell, shell: candidate.shell, angle: candidate.angle };
      }
      previewPosition(); updateBondPositions(); requestRender();
      setMessage('Saving the move…');
      try {
        const result = await (electronMove ? propsRef.current.onMoveElectron(electronMove) : propsRef.current.onMoveMolecule(current.moleculeId, current.current));
        if (result === false) throw new Error('Move not saved');
        if (!disposed) setMessage(electronMove ? `Move saved in ${shellNames[electronMove.shell]}.` : 'Life-area position saved.');
      } catch {
        if (!disposed) setMessage('The move could not be saved. Its latest saved position is shown.');
      } finally {
        pendingPreview = null; controls.enabled = true;
        // Parent state is authoritative, including slot correction and concurrent updates.
        if (!disposed) update();
      }
    }
    function cancelled(event: PointerEvent) { if (drag?.pointerId === event.pointerId) cancelDrag(); }
    function escaped(event: KeyboardEvent) { if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); cancelDrag(); } }
    function leave() { hover = false; hovered = undefined; requestRender(); }
    function contextLost(event: Event) {
      event.preventDefault(); unavailable = true;
      if (frame) cancelAnimationFrame(frame); frame = 0;
      cancelDrag(); controls.enabled = false;
      setStatus('unavailable'); propsRef.current.onUnavailable?.('context-lost');
    }
    function project(point: THREE.Vector3) {
      const projected = point.clone().project(camera);
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2,
        visible: projected.z > -1 && projected.z < 1 && projected.x > -1.1 && projected.x < 1.1 && projected.y > -1.1 && projected.y < 1.1 };
    }
    function sizeVisibleParticles() {
      const worldUnitsPerPixel = (point: THREE.Vector3) => {
        const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
        return Math.max(0, depth) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
      };
      content.updateMatrixWorld(true);
      for (const nucleus of nuclei.values()) nucleus.scale.setScalar(Math.max(1, worldUnitsPerPixel(nucleus.getWorldPosition(new THREE.Vector3())) * 20 / 28));
      for (const item of particles.values()) item.mesh.scale.setScalar(Math.max(item.electron.highlighted ? 11 : 8.5, worldUnitsPerPixel(item.mesh.getWorldPosition(new THREE.Vector3())) * 10));
    }
    function updateOverlay() {
      content.updateMatrixWorld(true);
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      const particleCenters = [...particles.values()].map(item => project(item.mesh.getWorldPosition(new THREE.Vector3()))).filter(point => point.visible);
      for (const [id, label] of labelRefs.current) {
        const group = groups.get(id); const projected = group ? project(group.getWorldPosition(new THREE.Vector3())) : undefined;
        label.hidden = !projected?.visible;
        if (projected && group) {
          const shell = Array.from({ length: 32 }, (_, index) => project(group.localToWorld(world(spatialOrbitPoint(2, index * Math.PI / 16)))));
          const left = Math.min(...shell.map(point => point.x)); const right = Math.max(...shell.map(point => point.x));
          const bottom = Math.max(...shell.map(point => point.y)); const top = Math.min(...shell.map(point => point.y));
          const labelWidth = Math.min(136, label.offsetWidth || 136); const labelHeight = Math.min(62, label.offsetHeight || 44);
          const candidates = [
            { x: projected.x, y: bottom + 12 }, { x: projected.x, y: top - labelHeight - 12 },
            { x: right + labelWidth / 2 + 12, y: projected.y - labelHeight / 2 },
            { x: left - labelWidth / 2 - 12, y: projected.y - labelHeight / 2 },
            { x: projected.x, y: projected.y + 38 },
          ].map(point => ({ x: Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, point.x)), y: Math.max(8, Math.min(height - labelHeight - 8, point.y)) }));
          const cost = (point: { x: number; y: number }) => {
            const x = point.x - labelWidth / 2; const y = point.y;
            const labels = occupied.filter(rect => x < rect.x + rect.width + 8 && x + labelWidth + 8 > rect.x && y < rect.y + rect.height + 8 && y + labelHeight + 8 > rect.y).length;
            const coveredParticles = particleCenters.filter(item => item.x > x - 22 && item.x < x + labelWidth + 22 && item.y > y - 22 && item.y < y + labelHeight + 22).length;
            return labels * 100 + coveredParticles * 10;
          };
          const location = candidates.reduce((best, point) => cost(point) < cost(best) ? point : best);
          label.style.left = `${location.x}px`; label.style.top = `${location.y}px`; label.dataset.screenX = String(projected.x); label.dataset.screenY = String(projected.y);
          occupied.push({ x: location.x - labelWidth / 2, y: location.y, width: labelWidth, height: labelHeight });
        }
      }
      const tooltip = tooltipRef.current;
      if (tooltip) {
        const item = hovered?.electronId ? particles.get(particleKey(hovered.moleculeId, hovered.electronId)) : undefined;
        const molecule = propsRef.current.molecules.find(value => value.id === hovered?.moleculeId);
        const point = item?.mesh.getWorldPosition(new THREE.Vector3()) ?? (molecule ? groups.get(molecule.id)?.getWorldPosition(new THREE.Vector3()) : undefined);
        const projected = point ? project(point) : undefined;
        tooltip.hidden = !projected?.visible || !!drag;
        if (projected && molecule) {
          tooltip.textContent = item ? `${item.electron.label} · ${item.electron.flavor ?? 'electron'} · ${shellNames[item.electron.shell]}` : `${molecule.label} · life-area nucleus`;
          tooltip.style.left = `${Math.max(112, Math.min(width - 112, projected.x))}px`; tooltip.style.top = `${Math.max(8, projected.y - 68)}px`;
        }
      }
      for (const [id, element] of particleRefs.current) {
        const particle = particles.get(id); const position = particle?.mesh.getWorldPosition(new THREE.Vector3()); const projected = position ? project(position) : undefined;
        element.dataset.visible = String(!!projected?.visible);
        if (projected && position) {
          element.dataset.screenX = String(projected.x); element.dataset.screenY = String(projected.y);
          const point = appPoint(position); element.dataset.worldX = String(point.x); element.dataset.worldY = String(point.y); element.dataset.worldZ = String(point.z);
        }
      }
      const view = snapshotCamera(); host.dataset.cameraPosition = JSON.stringify(view.position); host.dataset.cameraTarget = JSON.stringify(view.target);
    }
    function wantsMotion() { return propsRef.current.playing === true && propsRef.current.reducedMotion !== true && !document.hidden && !drag && !pendingPreview && !hover; }
    function render(time: number) {
      frame = 0;
      if (disposed || unavailable) return;
      if (wantsMotion()) {
        phase += Math.min(50, lastFrame ? time - lastFrame : 0) * 0.00012;
        placeParticles(); updateBondPositions(true);
      }
      lastFrame = time;
      try { sizeVisibleParticles(); renderer.render(scene, camera); updateOverlay(); }
      catch {
        unavailable = true; setStatus('unavailable'); propsRef.current.onUnavailable?.('webgl-unavailable');
        return;
      }
      if (wantsMotion()) requestRender();
    }
    function requestRender() { if (!disposed && !unavailable && !frame) frame = requestAnimationFrame(render); }
    function resize() {
      const bounds = host.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); requestRender();
    }
    function cameraChanged() { requestRender(); }
    function cameraEnded() { if (!drag && !pendingPreview) propsRef.current.onCameraChange?.(snapshotCamera()); }
    controls.addEventListener('change', cameraChanged); controls.addEventListener('end', cameraEnded);
    canvas.addEventListener('pointerdown', down, true); canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true); canvas.addEventListener('pointercancel', cancelled, true);
    canvas.addEventListener('lostpointercapture', cancelled, true); canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('webglcontextlost', contextLost); window.addEventListener('keydown', escaped);
    document.addEventListener('visibilitychange', requestRender);
    const observer = new ResizeObserver(resize); observer.observe(host);
    resize(); updateCamera(); update(); setStatus('ready');
    runtimeRef.current = { update, updateCamera, requestRender };
    return () => {
      disposed = true; runtimeRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      if (drag) releaseCapture(drag.pointerId);
      observer.disconnect(); controls.removeEventListener('change', cameraChanged); controls.removeEventListener('end', cameraEnded); controls.dispose();
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true); canvas.removeEventListener('pointercancel', cancelled, true);
      canvas.removeEventListener('lostpointercapture', cancelled, true); canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', contextLost); window.removeEventListener('keydown', escaped);
      document.removeEventListener('visibilitychange', requestRender);
      disposeGroup(content); disposeGroup(bondGroup); sphere.dispose(); for (const value of materials.values()) value.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => { runtimeRef.current?.update(); }, [props.molecules, props.bonds]);
  useEffect(() => { runtimeRef.current?.updateCamera(); }, [props.camera]);
  useEffect(() => { runtimeRef.current?.requestRender(); }, [props.playing, props.reducedMotion]);

  return <div ref={hostRef} className="atomic-spatial-scene" data-testid="atomic-spatial-scene" data-renderer-status={status}
    data-selected-molecule-id={selection.moleculeId} data-selected-task-id={selection.taskId}>
    <canvas ref={canvasRef} data-testid="spatial-atomic-canvas" className="atomic-spatial-canvas" aria-label="Three-dimensional life-area map" aria-describedby={helpId} />
    <div className="atomic-spatial-labels" aria-label="Life areas in the spatial scene">
      {props.molecules.map(molecule => <button key={molecule.id} ref={element => { if (element) labelRefs.current.set(molecule.id, element); else labelRefs.current.delete(molecule.id); }}
        type="button" className="atomic-spatial-label" data-molecule-id={molecule.id} data-molecule-label={molecule.id} aria-pressed={molecule.selected === true}
        onClick={() => { setSelection({ moleculeId: molecule.id }); props.onSelectMolecule?.(molecule.id); }}>{molecule.label}</button>)}
    </div>
    <div ref={tooltipRef} hidden role="tooltip" className="atomic-spatial-tooltip" />
    {visible.map(({ molecule, electron }) => <span key={particleKey(molecule.id, electron.id)} hidden aria-hidden="true"
      ref={element => { const id = particleKey(molecule.id, electron.id); if (element) particleRefs.current.set(id, element); else particleRefs.current.delete(id); }}
      data-spatial-particle-id={electron.id} data-task-id={electron.taskId} data-molecule-id={molecule.id} data-shell={electron.shell} data-angle={electron.angle} />)}
    <p id={helpId} className="sr-only">Drag empty space to turn the camera. Pinch or scroll to zoom. Drag a life area or particle to move it; Escape cancels. The Layout and Tasks controls provide the same actions without dragging.</p>
    {omitted > 0 && <p className="atomic-spatial-density">{omitted} more {omitted === 1 ? 'task remains' : 'tasks remain'} in the Tasks navigator.</p>}
    <p className="sr-only" role="status" aria-live="polite">{message}</p>
    {status === 'unavailable' && <div className="atomic-spatial-fallback" role="status">The 3D view is unavailable here. Your flat view and saved tasks are still available.</div>}
  </div>;
}

export default SpatialAtomicScene;
