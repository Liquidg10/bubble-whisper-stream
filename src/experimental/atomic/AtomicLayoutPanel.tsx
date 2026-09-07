import { useId, useState } from 'react';
import { Move, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ArrangeMolecule {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  particles: { id: string; label: string; shell: number }[];
}
interface Props {
  molecules: ArrangeMolecule[];
  status: string;
  message: string;
  canUndo: boolean;
  onMove: (id: string, offset: { x: number; y: number; z: number }) => void;
  onTurnParticle: (moleculeId: string, particleId: string, direction: number) => void;
  onReset: () => void;
  onUndo: () => void;
  onRetry: () => void;
}
const MOVEMENTS = [
  { label: 'Left', name: 'left', x: -24, y: 0, z: 0 },
  { label: 'Right', name: 'right', x: 24, y: 0, z: 0 },
  { label: 'Up', name: 'up', x: 0, y: -24, z: 0 },
  { label: 'Down', name: 'down', x: 0, y: 24, z: 0 },
  { label: 'Nearer', name: 'nearer', x: 0, y: 0, z: 24 },
  { label: 'Farther', name: 'farther', x: 0, y: 0, z: -24 },
] as const;
export function AtomicLayoutPanel({ molecules, status, message, canUndo, onMove, onTurnParticle, onReset, onUndo, onRetry }: Props) {
  const headingId = useId();
  const [selectedId, setSelectedId] = useState('');
  const selected = molecules.find(molecule => molecule.id === selectedId) ?? molecules[0];
  const [particleId, setParticleId] = useState('');
  const particle = selected?.particles.find(item => item.id === particleId) ?? selected?.particles[0];
  return <Popover>
    <PopoverTrigger asChild><Button variant="outline" className="hover:bg-muted hover:text-foreground h-11 gap-2 px-3" aria-label="Arrange molecule layout"><Move className="h-4 w-4" aria-hidden="true" /><span>Layout</span></Button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} aria-labelledby={headingId} data-testid="atomic-layout-panel"
      className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(38rem,var(--radix-popover-content-available-height))] space-y-4 overflow-y-auto rounded-2xl p-4 motion-reduce:animate-none">
      <div><h2 id={headingId} className="font-semibold">Molecule layout</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Give each life area its own space. Depth appears in 3D. Your task dates stay the same.</p></div>
      <p role="status" className="text-xs leading-relaxed" data-testid="atomic-layout-status">{message}</p>
      {status === 'error' ? <Button variant="outline" className="hover:bg-muted hover:text-foreground min-h-11" onClick={onRetry}>Retry saving layout</Button> : null}
      {selected ? <>
        <label className="block space-y-1 text-xs font-medium">Life area to arrange
          <select className="block min-h-11 w-full rounded-lg border bg-background px-2 text-sm" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
            {molecules.map(molecule => <option key={molecule.id} value={molecule.id}>{molecule.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground" data-testid="atomic-layout-position" data-x={selected.position.x} data-y={selected.position.y} data-z={selected.position.z}>
          Across {Math.round(selected.position.x)} · Down {Math.round(selected.position.y)} · Depth {Math.round(selected.position.z)}
        </p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Move ${selected.label} life area`}>
          {MOVEMENTS.map(({ label, name, ...offset }) => <Button key={name} variant="outline" className="hover:bg-muted hover:text-foreground min-h-11 px-2" aria-label={`Move life area ${name}`} disabled={status === 'loading'} onClick={() => onMove(selected.id, offset)}>{label}</Button>)}
        </div>
        {particle ? <div className="space-y-2 border-t pt-3">
          <label className="block space-y-1 text-xs font-medium">Particle to arrange
            <select value={particle.id} onChange={event => setParticleId(event.target.value)} className="block min-h-11 w-full rounded-lg border bg-background px-2 text-sm">
              {selected.particles.map(item => <option key={item.id} value={item.id}>{item.label} · {['Today', 'Week', 'Later'][item.shell]}</option>)}
            </select>
          </label>
          <div className="flex gap-2"><Button variant="outline" className="hover:bg-muted hover:text-foreground min-h-11 flex-1 px-2" disabled={status === 'loading'} aria-label="Move particle counterclockwise" onClick={() => onTurnParticle(selected.id, particle.id, -1)}>Turn back</Button><Button variant="outline" className="hover:bg-muted hover:text-foreground min-h-11 flex-1 px-2" disabled={status === 'loading'} aria-label="Move particle clockwise" onClick={() => onTurnParticle(selected.id, particle.id, 1)}>Turn forward</Button></div>
          <p className="text-xs leading-relaxed text-muted-foreground">Move to the next open place on this orbit. Use Tasks to change its time horizon.</p>
        </div> : null}
      </> : <p className="text-sm text-muted-foreground">Connect a task to a life area to begin.</p>}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button variant="outline" className="hover:bg-muted hover:text-foreground min-h-11 gap-2" disabled={!canUndo || status === 'loading'} aria-label="Undo layout change" onClick={onUndo}><Undo2 className="h-4 w-4" aria-hidden="true" />Undo</Button>
        <Button variant="ghost" className="hover:bg-muted hover:text-foreground min-h-11 gap-2" disabled={status === 'loading' || !molecules.length} aria-label="Reset molecule layout" onClick={onReset}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset layout</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
