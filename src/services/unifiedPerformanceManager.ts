/**
 * Phase 4C: Unified Performance Manager
 * Consolidates multiple performance managers into single system
 */

import { mobilePerformanceManager } from './mobilePerformanceManager';
import { performanceManager } from './performanceManager';
import { useIsMobile } from '@/hooks/use-mobile';

interface UnifiedPerformanceConfig {
  // Mobile-specific
  gestureDebounceMs: number;
  hapticFeedback: boolean;
  virtualScrollThreshold: number;
  
  // Desktop-specific
  maxConcurrentAnimations: number;
  enableMotionBlur: boolean;
  highDPI: boolean;
  
  // Universal
  lowPowerMode: boolean;
  reducedMotion: boolean;
  adaptiveLOD: boolean;
  performanceTarget: 'battery' | 'balanced' | 'performance';
}

interface UnifiedMetrics {
  fps: number;
  frameDrops: number;
  memoryUsage: number;
  gestureLatency: number;
  renderTime: number;
  batteryLevel?: number;
  networkLatency: number;
  cacheHitRate: number;
}

interface AdaptiveSettings {
  shadowQuality: 'none' | 'low' | 'medium' | 'high';
  animationQuality: 'minimal' | 'reduced' | 'standard' | 'enhanced';
  particleCount: number;
  maxVisibleElements: number;
  useWebGL: boolean;
  enableBlur: boolean;
  textureResolution: number;
}

class UnifiedPerformanceManager {
  private config: UnifiedPerformanceConfig;
  private metrics: UnifiedMetrics;
  private adaptiveSettings: AdaptiveSettings;
  private isMobile: boolean = false;
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.config = {
      gestureDebounceMs: 16,
      hapticFeedback: true,
      virtualScrollThreshold: 100,
      maxConcurrentAnimations: 3,
      enableMotionBlur: false,
      highDPI: true,
      lowPowerMode: false,
      reducedMotion: false,
      adaptiveLOD: true,
      performanceTarget: 'balanced'
    };

    this.metrics = {
      fps: 60,
      frameDrops: 0,
      memoryUsage: 0,
      gestureLatency: 0,
      renderTime: 0,
      networkLatency: 0,
      cacheHitRate: 1.0
    };

    this.adaptiveSettings = {
      shadowQuality: 'medium',
      animationQuality: 'standard',
      particleCount: 50,
      maxVisibleElements: 100,
      useWebGL: true,
      enableBlur: true,
      textureResolution: 1
    };

    this.detectEnvironment();
    this.initializePerformanceMonitoring();
  }

  // Public API
  initialize(): void {
    if (this.isMobile) {
      mobilePerformanceManager.updateConfig({
        gestureDebounceMs: this.config.gestureDebounceMs,
        hapticFeedback: this.config.hapticFeedback,
        virtualScrollThreshold: this.config.virtualScrollThreshold,
        lowPowerMode: this.config.lowPowerMode,
        reducedMotion: this.config.reducedMotion,
        maxConcurrentAnimations: this.config.maxConcurrentAnimations
      });
    }

    this.updateAdaptiveSettings();
    console.log('🎛️ Unified Performance Manager initialized', {
      isMobile: this.isMobile,
      target: this.config.performanceTarget
    });
  }

  updateConfig(updates: Partial<UnifiedPerformanceConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Propagate to underlying managers
    if (this.isMobile) {
      mobilePerformanceManager.updateConfig({
        gestureDebounceMs: this.config.gestureDebounceMs,
        hapticFeedback: this.config.hapticFeedback,
        virtualScrollThreshold: this.config.virtualScrollThreshold,
        lowPowerMode: this.config.lowPowerMode,
        reducedMotion: this.config.reducedMotion,
        maxConcurrentAnimations: this.config.maxConcurrentAnimations
      });
    }

    this.updateAdaptiveSettings();
  }

  getAdaptiveSettings(): AdaptiveSettings {
    if (this.config.adaptiveLOD) {
      this.updateAdaptiveSettingsBasedOnPerformance();
    }
    return { ...this.adaptiveSettings };
  }

  getMetrics(): UnifiedMetrics {
    if (this.isMobile) {
      const mobileStatus = mobilePerformanceManager.getPerformanceStatus();
      this.metrics.fps = mobileStatus.fps;
      this.metrics.gestureLatency = mobileStatus.gestureLatency;
    } else {
      const desktopMetrics = performanceManager.getMetrics();
      this.metrics.fps = desktopMetrics.fps;
      this.metrics.frameDrops = desktopMetrics.frameDrops || 0;
    }

    // Update memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }

    return { ...this.metrics };
  }

  // Performance optimization methods
  optimizeForBattery(): void {
    this.updateConfig({
      performanceTarget: 'battery',
      lowPowerMode: true,
      maxConcurrentAnimations: 1,
      enableMotionBlur: false,
      highDPI: false
    });
  }

  optimizeForPerformance(): void {
    this.updateConfig({
      performanceTarget: 'performance',
      lowPowerMode: false,
      maxConcurrentAnimations: 5,
      enableMotionBlur: true,
      highDPI: true
    });
  }

  optimizeForBalance(): void {
    this.updateConfig({
      performanceTarget: 'balanced',
      lowPowerMode: false,
      maxConcurrentAnimations: 3,
      enableMotionBlur: false,
      highDPI: true
    });
  }

  // Animation management
  canStartAnimation(animationId: string): boolean {
    if (this.isMobile) {
      return mobilePerformanceManager.canStartAnimation(animationId);
    }
    
    // Desktop animation management
    return this.metrics.fps > 45 && this.metrics.memoryUsage < 0.8;
  }

  startAnimation(animationId: string): boolean {
    if (this.isMobile) {
      mobilePerformanceManager.startAnimation(animationId);
      return true;
    }
    
    if (this.canStartAnimation(animationId)) {
      console.log(`🎨 Animation started: ${animationId}`);
      return true;
    }
    
    return false;
  }

  endAnimation(animationId: string): void {
    if (this.isMobile) {
      mobilePerformanceManager.endAnimation(animationId);
    } else {
      console.log(`🎨 Animation ended: ${animationId}`);
    }
  }

  // Gesture handling
  debounceGesture<T extends (...args: any[]) => void>(
    key: string,
    handler: T,
    delay?: number
  ): T {
    if (this.isMobile) {
      return mobilePerformanceManager.debounceGesture(key, handler, delay);
    }
    
    // Desktop gesture debouncing (simpler approach)
    let timeoutId: NodeJS.Timeout;
    const debounceMs = delay || 16;
    
    return ((...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => handler(...args), debounceMs);
    }) as T;
  }

  // Haptic feedback
  triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (this.isMobile && this.config.hapticFeedback) {
      mobilePerformanceManager.triggerHapticFeedback(type);
    }
  }

  // Error boundaries and fallbacks
  handlePerformanceError(error: Error, context: string): void {
    console.error(`Performance error in ${context}:`, error);
    
    // Automatic fallback to battery mode on repeated errors
    if (this.config.performanceTarget !== 'battery') {
      console.log('🔋 Falling back to battery mode due to performance errors');
      this.optimizeForBattery();
    }
  }

  // Private methods
  private detectEnvironment(): void {
    // Detect mobile environment
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Detect low-end devices
    if ('deviceMemory' in navigator) {
      const memory = (navigator as any).deviceMemory;
      if (memory <= 2) {
        this.config.performanceTarget = 'battery';
        this.config.lowPowerMode = true;
      }
    }

    // Detect battery status
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.metrics.batteryLevel = battery.level;
        
        if (battery.level < 0.2) {
          this.optimizeForBattery();
        }
      });
    }

    // Detect connection quality
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection.saveData || connection.effectiveType === 'slow-2g') {
        this.config.lowPowerMode = true;
      }
    }
  }

  private initializePerformanceMonitoring(): void {
    // Performance Observer for measuring render times
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.metrics.renderTime = entry.duration;
          }
        }
      });
      
      this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
    }

    // FPS monitoring
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        this.metrics.fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        
        // Auto-adjust settings based on FPS
        if (this.config.adaptiveLOD) {
          this.updateAdaptiveSettingsBasedOnPerformance();
        }
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  private updateAdaptiveSettings(): void {
    const target = this.config.performanceTarget;
    
    switch (target) {
      case 'battery':
        this.adaptiveSettings = {
          shadowQuality: 'none',
          animationQuality: 'minimal',
          particleCount: 10,
          maxVisibleElements: 50,
          useWebGL: false,
          enableBlur: false,
          textureResolution: 0.5
        };
        break;
        
      case 'performance':
        this.adaptiveSettings = {
          shadowQuality: 'high',
          animationQuality: 'enhanced',
          particleCount: 100,
          maxVisibleElements: 200,
          useWebGL: true,
          enableBlur: true,
          textureResolution: this.isMobile ? 1 : 2
        };
        break;
        
      default: // balanced
        this.adaptiveSettings = {
          shadowQuality: this.isMobile ? 'low' : 'medium',
          animationQuality: 'standard',
          particleCount: this.isMobile ? 25 : 50,
          maxVisibleElements: this.isMobile ? 75 : 100,
          useWebGL: !this.isMobile,
          enableBlur: !this.isMobile,
          textureResolution: 1
        };
    }

    // Apply reduced motion preferences
    if (this.config.reducedMotion) {
      this.adaptiveSettings.animationQuality = 'minimal';
      this.adaptiveSettings.particleCount = 0;
    }
  }

  private updateAdaptiveSettingsBasedOnPerformance(): void {
    const fps = this.metrics.fps;
    const memoryUsage = this.metrics.memoryUsage;
    
    // Reduce quality if performance is poor
    if (fps < 30 || memoryUsage > 0.8) {
      this.adaptiveSettings.shadowQuality = 'none';
      this.adaptiveSettings.animationQuality = 'minimal';
      this.adaptiveSettings.particleCount = Math.max(0, this.adaptiveSettings.particleCount - 10);
      this.adaptiveSettings.maxVisibleElements = Math.max(25, this.adaptiveSettings.maxVisibleElements - 25);
    } else if (fps > 55 && memoryUsage < 0.5) {
      // Increase quality if performance is good
      if (this.config.performanceTarget !== 'battery') {
        this.adaptiveSettings.shadowQuality = this.isMobile ? 'low' : 'medium';
        this.adaptiveSettings.animationQuality = 'standard';
        this.adaptiveSettings.particleCount = Math.min(100, this.adaptiveSettings.particleCount + 5);
      }
    }
  }
}

export const unifiedPerformanceManager = new UnifiedPerformanceManager();