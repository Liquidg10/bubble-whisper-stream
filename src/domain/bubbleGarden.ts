import { createTask, type Task, type TaskDomainLink } from '@/types/task';
import { createConfirmedDomainLink } from '@/domain/lifeDomains';

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
}

interface SuggestedStep {
  kind: string;
  title: string;
  minutes: number;
  reason: string;
}

/** Reuse the person's own unfinished list before offering a local pattern. */
function stepsFromNotes(description?: string): SuggestedStep[] {
  const seen = new Set<string>();
  return (description ?? '').split(/\r?\n/).flatMap((line) => {
    const match = line.match(
      /^\s*(?:[-*•]|\d+[.)])\s+(?:\[([ xX])\]\s*)?(.+)$/u,
    );
    if (!match || match[1]?.toLowerCase() === 'x') return [];
    const title = match[2].trim();
    const normalized = title
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ');
    if (!title || title.length > 300 || seen.has(normalized)) return [];
    seen.add(normalized);
    return [
      {
        kind: `note:${encodeURIComponent(normalized)}`,
        title,
        minutes: 5,
        reason:
          'From an unfinished item in your notes. The time is a starting estimate; edit the bubble to suit you.',
      },
    ];
  });
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
  if (
    source.completed ||
    source.actionability === 'reference' ||
    source.type !== 'task'
  )
    return [];
  const created = new Set(
    existing.map((task) => task.metadata?.bubbleGarden?.sproutKey),
  );
  const links = (source.domainLinks ?? []).filter((link) => link.userConfirmed);
  const title = source.title.trim();
  if (!title) return [];
  const shortTitle = title.length > 85 ? `${title.slice(0, 82)}…` : title;
  const pattern = localStartingSteps(title);
  const notes = stepsFromNotes(source.description);
  const drafts: SuggestedStep[] = notes.length
    ? notes
    : [
        {
          kind: 'first-step',
          title: pattern
            ? `${pattern[0]} — ${shortTitle}`
            : `Choose the first small step for “${shortTitle}”`,
          minutes: 2,
          reason: pattern
            ? `A local starting idea based on “${shortTitle}.” Keep it only if it fits.`
            : 'A concrete starting action can make a larger task easier to begin.',
        },
        {
          kind: 'prepare',
          title: pattern
            ? `${pattern[1]} — ${shortTitle}`
            : `Get one thing ready for “${shortTitle}”`,
          minutes: 5,
          reason:
            'Preparing a tool, space or note gives this bubble a smaller companion.',
        },
        {
          kind: 'meaning',
          title: `Name what “${shortTitle}” makes possible`,
          minutes: 2,
          reason:
            links.length > 1
              ? `This bubble already connects ${links.map((link) => link.label ?? link.domainId).join(' and ')}. You can explore that connection.`
              : 'A short reflection can help you decide which life areas this action supports.',
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
    domainLinks: sprout.domainLinks
      .filter((link) => selectedDomainIds.includes(link.domainId))
      .map((link) => ({
        ...createConfirmedDomainLink({
          domainId: link.domainId,
          label: link.label ?? link.domainId,
          source: 'user',
        }),
        reason: link.reason,
      })),
    metadata: {
      bubbleGarden: {
        sourceTaskId: sprout.sourceTaskId,
        sproutKey: sprout.key,
      },
    },
    view: { atomic: { shell: 'today' } },
    tags: [],
  });
}
