import React, { useEffect, useRef, useState } from 'react';
import { BubbleCanvas } from '@/components/BubbleCanvas';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Bubble } from '@/types/bubble';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, Zap, ZapOff } from 'lucide-react';

// Create many test bubbles for stress testing
const createStressBubbles = (): Bubble[] => {
  const baseTime = Date.now();
  const bubbles: Bubble[] = [];
  
  const types: Bubble['type'][] = ['Task', 'Thought', 'Memory', 'Mood', 'ReminderNote'];
  const contents = [
    'Write report', 'Call client', 'Review code', 'Plan meeting', 'Send email',
    'Fix bug', 'Update docs', 'Test feature', 'Deploy app', 'Backup data',
    'Beautiful sunset', 'Morning coffee', 'Team lunch', 'Weekend plans', 'Book recommendation',
    'Feeling creative', 'Energy boost', 'Productive day', 'Relaxing evening', 'Motivated mood',
    'Remember deadline', 'Doctor appointment', 'Pick up package', 'Call insurance', 'Pay bills'
  ];

  // Generate 150+ bubbles in clusters
  for (let cluster = 0; cluster < 8; cluster++) {
    const clusterX = (cluster % 4 - 1.5) * 400;
    const clusterY = Math.floor(cluster / 4) * 300 - 150;
    
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const radius = 50 + Math.random() * 100;
      const x = clusterX + Math.cos(angle) * radius + (Math.random() - 0.5) * 50;
      const y = clusterY + Math.sin(angle) * radius + (Math.random() - 0.5) * 50;
      
      const type = types[Math.floor(Math.random() * types.length)];
      const content = contents[Math.floor(Math.random() * contents.length)];
      
      bubbles.push({
        id: `stress-${cluster}-${i}`,
        type,
        content: `${content} ${cluster + 1}-${i + 1}`,
        x,
        y,
        size: 0.6 + Math.random() * 0.8,
        createdAt: baseTime - Math.random() * 86400000 * 7, // Random within last week
        updatedAt: baseTime - Math.random() * 86400000,
        tags: [],
        completed: Math.random() < 0.3, // 30% chance of completion
        // Add some photos for visual testing
        imageUri: (Math.random() < 0.1) ? 
          `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iJHtoc2woJHtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAzNjApfSA3MCUgNjAlKX0iLz48dGV4dCB4PSIxMDAiIHk9IjEwMCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+VGVzdCBJbWFnZTwvdGV4dD48L3N2Zz4=` 
          : undefined,
        reminderId: (Math.random() < 0.05) ? `reminder-${cluster}-${i}` : undefined
      });
    }
  }
  
  return bubbles;
};

export default function DevBubblesStress() {
  const { bubbles, addBubble, clearAllBubbles } = useBubbleStore();
  const [fpsStats, setFpsStats] = useState({ current: 0, average: 0, min: 0, max: 0 });
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const fpsRef = useRef<{
    frames: number[];
    lastTime: number;
    frameCount: number;
  }>({
    frames: [],
    lastTime: performance.now(),
    frameCount: 0
  });

  // FPS monitoring
  useEffect(() => {
    if (!isMonitoring) return;

    let animationId: number;
    
    const measureFPS = (currentTime: number) => {
      const fps = fpsRef.current;
      const deltaTime = currentTime - fps.lastTime;
      
      if (deltaTime >= 1000) { // Update every second
        const currentFPS = Math.round((fps.frameCount * 1000) / deltaTime);
        
        fps.frames.push(currentFPS);
        if (fps.frames.length > 10) {
          fps.frames.shift(); // Keep last 10 seconds
        }
        
        const avgFPS = Math.round(fps.frames.reduce((a, b) => a + b, 0) / fps.frames.length);
        const minFPS = Math.min(...fps.frames);
        const maxFPS = Math.max(...fps.frames);
        
        setFpsStats({
          current: currentFPS,
          average: avgFPS,
          min: minFPS,
          max: maxFPS
        });
        
        fps.lastTime = currentTime;
        fps.frameCount = 0;
      }
      
      fps.frameCount++;
      animationId = requestAnimationFrame(measureFPS);
    };
    
    animationId = requestAnimationFrame(measureFPS);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isMonitoring]);

  useEffect(() => {
    // Add stress test bubbles if none exist
    if (bubbles.length === 0) {
      const stressBubbles = createStressBubbles();
      stressBubbles.forEach(bubble => addBubble(bubble));
    }
  }, [bubbles.length, addBubble]);

  const resetStressData = async () => {
    await clearAllBubbles();
    const stressBubbles = createStressBubbles();
    stressBubbles.forEach(bubble => addBubble(bubble));
  };

  const toggleFPSMonitoring = () => {
    setIsMonitoring(!isMonitoring);
    if (!isMonitoring) {
      // Reset stats when starting
      setFpsStats({ current: 0, average: 0, min: 0, max: 0 });
      fpsRef.current = {
        frames: [],
        lastTime: performance.now(),
        frameCount: 0
      };
    }
  };

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return 'text-success-gentle';
    if (fps >= 30) return 'text-warning-glow';
    return 'text-danger-soft';
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header with dev controls and performance stats */}
      <div className="h-20 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 z-10">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">
            Dev: Bubbles Stress Test
          </h1>
          <p className="text-sm text-text-secondary">
            {bubbles.length} bubbles • Performance & LOD testing
          </p>
        </div>
        
        {/* Performance stats */}
        <div className="flex items-center gap-4">
          {isMonitoring && (
            <div className="flex gap-3 text-sm">
              <div className={`${getFPSColor(fpsStats.current)}`}>
                <span className="font-medium">{fpsStats.current}</span>
                <span className="text-text-secondary"> fps</span>
              </div>
              <div className="text-text-secondary">
                Avg: <span className={getFPSColor(fpsStats.average)}>{fpsStats.average}</span>
              </div>
              <div className="text-text-secondary">
                Min: <span className={getFPSColor(fpsStats.min)}>{fpsStats.min}</span>
              </div>
              <div className="text-text-secondary">
                Max: <span className={getFPSColor(fpsStats.max)}>{fpsStats.max}</span>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              variant={isMonitoring ? "default" : "outline"}
              size="sm"
              onClick={toggleFPSMonitoring}
              className="bg-card/80"
            >
              {isMonitoring ? <Zap className="h-4 w-4 mr-2" /> : <ZapOff className="h-4 w-4 mr-2" />}
              FPS Monitor
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetStressData}
              className="bg-card/80"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllBubbles}
              className="bg-card/80"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </div>

      {/* Main canvas */}
      <div className="flex-1 relative">
        <BubbleCanvas 
          onBubbleSelect={(bubble) => {
            console.log('Selected bubble:', bubble);
          }}
          onBubbleEdit={(bubble) => {
            console.log('Edited bubble:', bubble);
          }}
        />
      </div>

      {/* Performance guidelines overlay */}
      <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 max-w-sm">
        <h3 className="text-sm font-medium text-text-primary mb-2">Performance Targets</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-secondary">Target FPS:</span>
            <Badge variant="outline" className="text-success-gentle">≥55</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Acceptable:</span>
            <Badge variant="outline" className="text-warning-glow">≥30</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Poor:</span>
            <Badge variant="outline" className="text-danger-soft">&lt;30</Badge>
          </div>
          <div className="border-t border-border pt-2 mt-2">
            <p className="text-text-secondary">
              LOD should auto-engage at 150+ bubbles. 
              Test with float on/off, zoom/pan, and drag operations.
            </p>
          </div>
        </div>
      </div>

      {/* Stress test instructions */}
      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 max-w-sm">
        <h3 className="text-sm font-medium text-text-primary mb-2">Stress Test Scenarios</h3>
        <ul className="text-xs text-text-secondary space-y-1">
          <li>• Zoom out to see all bubbles</li>
          <li>• Rapidly pan across canvas</li>
          <li>• Drag bubbles with many visible</li>
          <li>• Toggle float motion during load</li>
          <li>• Multi-select with density changes</li>
          <li>• Check photo rendering performance</li>
        </ul>
      </div>
    </div>
  );
}