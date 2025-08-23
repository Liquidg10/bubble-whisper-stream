import React, { useState } from 'react';
import { Tag } from '@/types/bubble';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search } from 'lucide-react';

interface TagPickerProps {
  onSelectTag: (tag: Tag) => void;
  onClose: () => void;
}

const EMOTION_TAGS = [
  { emoji: '😊', name: 'Joy' },
  { emoji: '😢', name: 'Sadness' },
  { emoji: '😡', name: 'Anger' },
  { emoji: '😰', name: 'Anxiety' },
  { emoji: '😌', name: 'Peace' },
  { emoji: '🤔', name: 'Thoughtful' },
  { emoji: '😴', name: 'Tired' },
  { emoji: '💪', name: 'Motivated' },
  { emoji: '🎉', name: 'Excited' },
  { emoji: '😕', name: 'Confused' },
];

const PEOPLE_TAGS = [
  { emoji: '🐕', name: 'Pepper' },
  { emoji: '👥', name: 'Family' },
  { emoji: '👫', name: 'Friends' },
  { emoji: '💼', name: 'Work' },
  { emoji: '🏥', name: 'Doctor' },
];

const ACTIVITY_TAGS = [
  { emoji: '🏃', name: 'Exercise' },
  { emoji: '📚', name: 'Learning' },
  { emoji: '🍳', name: 'Cooking' },
  { emoji: '🎵', name: 'Music' },
  { emoji: '🌿', name: 'Nature' },
  { emoji: '💊', name: 'Medication' },
];

export const TagPicker: React.FC<TagPickerProps> = ({ onSelectTag, onClose }) => {
  const { tags, addTag } = useBubbleStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [activeCategory, setActiveCategory] = useState<'emotions' | 'people' | 'activities' | 'recent'>('emotions');

  const allPresetTags = [
    ...EMOTION_TAGS.map(t => ({ ...t, category: 'emotions' })),
    ...PEOPLE_TAGS.map(t => ({ ...t, category: 'people' })),
    ...ACTIVITY_TAGS.map(t => ({ ...t, category: 'activities' })),
  ];

  const recentTags = tags.slice(-10);

  const filteredPresetTags = allPresetTags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (activeCategory === 'recent' || tag.category === activeCategory)
  );

  const filteredRecentTags = recentTags.filter(tag =>
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectPresetTag = (presetTag: { emoji: string; name: string }) => {
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: presetTag.name,
      emoji: presetTag.emoji,
    };
    onSelectTag(tag);
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim()) return;

    const tag: Tag = {
      id: crypto.randomUUID(),
      name: newTagName.trim(),
      emoji: '🏷️',
    };

    await addTag(tag);
    onSelectTag(tag);
    setNewTagName('');
  };

  const categories = [
    { key: 'emotions', label: 'Emotions', emoji: '😊' },
    { key: 'people', label: 'People', emoji: '👥' },
    { key: 'activities', label: 'Activities', emoji: '🏃' },
    { key: 'recent', label: 'Recent', emoji: '🕒' },
  ] as const;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {categories.map((category) => (
              <Button
                key={category.key}
                variant={activeCategory === category.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(category.key)}
                className="whitespace-nowrap"
              >
                {category.emoji} {category.label}
              </Button>
            ))}
          </div>

          {/* Tag Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {activeCategory === 'recent' 
                ? filteredRecentTags.map((tag) => (
                    <Button
                      key={tag.id}
                      variant="outline"
                      onClick={() => onSelectTag(tag)}
                      className="h-auto p-3 flex items-center gap-2 justify-start"
                    >
                      <span>{tag.emoji}</span>
                      <span className="text-sm truncate">{tag.name}</span>
                    </Button>
                  ))
                : filteredPresetTags.map((tag, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      onClick={() => handleSelectPresetTag(tag)}
                      className="h-auto p-3 flex items-center gap-2 justify-start"
                    >
                      <span>{tag.emoji}</span>
                      <span className="text-sm truncate">{tag.name}</span>
                    </Button>
                  ))
              }
            </div>
          </div>

          {/* Create New Tag */}
          <div className="border-t pt-4">
            <div className="flex gap-2">
              <Input
                placeholder="Create new tag..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateNewTag()}
              />
              <Button
                onClick={handleCreateNewTag}
                disabled={!newTagName.trim()}
                size="sm"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};