/**
 * Kanban Column Settings Dialog
 * Allows users to customize column appearance and behavior
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Palette } from 'lucide-react';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
}

interface KanbanColumnSettingsProps {
  column: KanbanColumn;
  isOpen: boolean;
  onClose: () => void;
  onSave: (column: KanbanColumn) => void;
}

const PRESET_COLORS = [
  'hsl(var(--muted))',
  'hsl(var(--primary-accent))', 
  'hsl(var(--accent-flow))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
];

export function KanbanColumnSettings({ 
  column, 
  isOpen, 
  onClose, 
  onSave 
}: KanbanColumnSettingsProps) {
  const [title, setTitle] = useState(column.title);
  const [color, setColor] = useState(column.color);

  const handleSave = () => {
    onSave({
      ...column,
      title: title.trim() || column.title,
      color
    });
    onClose();
  };

  const handleCancel = () => {
    setTitle(column.title);
    setColor(column.color);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Column Settings</DialogTitle>
          <DialogDescription>
            Customize the appearance and name of your column.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="column-title">Column Title</Label>
            <Input
              id="column-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter column title..."
              className="h-11" // WCAG 44px target size
            />
          </div>
          
          <div className="space-y-2">
            <Label>Column Color</Label>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((presetColor, index) => (
                  <button
                    key={index}
                    className="w-11 h-11 rounded-md border-2 transition-all hover:scale-110"
                    style={{ 
                      backgroundColor: presetColor,
                      borderColor: color === presetColor ? 'hsl(var(--ring))' : 'hsl(var(--border))'
                    }}
                    onClick={() => setColor(presetColor)}
                    aria-label={`Select color ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} className="h-11">
            Cancel
          </Button>
          <Button onClick={handleSave} className="h-11">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}