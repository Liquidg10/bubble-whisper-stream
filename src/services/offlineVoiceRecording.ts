/**
 * Phase 4A: Offline Voice Note Recording
 * Records and stores voice notes locally with batch sync
 */

interface VoiceNote {
  id: string;
  bubbleId?: string;
  blob: Blob;
  duration: number;
  timestamp: number;
  transcription?: string;
  synced: boolean;
  size: number;
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
}

class OfflineVoiceRecording {
  private dbName = 'bubble-voice-notes';
  private version = 1;
  private recordingState: RecordingState = {
    isRecording: false,
    isPaused: false,
    duration: 0,
    mediaRecorder: null,
    audioChunks: []
  };
  private durationTimer: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('voice-notes')) {
          const store = db.createObjectStore('voice-notes', { keyPath: 'id' });
          store.createIndex('bubbleId', 'bubbleId', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async startRecording(): Promise<boolean> {
    try {
      if (this.recordingState.isRecording) return false;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.getSupportedMimeType()
      });

      this.recordingState = {
        isRecording: true,
        isPaused: false,
        duration: 0,
        mediaRecorder,
        audioChunks: []
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingState.audioChunks.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      this.startDurationTimer();

      console.log('🎤 Voice recording started');
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }

  pauseRecording(): void {
    if (this.recordingState.mediaRecorder && this.recordingState.isRecording) {
      this.recordingState.mediaRecorder.pause();
      this.recordingState.isPaused = true;
      this.stopDurationTimer();
      console.log('⏸️ Voice recording paused');
    }
  }

  resumeRecording(): void {
    if (this.recordingState.mediaRecorder && this.recordingState.isPaused) {
      this.recordingState.mediaRecorder.resume();
      this.recordingState.isPaused = false;
      this.startDurationTimer();
      console.log('▶️ Voice recording resumed');
    }
  }

  async stopRecording(): Promise<VoiceNote | null> {
    return new Promise((resolve) => {
      if (!this.recordingState.mediaRecorder || !this.recordingState.isRecording) {
        resolve(null);
        return;
      }

      this.recordingState.mediaRecorder.onstop = () => {
        this.stopDurationTimer();
        
        const blob = new Blob(this.recordingState.audioChunks, { 
          type: this.getSupportedMimeType() 
        });

        const voiceNote: VoiceNote = {
          id: this.generateVoiceNoteId(),
          blob,
          duration: this.recordingState.duration,
          timestamp: Date.now(),
          synced: false,
          size: blob.size
        };

        // Store locally
        this.storeVoiceNote(voiceNote);

        // Clean up
        this.recordingState.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
        this.recordingState = {
          isRecording: false,
          isPaused: false,
          duration: 0,
          mediaRecorder: null,
          audioChunks: []
        };

        console.log('🎤 Voice recording stopped and saved', { 
          duration: voiceNote.duration, 
          size: voiceNote.size 
        });
        resolve(voiceNote);
      };

      this.recordingState.mediaRecorder.stop();
    });
  }

  async getVoiceNotes(bubbleId?: string): Promise<VoiceNote[]> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['voice-notes'], 'readonly');
        const store = transaction.objectStore('voice-notes');
        
        let dbRequest: IDBRequest;
        
        if (bubbleId) {
          const index = store.index('bubbleId');
          dbRequest = index.getAll(bubbleId);
        } else {
          dbRequest = store.getAll();
        }
        
        dbRequest.onsuccess = () => {
          const notes = dbRequest.result.sort((a: VoiceNote, b: VoiceNote) => 
            b.timestamp - a.timestamp
          );
          resolve(notes);
        };
        
        dbRequest.onerror = () => resolve([]);
      };
      
      request.onerror = () => resolve([]);
    });
  }

  async deleteVoiceNote(id: string): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['voice-notes'], 'readwrite');
        const store = transaction.objectStore('voice-notes');
        
        const deleteRequest = store.delete(id);
        deleteRequest.onsuccess = () => resolve(true);
        deleteRequest.onerror = () => resolve(false);
      };
      
      request.onerror = () => resolve(false);
    });
  }

  async getUnsyncedVoiceNotes(): Promise<VoiceNote[]> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['voice-notes'], 'readonly');
        const store = transaction.objectStore('voice-notes');
        const index = store.index('synced');
        
        const getRequest = index.getAll(IDBKeyRange.only(false));
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => resolve([]);
      };
      
      request.onerror = () => resolve([]);
    });
  }

  async markVoiceNoteSynced(id: string): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['voice-notes'], 'readwrite');
        const store = transaction.objectStore('voice-notes');
        
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
          const note = getRequest.result;
          if (note) {
            note.synced = true;
            store.put(note);
          }
          resolve();
        };
      };
      
      request.onerror = () => resolve();
    });
  }

  getRecordingState(): RecordingState {
    return { ...this.recordingState };
  }

  private async storeVoiceNote(voiceNote: VoiceNote): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['voice-notes'], 'readwrite');
        const store = transaction.objectStore('voice-notes');
        
        const addRequest = store.add(voiceNote);
        addRequest.onsuccess = () => resolve();
        addRequest.onerror = () => resolve();
      };
      
      request.onerror = () => resolve();
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mp3'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    return 'audio/webm'; // Fallback
  }

  private generateVoiceNoteId(): string {
    return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startDurationTimer(): void {
    this.durationTimer = setInterval(() => {
      this.recordingState.duration += 100;
    }, 100);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }
}

export const offlineVoiceRecording = new OfflineVoiceRecording();