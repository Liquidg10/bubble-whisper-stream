import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Pause, RotateCcw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PrivacyZoneToggle } from '@/components/PrivacyZoneToggle';
import { ConnectorPrivacyMatrix } from './ConnectorPrivacyMatrix';
import { DataRedactionDialog } from './DataRedactionDialog';
import { MoveToDeepDialog } from './MoveToDeepDialog';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

export function PrivacyControlPanel() {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  const [pausedLayers, setPausedLayers] = useState<string[]>([]);

  const isPaused = (layer: string): boolean => {
    return pausedLayers.includes(layer);
  };

  const togglePause = async (layer: string, paused: boolean) => {
    if (paused) {
      setPausedLayers(prev => [...prev, layer]);
      toast({
        title: "Data collection paused",
        description: `${layer} layer data collection is now paused`,
        duration: 3000,
      });
    } else {
      setPausedLayers(prev => prev.filter(l => l !== layer));
      toast({
        title: "Data collection resumed",
        description: `${layer} layer data collection has resumed`,
        duration: 3000,
      });
    }
  };

  const [redactionDialogOpen, setRedactionDialogOpen] = useState(false);
  const [redactionLayer, setRedactionLayer] = useState<'surface' | 'context' | 'deep'>('surface');
  const [moveToDeepOpen, setMoveToDeepOpen] = useState(false);

  const openRedactionTool = (layer: 'surface' | 'context' | 'deep') => {
    setRedactionLayer(layer);
    setRedactionDialogOpen(true);
  };

  const openMoveToDeepDialog = () => {
    setMoveToDeepOpen(true);
  };

  const handleDataRedaction = async (layer: string) => {
    toast({
      title: "Data redacted",
      description: `Sensitive data has been removed from ${layer} layer`,
      duration: 3000,
    });
  };

  return (
    <div className="space-y-6">
      {/* Existing Privacy Zones */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">Privacy Zones</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Control what data layers are active for personalization
          </p>
        </div>
        
        <PrivacyZoneToggle
          layer="surface"
          title="Surface Layer"
          description="Basic preferences, theme settings, and UI customizations"
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        
        <PrivacyZoneToggle
          layer="context"
          title="Context Layer"
          description="Time patterns, routine detection, and adaptive reminders"
          icon={<ShieldCheck className="h-5 w-5" />}
          requiresBiometric={false}
        />
        
        <PrivacyZoneToggle
          layer="deep"
          title="Deep Layer"
          description="Emotional patterns, CBT insights, and personal triggers"
          icon={<ShieldCheck className="h-5 w-5" />}
          requiresBiometric={true}
        />
      </div>

      {/* Active Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Active Data Management</CardTitle>
          <CardDescription>
            Control your data in real-time with pause, redact, and move controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pause Controls */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Pause className="h-4 w-4" />
              Pause Data Collection
            </h4>
            <div className="space-y-3">
              {['surface', 'context', 'deep'].map((layer) => (
                <div key={layer} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm capitalize">{layer} layer</span>
                    {isPaused(layer) && (
                      <Badge variant="secondary" className="text-xs">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={!isPaused(layer)}
                    onCheckedChange={(enabled) => togglePause(layer, !enabled)}
                  />
                </div>
              ))}
            </div>
          </div>
          
          {/* Redaction Tools */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Data Redaction
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openRedactionTool('surface')}
              >
                Redact Surface Data
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openRedactionTool('context')}
              >
                Redact Context Data
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openRedactionTool('deep')}
              >
                Redact Deep Data
              </Button>
            </div>
          </div>
          
          {/* Move to Deep */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Enhance Protection
            </h4>
            <Button 
              variant="outline" 
              size="sm"
              onClick={openMoveToDeepDialog}
            >
              Move Sensitive Data to Deep Layer
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Connector Privacy Matrix */}
      <ConnectorPrivacyMatrix />

      {/* Privacy Notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium text-primary">
                Privacy & Transparency
              </h4>
              <div className="text-sm text-primary/80 space-y-1">
                <p>• All data processing remains 100% local to your device</p>
                <p>• Every adaptive action includes a "Because..." explanation</p>
                <p>• You can pause, redact, or enhance protection at any time</p>
                <p>• Granular controls let you choose what each connector can access</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Redaction Dialog */}
      <DataRedactionDialog
        open={redactionDialogOpen}
        onOpenChange={setRedactionDialogOpen}
        layer={redactionLayer}
      />

      {/* Move to Deep Dialog */}
      <MoveToDeepDialog
        open={moveToDeepOpen}
        onOpenChange={setMoveToDeepOpen}
      />
    </div>
  );
}
