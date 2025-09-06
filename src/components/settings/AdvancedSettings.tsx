import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Code,
  HelpCircle,
  Info,
  Lock
} from 'lucide-react';
import { DebugDataPanel } from '@/components/DebugDataPanel';
import { TTSDebugConsole } from '@/components/TTSDebugConsole';
import { QuickTour } from '@/components/QuickTour';
import { Badge } from '@/components/ui/badge';

export const AdvancedSettings: React.FC = () => {
  const [showQuickTour, setShowQuickTour] = useState(false);

  return (
    <div className="space-y-6">
      {/* Debug Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Debug Tools
          </CardTitle>
          <CardDescription>
            Development and debugging utilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DebugDataPanel />
        </CardContent>
      </Card>

      {/* TTS Debug Console */}
      <Card>
        <CardHeader>
          <CardTitle>TTS Debug Console</CardTitle>
          <CardDescription>
            Test and debug text-to-speech functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TTSDebugConsole />
        </CardContent>
      </Card>

      {/* Help & Support */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help & Support
          </CardTitle>
          <CardDescription>
            Learn about features and get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setShowQuickTour(true)}
            className="w-full"
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Take Feature Tour
          </Button>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            About Bubble Universe
          </CardTitle>
          <CardDescription>
            Your personal cognitive companion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm space-y-1">
            <p>Version: 1.0.0 (MVP)</p>
            <p>Privacy-first, local-only storage</p>
            <p>No analytics, no tracking</p>
          </div>
          <Badge variant="secondary" className="w-fit">
            <Lock className="h-3 w-3 mr-1" />
            100% Local
          </Badge>
        </CardContent>
      </Card>

      {/* Quick Tour Modal */}
      {showQuickTour && (
        <QuickTour 
          isOpen={showQuickTour} 
          onClose={() => setShowQuickTour(false)} 
        />
      )}
    </div>
  );
};