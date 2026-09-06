import type { Bubble } from '@/types/bubble';

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
