import React, { useState } from 'react';
import { BookOpen, Plus, Sprout } from 'lucide-react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { AtomicView } from '@/components/AtomicView';
import { RadialCapture } from '@/components/RadialCapture';
import { NotificationSystem } from '@/components/NotificationSystem';
import { JoyMomentumIntegration } from '@/components/JoyMomentumIntegration';
import { useBubbleStore } from '@/stores/bubbleStore';
import { BubbleDetail } from '@/components/BubbleDetail';
import { SmartTaskQuickAdd } from '@/components/SmartTaskQuickAdd';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BubbleGardenDialog,
  StarterWelcome,
  useStarterBubbles,
} from '@/components/BubbleGarden';

export default function Index() {
  const { isLoading, bubbles, settings } = useBubbleStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [gardenMode, setGardenMode] = useState<'guide' | 'grow' | null>(null);
  const starter = useStarterBubbles();
  const currentViewMode = settings.viewMode || 'bubble';
  const selectedBubble =
    bubbles.find((bubble) => bubble.id === selectedId) ?? null;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <div className="relative min-h-[180px] flex-1">
        {isLoading ? (
          <div
            role="status"
            className="grid h-full place-items-center text-sm text-muted-foreground"
          >
            Making room for your bubbles…
          </div>
        ) : bubbles.length === 0 ? (
          <div className="absolute inset-0 overflow-y-auto">
            <StarterWelcome
              onStart={starter.start}
              onCreate={() => setShowAdd(true)}
              busy={starter.busy}
              error={starter.error}
            />
          </div>
        ) : currentViewMode === 'bubble' ? (
          <BubbleCanvas
            onBubbleSelect={(bubble) => setSelectedId(bubble.id)}
            onBubbleEdit={(bubble) => setSelectedId(bubble.id)}
          />
        ) : (
          <AtomicView
            onBubbleSelect={setSelectedId}
            onBubbleEdit={setSelectedId}
          />
        )}
      </div>
      {starter.error && bubbles.length > 0 && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t bg-card px-3 py-2 text-sm"
        >
          <span>{starter.error}</span>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={starter.start}
            disabled={starter.busy}
          >
            Retry guide
          </Button>
        </div>
      )}
      <div
        data-panel
        data-testid="canvas-action-dock"
        className="relative z-30 flex shrink-0 flex-wrap items-center justify-center gap-1 border-t border-border/60 bg-card/90 px-2 py-2 sm:gap-3"
        aria-label="Bubble actions"
      >
        <RadialCapture className="!relative !bottom-auto !left-auto [&>button]:h-11 [&>button]:w-11" />
        <Button
          data-shell-control="quick-add"
          onClick={() => setShowAdd(true)}
          className="min-h-11 gap-2 rounded-full px-4"
        >
          <Plus className="h-4 w-4" />
          <span>Add task</span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 gap-2 rounded-full px-3"
          onClick={() => setGardenMode('grow')}
        >
          <Sprout className="h-4 w-4" />
          <span>Grow ideas</span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 gap-2 rounded-full px-3"
          onClick={() => setGardenMode('guide')}
        >
          <BookOpen className="h-4 w-4" />
          <span>Guide</span>
        </Button>
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Make a little space</DialogTitle>
            <DialogDescription>
              A task, a thought, a small beginning. You can connect it to your
              life areas in its details.
            </DialogDescription>
          </DialogHeader>
          <SmartTaskQuickAdd
            onCreated={(id) => {
              setShowAdd(false);
              setSelectedId(id);
            }}
          />
        </DialogContent>
      </Dialog>
      <BubbleGardenDialog
        starter={starter}
        mode={gardenMode}
        onClose={() => setGardenMode(null)}
        onOpenTask={setSelectedId}
      />
      <BubbleDetail
        bubble={selectedBubble}
        isOpen={!!selectedBubble}
        onClose={() => setSelectedId(null)}
      />
      <NotificationSystem />
      <JoyMomentumIntegration />
    </div>
  );
}
