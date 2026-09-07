import type { Task, TaskDomainLink } from '@/types/task';
import { createConfirmedDomainLink, normalizeDomainId, STARTER_LIFE_DOMAINS, type LifeDomainDefinition } from './lifeDomains';

export interface LifeDomainChoice extends LifeDomainDefinition {
  aliases: string[];
  taskCount: number;
  exampleTitle?: string;
}

/** A read-only vocabulary of confirmed areas. Labels never replace their IDs. */
export function collectLifeDomainChoices(tasks: readonly Pick<Task, 'id' | 'title' | 'domainLinks'>[]): LifeDomainChoice[] {
  const choices = new Map<string, LifeDomainChoice>();
  const latest = new Map<string, number>();
  const members = new Map<string, Set<string>>();
  for (const domain of STARTER_LIFE_DOMAINS) {
    choices.set(domain.id, { ...domain, aliases: [domain.label], taskCount: 0 });
  }
  for (const task of tasks) {
    for (const link of task.domainLinks ?? []) {
      const id = link.domainId.trim();
      if (!link.userConfirmed || !id) continue;
      const label = link.label?.trim() || id;
      const choice = choices.get(id) ?? { id, label, aliases: [], taskCount: 0 };
      const timestamp = link.updatedAt ?? link.createdAt ?? 0;
      if (!latest.has(id) || timestamp > latest.get(id)!) {
        choice.label = label;
        choice.exampleTitle = task.title;
        latest.set(id, timestamp);
      }
      if (!choice.aliases.includes(label)) choice.aliases.push(label);
      const taskIds = members.get(id) ?? new Set<string>();
      taskIds.add(task.id);
      members.set(id, taskIds);
      choice.taskCount = taskIds.size;
      choices.set(id, choice);
    }
  }
  return [...choices.values()].sort((a, b) =>
    Number(b.taskCount > 0) - Number(a.taskCount > 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

export function matchingLifeDomainChoices(label: string, choices: readonly LifeDomainChoice[]): LifeDomainChoice[] {
  const key = normalizeDomainId(label);
  return choices.filter(choice => [choice.id, choice.label, ...choice.aliases]
    .some(value => normalizeDomainId(value) === key));
}

export function reuseLifeDomainChoice(choice: LifeDomainChoice): TaskDomainLink {
  return {
    ...createConfirmedDomainLink({ domainId: choice.id, label: choice.label, source: 'user' }),
    // Imported/custom IDs can contain punctuation; reusing them must be exact.
    domainId: choice.id,
  };
}
