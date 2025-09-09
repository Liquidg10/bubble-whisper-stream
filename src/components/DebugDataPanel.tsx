import React from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { initializeSampleData, clearSampleData } from '@/db/seedData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CBTFeedbackPanel } from '@/components/CBTFeedbackPanel';

export function DebugDataPanel() {
  const { bubbles, initializeStore } = useBubbleStore();
  
  const photoBubbles = bubbles.filter(b => b.imageUri);
  const audioBubbles = bubbles.filter(b => b.audioUri);
  
  const handleLoadSampleData = async () => {
    await initializeSampleData();
    await initializeStore(); // Refresh the store
  };
  
  const handleClearSampleData = async () => {
    await clearSampleData();
    await initializeStore(); // Refresh the store
  };

  const handleCompleteCleanSlate = async () => {
    const { clearAllBubbles } = useBubbleStore.getState();
    await clearAllBubbles();
    await initializeStore(); // Refresh the store
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto m-4 space-y-4">
      {/* CBT Feedback Panel */}
      <CBTFeedbackPanel />
      
      {/* Original Debug Data Panel */}
      <Card>
        <CardHeader>
          <CardTitle>🔍 Debug Data Panel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Data Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{bubbles.length}</div>
            <div className="text-sm text-muted-foreground">Total Bubbles</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">{photoBubbles.length}</div>
            <div className="text-sm text-muted-foreground">Photo Bubbles</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-secondary">{audioBubbles.length}</div>
            <div className="text-sm text-muted-foreground">Audio Bubbles</div>
          </div>
        </div>
        
        {/* Photo Bubbles Details */}
        {photoBubbles.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">📸 Photo Bubbles:</h4>
            <div className="space-y-2">
              {photoBubbles.map(bubble => (
                <div key={bubble.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                  <Badge variant="outline">{bubble.type}</Badge>
                  <span className="text-sm">{bubble.content}</span>
                  <span className="text-xs text-muted-foreground">
                    {bubble.imageUri ? `Image: ${bubble.imageUri.substring(0, 30)}...` : 'No image'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleLoadSampleData} variant="default">
            🌟 Load Sample Data
          </Button>
          <Button onClick={handleClearSampleData} variant="outline">
            🗑️ Clear Sample Data
          </Button>
          <Button onClick={handleCompleteCleanSlate} variant="destructive">
            🧹 Complete Clean Slate
          </Button>
          <Button onClick={initializeStore} variant="secondary">
            🔄 Refresh Store
          </Button>
        </div>
        
        {/* Instructions */}
        <div className="text-sm text-muted-foreground p-3 bg-muted rounded">
          <p><strong>Instructions:</strong></p>
          <p>1. Click "Load Sample Data" to add sample bubbles with photos</p>
          <p>2. Check the photo bubble count above</p>
          <p>3. Look for photo bubbles in the canvas - they should show images now!</p>
        </div>
        </CardContent>
      </Card>
    </div>
  );
}