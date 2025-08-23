// Zustand store for managing bubble universe state

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Bubble, Reminder, Tag, Settings, SelfModel } from '@/types/bubble';
import { storageService } from '@/services/storage';

interface BubbleStore {
  // State
  bubbles: Bubble[];
  reminders: Reminder[];
  tags: Tag[];
  settings: Settings;
  selfModel: SelfModel;
  isLoading: boolean;
  selectedBubbles: Set<string>;
  
  // Actions
  initializeStore: () => Promise<void>;
  
  // Selection actions
  toggleSelection: (bubbleId: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  isSelected: (bubbleId: string) => boolean;
  
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
}

const defaultSettings: Settings = {
  ttsEnabled: true,
  reducedMotion: false,
  highContrast: false,
  bubbleDensity: 'medium',
  biometricLock: false,
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
    (set, get) => ({
      // Initial state
      bubbles: [],
      reminders: [],
      tags: [],
      settings: defaultSettings,
      selfModel: defaultSelfModel,
      isLoading: false,
      selectedBubbles: new Set<string>(),

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
          await storageService.createBubble(bubble);
          set(state => ({ bubbles: [...state.bubbles, bubble] }));
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
    }),
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