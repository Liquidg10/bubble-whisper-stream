/**
 * Performance Manager - Phase 5 Infrastructure
 * Real-time FPS monitoring, LOD management, and performance budget enforcement
 */

import React from 'react';

export interface PerformanceMetrics {
  fps: number;
  averageFps: number;
  frameDrops: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  renderTime: number;
  dragLatency: number;
  activeAnimations: number;
  lastMeasurement: number;
}

export interface PerformanceBudget {
  targetFps: number;
  maxFrameDrops: number;
  maxRenderTime: number;
  maxDragLatency: number;
  maxMemoryPercentage: number;
}

export interface LODLevel {
  name: string;
  effectsEnabled: boolean;
  animationsEnabled: boolean;
  shadowsEnabled: boolean;
  blurEnabled: boolean;
  particlesEnabled: boolean;
  maxConcurrentAnimations: number;
}

const LOD_LEVELS: Record<string, LODLevel> = {
  high: {
    name: 'High',
    effectsEnabled: true,
    animationsEnabled: true,
    shadowsEnabled: true,
    blurEnabled: true,
    particlesEnabled: true,
    maxConcurrentAnimations: 10
  },
  medium: {
    name: 'Medium',
    effectsEnabled: true,
    animationsEnabled: true,
    shadowsEnabled: false,
    blurEnabled: true,
    particlesEnabled: false,
    maxConcurrentAnimations: 6
  },
  low: {
    name: 'Low',
    effectsEnabled: false,
    animationsEnabled: true,
    shadowsEnabled: false,
    blurEnabled: false,
    particlesEnabled: false,
    maxConcurrentAnimations: 3
  },
  minimal: {
    name: 'Minimal',
    effectsEnabled: false,
    animationsEnabled: false,
    shadowsEnabled: false,
    blurEnabled: false,
    particlesEnabled: false,
    maxConcurrentAnimations: 0
  }
};

class PerformanceManager {
  private metrics: PerformanceMetrics;
  private budget: PerformanceBudget;
  private currentLOD: string = 'high';
  private isMonitoring = false;
  private frameCount = 0;
  private lastFrameTime = 0;
  private fpsHistory: number[] = [];
  private animationFrameId: number | null = null;
  private observers: ((metrics: PerformanceMetrics) => void)[] = [];

  constructor() {
    this.metrics = {
      fps: 60,
      averageFps: 60,
      frameDrops: 0,
      memory: { used: 0, total: 0, percentage: 0 },
      renderTime: 0,
      dragLatency: 0,
      activeAnimations: 0,
      lastMeasurement: Date.now()
    };

    // Set budgets based on device capabilities
    this.budget = this.detectDeviceBudget();
    
    // Start monitoring automatically
    this.startMonitoring();
  }

  private detectDeviceBudget(): PerformanceBudget {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowEnd = navigator.hardwareConcurrency <= 2;

    if (isMobile || isLowEnd) {
      return {
        targetFps: 55,
        maxFrameDrops: 10,
        maxRenderTime: 20,
        maxDragLatency: 100,
        maxMemoryPercentage: 80
      };
    }

    return {
      targetFps: 60,
      maxFrameDrops: 5,
      maxRenderTime: 16.6,
      maxDragLatency: 50,
      maxMemoryPercentage: 70
    };
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastFrameTime = performance.now();
    this.measureFrame();
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private measureFrame = () => {
    if (!this.isMonitoring) return;

    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    
    if (deltaTime > 0) {
      const currentFps = 1000 / deltaTime;
      this.fpsHistory.push(currentFps);
      
      // Keep only last 60 frames for average
      if (this.fpsHistory.length > 60) {
        this.fpsHistory.shift();
      }

      // Update metrics
      this.metrics.fps = Math.round(currentFps);
      this.metrics.averageFps = Math.round(
        this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length
      );
      
      // Count frame drops (below target - 5fps tolerance)
      if (currentFps < this.budget.targetFps - 5) {
        this.metrics.frameDrops++;
      }

      this.metrics.renderTime = deltaTime;
      this.metrics.lastMeasurement = now;

      // Update memory if available
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.metrics.memory = {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
        };
      }

      // Auto-adjust LOD based on performance
      this.autoAdjustLOD();

      // Notify observers
      this.notifyObservers();
    }

    this.lastFrameTime = now;
    this.frameCount++;
    
    this.animationFrameId = requestAnimationFrame(this.measureFrame);
  };

  private autoAdjustLOD() {
    const { averageFps, frameDrops, memory } = this.metrics;
    const { targetFps, maxFrameDrops, maxMemoryPercentage } = this.budget;

    // Determine if we need to reduce quality
    const performanceIssues = 
      averageFps < targetFps - 10 || 
      frameDrops > maxFrameDrops ||
      memory.percentage > maxMemoryPercentage;

    // Determine if we can increase quality
    const performanceGood = 
      averageFps >= targetFps + 5 && 
      frameDrops < maxFrameDrops / 2 &&
      memory.percentage < maxMemoryPercentage - 20;

    if (performanceIssues) {
      this.reduceLOD();
    } else if (performanceGood) {
      this.increaseLOD();
    }
  }

  private reduceLOD() {
    const levels = ['high', 'medium', 'low', 'minimal'];
    const currentIndex = levels.indexOf(this.currentLOD);
    
    if (currentIndex < levels.length - 1) {
      this.currentLOD = levels[currentIndex + 1];
      this.applyLOD();
      console.log(`🎯 Performance: Reduced to ${this.currentLOD} LOD (FPS: ${this.metrics.averageFps})`);
    }
  }

  private increaseLOD() {
    const levels = ['high', 'medium', 'low', 'minimal'];
    const currentIndex = levels.indexOf(this.currentLOD);
    
    if (currentIndex > 0) {
      this.currentLOD = levels[currentIndex - 1];
      this.applyLOD();
      console.log(`🚀 Performance: Increased to ${this.currentLOD} LOD (FPS: ${this.metrics.averageFps})`);
    }
  }

  private applyLOD() {
    const level = LOD_LEVELS[this.currentLOD];
    
    // Apply CSS custom properties for LOD
    document.documentElement.style.setProperty('--lod-effects', level.effectsEnabled ? '1' : '0');
    document.documentElement.style.setProperty('--lod-animations', level.animationsEnabled ? '1' : '0');
    document.documentElement.style.setProperty('--lod-shadows', level.shadowsEnabled ? '1' : '0');
    document.documentElement.style.setProperty('--lod-blur', level.blurEnabled ? '1' : '0');
    document.documentElement.style.setProperty('--lod-particles', level.particlesEnabled ? '1' : '0');
    document.documentElement.style.setProperty('--lod-max-animations', level.maxConcurrentAnimations.toString());

    // Emit custom event for components to react
    window.dispatchEvent(new CustomEvent('lod-changed', { 
      detail: { level: this.currentLOD, config: level } 
    }));
  }

  // Public API
  getCurrentLOD(): string {
    return this.currentLOD;
  }

  setLOD(level: string) {
    if (level in LOD_LEVELS) {
      this.currentLOD = level;
      this.applyLOD();
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getBudget(): PerformanceBudget {
    return { ...this.budget };
  }

  setBudget(budget: Partial<PerformanceBudget>) {
    this.budget = { ...this.budget, ...budget };
  }

  onMetricsUpdate(callback: (metrics: PerformanceMetrics) => void) {
    this.observers.push(callback);
    return () => {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  private notifyObservers() {
    this.observers.forEach(callback => callback(this.metrics));
  }

  // Drag performance measurement
  measureDragStart() {
    this.dragStartTime = performance.now();
  }

  measureDragEnd() {
    if (this.dragStartTime) {
      this.metrics.dragLatency = performance.now() - this.dragStartTime;
      this.dragStartTime = undefined;
    }
  }

  private dragStartTime?: number;

  // Animation counting
  incrementAnimations() {
    this.metrics.activeAnimations++;
  }

  decrementAnimations() {
    this.metrics.activeAnimations = Math.max(0, this.metrics.activeAnimations - 1);
  }

  // Performance report
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      currentLOD: this.currentLOD,
      metrics: this.metrics,
      budget: this.budget,
      performance: {
        meetsFpsTarget: this.metrics.averageFps >= this.budget.targetFps - 5,
        withinFrameDropLimit: this.metrics.frameDrops <= this.budget.maxFrameDrops,
        withinMemoryLimit: this.metrics.memory.percentage <= this.budget.maxMemoryPercentage,
        overall: this.getOverallPerformanceGrade()
      }
    };
  }

  private getOverallPerformanceGrade(): 'excellent' | 'good' | 'fair' | 'poor' {
    const { averageFps, frameDrops, memory } = this.metrics;
    const { targetFps, maxFrameDrops, maxMemoryPercentage } = this.budget;

    const fpsScore = Math.min(100, (averageFps / targetFps) * 100);
    const dropScore = Math.max(0, 100 - (frameDrops / maxFrameDrops) * 100);
    const memoryScore = Math.max(0, 100 - (memory.percentage / maxMemoryPercentage) * 100);
    
    const overallScore = (fpsScore + dropScore + memoryScore) / 3;

    if (overallScore >= 90) return 'excellent';
    if (overallScore >= 75) return 'good';
    if (overallScore >= 60) return 'fair';
    return 'poor';
  }
}

// Singleton instance
export const performanceManager = new PerformanceManager();

// React hook for components
export function usePerformanceMetrics() {
  const [metrics, setMetrics] = React.useState(performanceManager.getMetrics());
  
  React.useEffect(() => {
    return performanceManager.onMetricsUpdate(setMetrics);
  }, []);

  return {
    metrics,
    currentLOD: performanceManager.getCurrentLOD(),
    setLOD: performanceManager.setLOD.bind(performanceManager),
    generateReport: performanceManager.generateReport.bind(performanceManager)
  };
}
