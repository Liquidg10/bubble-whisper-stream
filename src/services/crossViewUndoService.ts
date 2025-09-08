interface UndoEntry {
  id: string;
  timestamp: number;
  view: 'bubble' | 'atomic' | 'integration';
  type: 'merge' | 'drag' | 'edit' | 'create' | 'delete' | 'calendar-create' | 'calendar-update' | 'email-draft' | 'email-send';
  data: any;
  description: string;
  compensationFn?: () => Promise<void>;
  traceId?: string;
}

class CrossViewUndoService {
  private stack: UndoEntry[] = [];
  private maxEntries = 20;
  private listeners: ((stack: UndoEntry[]) => void)[] = [];

  addEntry(entry: Omit<UndoEntry, 'id' | 'timestamp'>) {
    const undoEntry: UndoEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };

    // Add to beginning of stack
    this.stack.unshift(undoEntry);

    // Maintain max entries
    if (this.stack.length > this.maxEntries) {
      this.stack = this.stack.slice(0, this.maxEntries);
    }

    this.notifyListeners();
    
    console.log(`🔄 Undo entry added: ${entry.description} (${entry.view} view)`);
  }

  async undo(): Promise<UndoEntry | null> {
    if (this.stack.length === 0) return null;

    const entry = this.stack.shift()!;
    
    // Execute compensation function if available
    if (entry.compensationFn) {
      try {
        await entry.compensationFn();
        console.log(`↩️ Compensated: ${entry.description}`);
      } catch (error) {
        console.error(`Failed to compensate ${entry.description}:`, error);
        // Re-add to stack if compensation failed
        this.stack.unshift(entry);
        this.notifyListeners();
        throw error;
      }
    }

    this.notifyListeners();
    console.log(`↩️ Undoing: ${entry.description} (${entry.view} view)`);
    return entry;
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }

  getLastEntry(): UndoEntry | null {
    return this.stack[0] || null;
  }

  getStack(): UndoEntry[] {
    return [...this.stack];
  }

  clear() {
    this.stack = [];
    this.notifyListeners();
  }

  subscribe(listener: (stack: UndoEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.stack]));
  }
}

export const crossViewUndoService = new CrossViewUndoService();