import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Clock, Smartphone, Monitor } from 'lucide-react';

interface ConflictData {
  id: string;
  entityType: string;
  entityId: string;
  localData: any;
  remoteData: any;
  localTimestamp: string;
  remoteTimestamp: string;
}

interface ConflictResolutionDialogProps {
  conflict: ConflictData | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (conflictId: string, resolution: 'keep-local' | 'keep-remote' | 'merge', mergedData?: any) => void;
}

export function ConflictResolutionDialog({ 
  conflict, 
  isOpen, 
  onClose, 
  onResolve 
}: ConflictResolutionDialogProps) {
  if (!conflict) return null;

  const handleResolve = (resolution: 'keep-local' | 'keep-remote' | 'merge') => {
    onResolve(conflict.id, resolution);
    onClose();
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sync Conflict Resolution
            <Badge variant="destructive">Requires Attention</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground">
              <strong>Entity:</strong> {conflict.entityType} ({conflict.entityId})
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local Version */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Smartphone className="h-4 w-4" />
                  Local Version (This Device)
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(conflict.localTimestamp)}
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                  {JSON.stringify(conflict.localData, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Remote Version */}
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                  <Monitor className="h-4 w-4" />
                  Remote Version (Other Device)
                </CardTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(conflict.remoteTimestamp)}
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
                  {JSON.stringify(conflict.remoteData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>

          {/* Resolution Options */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">How would you like to resolve this conflict?</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-start space-y-2 border-blue-200 hover:border-blue-300"
                onClick={() => handleResolve('keep-local')}
              >
                <div className="font-semibold text-blue-700 dark:text-blue-300">Keep Local</div>
                <div className="text-xs text-muted-foreground text-left">
                  Use the version from this device and discard the remote changes.
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-start space-y-2 border-orange-200 hover:border-orange-300"
                onClick={() => handleResolve('keep-remote')}
              >
                <div className="font-semibold text-orange-700 dark:text-orange-300">Keep Remote</div>
                <div className="text-xs text-muted-foreground text-left">
                  Use the version from the other device and discard local changes.
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-start space-y-2 border-green-200 hover:border-green-300"
                onClick={() => handleResolve('merge')}
              >
                <div className="font-semibold text-green-700 dark:text-green-300">Auto Merge</div>
                <div className="text-xs text-muted-foreground text-left">
                  Automatically combine both versions where possible.
                </div>
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}