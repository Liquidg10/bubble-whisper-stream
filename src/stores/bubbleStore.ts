// Zustand store for managing bubble universe state

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bubble, Reminder, Tag, Settings, SelfModel, BubbleType, CBTEntry, Glimmer, PatternHint } from '@/types/bubble';
import { storageService } from '@/services/storage';
import { cbtService } from '@/services/cbtService';
import { glimmerService } from '@/services/glimmerService';
import { adaptiveReminderService } from '@/services/adaptiveReminderService';
import { consentService } from '@/services/consentService';

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
  };
  selfModel: SelfModel;
  isLoading: boolean;
  selectedBubbles: Set<string>;
  
  // Phase 2 Intelligence Layer
  cbtEntries: CBTEntry[];
  glimmers: Glimmer[];
  patternHints: PatternHint[];
  intelligenceEnabled: boolean;
  
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
  createSampleBubbles: () => Promise<void>;
  
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
  
  // Reminder actions
  addReminder: (reminder: Reminder) => Promise<void>;
  updateReminder: (reminder: Reminder) => Promise<void>;
  snoozeReminder: (id: string, reason?: string, duration?: number) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  
  // Tag actions
  addTag: (tag: Tag) => Promise<void>;
  
  // Settings actions
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  
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
}

const defaultSettings = {
  ttsEnabled: true,
  reducedMotion: false,
  highContrast: false,
  bubbleDensity: 'medium' as const,
  biometricLock: false,
  quietHours: { start: '22:00', end: '08:00' },
  intelligenceEnabled: false, // Opt-in for Phase 2 features
  glimmersEnabled: false,
  adaptiveRemindersEnabled: false,
  selfModelLayers: {
    surface: true,
    context: false,
    deep: false
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
      intelligenceEnabled: false,

      // Initialize store from IndexedDB
      initializeStore: async () => {
        set({ isLoading: true });
        
        try {
          console.log('BubbleStore: Initializing...');
          await storageService.initializeWithRetry(3);
          
          const [bubbles, reminders, tags, settings, selfModel] = await Promise.all([
            storageService.getAllBubbles(),
            storageService.getActiveReminders(),
            storageService.getAllTags(),
            storageService.getSettings(),
            storageService.getSelfModel(),
          ]);
          
          console.log('BubbleStore: Loaded data:', { 
            bubblesCount: bubbles.length, 
            remindersCount: reminders.length,
            tagsCount: tags.length 
          });
          
          set({
            bubbles,
            reminders,
            tags,
            settings,
            selfModel,
            isLoading: false,
          });

          // If no bubbles exist, create some sample data for better UX
          if (bubbles.length === 0) {
            console.log('BubbleStore: No bubbles found, creating sample data...');
            get().createSampleBubbles();
          }
        } catch (error) {
          console.error('BubbleStore: Failed to initialize:', error);
          // Fall back to in-memory mode with sample data
          console.log('BubbleStore: Falling back to in-memory mode...');
          get().createSampleBubbles();
          set({ isLoading: false });
        }
      },

      // Create sample bubbles for demo/fallback
      createSampleBubbles: async () => {
        const now = Date.now();
        const sampleBubbles: Bubble[] = [
          {
            id: 'sample-1',
            content: 'Welcome to Bubble Universe! 🌟',
            type: 'Thought',
            x: 100,
            y: 100,
            size: 60,
            createdAt: now,
            updatedAt: now,
            tags: [],
            mood: 'happy'
          },
          {
            id: 'sample-2', 
            content: 'This is your creative companion',
            type: 'Memory',
            x: 250,
            y: 180,
            size: 45,
            createdAt: now - 86400000, // Yesterday
            updatedAt: now - 86400000,
            tags: [],
            mood: 'neutral'
          },
          {
            id: 'sample-3',
            content: 'Toggle panels in the view menu',
            type: 'Task',
            x: 400,
            y: 120,
            size: 50,
            createdAt: now - 172800000, // 2 days ago
            updatedAt: now - 172800000,
            tags: [],
            mood: 'good'
          }
        ];

        // Add to store immediately for UI responsiveness
        set(state => ({
          bubbles: [...state.bubbles, ...sampleBubbles]
        }));

        // Try to persist if storage is available
        if (storageService.isInitialized()) {
          try {
            for (const bubble of sampleBubbles) {
              await storageService.createBubble(bubble);
            }
            console.log('BubbleStore: Sample bubbles persisted to storage');
          } catch (error) {
            console.warn('BubbleStore: Could not persist sample bubbles:', error);
          }
        }
      },

      // Bubble actions
      addBubble: async (bubble) => {
        try {
          // Ensure bubble has a type for proper type-colored rims
          const bubbleWithType = {
            ...bubble,
            type: bubble.type || getDefaultBubbleType(bubble.content || '')
          };
          
          // Add to store immediately for UI responsiveness
          set(state => ({ bubbles: [...state.bubbles, bubbleWithType] }));

          // Try to persist if storage is available
          if (storageService.isInitialized()) {
            await storageService.createBubble(bubbleWithType);
          } else {
            console.warn('BubbleStore: Storage not initialized, bubble added to memory only');
          }
        } catch (error) {
          console.error('BubbleStore: Failed to add bubble:', error);
          // Bubble is already in store, so UI still works
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
        
        try {
          await storageService.updateSettings(updated);
          set({ settings: updated });
        } catch (error) {
          console.error('Failed to update settings:', error);
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
        set({ intelligenceEnabled: enabled });
        get().updateSettings({ intelligenceEnabled: enabled });
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