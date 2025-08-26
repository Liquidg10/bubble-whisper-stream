import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Eye, EyeOff, Camera } from 'lucide-react';

export function PhotoDebugPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const { bubbles } = useBubbleStore();
  
  const photoBubbles = bubbles.filter(bubble => bubble.imageUri);

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50"
      >
        <Camera className="w-4 h-4 mr-2" />
        Photo Debug
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-96 max-h-96 overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          Photo Debug Panel ({photoBubbles.length} photos)
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
          >
            <EyeOff className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {photoBubbles.map((bubble) => (
          <div key={bubble.id} className="p-2 border rounded text-xs">
            <div className="font-mono text-xs text-muted-foreground">
              ID: {bubble.id.substring(0, 8)}...
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-1 py-0.5 rounded text-xs ${
                bubble.imageUri?.startsWith('data:') 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {bubble.imageUri?.startsWith('data:') ? 'data:' : 'http:'}
              </span>
              <span className="text-xs">
                {bubble.imageUri?.substring(0, 30)}...
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Type: {bubble.type} | Size: {bubble.size} | 
              Completed: {bubble.completed ? '✓' : '✗'}
            </div>
          </div>
        ))}
        {photoBubbles.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-4">
            No photo bubbles found
          </div>
        )}
      </CardContent>
    </Card>
  );
}