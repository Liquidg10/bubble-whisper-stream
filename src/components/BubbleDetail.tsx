import React, { useState } from 'react';
import { Bubble, Tag } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { TagPicker } from './TagPicker';
import { X, Play, Trash2, Plus, Calendar } from 'lucide-react';
import { ttsService } from '@/services/tts';
import { hapticsService } from '@/services/haptics';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedBubble, setEditedBubble] = useState<Bubble | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  React.useEffect(() => {
    if (bubble) {
      setEditedBubble({ ...bubble });
    }
  }, [bubble]);

  if (!bubble || !editedBubble) return null;

  const handleSave = async () => {
    await updateBubble(editedBubble);
    setIsEditing(false);
    hapticsService.success();
  };

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
        tone: 'neutral',
        useAI: true
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
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="capitalize">{bubble.type}</span>
            <div className="flex gap-2">
              {bubble.content && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePlayTTS}
                  disabled={isPlaying}
                  className="h-8 w-8 p-0"
                >
                  <Play className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Content */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Content</label>
            {isEditing ? (
              <Textarea
                value={editedBubble.content || ''}
                onChange={(e) => setEditedBubble({ ...editedBubble, content: e.target.value })}
                placeholder="What's on your mind?"
                className="mt-1"
                rows={4}
              />
            ) : (
              <p className="mt-1 p-3 bg-muted rounded-md text-sm">
                {bubble.content || 'No content'}
              </p>
            )}
          </div>

          {/* Size/Priority */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Priority: {Math.round(editedBubble.size * 100)}%
            </label>
            {isEditing ? (
              <Slider
                value={[editedBubble.size]}
                onValueChange={([value]) => setEditedBubble({ ...editedBubble, size: value })}
                max={1}
                min={0.1}
                step={0.1}
                className="mt-2"
              />
            ) : (
              <div className="mt-2 h-2 bg-muted rounded-full">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${editedBubble.size * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">Tags</label>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTagPicker(true)}
                  className="h-6 px-2"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {editedBubble.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-xs">
                  {tag.emoji} {tag.name}
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Created: {formatDate(bubble.createdAt)}</div>
            <div>Updated: {formatDate(bubble.updatedAt)}</div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            {isEditing ? (
              <>
                <Button onClick={handleSave} size="sm">
                  Save Changes
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  size="sm"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setIsEditing(true)} size="sm">
                  Edit
                </Button>
                {!bubble.reminderId && (
                  <Button
                    variant="outline"
                    onClick={handleAddReminder}
                    size="sm"
                  >
                    <Calendar className="h-4 w-4 mr-1" />
                    Remind Me
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  size="sm"
                  className="ml-auto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {showTagPicker && (
          <TagPicker
            onSelectTag={handleAddTag}
            onClose={() => setShowTagPicker(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};