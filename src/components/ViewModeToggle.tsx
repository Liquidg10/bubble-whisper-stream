/**
 * View Mode Toggle - Switch between bubble and atomic views
 */

import { Button } from "@/components/ui/button";
import { Atom, Circle } from "lucide-react";
import { useBubbleStore } from "@/stores/bubbleStore";

export function ViewModeToggle() {
  const { settings, setViewMode } = useBubbleStore();
  const currentMode = settings.viewMode || 'bubble';

  return (
    <div className="flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-md">
      <Button
        variant={currentMode === 'bubble' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => {
          console.log('🔘 Clicked bubble view mode');
          setViewMode('bubble');
        }}
        className="h-8 px-2"
        aria-label="Bubble view mode"
      >
        <Circle className="h-4 w-4" />
      </Button>
      <Button
        variant={currentMode === 'atomic' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => {
          console.log('⚛️ Clicked atomic view mode');
          setViewMode('atomic');
        }}
        className="h-8 px-2"
        aria-label="Atomic view mode"
      >
        <Atom className="h-4 w-4" />
      </Button>
    </div>
  );
}