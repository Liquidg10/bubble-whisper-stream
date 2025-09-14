/**
 * Performance Test Utilities
 * Helper functions for performance testing and measurement
 */

import { Page, expect } from '@playwright/test';

export interface PerformanceMetrics {
  fps: number;
  frameCount: number;
  avgFrameTime: number;
  maxFrameTime: number;
  memoryUsage?: number;
  longFrames: number;
}

export interface LoadPerformanceMetrics {
  loadTime: number;
  domContentLoaded: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
}

/**
 * Measure frame rate and frame timing over a specified duration
 */
export async function measureFramePerformance(
  page: Page,
  durationMs: number = 2000
): Promise<PerformanceMetrics> {
  const result = await page.evaluate((duration) => {
    return new Promise<PerformanceMetrics>((resolve) => {
      const frames: number[] = [];
      const startTime = performance.now();
      let longFrames = 0;
      
      function measureFrame() {
        const currentTime = performance.now();
        frames.push(currentTime);
        
        // Check for long frames (>16.67ms for 60fps)
        if (frames.length > 1) {
          const frameTime = currentTime - frames[frames.length - 2];
          if (frameTime > 20) { // Allow 4ms variance
            longFrames++;
          }
        }
        
        if (currentTime - startTime < duration) {
          requestAnimationFrame(measureFrame);
        } else {
          // Calculate metrics
          const frameIntervals = [];
          for (let i = 1; i < frames.length; i++) {
            frameIntervals.push(frames[i] - frames[i - 1]);
          }
          
          const avgFrameTime = frameIntervals.reduce((a, b) => a + b, 0) / frameIntervals.length;
          const maxFrameTime = Math.max(...frameIntervals);
          const fps = 1000 / avgFrameTime;
          
          // Get memory if available
          const memoryUsage = (performance as any).memory?.usedJSHeapSize;
          
          resolve({
            fps,
            frameCount: frames.length,
            avgFrameTime,
            maxFrameTime,
            memoryUsage,
            longFrames
          });
        }
      }
      
      requestAnimationFrame(measureFrame);
    });
  }, durationMs);
  
  return result;
}

/**
 * Measure page load performance metrics
 */
export async function measureLoadPerformance(page: Page): Promise<LoadPerformanceMetrics> {
  const navigationMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    return {
      loadTime: navigation.loadEventEnd - navigation.navigationStart,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
    };
  });
  
  // Get paint metrics if available
  const paintMetrics = await page.evaluate(() => {
    const paintEntries = performance.getEntriesByType('paint');
    const metrics: { firstContentfulPaint?: number; largestContentfulPaint?: number } = {};
    
    paintEntries.forEach((entry) => {
      if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    });
    
    // Try to get LCP from observer if available
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      if (lcpEntries.length > 0) {
        metrics.largestContentfulPaint = lcpEntries[lcpEntries.length - 1].startTime;
      }
    } catch (e) {
      // LCP not available
    }
    
    return metrics;
  });
  
  return { ...navigationMetrics, ...paintMetrics };
}

/**
 * Monitor performance during a specific operation
 */
export async function measureOperationPerformance<T>(
  page: Page,
  operation: () => Promise<T>,
  options: { measureMemory?: boolean; measureFrames?: boolean } = {}
): Promise<{ result: T; metrics: Partial<PerformanceMetrics> }> {
  // Start monitoring
  const startTime = performance.now();
  let frameMonitoring: Promise<PerformanceMetrics> | null = null;
  
  if (options.measureFrames) {
    frameMonitoring = measureFramePerformance(page, 5000); // 5 second window
  }
  
  const initialMemory = options.measureMemory ? await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize || 0;
  }) : 0;
  
  // Execute operation
  const result = await operation();
  
  const endTime = performance.now();
  const operationTime = endTime - startTime;
  
  // Gather metrics
  const finalMemory = options.measureMemory ? await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize || 0;
  }) : 0;
  
  const frameMetrics = frameMonitoring ? await frameMonitoring : {};
  
  const metrics: Partial<PerformanceMetrics> = {
    ...frameMetrics,
    memoryUsage: finalMemory - initialMemory
  };
  
  return { result, metrics };
}

/**
 * Assert performance targets are met
 */
export function assertPerformanceTargets(
  metrics: PerformanceMetrics,
  targets: {
    minFps?: number;
    maxFrameTime?: number;
    maxLongFrames?: number;
    maxMemoryMB?: number;
  }
): void {
  if (targets.minFps !== undefined) {
    expect(metrics.fps).toBeGreaterThanOrEqual(targets.minFps);
  }
  
  if (targets.maxFrameTime !== undefined) {
    expect(metrics.maxFrameTime).toBeLessThan(targets.maxFrameTime);
  }
  
  if (targets.maxLongFrames !== undefined) {
    expect(metrics.longFrames).toBeLessThanOrEqual(targets.maxLongFrames);
  }
  
  if (targets.maxMemoryMB !== undefined && metrics.memoryUsage) {
    const memoryMB = metrics.memoryUsage / (1024 * 1024);
    expect(memoryMB).toBeLessThan(targets.maxMemoryMB);
  }
}

/**
 * Create performance stress conditions
 */
export async function createPerformanceStress(
  page: Page,
  stressType: 'cpu' | 'memory' | 'dom' | 'animation',
  intensity: 'low' | 'medium' | 'high' = 'medium'
): Promise<() => Promise<void>> {
  const cleanup = await page.evaluate((type, level) => {
    let cleanupFn: (() => void) | null = null;
    
    switch (type) {
      case 'cpu':
        const cpuIntensity = level === 'low' ? 10 : level === 'medium' ? 50 : 100;
        let shouldStress = true;
        
        const cpuStress = () => {
          const start = Date.now();
          while (Date.now() - start < cpuIntensity && shouldStress) {
            Math.random() * Math.random();
          }
          if (shouldStress) {
            setTimeout(cpuStress, 10);
          }
        };
        
        cpuStress();
        cleanupFn = () => { shouldStress = false; };
        break;
        
      case 'memory':
        const arrays: number[][] = [];
        const memorySize = level === 'low' ? 1000 : level === 'medium' ? 10000 : 100000;
        
        for (let i = 0; i < 100; i++) {
          arrays.push(new Array(memorySize).fill(Math.random()));
        }
        
        cleanupFn = () => { arrays.length = 0; };
        break;
        
      case 'dom':
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        document.body.appendChild(container);
        
        const elementCount = level === 'low' ? 100 : level === 'medium' ? 500 : 1000;
        
        for (let i = 0; i < elementCount; i++) {
          const div = document.createElement('div');
          div.textContent = `Stress element ${i}`;
          div.style.background = `hsl(${Math.random() * 360}, 50%, 50%)`;
          container.appendChild(div);
        }
        
        cleanupFn = () => { container.remove(); };
        break;
        
      case 'animation':
        const animElements: HTMLElement[] = [];
        const animCount = level === 'low' ? 10 : level === 'medium' ? 50 : 100;
        
        for (let i = 0; i < animCount; i++) {
          const div = document.createElement('div');
          div.style.cssText = `
            position: absolute;
            top: ${Math.random() * 100}vh;
            left: ${Math.random() * 100}vw;
            width: 10px;
            height: 10px;
            background: red;
            animation: spin 1s linear infinite;
          `;
          document.body.appendChild(div);
          animElements.push(div);
        }
        
        // Add animation keyframes
        const style = document.createElement('style');
        style.textContent = `
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
        
        cleanupFn = () => {
          animElements.forEach(el => el.remove());
          style.remove();
        };
        break;
    }
    
    // Store cleanup function globally
    (window as any)._performanceStressCleanup = cleanupFn;
    
    return 'started';
  }, stressType, intensity);
  
  // Return cleanup function
  return async () => {
    await page.evaluate(() => {
      const cleanup = (window as any)._performanceStressCleanup;
      if (cleanup) {
        cleanup();
        delete (window as any)._performanceStressCleanup;
      }
    });
  };
}

/**
 * Wait for performance to stabilize
 */
export async function waitForPerformanceStabilization(
  page: Page,
  maxWaitMs: number = 5000
): Promise<void> {
  const startTime = Date.now();
  let consecutiveGoodFrames = 0;
  const requiredGoodFrames = 30; // ~0.5 seconds at 60fps
  
  while (Date.now() - startTime < maxWaitMs) {
    const metrics = await measureFramePerformance(page, 500); // 0.5 second sample
    
    if (metrics.fps >= 55 && metrics.maxFrameTime < 25) {
      consecutiveGoodFrames += metrics.frameCount;
      
      if (consecutiveGoodFrames >= requiredGoodFrames) {
        return; // Performance is stable
      }
    } else {
      consecutiveGoodFrames = 0; // Reset counter
    }
    
    await page.waitForTimeout(100);
  }
  
  // If we reach here, performance didn't stabilize within timeout
  console.warn(`Performance did not stabilize within ${maxWaitMs}ms`);
}

/**
 * Get current LOD level from performance manager
 */
export async function getCurrentLODLevel(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // Try to access performance manager from window
    const manager = (window as any).mobilePerformanceManager;
    return manager?.getPerformanceStatus?.()?.lodLevel || null;
  });
}

/**
 * Monitor resource usage over time
 */
export async function monitorResourceUsage(
  page: Page,
  durationMs: number = 10000,
  intervalMs: number = 1000
): Promise<Array<{ timestamp: number; memory: number; fps: number }>> {
  const samples: Array<{ timestamp: number; memory: number; fps: number }> = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < durationMs) {
    const frameMetrics = await measureFramePerformance(page, intervalMs);
    const memory = frameMetrics.memoryUsage || 0;
    
    samples.push({
      timestamp: Date.now(),
      memory,
      fps: frameMetrics.fps
    });
    
    await page.waitForTimeout(intervalMs);
  }
  
  return samples;
}