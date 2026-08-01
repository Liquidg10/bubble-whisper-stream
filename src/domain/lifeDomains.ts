import type { Task, TaskDomainLink } from '@/types/task';

export interface LifeDomainDefinition {
  id: string;
  label: string;
  keywords?: readonly string[];
}

export interface LifeDomainProposal {
  id: string;
  domainId: string;
  label: string;
  source: TaskDomainLink['source'];
  explanation: string;
  pendingLinkId?: string;
}

export interface LifeDomainProposalOptions {
  knownDomains?: readonly LifeDomainDefinition[];
  maxSuggestions?: number;
}

/**
 * Starter language, not a fixed ontology. People can rename, remove, or add
 * any connection, and accepted labels retain stable IDs.
 */
export const STARTER_LIFE_DOMAINS: readonly LifeDomainDefinition[] = [
  {
    id: 'mindfulness',
    label: 'Mindfulness',
    keywords: ['mindful', 'meditate', 'meditation', 'breathe', 'breathing', 'grounding', 'reflect', 'journal'],
  },
  {
    id: 'career',
    label: 'Career',
    keywords: ['career', 'work', 'client', 'meeting', 'deadline', 'project', 'office', 'presentation', 'professional'],
  },
  {
    id: 'physical-health',
    label: 'Physical health',
    keywords: ['health', 'walk', 'doctor', 'medical', 'exercise', 'workout', 'fitness', 'sleep', 'medication', 'appointment'],
  },
  {
    id: 'family',
    label: 'Family',
    keywords: ['family', 'parent', 'mother', 'father', 'mom', 'dad', 'child', 'children', 'kids', 'sibling', 'spouse'],
  },
  {
    id: 'education',
    label: 'Education',
    keywords: ['learn', 'learning', 'study', 'course', 'school', 'class', 'training', 'research', 'tutorial', 'homework'],
  },
  {
    id: 'friends-community',
    label: 'Friends & community',
    keywords: ['friend', 'friends', 'community', 'neighbor', 'neighbour', 'meetup', 'volunteer', 'social'],
  },
  {
    id: 'financial-wellbeing',
    label: 'Financial wellbeing',
    keywords: ['budget', 'money', 'finance', 'financial', 'pay', 'expense', 'income', 'bank', 'debt', 'save', 'saving'],
  },
  {
    id: 'home-personal',
    label: 'Home & personal',
    keywords: ['home', 'house', 'clean', 'chore', 'repair', 'garden', 'cook', 'laundry', 'hobby', 'shopping'],
  },
] as const;

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();
}

export function normalizeDomainId(label: string): string {
  const wordId = normalizeText(label).replace(/\s+/g, '-');
  if (wordId) return wordId;

  const codePointId = Array.from(label.normalize('NFKC'))
    .map(character => character.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-');
  return codePointId ? `custom-${codePointId}` : 'life-connection';
}

function taskText(task: Pick<Task, 'title' | 'description' | 'tags'>): string {
  return normalizeText([
    task.title,
    task.description ?? '',
    ...task.tags.map(tag => tag.name),
  ].join(' '));
}

function candidateTerms(domain: LifeDomainDefinition): string[] {
  const labelTerms = normalizeText(domain.label)
    .split(' ')
    .filter(term => term.length >= 4);
  const idTerms = normalizeText(domain.id)
    .split(' ')
    .filter(term => term.length >= 4);

  return Array.from(new Set([
    ...(domain.keywords ?? []).map(normalizeText),
    ...labelTerms,
    ...idTerms,
  ].filter(Boolean)));
}

function findEvidence(text: string, domain: LifeDomainDefinition): string | undefined {
  const paddedText = ` ${text} `;
  return candidateTerms(domain).find(term => paddedText.includes(` ${term} `));
}

function uniqueDomains(domains: readonly LifeDomainDefinition[]): LifeDomainDefinition[] {
  const seen = new Set<string>();
  return domains.filter(domain => {
    const key = normalizeDomainId(domain.id || domain.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Produces local, transient hypotheses. Calling this function never mutates a
 * Task and never turns a proposal into product truth.
 */
export function proposeLifeDomainLinks(
  task: Pick<Task, 'title' | 'description' | 'tags' | 'actionability'>,
  existingLinks: readonly TaskDomainLink[] = [],
  options: LifeDomainProposalOptions = {},
): LifeDomainProposal[] {
  if (task.actionability === 'reference') return [];

  const text = taskText(task);
  if (!text) return [];

  const existingKeys = new Set(existingLinks.flatMap(link => [
    normalizeDomainId(link.domainId),
    normalizeDomainId(link.label ?? link.domainId),
  ]));
  const candidates = uniqueDomains([
    ...(options.knownDomains ?? []),
    ...STARTER_LIFE_DOMAINS,
  ]);

  const proposals: LifeDomainProposal[] = [];
  for (const domain of candidates) {
    const domainId = normalizeDomainId(domain.id || domain.label);
    const labelKey = normalizeDomainId(domain.label);
    if (existingKeys.has(domainId) || existingKeys.has(labelKey)) continue;

    const evidence = findEvidence(text, domain);
    if (!evidence) continue;

    proposals.push({
      id: `rule:${domainId}`,
      domainId,
      label: domain.label,
      source: 'rule',
      explanation: `This task mentions “${evidence}.”`,
    });
  }

  return proposals.slice(0, options.maxSuggestions ?? 3);
}

function generateLinkId(domainId: string, now: number): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ?? `domain-link-${domainId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createConfirmedDomainLink(
  input: {
    domainId: string;
    label: string;
    source: TaskDomainLink['source'];
  },
  options: {
    id?: string;
    now?: number;
    strength?: TaskDomainLink['strength'];
  } = {},
): TaskDomainLink {
  const now = options.now ?? Date.now();
  const domainId = normalizeDomainId(input.domainId || input.label);

  const link: TaskDomainLink = {
    id: options.id ?? generateLinkId(domainId, now),
    domainId,
    label: input.label.trim(),
    userConfirmed: true,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };

  if (options.strength) link.strength = options.strength;
  return link;
}

export function createUserDomainLink(
  label: string,
  options: Parameters<typeof createConfirmedDomainLink>[1] = {},
): TaskDomainLink {
  return createConfirmedDomainLink({
    domainId: normalizeDomainId(label),
    label,
    source: 'user',
  }, options);
}

export function pendingLinkToProposal(link: TaskDomainLink): LifeDomainProposal {
  return {
    id: `pending:${link.id}`,
    domainId: link.domainId,
    label: link.label ?? link.domainId,
    source: link.source,
    explanation: link.suggestionReason?.trim() || (link.source === 'assistant'
      ? 'An assistant offered this as a possibility without a saved explanation.'
      : link.source === 'rule'
        ? 'A local rule offered this as a possibility.'
        : link.source === 'import'
          ? 'This connection was imported but has not been confirmed.'
          : 'This user-created connection is still awaiting confirmation.'),
    pendingLinkId: link.id,
  };
}
