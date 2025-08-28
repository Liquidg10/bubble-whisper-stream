import React, { useEffect } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw } from 'lucide-react';

// Create test data for basic testing
const createTestBubbles = (): Bubble[] => {
  const baseTime = Date.now();
  
  return [
    {
      id: 'test-task-1',
      type: 'Task',
      content: 'Write script for video',
      x: -200,
      y: -100,
      size: 1.2,
      createdAt: baseTime - 3600000,
      updatedAt: baseTime - 3600000,
      tags: [],
      completed: false
    },
    {
      id: 'test-thought-1',
      type: 'Thought',
      content: 'Remember to call mom',
      x: 100,
      y: -50,
      size: 0.8,
      createdAt: baseTime - 7200000,
      updatedAt: baseTime - 7200000,
      tags: [],
      completed: false
    },
    {
      id: 'test-memory-1',
      type: 'Memory',
      content: 'Beach vacation last summer',
      x: -50,
      y: 150,
      size: 1.5,
      createdAt: baseTime - 86400000,
      updatedAt: baseTime - 86400000,
      tags: [],
      completed: false,
      imageUri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzRGQkRGRiIvPjx0ZXh0IHg9IjEwMCIgeT0iMTAwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5CZWFjaCBQaG90bzwvdGV4dD48L3N2Zz4='
    },
    {
      id: 'test-task-2',
      type: 'Task',
      content: 'Buy groceries',
      x: 200,
      y: 100,
      size: 1.0,
      createdAt: baseTime - 1800000,
      updatedAt: baseTime - 1800000,
      tags: [],
      completed: true
    },
    {
      id: 'test-mood-1',
      type: 'Mood',
      content: 'Feeling productive today! 🚀',
      x: -150,
      y: 50,
      size: 1.1,
      createdAt: baseTime - 900000,
      updatedAt: baseTime - 900000,
      tags: [],
      completed: false,
      moodColor: 'hsl(135 100% 75%)'
    },
    {
      id: 'test-photo-1',
      type: 'Memory',
      content: 'Pepper painting at sunset',
      x: 50,
      y: -150,
      size: 1.3,
      createdAt: baseTime - 3600000,
      updatedAt: baseTime - 3600000,
      tags: [],
      completed: false,
      imageUri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9InN1bnNldCIgeDE9IjAlIiB5MT0iMCUiIHgyPSIxMDAlIiB5Mj0iMTAwJSI+PHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI0ZGNkI2QiIvPjxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjRkZBNTAwIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjRkZEQjAwIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9InVybCgjc3Vuc2V0KSIvPjx0ZXh0IHg9IjEwMCIgeT0iMTAwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TdW5zZXQgUGFpbnRpbmc8L3RleHQ+PC9zdmc+'
    },
    {
      id: 'test-reminder-1',
      type: 'ReminderNote',
      content: 'Doctor appointment tomorrow',
      x: -100,
      y: -200,
      size: 0.9,
      createdAt: baseTime - 1800000,
      updatedAt: baseTime - 1800000,
      tags: [],
      completed: false,
      reminderId: 'reminder-1'
    },
    {
      id: 'test-thought-2',
      type: 'Thought',
      content: 'Need to organize workspace',
      x: 150,
      y: -100,
      size: 0.7,
      createdAt: baseTime - 5400000,
      updatedAt: baseTime - 5400000,
      tags: [],
      completed: false
    },
    {
      id: 'test-memory-2',
      type: 'Memory',
      content: 'Great conversation with team',
      x: -250,
      y: 100,
      size: 1.0,
      createdAt: baseTime - 10800000,
      updatedAt: baseTime - 10800000,
      tags: [],
      completed: false
    },
    {
      id: 'test-photo-2',
      type: 'Memory',
      content: 'Coffee art this morning',
      x: 250,
      y: -50,
      size: 1.1,
      createdAt: baseTime - 7200000,
      updatedAt: baseTime - 7200000,
      tags: [],
      completed: false,
      imageUri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjgwIiBmaWxsPSIjOEE0REZGIiBzdHJva2U9IiNGRjZCNkIiIHN0cm9rZS13aWR0aD0iNCIvPjx0ZXh0IHg9IjEwMCIgeT0iMTA1IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkNvZmZlZSBBcnQ8L3RleHQ+PC9zdmc+'
    }
  ];
};

export default function DevBubblesBasic() {
  const { bubbles, addBubble, clearAllBubbles } = useBubbleStore();

  useEffect(() => {
    // Add test bubbles if none exist
    if (bubbles.length === 0) {
      const testBubbles = createTestBubbles();
      testBubbles.forEach(bubble => addBubble(bubble));
    }
  }, [bubbles.length, addBubble]);

  const resetTestData = async () => {
    await clearAllBubbles();
    const testBubbles = createTestBubbles();
    testBubbles.forEach(bubble => addBubble(bubble));
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header with dev controls */}
      <div className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 z-10">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Dev: Bubbles Basic Test
          </h1>
          <p className="text-sm text-text-secondary">
            {bubbles.length} bubbles • Test drag, pan/zoom, merge, photos, motion
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetTestData}
            className="bg-card/80"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Test Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAllBubbles}
            className="bg-card/80"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Main canvas */}
      <div className="flex-1 relative">
        <BubbleCanvas 
          onBubbleSelect={(bubble) => {
            console.log('Selected bubble:', bubble);
          }}
          onBubbleEdit={(bubble) => {
            console.log('Edited bubble:', bubble);
          }}
        />
      </div>

      {/* Instructions overlay */}
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 max-w-sm">
        <h3 className="text-sm font-medium text-text-primary mb-2">Test Instructions</h3>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>• Drag bubbles to move and test merge</li>
          <li>• Scroll/pinch to zoom</li>
          <li>• Click empty space to pan</li>
          <li>• Check photo visibility & type-colored rims</li>
          <li>• Test Float motion toggle</li>
          <li>• Verify Reduced Motion settings</li>
        </ul>
      </div>
    </div>
  );
}