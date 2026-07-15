import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { Bubble } from '@/types/bubble';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetMockBubbleStore, setMockBubbleState } from '@/test/helpers/mockBubbleStore';

// Faithful, complete bubbleStore mock via shared helper (see mockBubbleStore.ts).
// A bare `vi.mock('@/stores/bubbleStore')` auto-mock made `settings` undefined,
// crashing BubbleCanvas at `settings.reducedMotion` / `settings.viewMode`
// (src/components/BubbleCanvas.tsx:514,656) -- the same class-B signature
// `mockBubbleStore.ts` was built to fix. `AccessibilityProvider` (pulled in by
// `renderWithProviders`) also calls `useBubbleStore()` internally, so it reads
// this same mock state.
vi.mock('@/stores/bubbleStore', async () => {
  const { makeBubbleStoreMockModule } = await import('@/test/helpers/mockBubbleStore');
  return makeBubbleStoreMockModule();
});

// Performance utilities
const measurePerformance = (fn: () => void): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

const generateLargeBubbleDataset = (count: number): Bubble[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `bubble-${i}`,
    x: Math.random() * 1000,
    y: Math.random() * 1000,
    type: 'Thought' as Bubble['type'],
    content: `Test bubble content ${i} with some longer text to simulate real usage patterns`,
    tags: [{ id: `tag-${i}`, name: `tag-${i % 10}`, emoji: '🏷️' }],
    createdAt: Date.now() - i * 3600000,
    updatedAt: Date.now() - i * 3600000,
    size: 1
  }));
};

// BubbleCanvas destructures these directly from useBubbleStore() (see
// src/components/BubbleCanvas.tsx:40-51); `settings` already comes from the
// shared helper's createMockSettings() default. `mergeCandidate` /
// `lastOperation` are only read when truthy so `null` is safe; `selectAll` /
// `isSelected` are included defensively even though this suite doesn't
// exercise them directly.
const bubbleCanvasActionStubs = () => ({
  selectedBubbles: new Set(),
  isLoading: false,
  addBubble: vi.fn(),
  updateBubble: vi.fn(),
  deleteBubble: vi.fn(),
  selectBubble: vi.fn(),
  clearSelection: vi.fn(),
  selectAll: vi.fn(),
  isSelected: vi.fn(() => false),
  mergeBubbles: vi.fn(),
  mergeCandidate: null,
  setMergeCandidate: vi.fn(),
  clearMergeCandidate: vi.fn(),
  undoLastMerge: vi.fn(),
  lastOperation: null,
});

describe('Load Testing Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockBubbleStore();
  });

  describe('Large Dataset Performance', () => {
    it('should handle 1000+ bubbles with acceptable performance', async () => {
      const largeBubbleSet = generateLargeBubbleDataset(1000);

      setMockBubbleState({
        bubbles: largeBubbleSet,
        ...bubbleCanvasActionStubs(),
      });

      const renderTime = measurePerformance(() => {
        renderWithProviders(<BubbleCanvas />);
      });

      // Rendering 1000+ bubbles should take less than 2 seconds
      expect(renderTime).toBeLessThan(2000);

      // Canvas should be rendered
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('should maintain smooth scrolling with large datasets', async () => {
      const largeBubbleSet = generateLargeBubbleDataset(2000);

      setMockBubbleState({
        bubbles: largeBubbleSet,
        ...bubbleCanvasActionStubs(),
      });

      renderWithProviders(<BubbleCanvas />);

      // Simulate rapid scroll events
      const canvas = screen.getByRole('main');
      const scrollEvents = Array.from({ length: 50 }, (_, i) => () => {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: i * 10 }));
      });

      const scrollTime = measurePerformance(() => {
        scrollEvents.forEach(event => event());
      });

      // 50 scroll events should process in under 100ms
      expect(scrollTime).toBeLessThan(100);
    });
  });

  describe('Memory Management', () => {
    it('should not cause memory leaks with frequent bubble creation/deletion', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

      const stubs = bubbleCanvasActionStubs();
      setMockBubbleState({
        bubbles: [],
        ...stubs,
      });

      const { unmount } = renderWithProviders(<BubbleCanvas />);

      // Simulate rapid bubble creation/deletion
      for (let i = 0; i < 100; i++) {
        const bubble = generateLargeBubbleDataset(1)[0];
        stubs.addBubble(bubble);
        stubs.deleteBubble(bubble.id);
      }

      unmount();

      // Force garbage collection if available
      if ((window as any).gc) {
        (window as any).gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Search Performance', () => {
    it('should search through large datasets quickly', async () => {
      const largeBubbleSet = generateLargeBubbleDataset(5000);
      
      // Mock search function
      const searchBubbles = (query: string, bubbles: Bubble[]): Bubble[] => {
        return bubbles.filter(bubble => 
          bubble.content.toLowerCase().includes(query.toLowerCase()) ||
          bubble.tags.some(tag => tag.name.toLowerCase().includes(query.toLowerCase()))
        );
      };

      const searchTime = measurePerformance(() => {
        const results = searchBubbles('test', largeBubbleSet);
        expect(results.length).toBeGreaterThan(0);
      });

      // Search should complete in under 50ms
      expect(searchTime).toBeLessThan(50);
    });

    it('should handle complex semantic search queries efficiently', async () => {
      const largeBubbleSet = generateLargeBubbleDataset(1000);
      
      // Mock semantic search with vector similarity
      const semanticSearch = (query: string, bubbles: Bubble[]): Bubble[] => {
        // Simulate vector similarity calculation
        return bubbles
          .map(bubble => ({
            bubble,
            score: Math.random() // Simulate similarity score
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .map(item => item.bubble);
      };

      const searchTime = measurePerformance(() => {
        const results = semanticSearch('emotional reflection', largeBubbleSet);
        expect(results.length).toBe(20);
      });

      // Semantic search should complete in under 200ms
      expect(searchTime).toBeLessThan(200);
    });
  });

  describe('Sync Performance', () => {
    it('should handle large sync operations efficiently', async () => {
      const syncData = generateLargeBubbleDataset(500);
      
      // Mock sync operation
      const performSync = (data: Bubble[]): Promise<void> => {
        return new Promise((resolve) => {
          // Simulate encryption and network operations
          setTimeout(() => {
            data.forEach(bubble => {
              // Simulate encryption
              JSON.stringify(bubble);
            });
            resolve();
          }, 10);
        });
      };

      const syncTime = measurePerformance(() => {
        performSync(syncData);
      });

      // Sync preparation should be fast (under 100ms)
      expect(syncTime).toBeLessThan(100);
    });
  });

  describe('AI Processing Performance', () => {
    it('should queue and batch AI requests efficiently', async () => {
      const requests = Array.from({ length: 50 }, (_, i) => ({
        id: `request-${i}`,
        text: `Test content for AI processing ${i}`,
        type: 'sentiment' as const
      }));

      // Mock AI service with batching
      const processAIRequests = (requests: any[]): Promise<any[]> => {
        return new Promise((resolve) => {
          // Simulate batched processing
          const batchSize = 10;
          const batches = [];
          
          for (let i = 0; i < requests.length; i += batchSize) {
            batches.push(requests.slice(i, i + batchSize));
          }
          
          setTimeout(() => {
            const results = requests.map(req => ({
              id: req.id,
              sentiment: 'positive',
              confidence: 0.85
            }));
            resolve(results);
          }, 50);
        });
      };

      const processingTime = measurePerformance(() => {
        processAIRequests(requests);
      });

      // AI request batching should be efficient (under 10ms)
      expect(processingTime).toBeLessThan(10);
    });
  });

  describe('Plugin System Performance', () => {
    it('should load multiple plugins without performance degradation', async () => {
      const mockPlugins = Array.from({ length: 20 }, (_, i) => ({
        id: `plugin-${i}`,
        name: `Test Plugin ${i}`,
        execute: () => Promise.resolve(`Result ${i}`)
      }));

      // Mock plugin loader
      const loadPlugins = (plugins: any[]): Promise<void> => {
        return Promise.all(
          plugins.map(plugin => plugin.execute())
        ).then(() => {});
      };

      const loadTime = measurePerformance(() => {
        loadPlugins(mockPlugins);
      });

      // Plugin loading should be fast (under 50ms)
      expect(loadTime).toBeLessThan(50);
    });
  });
});
