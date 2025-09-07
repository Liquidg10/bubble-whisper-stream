/**
 * CBT Performance Tracker
 * Monitors latency and performance metrics for CBT pipeline
 * Target: chip render ≤ 50ms post-message
 */

export interface PerformanceMetrics {
  observerTime: number;
  policyTime: number;
  renderTime: number;
  totalTime: number;
  timestamp: number;
  messageLength: number;
  distortionCount: number;
  crisisCount: number;
}

export interface PerformanceStats {
  avgObserverTime: number;
  avgPolicyTime: number;
  avgRenderTime: number;
  avgTotalTime: number;
  maxTotalTime: number;
  minTotalTime: number;
  p95TotalTime: number;
  successRate: number; // % under 50ms target
  memoryUsage: number;
  sampleCount: number;
}

export class CBTPerformanceTracker {
  private metrics: PerformanceMetrics[] = [];
  private maxSamples = 100; // Keep last 100 measurements
  private targetLatency = 50; // 50ms target

  // Record a performance measurement
  recordMetrics(metrics: Omit<PerformanceMetrics, 'timestamp'>): void {
    const fullMetrics: PerformanceMetrics = {
      ...metrics,
      timestamp: Date.now()
    };

    this.metrics.push(fullMetrics);

    // Keep only recent samples
    if (this.metrics.length > this.maxSamples) {
      this.metrics.shift();
    }

    // Log if over target
    if (fullMetrics.totalTime > this.targetLatency) {
      console.warn(`[CBT Performance] Slow pipeline: ${fullMetrics.totalTime.toFixed(2)}ms (target: ${this.targetLatency}ms)`, {
        observer: fullMetrics.observerTime,
        policy: fullMetrics.policyTime,
        render: fullMetrics.renderTime,
        messageLength: fullMetrics.messageLength
      });
    }
  }

  // Get current performance statistics
  getStats(): PerformanceStats {
    if (this.metrics.length === 0) {
      return {
        avgObserverTime: 0,
        avgPolicyTime: 0,
        avgRenderTime: 0,
        avgTotalTime: 0,
        maxTotalTime: 0,
        minTotalTime: 0,
        p95TotalTime: 0,
        successRate: 0,
        memoryUsage: this.estimateMemoryUsage(),
        sampleCount: 0
      };
    }

    const totalTimes = this.metrics.map(m => m.totalTime).sort((a, b) => a - b);
    const underTarget = this.metrics.filter(m => m.totalTime <= this.targetLatency).length;

    return {
      avgObserverTime: this.average(this.metrics.map(m => m.observerTime)),
      avgPolicyTime: this.average(this.metrics.map(m => m.policyTime)),
      avgRenderTime: this.average(this.metrics.map(m => m.renderTime)),
      avgTotalTime: this.average(totalTimes),
      maxTotalTime: Math.max(...totalTimes),
      minTotalTime: Math.min(...totalTimes),
      p95TotalTime: this.percentile(totalTimes, 95),
      successRate: (underTarget / this.metrics.length) * 100,
      memoryUsage: this.estimateMemoryUsage(),
      sampleCount: this.metrics.length
    };
  }

  // Get recent performance trend
  getTrend(lastN: number = 20): {
    improving: boolean;
    recentAvg: number;
    previousAvg: number;
    confidence: 'high' | 'medium' | 'low';
  } {
    if (this.metrics.length < lastN * 2) {
      return {
        improving: false,
        recentAvg: 0,
        previousAvg: 0,
        confidence: 'low'
      };
    }

    const recent = this.metrics.slice(-lastN);
    const previous = this.metrics.slice(-lastN * 2, -lastN);

    const recentAvg = this.average(recent.map(m => m.totalTime));
    const previousAvg = this.average(previous.map(m => m.totalTime));

    const confidence = this.metrics.length >= lastN * 4 ? 'high' : 
                      this.metrics.length >= lastN * 2 ? 'medium' : 'low';

    return {
      improving: recentAvg < previousAvg,
      recentAvg,
      previousAvg,
      confidence
    };
  }

  // Performance by message characteristics
  getMetricsByMessageLength(): Array<{
    lengthRange: string;
    avgTime: number;
    count: number;
    successRate: number;
  }> {
    const ranges = [
      { min: 0, max: 50, label: '0-50 chars' },
      { min: 51, max: 100, label: '51-100 chars' },
      { min: 101, max: 200, label: '101-200 chars' },
      { min: 201, max: 500, label: '201-500 chars' },
      { min: 501, max: Infinity, label: '500+ chars' }
    ];

    return ranges.map(range => {
      const samples = this.metrics.filter(m => 
        m.messageLength >= range.min && m.messageLength <= range.max
      );

      if (samples.length === 0) {
        return {
          lengthRange: range.label,
          avgTime: 0,
          count: 0,
          successRate: 0
        };
      }

      const underTarget = samples.filter(s => s.totalTime <= this.targetLatency).length;

      return {
        lengthRange: range.label,
        avgTime: this.average(samples.map(s => s.totalTime)),
        count: samples.length,
        successRate: (underTarget / samples.length) * 100
      };
    });
  }

  // Performance by complexity
  getMetricsByComplexity(): Array<{
    complexity: string;
    avgTime: number;
    count: number;
    successRate: number;
  }> {
    const complexityGroups = [
      { min: 0, max: 0, label: 'No detections' },
      { min: 1, max: 1, label: '1 detection' },
      { min: 2, max: 3, label: '2-3 detections' },
      { min: 4, max: Infinity, label: '4+ detections' }
    ];

    return complexityGroups.map(group => {
      const samples = this.metrics.filter(m => {
        const total = m.distortionCount + m.crisisCount;
        return total >= group.min && total <= group.max;
      });

      if (samples.length === 0) {
        return {
          complexity: group.label,
          avgTime: 0,
          count: 0,
          successRate: 0
        };
      }

      const underTarget = samples.filter(s => s.totalTime <= this.targetLatency).length;

      return {
        complexity: group.label,
        avgTime: this.average(samples.map(s => s.totalTime)),
        count: samples.length,
        successRate: (underTarget / samples.length) * 100
      };
    });
  }

  // Clear metrics
  clearMetrics(): void {
    this.metrics = [];
  }

  // Export metrics for analysis
  exportMetrics(): string {
    return JSON.stringify({
      targetLatency: this.targetLatency,
      maxSamples: this.maxSamples,
      stats: this.getStats(),
      trend: this.getTrend(),
      byLength: this.getMetricsByMessageLength(),
      byComplexity: this.getMetricsByComplexity(),
      rawMetrics: this.metrics
    }, null, 2);
  }

  // Real-time performance monitoring
  startMonitoring(intervalMs: number = 5000): () => void {
    const interval = setInterval(() => {
      const stats = this.getStats();
      
      if (stats.sampleCount > 10) { // Only monitor with sufficient data
        if (stats.successRate < 80) {
          console.warn(`[CBT Performance] Success rate low: ${stats.successRate.toFixed(1)}%`);
        }
        
        if (stats.avgTotalTime > this.targetLatency * 1.5) {
          console.warn(`[CBT Performance] Average latency high: ${stats.avgTotalTime.toFixed(2)}ms`);
        }
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }

  // Utility methods
  private average(numbers: number[]): number {
    return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
  }

  private percentile(sortedNumbers: number[], p: number): number {
    const index = Math.ceil((p / 100) * sortedNumbers.length) - 1;
    return sortedNumbers[Math.max(0, index)] || 0;
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage for metrics
    const sizePerMetric = 100; // bytes (rough estimate)
    return this.metrics.length * sizePerMetric;
  }

  // Create performance measurement wrapper
  createMeasurement() {
    const start = performance.now();
    let observerEnd = 0;
    let policyEnd = 0;

    return {
      markObserverComplete: () => {
        observerEnd = performance.now();
      },
      markPolicyComplete: () => {
        policyEnd = performance.now();
      },
      complete: (messageLength: number, distortionCount: number, crisisCount: number) => {
        const renderEnd = performance.now();
        
        this.recordMetrics({
          observerTime: observerEnd - start,
          policyTime: policyEnd - observerEnd,
          renderTime: renderEnd - policyEnd,
          totalTime: renderEnd - start,
          messageLength,
          distortionCount,
          crisisCount
        });

        return renderEnd - start;
      }
    };
  }
}

export const cbtPerformanceTracker = new CBTPerformanceTracker();
