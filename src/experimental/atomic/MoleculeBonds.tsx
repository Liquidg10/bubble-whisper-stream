import type { MoleculeBond } from './moleculeBondModel';
import type { CanvasPoint } from '@/lib/canvasGeometry';

export function MoleculeBonds({
  bonds, scale, selectedIds, activeTaskPoints,
}: { bonds: MoleculeBond[]; scale: number; selectedIds: string[]; activeTaskPoints: CanvasPoint[] }) {
  return (
    <svg
      aria-hidden="true"
      className="atomic-bonds pointer-events-none absolute left-1/2 top-1/2 overflow-visible"
      width="1"
      height="1"
      data-testid="atomic-molecule-bonds"
    >
      {bonds.map(({ id, from, to, tasks }) => {
        const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        const nx = (to.x - from.x) / distance;
        const ny = (to.y - from.y) / distance;
        const clearance = Math.min(34 / Math.min(1, scale), distance / 3);
        const bend = Math.min(48, distance / 10);
        const midpoint = { x: (from.x + to.x) / 2 - ny * bend, y: (from.y + to.y) / 2 + nx * bend };
        const path = `M ${from.x + nx * clearance} ${from.y + ny * clearance} Q ${midpoint.x} ${midpoint.y} ${to.x - nx * clearance} ${to.y - ny * clearance}`;
        const selected = selectedIds.length === 0 || selectedIds.includes(from.id) || selectedIds.includes(to.id);
        return (
          <g key={id} data-bond-id={id} data-shared-task-count={tasks.length} opacity={selected ? 1 : 0.18}>
            <path d={path} className="atomic-bond-halo" strokeWidth={9 / scale} />
            <path d={path} className="atomic-bond-strand" strokeWidth={1.8 / scale} />
            <path d={path} className="atomic-bond-thread" strokeWidth={0.8 / scale} strokeDasharray={`${4 / scale} ${7 / scale}`} />
          </g>
        );
      })}
      {activeTaskPoints.slice(1).map((point, index) => (
        <path key={index} data-shared-electron-thread
          d={`M ${activeTaskPoints[0].x} ${activeTaskPoints[0].y} Q ${(activeTaskPoints[0].x + point.x) / 2 + 24} ${(activeTaskPoints[0].y + point.y) / 2 - 24} ${point.x} ${point.y}`}
          className="atomic-shared-electron-thread" strokeWidth={2 / scale}
          strokeDasharray={`${5 / scale} ${4 / scale}`} />
      ))}
    </svg>
  );
}
