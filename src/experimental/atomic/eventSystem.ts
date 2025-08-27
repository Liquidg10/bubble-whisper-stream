/**
 * Clean Event System for Atomic Renderer
 * Manages interaction states without conflicts
 */

export type InteractionState = 
  | { type: 'idle' }
  | { type: 'dragging-electron'; electronId: string; originalShell: number; currentShell: number | null }
  | { type: 'dragging-molecule'; moleculeId: string; startX: number; startY: number }
  | { type: 'panning-canvas'; startX: number; startY: number; initialViewport: { x: number; y: number } }
  | { type: 'dragging-ui'; element: 'domain' | 'time' };

export interface EventSystemState {
  interaction: InteractionState;
  hoveredShell: number | null;
  preventAnimation: boolean; // Disable animation during interactions
}

/**
 * Event system manager
 */
export class EventSystem {
  private state: EventSystemState;
  private listeners: Set<(state: EventSystemState) => void> = new Set();

  constructor() {
    this.state = {
      interaction: { type: 'idle' },
      hoveredShell: null,
      preventAnimation: false
    };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: EventSystemState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current state
   */
  getState(): EventSystemState {
    return this.state;
  }

  /**
   * Update state and notify listeners
   */
  private setState(newState: Partial<EventSystemState>) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Start electron dragging
   */
  startElectronDrag(electronId: string, originalShell: number) {
    this.setState({
      interaction: { 
        type: 'dragging-electron', 
        electronId, 
        originalShell, 
        currentShell: null 
      },
      preventAnimation: true
    });
  }

  /**
   * Update electron drag
   */
  updateElectronDrag(currentShell: number | null, hoveredShell: number | null) {
    if (this.state.interaction.type !== 'dragging-electron') return;
    
    this.setState({
      interaction: { 
        ...this.state.interaction, 
        currentShell 
      },
      hoveredShell
    });
  }

  /**
   * End electron dragging
   */
  endElectronDrag(): { electronId: string; originalShell: number; currentShell: number | null } | null {
    if (this.state.interaction.type !== 'dragging-electron') return null;
    
    const result = {
      electronId: this.state.interaction.electronId,
      originalShell: this.state.interaction.originalShell,
      currentShell: this.state.interaction.currentShell
    };
    
    this.setState({
      interaction: { type: 'idle' },
      hoveredShell: null,
      preventAnimation: false
    });
    
    return result;
  }

  /**
   * Start molecule dragging
   */
  startMoleculeDrag(moleculeId: string, startX: number, startY: number) {
    this.setState({
      interaction: { 
        type: 'dragging-molecule', 
        moleculeId, 
        startX, 
        startY 
      },
      preventAnimation: true
    });
  }

  /**
   * End molecule dragging
   */
  endMoleculeDrag() {
    this.setState({
      interaction: { type: 'idle' },
      preventAnimation: false
    });
  }

  /**
   * Start canvas panning
   */
  startCanvasPan(startX: number, startY: number, initialViewport: { x: number; y: number }) {
    this.setState({
      interaction: { 
        type: 'panning-canvas', 
        startX, 
        startY, 
        initialViewport 
      }
    });
  }

  /**
   * End canvas panning
   */
  endCanvasPan() {
    this.setState({
      interaction: { type: 'idle' }
    });
  }

  /**
   * Start UI dragging
   */
  startUIDrag(element: 'domain' | 'time') {
    this.setState({
      interaction: { type: 'dragging-ui', element }
    });
  }

  /**
   * End UI dragging
   */
  endUIDrag() {
    this.setState({
      interaction: { type: 'idle' }
    });
  }

  /**
   * Check if animation should be prevented
   */
  shouldPreventAnimation(): boolean {
    return this.state.preventAnimation;
  }

  /**
   * Check if a specific interaction is active
   */
  isInteractionActive(type: InteractionState['type']): boolean {
    return this.state.interaction.type === type;
  }
}