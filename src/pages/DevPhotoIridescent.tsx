import React, { useEffect } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import IridescentCanvas from '@/experimental/iridescent/BubbleRenderer';
import { useTheme } from '@/hooks/use-theme';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PhotoDebugToggle } from '@/components/PhotoDebugToggle';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function DevPhotoIridescent() {
  const { currentTheme } = useTheme();
  const { addBubble, bubbles } = useBubbleStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Clear existing bubbles and create test bubbles
    // Use a simple approach to replace all bubbles with test cases
    
    const testBubbles = [
      {
        id: 'data-legacy-incomplete',
        content: 'Data URL Legacy',
        type: 'Memory' as const,
        x: -100,
        y: -80,
        size: 1.2,
        completed: false,
        imageUri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwNzBmMyIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5EYXRhIFVSTDwvdGV4dD48L3N2Zz4=',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'data-legacy-complete',
        content: 'Data URL Complete',
        type: 'Memory' as const,
        x: 100,
        y: -80,
        size: 1.2,
        completed: true,
        imageUri: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzEwYjk4MSIvPjx0ZXh0IHg9IjUwIiB5PSI0NSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Db21wbGV0ZWQ8L3RleHQ+PHRleHQgeD0iNTAiIHk9IjY1IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkRhdGEgVVJMPC90ZXh0Pjwvc3ZnPg==',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'http-supabase-incomplete',
        content: 'HTTP Supabase',
        type: 'Thought' as const,
        x: -100,
        y: 30,
        size: 1.2,
        completed: false,
        imageUri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'http-supabase-complete',
        content: 'HTTP Complete',
        type: 'Thought' as const,
        x: 100,
        y: 30,
        size: 1.2,
        completed: true,
        imageUri: 'https://images.unsplash.com/photo-1494790108755-2616b612b605?w=100&h=100&fit=crop',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'large-image',
        content: 'Large Image Edge Case',
        type: 'Task' as const,
        x: -100,
        y: 140,
        size: 2.0,
        completed: false,
        imageUri: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=200&h=200&fit=crop',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'broken-url',
        content: 'Broken URL',
        type: 'Mood' as const,
        x: 100,
        y: 140,
        size: 1.2,
        completed: false,
        imageUri: 'https://invalid-domain-should-fail.com/nonexistent.jpg',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    testBubbles.forEach(bubble => addBubble(bubble));
  }, [addBubble]);

  const logNetworkResults = () => {
    console.group('🌐 Network Results Summary');
    console.log('Check DevTools Network tab for:');
    console.log('- HTTP status codes (200 OK expected)');
    console.log('- Content-Type: image/* headers');
    console.log('- CORS errors (should use crossOrigin="anonymous")');
    console.log('- 401/403 auth issues (buckets should be public)');
    console.groupEnd();
  };

  return (
    <div className="h-screen w-full bg-universe relative">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
        <Card className="bg-card/90 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/')}
                className="p-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              Photo Iridescent Test Page
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={logNetworkResults}
          className="bg-card/90 backdrop-blur-sm"
        >
          Log Network Summary
        </Button>
      </div>

      {/* Test Cases Legend */}
      <div className="absolute top-20 left-4 z-40">
        <Card className="bg-card/90 backdrop-blur-sm w-80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Test Cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-purple-100 text-purple-800">Data</Badge>
              <span>Legacy data: URIs (should load immediately)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-100 text-blue-800">HTTP</Badge>
              <span>Supabase public URLs (check CORS)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-100 text-green-800">Large</Badge>
              <span>Sizing edge case (200px image)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-red-100 text-red-800">Broken</Badge>
              <span>Invalid URL (should show error state)</span>
            </div>
            <div className="text-muted-foreground mt-2">
              Half are marked "completed" to test dimming behavior.
              <br />
              Photos should NOT be dimmed when completed.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Canvas */}
      <IridescentCanvas theme={currentTheme} />
      
      {/* Debug Toggle */}
      <PhotoDebugToggle />
    </div>
  );
}