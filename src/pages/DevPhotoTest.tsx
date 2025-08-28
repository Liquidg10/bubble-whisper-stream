// Dev route for testing photo rendering in all scenarios
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { BulletproofPhotoRenderer } from '@/components/BulletproofPhotoRenderer';

// Test cases for all photo scenarios
const testCases = [
  {
    id: 'data-url-task',
    name: 'Data URL - Task',
    src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzMxOGNmZiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VEFTSzwvdGV4dD48L3N2Zz4=',
    type: 'Task',
    completed: false
  },
  {
    id: 'data-url-thought-completed',
    name: 'Data URL - Thought (Completed)',
    src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzEwYjk4MSIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+VEhPVUdIVDwvdGV4dD48L3N2Zz4=',
    type: 'Thought',
    completed: true
  },
  {
    id: 'supabase-memory',
    name: 'Supabase URL - Memory',
    src: 'https://ekekeywoxvdbfbmqyhjy.supabase.co/storage/v1/object/public/photos/sample-memory.jpg',
    type: 'Memory',
    completed: false
  },
  {
    id: 'supabase-mood-completed',
    name: 'Supabase URL - Mood (Completed)',
    src: 'https://ekekeywoxvdbfbmqyhjy.supabase.co/storage/v1/object/public/photos/sample-mood.jpg',
    type: 'Mood',
    completed: true
  },
  {
    id: 'external-reminder',
    name: 'External URL - ReminderNote',
    src: 'https://picsum.photos/100/100?random=1',
    type: 'ReminderNote',
    completed: false
  },
  {
    id: 'broken-src',
    name: 'Broken URL - Test Error Handling',
    src: 'https://example.com/nonexistent-image.jpg',
    type: 'Task',
    completed: false
  }
];

export default function DevPhotoTest() {
  const navigate = useNavigate();
  const [debugMode, setDebugMode] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadStatuses, setLoadStatuses] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});

  // Track load statuses for summary
  useEffect(() => {
    const DEBUG = localStorage.getItem('DEBUG') === 'true';
    if (!DEBUG || !debugMode) return;

    const timer = setTimeout(() => {
      const summary = testCases.map(testCase => ({
        name: testCase.name,
        status: loadStatuses[testCase.id] || 'loading',
        urlType: testCase.src.startsWith('data:') ? 'data:' : 
                testCase.src.includes('supabase.co') ? 'supabase' : 'external'
      }));

      console.group('📸 Photo Test Summary');
      console.table(summary);
      console.log('Total cases:', testCases.length);
      console.log('Loaded:', summary.filter(s => s.status === 'loaded').length);
      console.log('Failed:', summary.filter(s => s.status === 'error').length);
      console.log('Loading:', summary.filter(s => s.status === 'loading').length);
      console.groupEnd();
    }, 3000); // Wait 3 seconds for images to load

    return () => clearTimeout(timer);
  }, [loadStatuses, debugMode, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
    setLoadStatuses({});
  };

  const toggleDebug = () => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    localStorage.setItem('DEBUG', newDebugMode.toString());
  };

  return (
    <div className="min-h-screen bg-gradient-canvas p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/')}
              className="bg-card/80 backdrop-blur-sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Photo Rendering Test</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="debug-toggle" className="text-sm font-medium">
                Debug Mode
              </label>
              <Switch
                id="debug-toggle"
                checked={debugMode}
                onCheckedChange={toggleDebug}
              />
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="bg-card/80 backdrop-blur-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Test Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Test Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">2</div>
                <div className="text-xs text-muted-foreground">Data URLs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">2</div>
                <div className="text-xs text-muted-foreground">Supabase URLs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-500">1</div>
                <div className="text-xs text-muted-foreground">External URLs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">1</div>
                <div className="text-xs text-muted-foreground">Broken URLs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-500">3</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-500">5</div>
                <div className="text-xs text-muted-foreground">Bubble Types</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Cases Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testCases.map((testCase) => (
            <Card key={`${testCase.id}-${refreshKey}`} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{testCase.name}</CardTitle>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">
                      {testCase.type}
                    </Badge>
                    {testCase.completed && (
                      <Badge variant="secondary" className="text-xs">
                        Completed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Photo Renderer Test */}
                <div className="flex justify-center mb-4">
                  <div className="relative" style={{ width: 120, height: 120 }}>
                    <BulletproofPhotoRenderer
                      src={testCase.src}
                      size={120}
                      bubbleType={testCase.type}
                      completed={testCase.completed}
                      bubbleId={testCase.id}
                      debugMode={debugMode}
                    />
                  </div>
                </div>
                
                {/* URL Info */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div><strong>URL Type:</strong> {
                    testCase.src.startsWith('data:') ? 'Data URL' :
                    testCase.src.includes('supabase.co') ? 'Supabase' :
                    'External'
                  }</div>
                  <div className="break-all">
                    <strong>Source:</strong> {testCase.src.substring(0, 40)}...
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Instructions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Expected Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>✅ All photos should be visible and crisp</div>
            <div>✅ Type-colored rims should be clearly visible around each photo</div>
            <div>✅ Completed photos should have dimmed overlays (not affecting the photo itself)</div>
            <div>✅ Broken URLs should show error state but maintain proper layering</div>
            <div>✅ No backdrop-filter effects on photo containers</div>
            <div>✅ Console should show debug info when Debug Mode is enabled</div>
            <div className="text-muted-foreground mt-4">
              To see console logs, enable Debug Mode and check the browser console after refresh.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}