/**
 * AudioSessionManager - Centralized audio session locking
 * Prevents concurrent voice recordings and manages audio resource conflicts
 */

import { devLog } from '@/devtools/devLog';

export type SessionState = 'idle' | 'recording' | 'processing' | 'busy';

interface AudioSession {
  id: string;
  source: string; // Which component requested the session
  state: SessionState;
  startTime: number;
  stream?: MediaStream;
  recognition?: any;
  recorder?: MediaRecorder;
}

export class AudioSessionManager {
  private static instance: AudioSessionManager;
  private currentSession: AudioSession | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT_MS = 30000; // 30 second watchdog
  private listeners: Array<(state: SessionState, source?: string) => void> = [];

  private constructor() {
    // Handle page blur to force release stale sessions
    window.addEventListener('blur', () => this.forceReleaseSession('page_blur'));
    window.addEventListener('beforeunload', () => this.forceReleaseSession('page_unload'));
  }

  static getInstance(): AudioSessionManager {
    if (!AudioSessionManager.instance) {
      AudioSessionManager.instance = new AudioSessionManager();
    }
    return AudioSessionManager.instance;
  }

  /**
   * Request exclusive audio session lock
   */
  async requestSession(source: string): Promise<string | null> {
    if (this.currentSession) {
      devLog(`Voice session rejected - already active: ${this.currentSession.source}`, { 
        current: this.currentSession.source, 
        requesting: source 
      });
      return null;
    }

    const sessionId = crypto.randomUUID();
    this.currentSession = {
      id: sessionId,
      source,
      state: 'recording',
      startTime: Date.now()
    };

    // Set watchdog timeout
    this.sessionTimeout = setTimeout(() => {
      devLog(`Voice session timeout - force releasing: ${source}`);
      this.forceReleaseSession('timeout');
    }, this.SESSION_TIMEOUT_MS);

    devLog(`Voice session started: ${source}`, { sessionId });
    this.notifyListeners('recording', source);
    
    return sessionId;
  }

  /**
   * Update session state (recording -> processing)
   */
  updateSessionState(sessionId: string, state: SessionState): boolean {
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      devLog(`Cannot update session state - invalid session: ${sessionId}`);
      return false;
    }

    this.currentSession.state = state;
    this.notifyListeners(state, this.currentSession.source);
    
    devLog(`Voice session state updated: ${this.currentSession.source} -> ${state}`);
    return true;
  }

  /**
   * Store audio resources with session for cleanup
   */
  attachResources(sessionId: string, resources: {
    stream?: MediaStream;
    recognition?: any;
    recorder?: MediaRecorder;
  }): boolean {
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      return false;
    }

    this.currentSession.stream = resources.stream;
    this.currentSession.recognition = resources.recognition;
    this.currentSession.recorder = resources.recorder;
    return true;
  }

  /**
   * Release session normally
   */
  releaseSession(sessionId: string, source?: string): boolean {
    if (!this.currentSession || this.currentSession.id !== sessionId) {
      devLog(`Cannot release session - invalid session: ${sessionId}`);
      return false;
    }

    this.cleanupSession();
    devLog(`Voice session released: ${source || this.currentSession.source}`);
    return true;
  }

  /**
   * Force release any active session (emergency cleanup)
   */
  forceReleaseSession(reason: string): void {
    if (!this.currentSession) return;

    devLog(`Force releasing voice session: ${reason}`, { 
      source: this.currentSession.source,
      duration: Date.now() - this.currentSession.startTime 
    });
    
    this.cleanupSession();
  }

  /**
   * Get current session info
   */
  getCurrentSession(): { source: string; state: SessionState; duration: number } | null {
    if (!this.currentSession) return null;

    return {
      source: this.currentSession.source,
      state: this.currentSession.state,
      duration: Date.now() - this.currentSession.startTime
    };
  }

  /**
   * Check if session is available
   */
  isSessionAvailable(): boolean {
    return this.currentSession === null;
  }

  /**
   * Subscribe to session state changes
   */
  onStateChange(listener: (state: SessionState, source?: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private cleanupSession(): void {
    if (!this.currentSession) return;

    const session = this.currentSession;

    // Cleanup audio resources
    try {
      if (session.stream) {
        session.stream.getTracks().forEach(track => track.stop());
      }
      if (session.recognition) {
        session.recognition.stop();
      }
      if (session.recorder && session.recorder.state !== 'inactive') {
        session.recorder.stop();
      }
    } catch (error) {
      devLog('Error cleaning up audio resources:', error);
    }

    // Clear timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    // Reset state
    this.currentSession = null;
    this.notifyListeners('idle');
  }

  private notifyListeners(state: SessionState, source?: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(state, source);
      } catch (error) {
        devLog('Error in session state listener:', error);
      }
    });
  }
}

// Export singleton instance
export const audioSessionManager = AudioSessionManager.getInstance();