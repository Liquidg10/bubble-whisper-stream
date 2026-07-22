import React, { useState, useEffect, useCallback } from 'react';
import { Bubble, Tag } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const { updateBubble, deleteBubble, addReminder } = useBubbleStore();
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
  const { toast } = useToast();

  // Auto-save debounced function
  const debouncedSave = useCallback(
    debounce(async (bubbleToSave: Bubble) => {
      await updateBubble(bubbleToSave);
      toast({ title: "Changes saved", duration: 1000 });
    }, 1000),
    [updateBubble, toast]
  );

  React.useEffect(() => {
    if (bubble) {
      setEditedBubble({ ...bubble });
    }
  }, [bubble]);

  // Auto-save when editedBubble changes
  React.useEffect(() => {
    if (editedBubble && bubble && editedBubble !== bubble) {
      debouncedSave(editedBubble);
    }
  }, [editedBubble, bubble, debouncedSave]);

  if (!bubble || !editedBubble) return null;

  const colorScheme = getBubbleColorScheme(bubble.type, bubble.size);
  const typeIcon = getBubbleTypeIcon(bubble.type);

  const handleDelete = async () => {
    await deleteBubble(bubble.id);
    onClose();
    hapticsService.trigger('warning');
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
    const reminderTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
    const reminder = {
      id: crypto.randomUUID(),
      bubbleId: bubble.id,
      scheduledAt: reminderTime,
      status: 'Active' as const,
      level: 1 as const,
      snoozes: [],
    };
    
    await addReminder(reminder);
    setEditedBubble({ ...editedBubble, reminderId: reminder.id });
    hapticsService.success();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-md mx-auto max-h-[90vh] overflow-y-auto"
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

        <div className="space-y-4">
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
              bubble={bubble}
              onUpdate={(updatedBubble) => {
                setEditedBubble(updatedBubble);
                updateBubble(updatedBubble);
              }}
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
          <div className="flex gap-2 pt-4 border-t" style={{ borderTopColor: colorScheme.border }}>
            <Button 
              onClick={onClose} 
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
        </div>

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
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}