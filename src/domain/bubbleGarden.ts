import { createTask, type Task, type TaskDomainLink } from '@/types/task';
import { createConfirmedDomainLink } from '@/domain/lifeDomains';
import { getConfirmedTaskDomainEffects } from '@/domain/taskRelationships';

export const STARTER_PACK = 'living-bubbles-v1';

export const STARTER_LESSONS = [
  {
    key: 'move',
    title: 'Try moving this bubble',
    description:
      'Drag me to a comfortable spot. In Atomic view, drag an electron between Today, Week and Later. You can also open a task and choose its time horizon without dragging.',
    domains: ['education'],
    minutes: 1,
  },
  {
    key: 'connect',
    title: 'See how one action connects your life',
    description:
      'Open Life connections below. These example links connect learning, home and wellbeing. Keep the ones that fit, remove the rest, or name a life area of your own. Switch to Atomic view to see the molecules and their bonds.',
    domains: ['education', 'home-personal', 'physical-health'],
    minutes: 2,
  },
  {
    key: 'finish',
    title: 'Do one tiny thing that makes today easier',
    description:
      'Choose something small: clear a space, put something where you need it, or take a comfortable pause. Mark this bubble done when you are ready. There is no timer to beat.',
    domains: ['home-personal', 'physical-health'],
    minutes: 2,
  },
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  education: 'Learning',
  'home-personal': 'Home & personal',
  'physical-health': 'Wellbeing',
};

export function starterLessonKey(task: Task): string | undefined {
  const garden = task.metadata?.bubbleGarden;
  return garden?.pack === STARTER_PACK && typeof garden.lesson === 'string'
    ? garden.lesson
    : undefined;
}

export function createStarterTask(
  lesson: (typeof STARTER_LESSONS)[number],
): Omit<Task, 'id'> {
  return createTask(lesson.title, 'task', {
    description: lesson.description,
    actionability: 'actionable',
    energyFit: 'low',
    estimatedMinutes: lesson.minutes,
    priority: 35,
    domainLinks: lesson.domains.map((domainId) =>
      createConfirmedDomainLink({
        domainId,
        label: DOMAIN_LABELS[domainId],
        source: 'user',
      }),
    ),
    metadata: { bubbleGarden: { pack: STARTER_PACK, lesson: lesson.key } },
    view: { atomic: { shell: 'today' } },
    tags: [{ id: 'starter-guide', name: 'Starter guide', emoji: '🌱' }],
  });
}

export interface BubbleSprout {
  key: string;
  title: string;
  reason: string;
  sourceTaskId: string;
  sourceTitle: string;
  minutes: number;
  domainLinks: TaskDomainLink[];
  origin: 'notes' | 'local' | 'ai';
  provenance?: { sourceFingerprint: string; model?: string };
  automatic?: boolean;
}

interface SuggestedStep {
  kind: string;
  title: string;
  minutes: number;
  reason: string;
  origin: BubbleSprout['origin'];
}

/** Grow is an explicit invitation for tasks and thoughts, never a type conversion. */
export function canGrowBubble(source: Pick<Task, 'type' | 'completed' | 'actionability' | 'title' | 'description'>): boolean {
  return (source.type === 'task' || source.type === 'thought') &&
    !source.completed && source.actionability !== 'reference' &&
    Boolean(source.title.trim() || source.description?.trim());
}

/** Reuse the person's own unfinished list before offering a local pattern. */
function stepsFromNotes(description?: string): SuggestedStep[] {
  const seen = new Set<string>();
  const completed = new Set<string>();
  return (description ?? '').split(/\r?\n/).flatMap((line) => {
    const match = line.match(
      /^\s*(?:[-*•]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.+)$/u,
    );
    if (!match) return [];
    const title = match[2].trim();
    const normalized = title
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ');
    if (!title || title.length > 300) return [];
    const kind = `note:${encodeURIComponent(normalized)}`;
    if (match[1]?.toLowerCase() === 'x') { completed.add(kind); return []; }
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [
      {
        kind,
        title,
        minutes: 5,
        origin: 'notes' as const,
        reason:
          'From an unfinished item in your notes. The time is a starting estimate; edit the bubble to suit you.',
      },
    ];
  }).filter(step => !completed.has(step.kind));
}

function localStartingSteps(title: string): [string, string] | undefined {
  const text = title.normalize('NFKC').toLocaleLowerCase();
  if (/\b(shopping|groceries|grocery)\b/.test(text))
    return [
      'List the items you actually need',
      'Check which items you already have',
    ];
  if (/\b(clean|cleaning|tidy|declutter|organize|organise)\b/.test(text))
    return [
      'Choose one small surface or area to start with',
      'Put one misplaced item where it belongs',
    ];
  if (/\b(project|report|presentation|essay|proposal)\b/.test(text))
    return [
      'Write one sentence describing the finished result',
      'Open the notes or file you will start from',
    ];
  if (/\b(email|reply|message)\b/.test(text))
    return [
      'Write the one point you want to communicate',
      'Draft an opening sentence without sending it',
    ];
  if (/\b(learn|study|course|lesson|tutorial)\b/.test(text))
    return [
      'Choose one question you want to answer',
      'Open one resource and mark a place to begin',
    ];
  return undefined;
}

/** Local suggestions are drafts. Only the explicit Add action creates a task. */
export function suggestBubbleSprouts(
  source: Task,
  existing: readonly Task[],
): BubbleSprout[] {
  if (!canGrowBubble(source)) return [];
  const created = new Set(
    existing.map((task) => task.metadata?.bubbleGarden?.sproutKey),
  );
  const links = getConfirmedTaskDomainEffects(source).map(({ link }) => link);
  const title = source.title.trim() || source.description!.trim();
  const singleLineTitle = title.replace(/\s+/g, ' ');
  const shortTitle = singleLineTitle.length > 85 ? `${singleLineTitle.slice(0, 82)}…` : singleLineTitle;
  const pattern = localStartingSteps(title);
  // Text captures live in the title. Keep saved notes first and deduplicate both lists.
  const notes = stepsFromNotes([source.description, source.type === 'thought' ? source.title : ''].filter(Boolean).join('\n'));
  const thought = source.type === 'thought';
  const drafts: SuggestedStep[] = notes.length
    ? notes
    : [
        {
          kind: 'first-step',
          title: pattern
            ? `${pattern[0]} — ${shortTitle}`
            : thought
              ? `Write one question to explore about “${shortTitle}”`
              : `Choose the first small step for “${shortTitle}”`,
          minutes: 2,
          origin: 'local',
          reason: pattern
            ? `A local starting idea based on “${shortTitle}.” Keep it only if it fits.`
            : thought
              ? 'An optional reflection prompt from a local template. Keep or rewrite it if you want to explore this thought.'
              : 'A local starting prompt for making a larger task easier to begin. Keep or rewrite it if it fits.',
        },
        {
          kind: 'prepare',
          title: pattern
            ? `${pattern[1]} — ${shortTitle}`
            : thought
              ? `Describe one tiny way to try “${shortTitle}”`
              : `Get one thing ready for “${shortTitle}”`,
          minutes: 5,
          origin: 'local',
          reason: thought
            ? 'An optional local prompt for exploring an idea. You can keep the thought without turning it into an action.'
            : 'A local preparation prompt: choose a tool, space or note that would help you begin.',
        },
        {
          kind: 'meaning',
          title: thought ? `Name what interests you about “${shortTitle}”` : `Name what “${shortTitle}” makes possible`,
          minutes: 2,
          origin: 'local',
          reason:
            links.length > 1
              ? `This bubble already connects ${links.map((link) => link.label ?? link.domainId).join(' and ')}. You can explore that connection.`
              : thought
                ? 'A local reflection prompt. You decide whether this thought connects to any life area.'
                : 'A local reflection prompt for deciding which life areas this action supports.',
        },
      ];
  return drafts
    .flatMap((draft) => {
      const key = `${source.id}:${draft.kind}`;
      return created.has(key)
        ? []
        : [
            {
              ...draft,
              key,
              sourceTaskId: source.id,
              sourceTitle: title,
              domainLinks: links,
            },
          ];
    })
    .slice(0, 3);
}

export function bubbleGrowthSourceFingerprint(source: Pick<Task, 'title' | 'description'>): string {
  return JSON.stringify([source.title, source.description ?? '']);
}

export function createAiSprouts(
  source: Task,
  steps: readonly { title: string; reason: string; estimatedMinutes: number }[],
  existing: readonly Task[],
  provenance: { sourceFingerprint: string; model?: string },
): BubbleSprout[] {
  if (!canGrowBubble(source) || provenance.sourceFingerprint !== bubbleGrowthSourceFingerprint(source)) return [];
  const created = new Set(existing.map(task => task.metadata?.bubbleGarden?.sproutKey));
  const seen = new Set<string>();
  return steps.flatMap(step => {
    if (typeof step.title !== 'string' || !step.title.trim() || step.title.trim().length > 300 ||
      typeof step.reason !== 'string' || step.reason.length > 600 || !Number.isFinite(step.estimatedMinutes) || step.estimatedMinutes < 1 || step.estimatedMinutes > 120) return [];
    const title = step.title.trim();
    const normalized = title.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
    const key = `${source.id}:ai:${encodeURIComponent(normalized)}`;
    if (seen.has(normalized) || created.has(key)) return [];
    seen.add(normalized);
    return [{ key, title, reason: step.reason, minutes: Math.round(step.estimatedMinutes), sourceTaskId: source.id,
      sourceTitle: source.title.trim() || source.description || '', origin: 'ai' as const,
      domainLinks: getConfirmedTaskDomainEffects(source).map(({ link }) => link), provenance }];
  }).slice(0, 3);
}

export function createSproutTask(
  sprout: BubbleSprout,
  title: string,
  selectedDomainIds: readonly string[],
): Omit<Task, 'id'> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Give your new bubble a name.');
  return createTask(trimmed, 'task', {
    description: `A small next step from “${sprout.sourceTitle}”.\n\n${sprout.reason}`,
    actionability: 'actionable',
    energyFit: 'low',
    estimatedMinutes: sprout.minutes,
    domainLinks: getConfirmedTaskDomainEffects({ domainLinks: sprout.domainLinks }).map(({ link }) => link)
      .filter((link) => selectedDomainIds.includes(link.domainId))
      .map((link) => ({
        ...createConfirmedDomainLink({
          domainId: link.domainId,
          label: link.label ?? link.domainId,
          source: 'user',
        }),
        // Reuse the saved area's exact identity, including imported punctuation.
        domainId: link.domainId,
        reason: link.reason,
        effect: link.effect,
      })),
    metadata: {
      bubbleGarden: {
        sourceTaskId: sprout.sourceTaskId,
        sproutKey: sprout.key,
        origin: sprout.origin,
        ...(sprout.provenance ? { provenance: sprout.provenance } : {}),
        ...(sprout.automatic ? { automatic: true } : {}),
      },
    },
    view: { atomic: { shell: 'today' } },
    tags: [],
  });
}
