interface ViewportState {
  x: number;
  y: number;
  scale: number;
  timestamp: number;
}

const VIEWPORT_STORAGE_KEY = 'viewport-memory';

class ViewportMemoryService {
  private cache: Map<string, ViewportState> = new Map();

  saveViewport(viewKey: string, state: { x: number; y: number; scale: number }) {
    const viewportState: ViewportState = {
      ...state,
      timestamp: Date.now()
    };

    this.cache.set(viewKey, viewportState);
    
    try {
      const allStates = Object.fromEntries(this.cache);
      localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(allStates));
    } catch (error) {
      console.warn('Failed to save viewport state:', error);
    }
  }

  restoreViewport(viewKey: string): { x: number; y: number; scale: number } | null {
    // Check cache first
    if (this.cache.has(viewKey)) {
      const state = this.cache.get(viewKey)!;
      return { x: state.x, y: state.y, scale: state.scale };
    }

    // Load from localStorage if not in cache
    try {
      const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
      if (stored) {
        const allStates = JSON.parse(stored) as Record<string, ViewportState>;
        if (allStates[viewKey]) {
          const state = allStates[viewKey];
          this.cache.set(viewKey, state);
          return { x: state.x, y: state.y, scale: state.scale };
        }
      }
    } catch (error) {
      console.warn('Failed to restore viewport state:', error);
    }

    return null;
  }

  clearViewport(viewKey: string) {
    this.cache.delete(viewKey);
    
    try {
      const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
      if (stored) {
        const allStates = JSON.parse(stored) as Record<string, ViewportState>;
        delete allStates[viewKey];
        localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(allStates));
      }
    } catch (error) {
      console.warn('Failed to clear viewport state:', error);
    }
  }

  clearAll() {
    this.cache.clear();
    try {
      localStorage.removeItem(VIEWPORT_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear all viewport states:', error);
    }
  }
}

export const viewportMemoryService = new ViewportMemoryService();