import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ZoomIn, ZoomOut, RotateCcw, Clock, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBubbleStore } from '@/stores/bubbleStore';
import { usePinchZoom } from '@/hooks/usePinchZoom';

interface TemporalNavigationProps {
  onTimeRangeChange?: (range: { start: Date; end: Date }) => void;
  onZoomChange?: (level: number) => void;
  className?: string;
  isVisible?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onClose?: () => void;
}

type TimeScale = 'day' | 'week' | 'month' | 'year';

interface TimePoint {
  date: Date;
  bubbleCount: number;
  moodAverage: number;
  activities: string[];
}

const TemporalNavigation: React.FC<TemporalNavigationProps> = ({
  onTimeRangeChange,
  onZoomChange,
  className = '',
  isVisible = true,
  isMinimized = false,
  onToggleMinimize,
  onClose
}) => {
  const { bubbles, cbtEntries, glimmers } = useBubbleStore();
  const [currentScale, setCurrentScale] = useState<TimeScale>('week');
  const [centerDate, setCenterDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; date: Date } | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);

  // Pinch zoom support for mobile
  const { onTouchStart, onTouchMove, onTouchEnd } = usePinchZoom({
    minScale: 0.5,
    maxScale: 3,
    onZoom: (newScale) => setZoomLevel(newScale),
    onPan: () => {} // No-op for now
  });

  // Generate time points for visualization
  const generateTimePoints = (): TimePoint[] => {
    const points: TimePoint[] = [];
    const range = getTimeRange();
    const interval = getTimeInterval();
    
    for (let date = new Date(range.start); date <= range.end; date = new Date(date.getTime() + interval)) {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayBubbles = bubbles.filter(b => {
        const bubbleDate = new Date(b.createdAt);
        return bubbleDate >= dayStart && bubbleDate < dayEnd;
      });
      
      const dayCBT = cbtEntries.filter(c => {
        const cbtDate = new Date(c.createdAt);
        return cbtDate >= dayStart && cbtDate < dayEnd;
      });
      
      const dayGlimmers = glimmers.filter(g => {
        const glimmerDate = new Date(g.createdAt);
        return glimmerDate >= dayStart && glimmerDate < dayEnd;
      });
      
      // Calculate mood average from bubbles with mood data
      const moodBubbles = dayBubbles.filter(b => b.mood);
      const moodAverage = moodBubbles.length > 0 
        ? moodBubbles.reduce((sum, b) => sum + getMoodValue(b.mood), 0) / moodBubbles.length
        : 0;
      
      const activities = [
        ...dayBubbles.map(b => b.type),
        ...dayCBT.map(() => 'CBT'),
        ...dayGlimmers.map(() => 'Glimmer')
      ];
      
      points.push({
        date: new Date(date),
        bubbleCount: dayBubbles.length,
        moodAverage,
        activities: [...new Set(activities)]
      });
    }
    
    return points;
  };

  const getTimeRange = () => {
    const center = centerDate;
    let start: Date, end: Date;
    
    switch (currentScale) {
      case 'day':
        start = new Date(center);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        break;
      case 'week':
        start = new Date(center);
        start.setDate(start.getDate() - 3);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 7);
        break;
      case 'month':
        start = new Date(center.getFullYear(), center.getMonth() - 1, 1);
        end = new Date(center.getFullYear(), center.getMonth() + 2, 0);
        break;
      case 'year':
        start = new Date(center.getFullYear() - 1, 0, 1);
        end = new Date(center.getFullYear() + 2, 0, 0);
        break;
    }
    
    return { start, end };
  };

  const getTimeInterval = () => {
    switch (currentScale) {
      case 'day': return 60 * 60 * 1000; // 1 hour
      case 'week': return 24 * 60 * 60 * 1000; // 1 day
      case 'month': return 24 * 60 * 60 * 1000; // 1 day
      case 'year': return 7 * 24 * 60 * 60 * 1000; // 1 week
    }
  };

  const getMoodValue = (mood?: string): number => {
    const moodMap: Record<string, number> = {
      'terrible': 1, 'bad': 2, 'okay': 3, 'good': 4, 'great': 5,
      'sad': 2, 'neutral': 3, 'happy': 4, 'excited': 5
    };
    return moodMap[mood || 'neutral'] || 3;
  };

  const getMoodColor = (value: number): string => {
    if (value <= 2) return 'hsl(var(--destructive))';
    if (value <= 3) return 'hsl(var(--warning))';
    if (value <= 4) return 'hsl(var(--primary))';
    return 'hsl(var(--success))';
  };

  // Handle timeline interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, date: new Date(centerDate) });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return;
    
    const deltaX = e.clientX - dragStart.x;
    const timelinePxPerDay = timelineRef.current ? timelineRef.current.clientWidth / 7 : 50;
    const daysDelta = -deltaX / timelinePxPerDay;
    
    const newDate = new Date(dragStart.date);
    newDate.setDate(newDate.getDate() + daysDelta);
    setCenterDate(newDate);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Zoom controls
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel * 1.2, 3);
    setZoomLevel(newZoom);
    onZoomChange?.(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel / 1.2, 0.5);
    setZoomLevel(newZoom);
    onZoomChange?.(newZoom);
  };

  const handleScaleChange = (newScale: TimeScale) => {
    setCurrentScale(newScale);
    setZoomLevel(1); // Reset zoom when changing scale
  };

  const handleToday = () => {
    setCenterDate(new Date());
    setZoomLevel(1);
  };

  // Generate visualization data
  const timePoints = generateTimePoints();
  const hasData = bubbles.length > 0 || cbtEntries.length > 0 || glimmers.length > 0;

  useEffect(() => {
    const range = getTimeRange();
    onTimeRangeChange?.(range);
  }, [centerDate, currentScale, onTimeRangeChange]);

  if (!isVisible) return null;

  if (isMinimized) {
    return (
      <Card 
        className={`${className} cursor-pointer hover:bg-muted/50 transition-colors`}
        onClick={onToggleMinimize}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Timeline</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {currentScale}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Temporal Navigation
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              <RotateCcw className="w-4 h-4" />
              Today
            </Button>
            
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {onToggleMinimize && (
                <Button variant="ghost" size="sm" onClick={onToggleMinimize}>
                  <span className="text-xs">−</span>
                </Button>
              )}
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <span className="text-xs">×</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={currentScale} onValueChange={(value) => handleScaleChange(value as TimeScale)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 space-y-4">
            {/* Current date display */}
            <div className="text-center">
              <h3 className="text-lg font-semibold">
                {centerDate.toLocaleDateString('en-US', { 
                  weekday: 'long',
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              <Badge variant="outline" className="mt-1">
                Zoom: {(zoomLevel * 100).toFixed(0)}%
              </Badge>
            </div>
            
            {/* Timeline visualization */}
            <div 
              ref={timelineRef}
              className="relative h-32 border rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {hasData ? (
                <>
                  {/* Activity density bars */}
                  <div className="absolute inset-0 flex items-end">
                    {timePoints.map((point, index) => (
                      <div
                        key={index}
                        className="flex-1 mx-0.5 rounded-t opacity-60 hover:opacity-100 transition-opacity"
                        style={{
                          height: `${Math.max(4, (point.bubbleCount / 10) * 100)}%`,
                          backgroundColor: 'hsl(var(--primary))'
                        }}
                        title={`${point.date.toLocaleDateString()}: ${point.bubbleCount} activities`}
                      />
                    ))}
                  </div>
                  
                  {/* Mood heatmap overlay */}
                  <div className="absolute inset-0 flex items-end">
                    {timePoints.map((point, index) => (
                      <div
                        key={`mood-${index}`}
                        className="flex-1 mx-0.5 rounded-t opacity-40"
                        style={{
                          height: '8px',
                          marginBottom: `${Math.max(4, (point.bubbleCount / 10) * 100)}%`,
                          backgroundColor: getMoodColor(point.moodAverage)
                        }}
                        title={`Mood: ${point.moodAverage.toFixed(1)}/5`}
                      />
                    ))}
                  </div>
                  
                  {/* Current date indicator */}
                  <div className="absolute inset-0 flex justify-center">
                    <div className="w-0.5 h-full bg-accent-foreground opacity-50" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/20 rounded">
                  <div className="text-center text-muted-foreground">
                    <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Empty timeline</p>
                    <p className="text-xs opacity-60">Your activity will appear here</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Time range slider */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Navigate Timeline</label>
              <Slider
                value={[timePoints.findIndex(p => 
                  Math.abs(p.date.getTime() - centerDate.getTime()) < 24 * 60 * 60 * 1000
                )]}
                onValueChange={([value]) => {
                  if (timePoints[value]) {
                    setCenterDate(new Date(timePoints[value].date));
                  }
                }}
                max={timePoints.length - 1}
                step={1}
                className="w-full"
              />
            </div>
            
            {/* Statistics for current view */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              {hasData ? (
                <>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {timePoints.reduce((sum, p) => sum + p.bubbleCount, 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Activities</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ 
                      color: getMoodColor(
                        timePoints.reduce((sum, p) => sum + p.moodAverage, 0) / Math.max(timePoints.length, 1)
                      )
                    }}>
                      {(timePoints.reduce((sum, p) => sum + p.moodAverage, 0) / Math.max(timePoints.length, 1)).toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg Mood</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-secondary-foreground">
                      {new Set(timePoints.flatMap(p => p.activities)).size}
                    </div>
                    <div className="text-xs text-muted-foreground">Activity Types</div>
                  </div>
                </>
              ) : (
                <div className="col-span-3 text-center py-8">
                  <div className="text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No activity data yet</p>
                    <p className="text-xs opacity-60">Create some bubbles to see your timeline!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TemporalNavigation;