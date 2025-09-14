/**
 * Mobile Conflict Resolver
 * Mobile-optimized UI for resolving calendar sync conflicts
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Merge,
  ArrowRight 
} from 'lucide-react';
import { CalendarOfflineAction } from '@/services/calendarOfflineExtensions';
import { cn } from '@/lib/utils';

interface MobileConflictResolverProps {
  conflicts: CalendarOfflineAction[];
  onResolve: (actionId: string, resolution: 'local' | 'remote' | 'merge') => void;
  onDismiss: () => void;
  className?: string;
}

export function MobileConflictResolver({ 
  conflicts, 
  onResolve, 
  onDismiss, 
  className 
}: MobileConflictResolverProps) {
  if (conflicts.length === 0) return null;

  const formatDateTime = (dateTime: string) => {
    try {
      const date = new Date(dateTime);
      return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return { date: 'Invalid date', time: '' };
    }
  };

  const getConflictIcon = (type: string) => {
    switch (type) {
      case 'time_overlap':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'concurrent_move':
        return <ArrowRight className="h-4 w-4 text-warning" />;
      case 'deleted_task':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
  };

  const getConflictDescription = (conflict: CalendarOfflineAction) => {
    switch (conflict.conflictData?.conflictType) {
      case 'time_overlap':
        return 'This task was rescheduled at the same time as another user';
      case 'concurrent_move':
        return 'This task was moved while you were offline';
      case 'deleted_task':
        return 'This task was deleted by another user';
      default:
        return 'A conflict occurred while syncing';
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {conflicts.length} sync conflict{conflicts.length > 1 ? 's' : ''} need{conflicts.length === 1 ? 's' : ''} your attention
        </AlertDescription>
      </Alert>

      {conflicts.map((conflict) => {
        const { conflictData } = conflict;
        if (!conflictData) return null;

        const localDateTime = formatDateTime(conflictData.localAction.data.newDateTime || '');
        const remoteDateTime = formatDateTime(conflictData.remoteAction.data.newDateTime || '');

        return (
          <Card key={conflict.id} className="border-warning">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                {getConflictIcon(conflictData.conflictType)}
                Sync Conflict
                <Badge variant="outline" className="ml-auto">
                  {conflict.type.replace('_', ' ')}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {getConflictDescription(conflict)}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Conflict Details */}
              <div className="grid grid-cols-1 gap-3">
                {/* Your Version */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Your Version</Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    {localDateTime.date && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {localDateTime.date} at {localDateTime.time}
                      </div>
                    )}
                    {conflictData.localAction.data.pinboardPosition && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        Pinboard position: {conflictData.localAction.data.pinboardPosition.x}, {conflictData.localAction.data.pinboardPosition.y}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Server Version */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Server Version</Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    {remoteDateTime.date && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {remoteDateTime.date} at {remoteDateTime.time}
                      </div>
                    )}
                    {conflictData.remoteAction.data.pinboardPosition && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        Pinboard position: {conflictData.remoteAction.data.pinboardPosition.x}, {conflictData.remoteAction.data.pinboardPosition.y}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Resolution Buttons */}
              <div className="grid grid-cols-1 gap-2 pt-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onResolve(conflict.id, 'local')}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="h-3 w-3" />
                  Keep My Version
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onResolve(conflict.id, 'remote')}
                  className="flex items-center gap-2"
                >
                  <XCircle className="h-3 w-3" />
                  Use Server Version
                </Button>
                
                {conflictData.conflictType !== 'deleted_task' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onResolve(conflict.id, 'merge')}
                    className="flex items-center gap-2"
                  >
                    <Merge className="h-3 w-3" />
                    Try to Merge
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Dismiss All Button */}
      <div className="flex justify-center pt-2">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss All
        </Button>
      </div>
    </div>
  );
}