/**
 * Phase 1: Mobile Performance Manager
 * Mobile-specific optimizations, gesture debouncing, and virtual scrolling
 */

import { performanceManager } from './performanceManager';

export interface MobilePerformanceConfig {
  gestureDebounceMs: number;
  virtualScrollThreshold: number;
  maxConcurrentAnimations: number;
  lowPowerMode: boolean;
  reducedMotion: boolean;
  hapticFeedback: boolean;
}

export interface TouchOptimization {
  preventDefaultScroll: boolean;
  usePassiveListeners: boolean;
  touchActionNone: boolean;
  minimumTouchTargetSize: number;
}

export interface VirtualScrollMetrics {
  totalItems: number;
  visibleItems: number;
  scrollPosition: number;
  itemHeight: number;
  bufferSize: number;
}

class MobilePerformanceManager {
  private config: MobilePerformanceConfig;
  private gestureTimeouts: Map<string, number> = new Map();
  private activeAnimations: Set<string> = new Set();
  private lastFrameTime = 0;
  private frameCount = 0;
  private isLowPowerMode = false;

  constructor() {
    this.config = {
      gestureDebounceMs: 16, // ~60fps
      virtualScrollThreshold: 100,
      maxConcurrentAnimations: 3,
      lowPowerMode: false,
      reducedMotion: false,
      hapticFeedback: 'vibrate' in navigator
    };

    this.detectLowPowerMode();
    this.setupPerformanceMonitoring();
  }

  /**
   * Debounced gesture handler for smooth touch interactions
   */
  debounceGesture<T extends (...args: any[]) => void>(
    key: string,
    handler: T,
    delay?: number
  ): T {
    const debounceMs = delay || this.config.gestureDebounceMs;
    
    return ((...args: any[]) => {
      // Clear existing timeout
      const existingTimeout = this.gestureTimeouts.get(key);
      if (existingTimeout) {
        cancelAnimationFrame(existingTimeout);
      }

      // Schedule new execution
      const timeoutId = requestAnimationFrame(() => {
        handler(...args);
        this.gestureTimeouts.delete(key);
      });

      this.gestureTimeouts.set(key, timeoutId);
    }) as T;
  }

  /**
   * Virtual scrolling for large lists
   */
  calculateVirtualScrollMetrics(
    containerHeight: number,
    itemHeight: number,
    totalItems: number,
    scrollTop: number,
    bufferSize: number = 5
  ): VirtualScrollMetrics {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + bufferSize * 2);
    
    return {
      totalItems,
      visibleItems: endIndex - startIndex + 1,
      scrollPosition: startIndex,
      itemHeight,
      bufferSize
    };
  }

  /**
   * Create virtual scroll component props
   */
  createVirtualScrollProps(
    items: any[],
    containerHeight: number,
    itemHeight: number,
    scrollTop: number
  ) {
    const metrics = this.calculateVirtualScrollMetrics(
      containerHeight,
      itemHeight,
      items.length,
      scrollTop
    );

    const visibleItems = items.slice(
      metrics.scrollPosition,
      metrics.scrollPosition + metrics.visibleItems
    );

    const totalHeight = items.length * itemHeight;
    const offsetY = metrics.scrollPosition * itemHeight;

    return {
      visibleItems,
      totalHeight,
      offsetY,
      startIndex: metrics.scrollPosition,
      endIndex: metrics.scrollPosition + metrics.visibleItems - 1
    };
  }

  /**
   * Optimize touch events for mobile
   */
  getTouchOptimization(): TouchOptimization {
    return {
      preventDefaultScroll: !this.config.reducedMotion,
      usePassiveListeners: true,
      touchActionNone: true,
      minimumTouchTargetSize: 44 // iOS/Android recommendation
    };
  }

  /**
   * Animation management with mobile constraints
   */
  canStartAnimation(animationId: string): boolean {
    if (this.config.lowPowerMode && this.activeAnimations.size >= 1) {
      return false;
    }

    if (this.activeAnimations.size >= this.config.maxConcurrentAnimations) {
      return false;
    }

    return true;
  }

  startAnimation(animationId: string): void {
    if (this.canStartAnimation(animationId)) {
      this.activeAnimations.add(animationId);
      console.log(`📱 Started animation: ${animationId} (${this.activeAnimations.size} active)`);
    }
  }

  endAnimation(animationId: string): void {
    this.activeAnimations.delete(animationId);
    console.log(`📱 Ended animation: ${animationId} (${this.activeAnimations.size} active)`);
  }

  /**
   * Haptic feedback for mobile interactions
   */
  triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!this.config.hapticFeedback) return;

    // Modern haptic feedback API
    if ('vibrate' in navigator) {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [30]
      };
      
      navigator.vibrate(patterns[type]);
    }

    // iOS haptic feedback (if available)
    if ('hapticFeedback' in window) {
      const intensity = {
        light: 0.3,
        medium: 0.6,
        heavy: 1.0
      };
      
      (window as any).hapticFeedback(intensity[type]);
    }
  }

  /**
   * Mobile-optimized Level of Detail configuration
   */
  getMobileLODConfig() {
    const baseConfig = { maxVisibleBubbles: 50, animationQuality: 'medium', particleCount: 50 };
    
    // Reduce complexity for mobile
    return {
      ...baseConfig,
      maxVisibleBubbles: Math.floor(baseConfig.maxVisibleBubbles * 0.7),
      animationQuality: this.config.lowPowerMode ? 'minimal' : baseConfig.animationQuality,
      shadowQuality: this.config.lowPowerMode ? 'none' : 'low',
      particleCount: Math.floor((baseConfig.particleCount || 50) * 0.5),
      useWebGL: false, // Disable WebGL on mobile for battery
      enableMotionBlur: false,
      highDPI: !this.config.lowPowerMode
    };
  }

  /**
   * Adaptive performance based on device capabilities
   */
  updateConfig(updates: Partial<MobilePerformanceConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('📱 Mobile performance config updated:', this.config);
  }

  /**
   * Get current performance status
   */
  getPerformanceStatus() {
    const metrics = performanceManager.getMetrics();
    
    return {
      fps: metrics.fps,
      memoryUsage: 0,
      isLowPowerMode: this.isLowPowerMode,
      activeAnimations: this.activeAnimations.size,
      gestureLatency: this.getAverageGestureLatency(),
      recommendation: this.getPerformanceRecommendation(metrics.fps)
    };
  }

  /**
   * Memory pressure detection and handling
   */
  handleMemoryPressure(): void {
    console.log('📱 Memory pressure detected, optimizing...');
    
    // Clear gesture timeouts
    this.gestureTimeouts.forEach(timeout => cancelAnimationFrame(timeout));
    this.gestureTimeouts.clear();
    
    // Stop non-essential animations
    if (this.activeAnimations.size > 1) {
      const animationsArray = Array.from(this.activeAnimations);
      animationsArray.slice(1).forEach(id => {
        this.endAnimation(id);
      });
    }
    
    // Enable low power mode temporarily
    this.updateConfig({ lowPowerMode: true });
    
    // Re-evaluate after 5 seconds
    setTimeout(() => {
      this.updateConfig({ lowPowerMode: false });
    }, 5000);
  }

  /**
   * Gesture latency measurement
   */
  measureGestureLatency(startTime: number): number {
    const latency = performance.now() - startTime;
    
    // Store recent latencies for averaging
    const key = 'gestureLatencies';
    const stored = sessionStorage.getItem(key);
    const latencies = stored ? JSON.parse(stored) : [];
    
    latencies.push(latency);
    if (latencies.length > 10) latencies.shift();
    
    sessionStorage.setItem(key, JSON.stringify(latencies));
    
    return latency;
  }

  private detectLowPowerMode(): void {
    // Battery API for low power mode detection
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.isLowPowerMode = battery.level < 0.2 || battery.charging === false;
        
        battery.addEventListener('chargingchange', () => {
          this.isLowPowerMode = battery.level < 0.2 || battery.charging === false;
        });
        
        battery.addEventListener('levelchange', () => {
          this.isLowPowerMode = battery.level < 0.2 || battery.charging === false;
        });
      }).catch(() => {
        console.log('📱 Battery API not available');
      });
    }

    // Device memory detection
    if ('deviceMemory' in navigator) {
      const memory = (navigator as any).deviceMemory;
      if (memory <= 2) { // Less than 2GB RAM
        this.isLowPowerMode = true;
        console.log('📱 Low memory device detected, enabling power saving');
      }
    }

    // Connection type detection
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection.saveData || connection.effectiveType === 'slow-2g') {
        this.updateConfig({ lowPowerMode: true });
      }
    }
  }

  private setupPerformanceMonitoring(): void {
    let frameCount = 0;
    let lastTime = performance.now();

    const measureFrame = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        
        // Auto-adjust based on performance
        if (fps < 30 && !this.config.lowPowerMode) {
          console.log('📱 Low FPS detected, enabling performance mode');
          this.updateConfig({ lowPowerMode: true });
        } else if (fps > 55 && this.config.lowPowerMode) {
          console.log('📱 Good FPS detected, disabling performance mode');
          this.updateConfig({ lowPowerMode: false });
        }
      }
      
      requestAnimationFrame(measureFrame);
    };
    
    requestAnimationFrame(measureFrame);

    // Memory pressure listener
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory;
        if (memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.8) {
          this.handleMemoryPressure();
        }
      }, 5000);
    }
  }

  private getAverageGestureLatency(): number {
    const stored = sessionStorage.getItem('gestureLatencies');
    if (!stored) return 0;
    
    const latencies = JSON.parse(stored);
    return latencies.reduce((sum: number, lat: number) => sum + lat, 0) / latencies.length;
  }

  private getPerformanceRecommendation(fps: number): string {
    if (fps < 20) return 'Consider reducing visual effects and animations';
    if (fps < 30) return 'Enable low power mode for better performance';
    if (fps < 45) return 'Good performance, minor optimizations possible';
    return 'Excellent performance';
  }
}

export const mobilePerformanceManager = new MobilePerformanceManager();