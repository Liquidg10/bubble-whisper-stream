/**
 * Phase 4: Activation Ritual Service Integration
 * Manages ritual state and integration with task system
 */

interface RitualSession {
  id: string;
  startTime: number;
  endTime?: number;
  breathCount: number;
  completed: boolean;
  context: 'task-start' | 'overwhelm-detected' | 'manual' | 'context-switch';
}

interface RitualMetrics {
  totalSessions: number;
  completedSessions: number;
  averageDuration: number;
  overwhelmInterventions: number;
  lastSession?: RitualSession;
}

class ActivationRitualService {
  private sessions: RitualSession[] = [];
  private currentSession: RitualSession | null = null;
  private listeners: ((metrics: RitualMetrics) => void)[] = [];

  startRitual(context: RitualSession['context'] = 'manual', breathCount: number = 3): string {
    const sessionId = `ritual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      id: sessionId,
      startTime: Date.now(),
      breathCount,
      completed: false,
      context
    };

    this.sessions.push(this.currentSession);
    this.notifyListeners();
    
    // Log for analytics (consent-gated)
    console.log(`[Ritual] Started: ${context} context, ${breathCount} breaths`);
    
    return sessionId;
  }

  completeRitual(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    session.endTime = Date.now();
    session.completed = true;
    this.currentSession = null;

    const duration = session.endTime - session.startTime;
    console.log(`[Ritual] Completed: ${duration}ms duration`);

    this.notifyListeners();
  }

  cancelRitual(sessionId: string): void {
    const sessionIndex = this.sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;

    this.sessions.splice(sessionIndex, 1);
    this.currentSession = null;
    this.notifyListeners();
  }

  getCurrentSession(): RitualSession | null {
    return this.currentSession;
  }

  getMetrics(): RitualMetrics {
    const completed = this.sessions.filter(s => s.completed);
    const overwhelmSessions = this.sessions.filter(s => s.context === 'overwhelm-detected');
    
    const averageDuration = completed.length > 0
      ? completed.reduce((sum, s) => sum + (s.endTime! - s.startTime), 0) / completed.length
      : 0;

    return {
      totalSessions: this.sessions.length,
      completedSessions: completed.length,
      averageDuration,
      overwhelmInterventions: overwhelmSessions.length,
      lastSession: this.sessions[this.sessions.length - 1]
    };
  }

  // Integration with overwhelm detection
  triggerOverwhelmRitual(): string {
    console.log('[Ritual] Overwhelm detected, suggesting activation ritual');
    return this.startRitual('overwhelm-detected', 1); // Shorter for overwhelm
  }

  // Integration with context switching
  triggerContextSwitchRitual(): string {
    console.log('[Ritual] Context switch detected, offering transition ritual');
    return this.startRitual('context-switch', 3);
  }

  // Integration with task system
  suggestRitualForTask(taskComplexity: 'low' | 'medium' | 'high'): boolean {
    const metrics = this.getMetrics();
    const recentSession = metrics.lastSession;
    
    // Don't suggest too frequently
    if (recentSession && Date.now() - recentSession.startTime < 30 * 60 * 1000) {
      return false;
    }

    // Suggest for high complexity tasks or after 3+ incomplete tasks
    return taskComplexity === 'high' || this.shouldIntervenForPattern();
  }

  private shouldIntervenForPattern(): boolean {
    // Analyze recent task completion patterns
    // This would integrate with actual task data
    return Math.random() < 0.3; // Placeholder logic
  }

  subscribeToMetrics(listener: (metrics: RitualMetrics) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    const metrics = this.getMetrics();
    this.listeners.forEach(listener => listener(metrics));
  }

  // Export data for analytics
  exportSessions(): RitualSession[] {
    return this.sessions.map(session => ({
      ...session,
      // Remove potentially sensitive timing data in production
      startTime: Math.floor(session.startTime / 1000) * 1000,
      endTime: session.endTime ? Math.floor(session.endTime / 1000) * 1000 : undefined
    }));
  }

  // Clear data (privacy compliance)
  clearSessions(): void {
    this.sessions = [];
    this.currentSession = null;
    this.notifyListeners();
  }
}

export const activationRitualService = new ActivationRitualService();

// Development helpers
if (process.env.NODE_ENV === 'development') {
  (window as any).activationRitualService = activationRitualService;
}