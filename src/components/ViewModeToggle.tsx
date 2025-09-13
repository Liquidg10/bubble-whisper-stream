/**
 * View Mode Toggle - Switch between bubble, atomic, list, and matrix views
 */

import { Button } from "@/components/ui/button";
import { Atom, Circle, List, Grid3x3 } from "lucide-react";
import { useBubbleStore } from "@/stores/bubbleStore";
import { useLocation, useNavigate } from "react-router-dom";

export function ViewModeToggle() {
  const { settings, setViewMode } = useBubbleStore();
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentPath = location.pathname;
  
  const handleViewChange = (view: string, path: string) => {
    if (path === '/') {
      // For bubble and atomic views, update store and stay on Index page
      setViewMode(view as 'bubble' | 'atomic');
    } else {
      // For list and matrix views, navigate to their respective pages
      navigate(path);
    }
  };
  
  const isActive = (path: string, viewMode?: string) => {
    if (path === '/') {
      return currentPath === '/' && (settings.viewMode || 'bubble') === viewMode;
    }
    return currentPath === path;
  };

  return (
    <div className="flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-md">
      <Button
        variant={isActive('/', 'bubble') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleViewChange('bubble', '/')}
        className="h-11 px-3"
        aria-label="Bubble view mode"
      >
        <Circle className="h-4 w-4" />
      </Button>
      <Button
        variant={isActive('/', 'atomic') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleViewChange('atomic', '/')}
        className="h-11 px-3"
        aria-label="Atomic view mode"
      >
        <Atom className="h-4 w-4" />
      </Button>
      <Button
        variant={isActive('/list') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleViewChange('list', '/list')}
        className="h-11 px-3"
        aria-label="List view mode"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant={isActive('/matrix') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => handleViewChange('matrix', '/matrix')}
        className="h-11 px-3"
        aria-label="Matrix view mode"
      >
        <Grid3x3 className="h-4 w-4" />
      </Button>
    </div>
  );
}