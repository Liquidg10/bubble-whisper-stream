// Zustand store for managing bubble universe state

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bubble, Reminder, Tag, Settings, SelfModel, BubbleType, CBTEntry, Glimmer, PatternHint } from '@/types/bubble';
import { storageService } from '@/services/storage';
import { cbtService } from '@/services/cbtService';
import { glimmerService } from '@/services/glimmerService';
import { adaptiveReminderService } from '@/services/adaptiveReminderService';
import { consentService } from '@/services/consentService';
import { setHorizon, createHorizonMoveEntry, type Horizon } from '@/lib/horizon';
import { crossViewUndoService } from '@/services/crossViewUndoService';

// Helper to assign default bubble type based on content
function getDefaultBubbleType(content: string): BubbleType {
  const lower = content.toLowerCase();
  if (lower.includes('todo') || lower.includes('task') || lower.includes('complete')) return 'Task';
  if (lower.includes('remember') || lower.includes('memory')) return 'Memory';
  if (lower.includes('feeling') || lower.includes('mood')) return 'Mood';
  if (lower.includes('remind') || lower.includes('alert')) return 'ReminderNote';
  return 'Thought'; // Default
}

interface BubbleStore {
  // State
  bubbles: Bubble[];
  reminders: Reminder[];
  tags: Tag[];
  settings: Settings & {
    intelligenceEnabled?: boolean;
    glimmersEnabled?: boolean;
    adaptiveRemindersEnabled?: boolean;
    selfModelLayers?: {
      surface: boolean;
      context: boolean;
      deep: boolean;
    };
    groceryHelperEnabled?: boolean;
    cleaningCuesEnabled?: boolean;
    personalVoiceEnabled?: boolean;
    biometricEnabled?: boolean;
    locationIntelligenceEnabled?: boolean;
    calendarIntegrationEnabled?: boolean;
    emailIntegrationEnabled?: boolean;
    bankingIntegrationEnabled?: boolean;
    viewMode?: 'bubble' | 'atomic';
    aiSystemPrompt?: string;
    aiPersonalInfo?: string;
    cbtSettings?: {
      cbtAssistEnabled: boolean;
      assistLevel: 'off' | 'subtle' | 'standard';
      privacyLayer: 'surface' | 'context' | 'deep';
      autoLogMode: 'ask' | 'off' | 'on';
      quietHours: {
        enabled: boolean;
        start: string;
        end: string;
      };
      topicExclusions: string[];
      neverInterveneOn: string[];
    };
    cbtOnboardingState?: {
      hasShownBanner: boolean;
      bannerDismissedAt?: number;
      initialChoice?: 'off' | 'ask' | 'on';
      onboardingCompleted: boolean;
    };
    // Voice System Unified Settings (Phase 2)
    voiceAutoCommit?: boolean;
    voiceHotkey?: string;
    voiceConfidenceThreshold?: number;
    voiceFeedbackLevel?: 'minimal' | 'standard' | 'verbose';
    voiceTTSEnabled?: boolean;
    voiceWebSpeechEnabled?: boolean;
    voiceWhisperEnabled?: boolean;
    voiceBackendPreference?: 'web-speech' | 'whisper' | 'auto';
    voiceDebugMode?: boolean;
    voiceSessionTimeout?: number;
    // Progressive Onboarding Settings
    progressiveOnboarding?: {
      isEnabled: boolean;
      currentDay: number;
      startDate: number;
      completedMilestones: number[];
      hasSkippedProgression: boolean;
      lastShownMilestone?: number;
    };
  };
  selfModel: SelfModel;
  isLoading: boolean;
  selectedBubbles: Set<string>;
  
  // Phase 2 Intelligence Layer
  cbtEntries: CBTEntry[];
  glimmers: Glimmer[];
  patternHints: PatternHint[];
  
  // Merge state
  mergeCandidate: { bubble1: Bubble; bubble2: Bubble } | null;
  lastOperation: {
    type: 'merge';
    originalBubbles: Bubble[];
    mergedBubble: Bubble;
    timestamp: number;
  } | null;
  
  // Actions
  initializeStore: () => Promise<void>;
  
  // Selection actions
  toggleSelection: (bubbleId: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  isSelected: (bubbleId: string) => boolean;
  
  // Merge actions
  setMergeCandidate: (bubble1: Bubble, bubble2: Bubble) => void;
  clearMergeCandidate: () => void;
  mergeBubbles: (bubble1: Bubble, bubble2: Bubble) => void;
  undoLastMerge: () => void;
  
  // Bubble actions
  addBubble: (bubble: Bubble) => Promise<void>;
  updateBubble: (bubble: Bubble) => Promise<void>;
  deleteBubble: (id: string) => Promise<void>;
  clearAllBubbles: () => Promise<void>;
  
  // Reminder actions
  addReminder: (reminder: Reminder) => Promise<void>;
  updateReminder: (reminder: Reminder) => Promise<void>;
  snoozeReminder: (id: string, reason?: string, duration?: number) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  
  // Tag actions
  addTag: (tag: Tag) => Promise<void>;
  
  // Settings actions
  updateSettings: (settings: Partial<Settings & {
    calendarIntegrationEnabled?: boolean;
    emailIntegrationEnabled?: boolean;
    bankingIntegrationEnabled?: boolean;
    viewMode?: 'bubble' | 'atomic';
    aiSystemPrompt?: string;
    aiPersonalInfo?: string;
    // Voice-First Capture Settings
    voiceAutoCommit?: boolean;
    voiceHotkey?: string;
    voiceConfidenceThreshold?: number;
    voiceFeedbackLevel?: 'minimal' | 'standard' | 'verbose';
    cbtSettings?: {
      cbtAssistEnabled: boolean;
      assistLevel: 'off' | 'subtle' | 'standard';
      privacyLayer: 'surface' | 'context' | 'deep';
      autoLogMode: 'ask' | 'off' | 'on';
      quietHours: {
        enabled: boolean;
        start: string;
        end: string;
      };
      topicExclusions: string[];
      neverInterveneOn: string[];
    };
    progressiveOnboarding?: {
      isEnabled: boolean;
      currentDay: number;
      startDate: number;
      completedMilestones: number[];
      hasSkippedProgression: boolean;
      lastShownMilestone?: number;
    };
  }>) => Promise<void>;
  
  // Self model actions
  updateSelfModel: (model: SelfModel) => Promise<void>;
  
  // Phase 2 Intelligence Actions
  addCBTEntry: (entry: CBTEntry) => Promise<void>;
  getCBTEntries: () => CBTEntry[];
  addGlimmer: (glimmer: Glimmer) => Promise<void>;
  dismissGlimmer: (id: string) => Promise<void>;
  addPatternHint: (hint: PatternHint) => Promise<void>;
  updatePatternHint: (hint: PatternHint) => Promise<void>;
  getAdaptiveExplanation: (reminderId: string) => string | null;
  toggleIntelligence: (enabled: boolean) => void;
  
  // Horizon management actions
  moveBubbleToHorizon: (id: string, horizon: Horizon) => void;
  
  // View mode actions
  setViewMode: (mode: 'bubble' | 'atomic') => void;
}

const defaultSettings = {
  ttsEnabled: true,
  reducedMotion: false,
  highContrast: false,
  bubbleDensity: 'medium' as const,
  biometricLock: false,
  quietHours: { start: '22:00', end: '08:00' },
  intelligenceEnabled: true, // Enabled by default for Phase 2 features
  cleaningCuesEnabled: false,
  locationIntelligenceEnabled: false, // Opt-in for location tracking
  cleanHouseTimer: {
    isActive: false,
    timeRemaining: 10 * 60, // 10 minutes in seconds
    duration: 10 * 60,
    startTime: null as number | null
  },
  cleanHouseCustomization: {
    duration: 10 * 60, // 10 minutes default
    celebrationSound: 'chime',
    celebrationMessage: 'Great job on your 10-minute reset! Every small step matters. 🎉',
    hapticEnabled: true,
    autoRestart: false
  },
  pomodoroTimer: {
    isActive: false,
    timeRemaining: 25 * 60, // 25 minutes default
    duration: 25 * 60,
    startTime: null as number | null,
    currentPhase: 'work' as const,
    cycleCount: 0
  },
  pomodoroCustomization: {
    workDuration: 25 * 60, // 25 minutes
    shortBreakDuration: 5 * 60, // 5 minutes
    longBreakDuration: 15 * 60, // 15 minutes
    cyclesBeforeLongBreak: 4,
    celebrationMessage: "Great focus session! 🍅",
    hapticEnabled: true,
    autoStartBreaks: false,
    autoStartWork: false
  },
  glimmersEnabled: true,
  adaptiveRemindersEnabled: true,
  viewMode: 'bubble' as const,
  selfModelLayers: {
    surface: true,
    context: false,
    deep: false
  },
  // AI Voice Settings
  globalVoice: 'nova' as const,
  voiceVolume: 0.8,
  voicePreferences: {
    banking: 'onyx' as const,
    companion: 'nova' as const,
    notes: 'shimmer' as const,
    cbt: 'nova' as const,
    reminders: 'echo' as const,
    glimmers: 'shimmer' as const,
  }
};

const defaultSelfModel: SelfModel = {
  id: 'self',
  routines: [],
  medicationTimes: [],
  preferences: {},
  triggers: [],
};

export const useBubbleStore = create<BubbleStore>()(
  persist(
    (set, get) => {
      console.log('Initializing bubble store...');
      return {
      // Initial state
      bubbles: [],
      reminders: [],
      tags: [],
      settings: defaultSettings,
      selfModel: defaultSelfModel,
      isLoading: false,
      selectedBubbles: new Set<string>(),
      mergeCandidate: null,
      lastOperation: null,
      
      // Phase 2 Intelligence Layer
      cbtEntries: [],
      glimmers: [],
      patternHints: [],

      // Initialize store from IndexedDB
      initializeStore: async () => {
        set({ isLoading: true });
        
        try {
          await storageService.initialize();
          
          const [bubbles, reminders, tags, settings, selfModel] = await Promise.all([
            storageService.getAllBubbles(),
            storageService.getActiveReminders(),
            storageService.getAllTags(),
            storageService.getSettings(),
            storageService.getSelfModel(),
          ]);
          
          // Debug logging for photo bubbles
          console.log('📊 Loaded bubbles:', bubbles.length);
          const photoBubbles = bubbles.filter(b => b.imageUri);
          console.log('📸 Photo bubbles found:', photoBubbles.length, photoBubbles.map(b => ({ id: b.id, hasPhoto: !!b.imageUri, imageUri: b.imageUri?.substring(0, 50) + '...' })));
          
          set({
            bubbles,
            reminders,
            tags,
            settings,
            selfModel,
            isLoading: false,
          });
        } catch (error) {
          console.error('Failed to initialize store:', error);
          set({ isLoading: false });
        }
      },

      // Bubble actions
      addBubble: async (bubble) => {
        try {
          // Check if database is initialized before attempting to create bubble
          if (!storageService.isInitialized()) {
            console.warn('Database not yet initialized, skipping bubble creation');
            return;
          }
          
          // Ensure bubble has a type for proper type-colored rims
          const bubbleWithType = {
            ...bubble,
            type: bubble.type || getDefaultBubbleType(bubble.content || '')
          };

          // Auto-analyze photo bubbles if vision is enabled
          if (bubbleWithType.imageUri && !bubbleWithType.caption) {
            try {
              const { visionService } = await import('@/services/vision');
              const visionResult = await visionService.describeImage(bubbleWithType.imageUri);
              
              // Update bubble with vision results
              bubbleWithType.caption = visionResult.caption;
              if (visionResult.tags.length > 0) {
                const newTags = visionResult.tags.map(tagName => ({
                  id: crypto.randomUUID(),
                  name: tagName,
                  emoji: tagName === 'photo' ? '📸' : undefined
                }));
                bubbleWithType.tags = [...(bubbleWithType.tags || []), ...newTags];
              }

              // Handle special type routing
              if (visionResult.typeHint === 'receipt') {
                // Route to OCR flow (existing receipt handling)
                console.log('Receipt detected, consider OCR processing');
              }

              // Mark as Joy candidate if high joy score and user opted in
              if (visionResult.joyScore && visionResult.joyScore > 0.6) {
                const { consentService } = await import('@/services/consentService');
                const hasJoyConsent = await consentService.hasConsent('joy_detection');
                
                if (hasJoyConsent) {
                  const joyTag = { id: crypto.randomUUID(), name: 'joy-candidate', emoji: '✨' };
                  bubbleWithType.tags = [...(bubbleWithType.tags || []), joyTag];
                }
              }
            } catch (error) {
              console.log('Vision analysis failed, proceeding without:', error);
            }
          }
          
          await storageService.createBubble(bubbleWithType);
          set(state => ({ bubbles: [...state.bubbles, bubbleWithType] }));
        } catch (error) {
          console.error('Failed to add bubble:', error);
        }
      },

      updateBubble: async (bubble) => {
        try {
          await storageService.updateBubble(bubble);
          set(state => ({
            bubbles: state.bubbles.map(b => b.id === bubble.id ? bubble : b)
          }));
        } catch (error) {
          console.error('Failed to update bubble:', error);
        }
      },

      deleteBubble: async (id) => {
        try {
          await storageService.deleteBubble(id);
          set(state => ({
            bubbles: state.bubbles.filter(b => b.id !== id)
          }));
        } catch (error) {
          console.error('Failed to delete bubble:', error);
        }
      },

      clearAllBubbles: async () => {
        try {
          const state = get();
          
          // Clear from storage
          await storageService.clearAllBubbles();
          
          // Clear from memory
          set({ bubbles: [] });
          
          console.log('🧹 All bubbles cleared from storage and memory');
          // Delete all bubbles from storage
          await Promise.all(state.bubbles.map(bubble => storageService.deleteBubble(bubble.id)));
          // Clear state
          set({
            bubbles: [],
            selectedBubbles: new Set<string>(),
            mergeCandidate: null,
            lastOperation: null
          });
          console.log('✅ All bubbles cleared');
        } catch (error) {
          console.error('Failed to clear all bubbles:', error);
        }
      },

      // Reminder actions
      addReminder: async (reminder) => {
        try {
          await storageService.createReminder(reminder);
          set(state => ({ reminders: [...state.reminders, reminder] }));
        } catch (error) {
          console.error('Failed to add reminder:', error);
        }
      },

      updateReminder: async (reminder) => {
        try {
          await storageService.updateReminder(reminder);
          set(state => ({
            reminders: state.reminders.map(r => r.id === reminder.id ? reminder : r)
          }));
        } catch (error) {
          console.error('Failed to update reminder:', error);
        }
      },

      snoozeReminder: async (id, reason, duration = 30 * 60 * 1000) => {
        const state = get();
        const reminder = state.reminders.find(r => r.id === id);
        if (!reminder) return;

        const snooze = {
          id: crypto.randomUUID(),
          reminderId: id,
          at: Date.now() + duration,
          reason,
        };

        const updatedReminder = {
          ...reminder,
          status: 'Snoozed' as const,
          snoozes: [...reminder.snoozes, snooze],
        };

        await state.updateReminder(updatedReminder);
      },

      completeReminder: async (id) => {
        const state = get();
        const reminder = state.reminders.find(r => r.id === id);
        if (!reminder) return;

        const updatedReminder = {
          ...reminder,
          status: 'Done' as const,
        };

        await state.updateReminder(updatedReminder);
      },

      // Tag actions
      addTag: async (tag) => {
        try {
          await storageService.createTag(tag);
          set(state => ({ tags: [...state.tags, tag] }));
        } catch (error) {
          console.error('Failed to add tag:', error);
        }
      },

      // Settings actions
      updateSettings: async (newSettings) => {
        const state = get();
        const updated = { ...state.settings, ...newSettings };
        
        // Handle Location Intelligence service start/stop
        if ('locationIntelligenceEnabled' in newSettings) {
          try {
            const { locationIntelligenceService } = await import('@/services/locationIntelligenceService');
            if (newSettings.locationIntelligenceEnabled) {
              locationIntelligenceService.startTracking();
            } else {
              locationIntelligenceService.stopTracking();
            }
          } catch (error) {
            console.warn('Failed to control location intelligence service:', error);
          }
        }
        
        // Update state immediately for responsive UI
        set({ settings: updated });
        
        try {
          // Check if database is initialized before attempting to persist
          if (!storageService.isInitialized()) {
            console.warn('Database not yet initialized, skipping settings persistence');
            return;
          }
          
          // Persist to storage in background
          await storageService.updateSettings(updated);
        } catch (error) {
          console.error('Failed to persist settings:', error);
          // Keep the optimistic update in state even if persistence fails
        }
      },

      // Self model actions
      updateSelfModel: async (model) => {
        try {
          await storageService.updateSelfModel(model);
          set({ selfModel: model });
        } catch (error) {
          console.error('Failed to update self model:', error);
        }
      },

      // Selection actions
      toggleSelection: (bubbleId: string) => {
        set(state => {
          const newSelection = new Set(state.selectedBubbles);
          if (newSelection.has(bubbleId)) {
            newSelection.delete(bubbleId);
          } else {
            newSelection.add(bubbleId);
          }
          return { selectedBubbles: newSelection };
        });
      },

      clearSelection: () => {
        set({ selectedBubbles: new Set<string>() });
      },

      selectAll: () => {
        const state = get();
        const allIds = new Set(state.bubbles.map(b => b.id));
        set({ selectedBubbles: allIds });
      },

      isSelected: (bubbleId: string) => {
        const state = get();
        return state.selectedBubbles.has(bubbleId);
      },

      // Merge actions
      setMergeCandidate: (bubble1: Bubble, bubble2: Bubble) => 
        set({ mergeCandidate: { bubble1, bubble2 } }),

      clearMergeCandidate: () => 
        set({ mergeCandidate: null }),

      mergeBubbles: (bubble1: Bubble, bubble2: Bubble) => {
        const state = get();
        
        // Create merged bubble
        const mergedBubble: Bubble = {
          id: crypto.randomUUID(),
          content: `${bubble1.content}\n\n${bubble2.content}`,
          type: bubble1.type,
          size: Math.max(bubble1.size, bubble2.size), // Take larger size
          x: (bubble1.x + bubble2.x) / 2,
          y: (bubble1.y + bubble2.y) / 2,
          tags: [...new Set([...bubble1.tags, ...bubble2.tags])],
          createdAt: bubble1.createdAt < bubble2.createdAt ? bubble1.createdAt : bubble2.createdAt,
          updatedAt: Date.now(),
          completed: bubble1.completed && bubble2.completed
        };

        // Store undo information
        const lastOperation = {
          type: 'merge' as const,
          originalBubbles: [bubble1, bubble2],
          mergedBubble,
          timestamp: Date.now()
        };

        // Update state
        const newBubbles = state.bubbles
          .filter(b => b.id !== bubble1.id && b.id !== bubble2.id)
          .concat(mergedBubble);

        const newSelectedBubbles = new Set(state.selectedBubbles);
        newSelectedBubbles.delete(bubble1.id);
        newSelectedBubbles.delete(bubble2.id);
        newSelectedBubbles.add(mergedBubble.id);

        set({
          bubbles: newBubbles,
          selectedBubbles: newSelectedBubbles,
          mergeCandidate: null,
          lastOperation
        });

        // Store in IndexedDB
        storageService.createBubble(mergedBubble);
        storageService.deleteBubble(bubble1.id);
        storageService.deleteBubble(bubble2.id);
      },

      undoLastMerge: () => {
        const state = get();
        if (!state.lastOperation || state.lastOperation.type !== 'merge') return;

        const { originalBubbles, mergedBubble } = state.lastOperation;

        // Restore original bubbles
        const newBubbles = state.bubbles
          .filter(b => b.id !== mergedBubble.id)
          .concat(originalBubbles);

        // Re-select original bubbles
        const newSelectedBubbles = new Set<string>(originalBubbles.map(b => b.id));

        set({
          bubbles: newBubbles,
          selectedBubbles: newSelectedBubbles,
          lastOperation: null
        });

        // Restore in IndexedDB
        originalBubbles.forEach(bubble => {
          storageService.createBubble(bubble);
        });
        storageService.deleteBubble(mergedBubble.id);
      },

      // Phase 2 Intelligence Actions
      addCBTEntry: async (entry) => {
        try {
          await storageService.createCBTEntry(entry);
          set(state => ({ cbtEntries: [...state.cbtEntries, entry] }));
        } catch (error) {
          console.error('Failed to add CBT entry:', error);
        }
      },

      getCBTEntries: () => {
        const state = get();
        return state.cbtEntries;
      },

      addGlimmer: async (glimmer) => {
        try {
          await storageService.createGlimmer(glimmer);
          set(state => ({ glimmers: [...state.glimmers, glimmer] }));
        } catch (error) {
          console.error('Failed to add glimmer:', error);
        }
      },

      dismissGlimmer: async (id) => {
        try {
          await storageService.updateGlimmer({ 
            ...get().glimmers.find(g => g.id === id)!,
            dismissed: true 
          });
          set(state => ({
            glimmers: state.glimmers.filter(g => g.id !== id)
          }));
        } catch (error) {
          console.error('Failed to dismiss glimmer:', error);
        }
      },

      addPatternHint: async (hint) => {
        try {
          await storageService.createPatternHint(hint);
          set(state => ({ patternHints: [...state.patternHints, hint] }));
        } catch (error) {
          console.error('Failed to add pattern hint:', error);
        }
      },

      updatePatternHint: async (hint) => {
        try {
          await storageService.updatePatternHint(hint);
          set(state => ({
            patternHints: state.patternHints.map(h => h.id === hint.id ? hint : h)
          }));
        } catch (error) {
          console.error('Failed to update pattern hint:', error);
        }
      },

      getAdaptiveExplanation: (reminderId: string) => {
        const state = get();
        const reminder = state.reminders.find(r => r.id === reminderId);
        if (!reminder) return null;
        
        return adaptiveReminderService.getExplanation(reminder, state.patternHints, state.settings);
      },

      toggleIntelligence: (enabled: boolean) => {
        // Update settings directly and persist
        set(state => ({
          settings: { ...state.settings, intelligenceEnabled: enabled }
        }));
        // Async persistence without blocking UI
        get().updateSettings({ intelligenceEnabled: enabled }).catch(() => {
          console.warn('Failed to persist intelligence setting');
        });
      },

      // Horizon management actions
      moveBubbleToHorizon: (id, horizon) => {
        const state = get();
        const bubble = state.bubbles.find(b => b.id === id);
        if (!bubble) return;
        
        const currentHorizon = bubble.tags?.find(t => 
          ['today', 'week', 'later'].includes(t.name.toLowerCase())
        )?.name.toLowerCase() as Horizon | undefined;
        
        const updatedBubble = setHorizon(bubble, horizon);
        
        // Update in store
        set({
          bubbles: state.bubbles.map(b => b.id === id ? updatedBubble : b)
        });
        
        // Add undo entry
        const undoEntry = createHorizonMoveEntry(id, currentHorizon || null, horizon, state.settings.viewMode || 'bubble');
        crossViewUndoService.addEntry(undoEntry);
        
        // Save to storage
        storageService.updateBubble(updatedBubble);
      },

      // View mode actions
      setViewMode: (mode: 'bubble' | 'atomic') => {
        // Immediate state update for responsive UI
        set(state => ({
          settings: { ...state.settings, viewMode: mode }
        }));
        
        // Async persistence without blocking the UI
        // If persistence fails, the optimistic update remains
        get().updateSettings({ viewMode: mode }).catch(() => {
          console.warn('Failed to persist view mode setting');
        });
      },
    };
    },
    {
      name: 'bubble-universe-store',
      partialize: (state) => ({
        // Only persist settings and self model to localStorage as backup
        settings: state.settings,
        selfModel: state.selfModel,
      }),
    }
  )
);