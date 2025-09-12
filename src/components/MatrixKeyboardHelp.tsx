import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Keyboard, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Plus,
  Eye,
  X
} from 'lucide-react';

interface MatrixKeyboardHelpProps {
  onClose: () => void;
}

const KeyboardShortcut = ({ 
  keys, 
  description, 
  icon 
}: { 
  keys: string[]; 
  description: string; 
  icon?: React.ReactNode; 
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="flex items-center gap-2">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <span className="text-sm">{description}</span>
    </div>
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <React.Fragment key={key}>
          {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  </div>
);

export function MatrixKeyboardHelp({ onClose }: MatrixKeyboardHelpProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts - Eisenhower Matrix
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Navigation */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ArrowUp className="h-4 w-4" />
              Navigation
            </h3>
            <div className="space-y-1">
              <KeyboardShortcut
                keys={['↑', '↓', '←', '→']}
                description="Move between quadrants"
                icon={<ArrowUp className="h-4 w-4" />}
              />
              <KeyboardShortcut
                keys={['Tab']}
                description="Cycle through tasks in current quadrant"
              />
              <KeyboardShortcut
                keys={['1', '2', '3', '4']}
                description="Jump to specific quadrant (Do=1, Schedule=2, Delegate=3, Drop=4)"
              />
            </div>
          </section>

          <Separator />

          {/* Task Management */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Task Management
            </h3>
            <div className="space-y-1">
              <KeyboardShortcut
                keys={['Enter']}
                description="Edit selected task"
              />
              <KeyboardShortcut
                keys={['Space']}
                description="Toggle task completion"
              />
              <KeyboardShortcut
                keys={['N']}
                description="Add new task to current quadrant"
                icon={<Plus className="h-4 w-4" />}
              />
              <KeyboardShortcut
                keys={['Delete']}
                description="Delete selected task"
              />
            </div>
          </section>

          <Separator />

          {/* Matrix Controls */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Matrix Controls (when task is focused)
            </h3>
            <div className="space-y-1">
              <KeyboardShortcut
                keys={['←', '→']}
                description="Adjust task urgency (0-3)"
                icon={<ArrowLeft className="h-4 w-4" />}
              />
              <KeyboardShortcut
                keys={['↑', '↓']}
                description="Adjust task importance (0-3)"
                icon={<ArrowUp className="h-4 w-4" />}
              />
            </div>
          </section>

          <Separator />

          {/* Quadrant Filters */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Quadrant Filters
            </h3>
            <div className="space-y-1">
              <KeyboardShortcut
                keys={['Alt', '1']}
                description="Toggle Do quadrant visibility"
              />
              <KeyboardShortcut
                keys={['Alt', '2']}
                description="Toggle Schedule quadrant visibility"
              />
              <KeyboardShortcut
                keys={['Alt', '3']}
                description="Toggle Delegate quadrant visibility"
              />
              <KeyboardShortcut
                keys={['Alt', '4']}
                description="Toggle Drop quadrant visibility"
              />
            </div>
          </section>

          <Separator />

          {/* Help & Misc */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Help & Misc</h3>
            <div className="space-y-1">
              <KeyboardShortcut
                keys={['?']}
                description="Show this help dialog"
              />
              <KeyboardShortcut
                keys={['Esc']}
                description="Cancel current action / Close dialogs"
              />
            </div>
          </section>

          {/* Matrix Legend */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Matrix Quadrants</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">Q2</Badge>
                  <span className="font-medium text-blue-700 dark:text-blue-300">Schedule</span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">Not Urgent & Important</p>
              </div>
              
              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">Q1</Badge>
                  <span className="font-medium text-red-700 dark:text-red-300">Do</span>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400">Urgent & Important</p>
              </div>
              
              <div className="p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">Q4</Badge>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Drop</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Not Urgent & Not Important</p>
              </div>
              
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">Q3</Badge>
                  <span className="font-medium text-yellow-700 dark:text-yellow-300">Delegate</span>
                </div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Urgent & Not Important</p>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose} className="gap-2">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}