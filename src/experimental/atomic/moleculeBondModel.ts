import type { Bubble } from '@/types/bubble';
import type { TaskDomainLink } from '@/types/task';
import type { CanvasPoint } from '@/lib/canvasGeometry';
import { bubbleToTask } from '@/adapters/taskAdapter';

export interface BondMolecule {
  id: string;
  x: number;
  y: number;
  nucleus: { domain: string };
  electrons: { originalBubble?: Bubble }[];
}

export interface MoleculeBond {
  id: string;
  from: BondMolecule;
  to: BondMolecule;
  tasks: Bubble[];
}

/** Every edge is backed by the very same canonical bubble in both life areas. */
export function buildMoleculeBonds(molecules: BondMolecule[]): MoleculeBond[] {
  const result: MoleculeBond[] = [];
  const tasksByMolecule = molecules.map(molecule => new Map(
    molecule.electrons.flatMap(electron => electron.originalBubble
      ? [[electron.originalBubble.id, electron.originalBubble] as const] : []),
  ));
  molecules.forEach((from, fromIndex) => {
    molecules.slice(fromIndex + 1).forEach((to, offset) => {
      const toIndex = fromIndex + offset + 1;
      const tasks = [...tasksByMolecule[fromIndex].values()]
        .filter(task => tasksByMolecule[toIndex].has(task.id));
      if (tasks.length) result.push({ id: `${from.id}:${to.id}`, from, to, tasks });
    });
  });
  return result;
}

export function getConfirmedDomainLinks(bubble: Bubble): TaskDomainLink[] {
  const seen = new Set<string>();
  return (bubbleToTask(bubble).domainLinks ?? []).flatMap(link => {
    const domainId = link.domainId.trim();
    if (!link.userConfirmed || !domainId || seen.has(domainId)) return [];
    seen.add(domainId);
    return [{ ...link, domainId }];
  });
}

export interface SharedTaskConnection {
  task: Bubble;
  links: TaskDomainLink[];
}

/** One readable card per canonical task, independent of its pairwise edges. */
export function getSharedTaskConnections(bubbles: readonly Bubble[]): SharedTaskConnection[] {
  const seen = new Set<string>();
  return bubbles.flatMap(task => {
    if (seen.has(task.id)) return [];
    seen.add(task.id);
    const links = getConfirmedDomainLinks(task);
    return links.length > 1 ? [{ task, links }] : [];
  });
}

export interface MoleculeTracePoint extends CanvasPoint {
  anchor: 'area' | 'particle';
}
