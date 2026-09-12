import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createConfirmedDomainLink,
  createUserDomainLink,
  normalizeDomainId,
  pendingLinkToProposal,
  proposeLifeDomainLinks,
  type LifeDomainProposal,
} from '@/domain/lifeDomains';
import type { Task, TaskDomainLink } from '@/types/task';
import { useTaskStore } from '@/stores/taskStore';
import { collectLifeDomainChoices, matchingLifeDomainChoices, reuseLifeDomainChoice, type LifeDomainChoice } from '@/domain/lifeDomainLibrary';

interface LifeConnectionsEditorProps {
  task: Pick<Task, 'id' | 'title' | 'description' | 'tags' | 'actionability'>;
  links: readonly TaskDomainLink[];
  onChange: (links: TaskDomainLink[]) => void;
}

interface UndoState {
  links: TaskDomainLink[];
  label: string;
}

interface ConfirmedLinkRowProps {
  link: TaskDomainLink;
  onUpdate: (link: TaskDomainLink) => void;
  onRemove: () => void;
}

function sourceDescription(source: TaskDomainLink['source']): string {
  switch (source) {
    case 'rule': return 'Suggested locally, confirmed by you';
    case 'assistant': return 'Suggested by an assistant, confirmed by you';
    case 'import': return 'Imported, confirmed by you';
    default: return 'Linked by you';
  }
}

function ConfirmedLinkRow({ link, onUpdate, onRemove }: ConfirmedLinkRowProps) {
  const labelId = useId();
  const reasonId = useId();
  const strengthLabel = link.label ?? link.domainId;
  const [draftLabel, setDraftLabel] = useState(strengthLabel);
  const [draftReason, setDraftReason] = useState(link.reason ?? '');

  useEffect(() => {
    setDraftLabel(strengthLabel);
  }, [strengthLabel]);

  useEffect(() => {
    setDraftReason(link.reason ?? '');
  }, [link.reason]);

  const commitLabel = () => {
    const label = draftLabel.trim();
    if (!label) {
      setDraftLabel(strengthLabel);
      return;
    }
    if (label !== strengthLabel) {
      onUpdate({ ...link, label, updatedAt: Date.now() });
    }
  };

  const commitReason = () => {
    const reason = draftReason.trim();
    if (reason !== (link.reason ?? '')) {
      onUpdate({
        ...link,
        reason: reason || undefined,
        updatedAt: Date.now(),
      });
    }
  };

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={labelId}>Connection name for {strengthLabel}</Label>
          <Input
            id={labelId}
            data-life-inline-edit={draftLabel !== strengthLabel ? 'dirty' : 'clean'}
            value={draftLabel}
            onChange={event => setDraftLabel(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape' && draftLabel !== strengthLabel) {
                event.preventDefault();
                event.stopPropagation();
                setDraftLabel(strengthLabel);
              }
            }}
          />
        </div>
        <div className="space-y-1.5 sm:w-40">
          <Label htmlFor={`${labelId}-strength`}>Role for {strengthLabel} (optional)</Label>
          <Select
            value={link.strength}
            onValueChange={(strength: NonNullable<TaskDomainLink['strength']>) => {
              onUpdate({ ...link, strength, updatedAt: Date.now() });
            }}
          >
            <SelectTrigger id={`${labelId}-strength`} className="h-11">
              <SelectValue placeholder="Choose role" />
            </SelectTrigger>
            <SelectContent className="motion-reduce:animate-none motion-reduce:transition-none">
              <SelectItem value="primary" className="min-h-11">Primary</SelectItem>
              <SelectItem value="secondary" className="min-h-11">Supporting</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${labelId}-effect`}>How this connects to {strengthLabel}</Label>
        <select id={`${labelId}-effect`}
          className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={link.effect === undefined ? 'supports' : link.effect === 'supports' || link.effect === 'tradeoff' ? link.effect : ''}
          onChange={event => onUpdate({ ...link, effect: event.target.value as NonNullable<TaskDomainLink['effect']>, updatedAt: Date.now() })}>
          <option value="" disabled>Choose how this connects</option>
          <option value="supports">Supports this area</option>
          <option value="tradeoff">Involves a tradeoff</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={reasonId}>Why {strengthLabel} matters (optional)</Label>
        <Input
          id={reasonId}
          data-life-inline-edit={draftReason !== (link.reason ?? '') ? 'dirty' : 'clean'}
          value={draftReason}
          onChange={event => setDraftReason(event.target.value)}
          onBlur={commitReason}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape' && draftReason !== (link.reason ?? '')) {
              event.preventDefault();
              event.stopPropagation();
              setDraftReason(link.reason ?? '');
            }
          }}
          placeholder={link.effect === 'tradeoff' ? `What is the tradeoff for ${strengthLabel}?` : `How does this support ${strengthLabel}?`}
        />
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground">{sourceDescription(link.source)}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-11 whitespace-normal break-words text-center text-foreground hover:bg-muted hover:text-foreground transition-none"
          onClick={onRemove}
        >
          Remove {strengthLabel}
        </Button>
      </div>
    </li>
  );
}

function taskFingerprint(task: LifeConnectionsEditorProps['task']): string {
  return JSON.stringify([
    task.id,
    task.title,
    task.description ?? '',
    task.tags.map(tag => tag.name),
    task.actionability ?? '',
  ]);
}

function LifeConnectionsEditorContent({ task, links, onChange, availableDomains }: LifeConnectionsEditorProps & { availableDomains: readonly LifeDomainChoice[] }) {
  const addInputId = useId();
  const addErrorId = useId();
  const headingId = useId();
  const helpId = useId();
  const fingerprint = taskFingerprint(task);
  const [newLabel, setNewLabel] = useState('');
  const [inputError, setInputError] = useState('');
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [proposalEffects, setProposalEffects] = useState<Record<string, NonNullable<TaskDomainLink['effect']>>>({});
  const areaSearchId = useId();
  const areaPickerId = useId();
  const areaSearchRef = useRef<HTMLInputElement>(null);
  const [requestedFingerprint, setRequestedFingerprint] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<{ fingerprint: string; ids: Set<string> }>({
    fingerprint,
    ids: new Set(),
  });
  const [announcement, setAnnouncement] = useState({ id: 0, message: '' });
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const announcementId = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const suggestionToggleRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);

  const confirmedLinks = links.filter(link => link.userConfirmed);
  const pendingLinks = links.filter(link => !link.userConfirmed);
  const suggestionsVisible = requestedFingerprint === fingerprint;
  const localProposals = suggestionsVisible ? proposeLifeDomainLinks(task, links, { knownDomains: availableDomains }) : [];
  const areaQuery = areaSearch.trim() ? normalizeDomainId(areaSearch) : '';
  const availableChoices = availableDomains.filter(choice =>
    !links.some(link => link.domainId === choice.id)
    && (!areaQuery || [choice.id, choice.label, ...choice.aliases].some(label => normalizeDomainId(label).includes(areaQuery))));
  const areaChoiceLabels = useMemo(() => {
    const groups = new Map<string, LifeDomainChoice[]>();
    for (const choice of availableDomains) {
      const key = normalizeDomainId(choice.label);
      groups.set(key, [...(groups.get(key) ?? []), choice]);
    }
    const labels = new Map<string, string>();
    for (const sameName of groups.values()) {
      sameName.forEach((choice, index) => labels.set(choice.id, sameName.length > 1
        ? `${choice.label} (area ${index + 1} of ${sameName.length})` : choice.label));
    }
    return labels;
  }, [availableDomains]);
  const dismissedIds = dismissed.fingerprint === fingerprint ? dismissed.ids : new Set<string>();
  const proposals = suggestionsVisible
    ? [
        ...pendingLinks.map(pendingLinkToProposal),
        ...localProposals,
      ].filter(proposal => !dismissedIds.has(proposal.id))
    : [];

  const announce = (message: string) => {
    announcementId.current += 1;
    setAnnouncement({ id: announcementId.current, message });
  };

  const focusAfterRender = (getTarget: () => HTMLElement | null | undefined) => {
    window.setTimeout(() => getTarget()?.focus(), 0);
  };

  const commit = (
    nextLinks: TaskDomainLink[],
    message: string,
    undoLabel: string,
    focusUndo: boolean = false,
  ) => {
    setUndoState({ links: [...links], label: undoLabel });
    onChange(nextLinks);
    announce(message);
    if (focusUndo) focusAfterRender(() => undoButtonRef.current);
  };

  const updateLink = (updatedLink: TaskDomainLink) => {
    commit(
      links.map(link => link.id === updatedLink.id ? updatedLink : link),
      `Updated ${updatedLink.label ?? updatedLink.domainId}. Undo available.`,
      `Undo updating ${updatedLink.label ?? updatedLink.domainId}`,
    );
  };

  const removeLink = (linkToRemove: TaskDomainLink) => {
    const label = linkToRemove.label ?? linkToRemove.domainId;
    commit(
      links.filter(link => link.id !== linkToRemove.id),
      `Removed ${label}. Undo available.`,
      `Undo removing ${label}`,
      true,
    );
  };

  const acceptProposal = (proposal: LifeDomainProposal) => {
    const effect = proposalEffects[proposal.id] ?? proposal.effect;
    if (proposal.effectRequiresReview && !effect) return;
    let nextLinks: TaskDomainLink[];

    if (proposal.pendingLinkId) {
      nextLinks = links.map(link => link.id === proposal.pendingLinkId
        ? {
            ...link,
            userConfirmed: true,
            ...(effect ? { effect } : {}),
            updatedAt: Date.now(),
          }
        : link);
    } else {
      nextLinks = [
        ...links,
        { ...createConfirmedDomainLink({ ...proposal, effect }), domainId: proposal.domainId },
      ];
    }

    commit(
      nextLinks,
      `Linked this task to ${proposal.label}. Undo available.`,
      `Undo linking ${proposal.label}`,
      true,
    );
  };

  const dismissProposal = (proposal: LifeDomainProposal) => {
    setDismissed(current => ({
      fingerprint,
      ids: new Set(current.fingerprint === fingerprint
        ? [...current.ids, proposal.id]
        : [proposal.id]),
    }));
    announce(`Dismissed the ${proposal.label} suggestion. The task was not changed.`);
    focusAfterRender(() => (
      sectionRef.current?.querySelector<HTMLButtonElement>('[data-life-proposal-accept]')
      ?? suggestionToggleRef.current
    ));
  };

  const addConnection = (event: React.FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;

    const normalized = normalizeDomainId(label);
    const duplicate = links.some(link => (
      normalizeDomainId(link.domainId) === normalized
      || normalizeDomainId(link.label ?? link.domainId) === normalized
    ));
    if (duplicate) {
      const message = `${label} is already connected to this task.`;
      setInputError(message);
      announce(message);
      return;
    }

    const matches = matchingLifeDomainChoices(label, availableDomains);
    if (matches.length > 1) {
      setInputError('More than one life area uses this name. Choose the area you want above.');
      setAreaSearch(label);
      setAreaPickerOpen(true);
      focusAfterRender(() => areaSearchRef.current);
      return;
    }
    if (matches.length === 1 && links.some(link => link.domainId === matches[0].id)) {
      setInputError(`${matches[0].label} is already connected to this task.`);
      return;
    }
    const nextLink = matches.length === 1 ? reuseLifeDomainChoice(matches[0]) : createUserDomainLink(label);
    commit(
      [...links, nextLink],
      `Linked this task to ${nextLink.label}. Undo available.`,
      `Undo linking ${nextLink.label}`,
    );
    setNewLabel('');
    setInputError('');
  };

  const undo = () => {
    if (!undoState) return;
    onChange(undoState.links);
    announce('Undid the last Life Connections change.');
    setUndoState(null);
    focusAfterRender(() => suggestionToggleRef.current);
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      aria-describedby={helpId}
      className="min-w-0 w-full space-y-4 rounded-xl border border-border bg-background p-4 text-foreground shadow-sm"
    >
      <div className="space-y-1">
        <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          <Link2 aria-hidden="true" className="h-4 w-4" />
          Life connections
        </h3>
        <p id={helpId} className="text-sm leading-relaxed text-muted-foreground">
          What parts of your life does this support? A task can connect to more than one.
          Suggestions are possibilities only—nothing counts until you choose it.
        </p>
      </div>

      {confirmedLinks.length > 0 ? (
        <ul aria-label="Confirmed life connections" className="space-y-3">
          {confirmedLinks.map(link => (
            <ConfirmedLinkRow
              key={link.id}
              link={link}
              onUpdate={updateLink}
              onRemove={() => removeLink(link)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No life connections yet. That is completely okay.</p>
      )}

      <div className="space-y-3">
        <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal text-left text-foreground hover:bg-muted hover:text-foreground transition-none"
          aria-expanded={areaPickerOpen} aria-controls={areaPickerId}
          onClick={() => setAreaPickerOpen(open => !open)}>
          Choose an existing life area
        </Button>
        {areaPickerOpen && <div id={areaPickerId} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">Reuse the same area across bubbles to bring their connections together.</p>
          <Label htmlFor={areaSearchId}>Find a life area</Label>
          <Input ref={areaSearchRef} id={areaSearchId} value={areaSearch} onChange={event => setAreaSearch(event.target.value)} autoComplete="off" />
          <ul aria-label="Available life areas" className="max-h-52 space-y-1 overflow-y-auto overscroll-contain">
            {availableChoices.map(choice => <li key={choice.id}>
              <button type="button" className="min-h-11 w-full rounded-md p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Use life area ${areaChoiceLabels.get(choice.id)}`}
                onClick={() => {
                  commit([...links, reuseLifeDomainChoice(choice)], `Linked this task to ${choice.label}. Undo available.`, `Undo linking ${choice.label}`, true);
                  setAreaPickerOpen(false);
                  setAreaSearch('');
                  setNewLabel('');
                  setInputError('');
                }}>
                <span className="block break-words text-sm font-medium">{areaChoiceLabels.get(choice.id)}</span>
                <span className="line-clamp-2 break-words text-xs text-muted-foreground">{choice.taskCount > 0
                  ? `Used on ${choice.taskCount} ${choice.taskCount === 1 ? 'bubble' : 'bubbles'}${choice.exampleTitle ? `, including “${choice.exampleTitle}”` : ''}`
                  : 'A starting area you can make your own'}</span>
              </button>
            </li>)}
          </ul>
          {availableChoices.length === 0 && <p role="status" className="text-sm text-muted-foreground">No matching area to add. You can name a new one below.</p>}
        </div>}
      </div>

      <form onSubmit={addConnection} className="space-y-2">
        <Label htmlFor={addInputId}>Add your own connection</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={addInputId}
            value={newLabel}
            onChange={event => {
              setNewLabel(event.target.value);
              if (inputError) setInputError('');
            }}
            placeholder="For example: Creativity"
            autoComplete="off"
            aria-invalid={inputError ? 'true' : undefined}
            aria-describedby={inputError ? addErrorId : undefined}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!newLabel.trim()}>
            Add connection
          </Button>
        </div>
        {inputError && (
          <p id={addErrorId} role="alert" className="text-sm text-destructive">
            {inputError}
          </p>
        )}
      </form>

      <div className="space-y-3 border-t border-border pt-4">
        <Button
          ref={suggestionToggleRef}
          type="button"
          variant="outline"
          size="sm"
          className="text-foreground hover:bg-muted hover:text-foreground transition-none"
          aria-expanded={suggestionsVisible}
          onClick={() => {
            setRequestedFingerprint(suggestionsVisible ? null : fingerprint);
            announce(suggestionsVisible
              ? 'Connection suggestions hidden.'
              : 'Connection suggestions ready.');
          }}
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {suggestionsVisible ? 'Hide suggestions' : 'Suggest connections'}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          This check runs locally from the words already in this task. It does not contact an AI provider.
        </p>

        {suggestionsVisible && proposals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No clear local suggestions—and that is okay. You can still add what feels true.
          </p>
        )}

        {proposals.length > 0 && (
          <ul aria-label="Possible life connections" className="space-y-2">
            {proposals.map(proposal => (
              <li key={proposal.id} className="rounded-lg border border-border bg-card p-3 text-card-foreground">
                <p className="font-medium text-foreground">Possible connection: {proposal.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{proposal.explanation}</p>
                {proposal.effect === 'tradeoff' && <p className="mt-1 text-xs text-muted-foreground">Suggested as a tradeoff for this area.</p>}
                {proposal.effectRequiresReview && <label className="mt-2 block space-y-1 text-sm">
                  Choose how this connects to {proposal.label}
                  <select value={proposalEffects[proposal.id] ?? ''} onChange={event => setProposalEffects(current => ({ ...current, [proposal.id]: event.target.value as NonNullable<TaskDomainLink['effect']> }))} className="min-h-11 w-full rounded-md border bg-background px-2 text-foreground">
                    <option value="" disabled>Review the connection</option><option value="supports">Supports this area</option><option value="tradeoff">Involves a tradeoff</option>
                  </select>
                </label>}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    className="h-auto min-h-11 whitespace-normal break-words text-center"
                    data-life-proposal-accept
                    disabled={proposal.effectRequiresReview && !proposalEffects[proposal.id]}
                    onClick={() => acceptProposal(proposal)}
                  >
                    Link to {proposal.label}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-11 whitespace-normal break-words text-center text-foreground hover:bg-muted hover:text-foreground transition-none"
                    onClick={() => dismissProposal(proposal)}
                  >
                    Not this time
                    <span className="sr-only">: {proposal.label}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {undoState && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">Last Life Connections change can be undone.</span>
          <Button
            ref={undoButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 whitespace-normal break-words text-center text-foreground hover:bg-muted hover:text-foreground transition-none"
            onClick={undo}
          >
            {undoState.label}
          </Button>
        </div>
      )}

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={announcement.id}>{announcement.message}</span>
      </p>
    </section>
  );
}

/** A task identity change remounts the stateful editor, preventing stale undo or drafts. */
export function LifeConnectionsEditor(props: LifeConnectionsEditorProps) {
  const tasks = useTaskStore(state => state.tasks);
  const availableDomains = useMemo(() => collectLifeDomainChoices(tasks), [tasks]);
  return <LifeConnectionsEditorContent key={props.task.id} {...props} availableDomains={availableDomains} />;
}
