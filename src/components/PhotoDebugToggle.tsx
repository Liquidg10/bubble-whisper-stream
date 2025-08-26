import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Camera, Settings } from 'lucide-react';

export function PhotoDebugToggle() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    const debugEnabled = localStorage.getItem('DEBUG_PHOTO') === 'true';
    setIsEnabled(debugEnabled);
  }, []);

  const toggleDebug = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    localStorage.setItem('DEBUG_PHOTO', newState.toString());
    
    if (newState) {
      console.log('🖼️ Photo Debug Mode ENABLED - reload page to see debug logs');
    } else {
      console.log('🖼️ Photo Debug Mode DISABLED');
    }
  };

  if (!showPanel) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowPanel(true)}
        className="fixed bottom-16 right-4 z-50"
      >
        <Settings className="w-4 h-4 mr-2" />
        Photo Debug
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-16 right-4 z-50 w-80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          Photo Debug Controls
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPanel(false)}
          >
            ✕
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Debug Logging</span>
          <Button
            variant={isEnabled ? "default" : "outline"}
            size="sm"
            onClick={toggleDebug}
          >
            {isEnabled ? 'ON' : 'OFF'}
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground">
          {isEnabled ? (
            <>
              ✅ Debug mode enabled
              <br />
              Check console for photo loading logs
            </>
          ) : (
            'Enable to see detailed photo loading logs in console'
          )}
        </div>
        
        <div className="text-xs text-muted-foreground border-t pt-2">
          <strong>To use:</strong>
          <br />
          1. Enable debug logging
          <br />
          2. Reload the page
          <br />
          3. Switch to Iridescent theme
          <br />
          4. Check console for photo logs
        </div>
      </CardContent>
    </Card>
  );
}