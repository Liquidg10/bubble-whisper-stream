import React, { useState } from 'react';
import { Bubble, Tag } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { TagPicker } from './TagPicker';
import { Play, Trash2, Plus, Calendar, Image as ImageIcon, Target } from 'lucide-react';
import { ttsService } from '@/services/tts';
import { hapticsService } from '@/services/haptics';
import { getBubbleColorScheme, getBubbleTypeIcon } from '@/utils/bubbleColors';
import { ReceiptScanner } from './ReceiptScanner';
import { useToast } from '@/hooks/use-toast';
import { TaskOutliner } from './TaskOutliner';
import { isFeatureEnabled } from '@/config/flags';
import { AccessibleConfirmDialog } from '@/components/AccessibleConfirmDialog';
import { LifeConnectionsEditor } from '@/components/LifeConnectionsEditor';
import { bubbleToTask, withBubbleDomainLinks } from '@/adapters/taskAdapter';
import { useTaskStore } from '@/stores/taskStore';

interface BubbleDetailProps {
  bubble: Bubble | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BubbleDetail: React.FC<BubbleDetailProps> = ({
  bubble,
  isOpen,
  onClose,
}) => {
  const { updateBubbleStrict, deleteBubble, addReminder } = useBubbleStore();
  const updateTask = useTaskStore(state => state.updateTask);
  const [editedBubble, setEditedBubble] = useState<Bubble | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  // Delete requires an explicit confirm step (AccessibleConfirmDialog, already used
  // elsewhere in the app for accessible/calm-mode-aware confirmations -- see
  // AccessibilitySettings.tsx) rather than deleting on the first click. The Trash2
  // button below only opens this dialog; handleDelete (renamed target below) is now
  // the dialog's onConfirm, so a misclick can no longer instantly destroy a journaled
  // thought.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showOutliner, setShowOutliner] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isAuxiliarySaving, setIsAuxiliarySaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const skipNextAutoSave = React.useRef(false);
  const writeQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const isMountedRef = React.useRef(true);
  const editedBubbleRef = React.useRef<Bubble | null>(null);
  const dirtyBubbleRef = React.useRef<Bubble | null>(null);
  const loadedBubbleIdRef = React.useRef<string | null>(null);
  const wasOpenRef = React.useRef(false);
  const { toast } = useToast();

  const enqueueWrite = React.useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = writeQueueRef.current.then(operation, operation);
    writeQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  // Auto-save debounced function
  const debouncedSave = React.useMemo(
    () => debounce(async (bubbleToSave: Bubble) => {
      try {
        await enqueueWrite(() => updateBubbleStrict(bubbleToSave));
        if (dirtyBubbleRef.current === bubbleToSave) {
          dirtyBubbleRef.current = null;
        }
        if (isMountedRef.current) {
          setSaveError(null);
          toast({ title: "Changes saved", duration: 1000 });
        }
        return true;
      } catch {
        const message = 'Changes are still here, but could not be saved. Please try again.';
        if (isMountedRef.current) {
          setSaveError(message);
          toast({ title: "Couldn't save changes", description: message, variant: 'destructive' });
        }
        return false;
      }
    }, 1000),
    [enqueueWrite, updateBubbleStrict, toast]
  );

  React.useEffect(() => {
    const shouldLoad = Boolean(
      bubble
      && isOpen
      && (!wasOpenRef.current || loadedBubbleIdRef.current !== bubble.id),
    );
    wasOpenRef.current = isOpen;

    if (bubble && shouldLoad) {
      loadedBubbleIdRef.current = bubble.id;
      skipNextAutoSave.current = true;
      dirtyBubbleRef.current = null;
      setEditedBubble({ ...bubble });
      setSaveError(null);
      setCompletionError(null);
      setCompletionStatus('idle');
      setIsAuxiliarySaving(false);
      setIsClosing(false);
    }
  }, [bubble, isOpen]);

  React.useEffect(() => {
    editedBubbleRef.current = editedBubble;
  }, [editedBubble]);

  // Auto-save when editedBubble changes
  React.useEffect(() => {
    if (editedBubble && bubble && editedBubble !== bubble) {
      if (skipNextAutoSave.current) {
        skipNextAutoSave.current = false;
        return;
      }
      dirtyBubbleRef.current = editedBubble;
      debouncedSave(editedBubble);
    }
  }, [editedBubble, bubble, debouncedSave]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Route changes can unmount the modal without using its Done button. Flush
      // the last local edit so that a fast close never silently drops it.
      if (dirtyBubbleRef.current) debouncedSave(dirtyBubbleRef.current);
      void debouncedSave.flush();
    };
  }, [debouncedSave]);

  if (!bubble || !editedBubble) return null;

  const colorScheme = getBubbleColorScheme(bubble.type, bubble.size);
  const typeIcon = getBubbleTypeIcon(bubble.type);
  const canonicalTask = bubbleToTask(editedBubble);
  const isEditorBusy = completionStatus === 'saving' || isAuxiliarySaving || isClosing;

  const handleDelete = async () => {
    debouncedSave.cancel();
    await writeQueueRef.current;
    await deleteBubble(bubble.id);
    onClose();
    hapticsService.trigger('warning');
  };

  const handleClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    if (dirtyBubbleRef.current) debouncedSave(dirtyBubbleRef.current);
    const didSave = await debouncedSave.flush();
    await writeQueueRef.current;
    if (didSave === false || dirtyBubbleRef.current) {
      setIsClosing(false);
      return;
    }
    onClose();
  };

  const handlePlayTTS = async () => {
    if (!bubble.content) return;
    
    setIsPlaying(true);
    try {
      await ttsService.speak(bubble.content, {
        context: 'bubble-detail',
        tone: 'neutral'
      });
    } catch (error) {
      console.error('TTS failed:', error);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleAddReminder = async () => {
    if (isEditorBusy) return;
    setIsAuxiliarySaving(true);
    const reminderTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
    const reminder = {
      id: crypto.randomUUID(),
      bubbleId: bubble.id,
      scheduledAt: reminderTime,
      status: 'Active' as const,
      level: 1 as const,
      snoozes: [],
    };
    
    try {
      await addReminder(reminder);
      const latestBubble = editedBubbleRef.current;
      if (!latestBubble) throw new Error(`Bubble ${bubble.id} is no longer available`);
      const updatedBubble = { ...latestBubble, reminderId: reminder.id, updatedAt: Date.now() };
      await enqueueWrite(() => updateBubbleStrict(updatedBubble));
      dirtyBubbleRef.current = null;
      skipNextAutoSave.current = true;
      setEditedBubble(updatedBubble);
      setSaveError(null);
      hapticsService.success();
    } catch (error) {
      console.error('Failed to add reminder:', error);
      const message = 'Reminder could not be saved. Please try again.';
      setSaveError(message);
      toast({ title: 'Reminder not saved', description: message, variant: 'destructive' });
    } finally {
      setIsAuxiliarySaving(false);
    }
  };

  const handleReceiptUpdate = async (receiptBubble: Bubble) => {
    const latestBubble = editedBubbleRef.current;
    if (!latestBubble) throw new Error(`Bubble ${receiptBubble.id} is no longer available`);

    const tagByName = new Map<string, Tag>();
    for (const tag of [...latestBubble.tags, ...receiptBubble.tags]) {
      tagByName.set(tag.name.toLocaleLowerCase(), tag);
    }

    const updatedBubble: Bubble = {
      ...latestBubble,
      tags: [...tagByName.values()],
      metadata: {
        ...latestBubble.metadata,
        finance: receiptBubble.metadata?.finance,
      },
      updatedAt: Date.now(),
    };

    try {
      await enqueueWrite(() => updateBubbleStrict(updatedBubble));
      dirtyBubbleRef.current = null;
      skipNextAutoSave.current = true;
      setEditedBubble(updatedBubble);
      setSaveError(null);
    } catch (error) {
      const message = 'Receipt details could not be saved. Please try again.';
      setSaveError(message);
      throw error;
    }
  };

  const handleCompletionChange = async (checked: boolean | 'indeterminate') => {
    if (checked === 'indeterminate' || isEditorBusy) return;

    // Cancel the detail autosave queued when the modal opened. Completion is
    // persisted below through TaskStore's strict canonical write, including
    // any edits currently visible in the modal.
    const completionSnapshot = editedBubble;
    debouncedSave.cancel();
    setCompletionStatus('saving');
    setSaveError(null);
    setCompletionError(null);
    try {
      await enqueueWrite(() => updateTask(bubble.id, {
        ...bubbleToTask(completionSnapshot),
        completed: checked,
      }));

      const persistedBubble = useBubbleStore
        .getState()
        .bubbles
        .find(candidate => candidate.id === bubble.id);

      if (!persistedBubble) {
        throw new Error(`Task ${bubble.id} was not available after completion update`);
      }

      skipNextAutoSave.current = true;
      dirtyBubbleRef.current = null;
      setEditedBubble({ ...persistedBubble });
      setCompletionStatus('saved');
      setSaveError(null);
      setCompletionError(null);
      hapticsService.success();
    } catch (error) {
      console.error('Failed to update task completion:', error);
      const message = 'Completion could not be saved. Your task is still here; please try again.';
      setCompletionStatus('error');
      setCompletionError(message);
      dirtyBubbleRef.current = completionSnapshot;
      toast({
        title: 'Completion not saved',
        description: message,
        variant: 'destructive',
      });
      // The completion write included any pending editor changes. If that write
      // fails, retry those changes without changing completion so they are not
      // stranded by the canceled debounce.
      debouncedSave(completionSnapshot);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleAddTag = (tag: Tag) => {
    const updatedTags = [...editedBubble.tags, tag];
    setEditedBubble({ ...editedBubble, tags: updatedTags });
    setShowTagPicker(false);
  };

  const handleRemoveTag = (tagId: string) => {
    const updatedTags = editedBubble.tags.filter(t => t.id !== tagId);
    setEditedBubble({ ...editedBubble, tags: updatedTags });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isEditorBusy) void handleClose();
      }}
    >
      <DialogContent 
        className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-x-hidden overflow-y-auto [&>*]:min-w-0"
        onEscapeKeyDown={(event) => {
          if ((document.activeElement as HTMLElement | null)?.dataset.lifeInlineEdit === 'dirty') {
            event.preventDefault();
          }
        }}
        style={{ 
          backgroundColor: colorScheme.background,
          borderColor: colorScheme.border,
          color: colorScheme.text 
        }}
      >
        <DialogHeader>
          <DialogTitle 
            className="flex items-center justify-between"
            style={{ 
              borderBottomColor: colorScheme.border,
              borderBottomWidth: '1px',
              paddingBottom: '12px'
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{typeIcon}</span>
              <span className="capitalize font-semibold" style={{ color: colorScheme.accent }}>
                {bubble.type}
              </span>
            </div>
            <div className="flex gap-2">
              {bubble.content && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePlayTTS}
                  disabled={isPlaying}
                  className="h-8 w-8 p-0 hover:bg-transparent"
                  style={{ color: colorScheme.icon }}
                >
                  <Play className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <fieldset
          disabled={isEditorBusy}
          aria-busy={isEditorBusy}
          className="min-w-0 space-y-4 border-0 p-0"
        >
          {saveError && (
            <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {saveError}
            </p>
          )}
          {completionError && (
            <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {completionError}
            </p>
          )}

          {/* Photo Display */}
          {bubble.imageUri && (
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: colorScheme.text }}>Photo</label>
              <div 
                className="relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02]"
                style={{ borderColor: colorScheme.border }}
                onClick={() => setShowImageModal(true)}
              >
                <img 
                  src={bubble.imageUri} 
                  alt="Bubble content" 
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-white opacity-0 hover:opacity-70 transition-opacity" />
                </div>
              </div>
            </div>
          )}

          {/* Receipt Scanner - Only for photo bubbles */}
          {bubble.imageUri && (
            <ReceiptScanner
              bubble={editedBubble}
              onUpdate={handleReceiptUpdate}
              onBusyChange={setIsAuxiliarySaving}
            />
          )}

          {/* Content */}
          <div>
            <label className="text-sm font-medium" style={{ color: colorScheme.text }}>Content</label>
            <Textarea
              value={editedBubble.content || ''}
              onChange={(e) => setEditedBubble({ ...editedBubble, content: e.target.value })}
              placeholder="What's on your mind?"
              className="mt-1 bg-transparent border-2 transition-colors"
              style={{ 
                borderColor: colorScheme.border,
                color: colorScheme.text,
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }}
              rows={4}
            />
          </div>

          {/* Canonical task completion */}
          {bubble.type === 'Task' && (
            <div
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
              style={{ borderColor: colorScheme.border }}
            >
              <Checkbox
                id={`task-completed-${bubble.id}`}
                checked={editedBubble.completed ?? false}
                disabled={isEditorBusy}
                onCheckedChange={handleCompletionChange}
                className="h-5 w-5"
                aria-label="Completed"
                aria-describedby={`task-completion-help-${bubble.id} task-completion-status-${bubble.id}`}
              />
              <label
                htmlFor={`task-completed-${bubble.id}`}
                className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center py-2"
              >
                <span className="text-sm font-medium" style={{ color: colorScheme.text }}>
                  Completed
                </span>
                <span
                  id={`task-completion-help-${bubble.id}`}
                  className="text-xs"
                  style={{ color: `${colorScheme.text}99` }}
                >
                  Updates this task in every view.
                </span>
              </label>
              <span
                id={`task-completion-status-${bubble.id}`}
                className="sr-only"
                aria-live="polite"
              >
                {completionStatus === 'saving' && 'Saving completion status'}
                {completionStatus === 'saved' && 'Completion status saved'}
                {completionStatus === 'error' && 'Completion status was not saved'}
              </span>
            </div>
          )}

          {/* Size/Priority */}
          <div>
            <label className="text-sm font-medium flex items-center justify-between" style={{ color: colorScheme.text }}>
              <span>Priority</span>
              <span className="font-bold" style={{ color: colorScheme.accent }}>
                {Math.round(editedBubble.size * 100)}%
              </span>
            </label>
            <div className="mt-3">
              <Slider
                value={[editedBubble.size]}
                onValueChange={([value]) => setEditedBubble({ ...editedBubble, size: value })}
                max={1}
                min={0.1}
                step={0.1}
                className="slider-themed"
              />
              <div className="mt-2 h-3 bg-black/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${editedBubble.size * 100}%`,
                    backgroundColor: colorScheme.accent,
                    boxShadow: `0 0 8px ${colorScheme.accent}40`
                  }}
                />
              </div>
            </div>
          </div>

          {isFeatureEnabled('meaningLinks') && (
            <LifeConnectionsEditor
              task={canonicalTask}
              links={canonicalTask.domainLinks ?? []}
              onChange={(domainLinks) => {
                try {
                  setEditedBubble(withBubbleDomainLinks(editedBubble, domainLinks));
                  setSaveError(null);
                } catch {
                  setSaveError('This task was created by a newer data version and cannot be safely changed here.');
                }
              }}
            />
          )}

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: colorScheme.text }}>Tags</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTagPicker(true)}
                className="h-6 px-2 hover:bg-transparent"
                style={{ color: colorScheme.icon }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {editedBubble.tags.map((tag) => (
                <Badge 
                  key={tag.id} 
                  className="text-xs border transition-colors"
                  style={{ 
                    backgroundColor: `${colorScheme.accent}20`,
                    borderColor: colorScheme.accent,
                    color: colorScheme.text
                  }}
                >
                  {tag.emoji} {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-1 hover:opacity-70 transition-opacity"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-xs space-y-1" style={{ color: `${colorScheme.text}80` }}>
            <div>Created: {formatDate(bubble.createdAt)}</div>
            <div>Updated: {formatDate(bubble.updatedAt)}</div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderTopColor: colorScheme.border }}>
            <Button 
              onClick={() => void handleClose()}
              className="flex-1"
              style={{ 
                backgroundColor: colorScheme.accent,
                color: 'white'
              }}
            >
              Done
            </Button>
            {bubble.type === 'Task' && isFeatureEnabled('outliner') && (
              <Button
                variant="outline"
                onClick={() => setShowOutliner(true)}
                size="sm"
                style={{ 
                  borderColor: colorScheme.border,
                  color: colorScheme.text
                }}
              >
                <Target className="h-4 w-4 mr-1" />
                Break Down
              </Button>
            )}
            {!bubble.reminderId && (
              <Button
                variant="outline"
                onClick={handleAddReminder}
                size="sm"
                style={{ 
                  borderColor: colorScheme.border,
                  color: colorScheme.text
                }}
              >
                <Calendar className="h-4 w-4 mr-1" />
                Remind
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              size="sm"
              className="ml-auto"
              aria-label="Delete bubble"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </fieldset>

        {showTagPicker && (
          <TagPicker
            onSelectTag={handleAddTag}
            onClose={() => setShowTagPicker(false)}
          />
        )}

        {/* Task Outliner Modal */}
        {showOutliner && (
          <TaskOutliner
            bubble={bubble}
            isOpen={showOutliner}
            onClose={() => setShowOutliner(false)}
          />
        )}

        {/* Full-screen image modal */}
        {showImageModal && bubble.imageUri && (
          <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-2">
              <div className="relative">
                <img 
                  src={bubble.imageUri} 
                  alt="Bubble content full view" 
                  className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImageModal(false)}
                  className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                >
                  ×
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <AccessibleConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          action="delete"
          item="this bubble"
          onConfirm={handleDelete}
          variant="destructive"
        />
      </DialogContent>
    </Dialog>
  );
};

// Debounce utility function
type DebouncedFunction<T extends (...args: never[]) => Promise<boolean>> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void;
  flush: () => Promise<boolean | undefined>;
};

function debounce<T extends (...args: never[]) => Promise<boolean>>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | undefined;
  let pendingArgs: Parameters<T> | undefined;
  let inFlight: Promise<boolean> | null = null;

  const invoke = (): Promise<boolean | undefined> => {
    if (!pendingArgs) return inFlight ?? Promise.resolve(undefined);

    const args = pendingArgs;
    pendingArgs = undefined;
    timeout = undefined;
    const operation = func(...args);
    inFlight = operation;
    void operation.finally(() => {
      if (inFlight === operation) inFlight = null;
    });
    return operation;
  };

  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    pendingArgs = args;
    timeout = setTimeout(() => {
      void invoke();
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    pendingArgs = undefined;
  };

  debounced.flush = () => {
    if (timeout) clearTimeout(timeout);
    timeout = undefined;
    return invoke();
  };

  return debounced;
}
