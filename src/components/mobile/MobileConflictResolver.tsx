/**
 * Phase 1: Mobile Conflict Resolver Component
 * Touch-optimized UI for resolving offline sync conflicts
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  ArrowRight, 
  Merge, 
  Clock, 
  User, 
  Cloud,
  Smartphone,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { offlineTaskQueue, OfflineTask } from '@/services/offlineTaskQueue';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { mobilePerformanceManager } from '@/services/mobilePerformanceManager';

interface MobileConflictResolverProps {
  onResolved?: () => void;
  onClose?: () => void;
}

export const MobileConflictResolver: React.FC<MobileConflictResolverProps> = ({
  onResolved,
  onClose
}) => {
  const [conflicts, setConflicts] = useState<OfflineTask[]>([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedCount, setResolvedCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = async () => {
    try {
      const conflictTasks = await offlineTaskQueue.getConflicts();
      setConflicts(conflictTasks);
    } catch (error) {
      console.error('Failed to load conflicts:', error);
      toast({
        title: "Error loading conflicts",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleResolveConflict = async (resolution: 'local' | 'remote' | 'merge') => {
    if (currentConflictIndex >= conflicts.length) return;

    const conflict = conflicts[currentConflictIndex];
    setIsResolving(true);

    // Trigger haptic feedback
    mobilePerformanceManager.triggerHapticFeedback('light');

    try {
      await offlineTaskQueue.resolveConflict(conflict.id, resolution);
      
      setResolvedCount(prev => prev + 1);
      
      toast({
        title: "Conflict resolved",
        description: `Used ${resolution} version`,
      });

      // Move to next conflict
      if (currentConflictIndex < conflicts.length - 1) {
        setCurrentConflictIndex(prev => prev + 1);
      } else {
        // All conflicts resolved
        toast({
          title: "All conflicts resolved",
          description: `Resolved ${conflicts.length} conflicts`,
        });
        onResolved?.();
      }
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      toast({
        title: "Resolution failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsResolving(false);
    }
  };

  if (conflicts.length === 0) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
          <CardTitle>No Conflicts</CardTitle>
          <CardDescription>
            All your tasks are synchronized
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currentConflict = conflicts[currentConflictIndex];
  const progress = ((currentConflictIndex + resolvedCount) / conflicts.length) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Resolve Conflicts</CardTitle>
              <CardDescription>
                {conflicts.length - resolvedCount} conflicts remaining
              </CardDescription>
            </div>
            <Badge variant="outline">
              {currentConflictIndex + 1} of {conflicts.length}
            </Badge>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-secondary rounded-full h-2 mt-3">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Current Conflict */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentConflictIndex}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <div>
                  <CardTitle className="text-base">
                    {currentConflict.conflictData?.conflictType === 'concurrent_edit' ? 'Concurrent Edit' :
                     currentConflict.conflictData?.conflictType === 'delete_edit' ? 'Delete Conflict' :
                     'Duplicate Task'}
                  </CardTitle>
                  <CardDescription>
                    Task was modified in multiple places
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Local Version */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="h-4 w-4 text-primary" />
                  Your Device (Local)
                </div>
                <Card className="bg-muted/50">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium mb-1">
                      {currentConflict.conflictData?.localVersion.content}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(currentConflict.conflictData?.localVersion.updatedAt || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Remote Version */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud className="h-4 w-4 text-blue-500" />
                  Server (Remote)
                </div>
                <Card className="bg-muted/50">
                  <CardContent className="p-3">
                    <p className="text-sm font-medium mb-1">
                      {currentConflict.conflictData?.remoteVersion.content}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(currentConflict.conflictData?.remoteVersion.updatedAt || 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Resolution Buttons */}
              <div className="grid grid-cols-1 gap-3 pt-4">
                <Button
                  onClick={() => handleResolveConflict('local')}
                  disabled={isResolving}
                  variant="outline"
                  className="w-full h-12 text-left justify-start"
                >
                  <Smartphone className="h-4 w-4 mr-2 text-primary" />
                  <div>
                    <div className="font-medium">Keep My Version</div>
                    <div className="text-xs text-muted-foreground">Use local device version</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleResolveConflict('remote')}
                  disabled={isResolving}
                  variant="outline"
                  className="w-full h-12 text-left justify-start"
                >
                  <Cloud className="h-4 w-4 mr-2 text-blue-500" />
                  <div>
                    <div className="font-medium">Keep Server Version</div>
                    <div className="text-xs text-muted-foreground">Use remote server version</div>
                  </div>
                </Button>

                <Button
                  onClick={() => handleResolveConflict('merge')}
                  disabled={isResolving}
                  variant="default"
                  className="w-full h-12 text-left justify-start"
                >
                  <Merge className="h-4 w-4 mr-2" />
                  <div>
                    <div className="font-medium">Merge Both</div>
                    <div className="text-xs text-muted-foreground">Combine both versions</div>
                  </div>
                </Button>
              </div>

              {/* Preview of merged content */}
              {currentConflict.conflictData && (
                <Alert>
                  <Merge className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-1">Merge Preview:</div>
                    <div className="text-sm text-muted-foreground">
                      {currentConflict.conflictData.localVersion.content} | {currentConflict.conflictData.remoteVersion.content}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentConflictIndex(Math.max(0, currentConflictIndex - 1))}
              disabled={currentConflictIndex === 0 || isResolving}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <div className="text-sm text-muted-foreground">
              {resolvedCount} resolved
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentConflictIndex(Math.min(conflicts.length - 1, currentConflictIndex + 1))}
              disabled={currentConflictIndex === conflicts.length - 1 || isResolving}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Close Button */}
      {onClose && (
        <Button 
          variant="outline" 
          onClick={onClose}
          className="w-full"
        >
          Close Resolver
        </Button>
      )}
    </div>
  );
};