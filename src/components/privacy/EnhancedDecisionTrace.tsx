import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Undo2, Clock, Brain, AlertTriangle } from 'lucide-react';
import { decisionTraceService, type DecisionTrace } from '@/services/decisionTraceService';
import { PrivacyWatermark } from './PrivacyWatermark';
import { useToast } from '@/hooks/use-toast';

export const EnhancedDecisionTrace: React.FC = () => {
  const [traces, setTraces] = useState<DecisionTrace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<DecisionTrace | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const updateTraces = () => {
      setTraces(decisionTraceService.getRecentUndoable(20));
    };

    updateTraces();
    const unsubscribe = decisionTraceService.subscribe(updateTraces);
    return unsubscribe;
  }, []);

  const handleUndo = async (trace: DecisionTrace) => {
    if (!trace.undoable || trace.undoId) return;

    try {
      // Generate undo ID and mark as undone
      const undoId = crypto.randomUUID();
      decisionTraceService.markAsUndone(trace.id, undoId);

      // Add new trace for the undo action
      decisionTraceService.addTrace({
        feature: trace.feature,
        signals: [{
          type: 'undo',
          value: trace.id,
          confidence: 1.0,
          source: 'user',
          privacyLayer: 'surface'
        }],
        confidenceThreshold: 1.0,
        finalConfidence: 1.0,
        decision: 'rollback',
        action: `Undid: ${trace.action}`,
        becauseText: `User reversed previous action`,
        privacyWatermark: 'surface',
        castMember: 'System',
        metadata: { originalTraceId: trace.id },
        undoable: false
      });

      toast({
        title: "Action undone",
        description: `Reversed: ${trace.action}`,
      });
    } catch (error) {
      toast({
        title: "Undo failed",
        description: "Could not reverse the action",
        variant: "destructive"
      });
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'behavioral':
        return Brain;
      case 'mood':
        return '🎭';
      case 'contemplative':
        return '🧘';
      default:
        return AlertTriangle;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent AI Decisions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {traces.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No recent AI decisions to show
              </p>
            ) : (
              traces.map((trace) => {
                const iconValue = getFeatureIcon(trace.feature);
                const Icon = typeof iconValue === 'string' 
                  ? () => <span>{iconValue}</span>
                  : iconValue as React.ComponentType<any>;

                return (
                  <div
                    key={trace.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedTrace(selectedTrace?.id === trace.id ? null : trace)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <Badge variant="outline" className="text-xs">
                          {trace.feature}
                        </Badge>
                        <Badge variant={trace.decision === 'auto-write' ? 'default' : 'secondary'} className="text-xs">
                          {trace.decision}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(trace.timestamp)}
                        </span>
                        {trace.undoable && !trace.undoId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUndo(trace);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm mb-2">{trace.action}</p>
                    
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{trace.becauseText}</p>
                      <PrivacyWatermark
                        layer={trace.privacyWatermark}
                        castMember={trace.castMember}
                        className="ml-2"
                      />
                    </div>

                    {selectedTrace?.id === trace.id && (
                      <>
                        <Separator className="my-3" />
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-medium">Confidence:</span> {Math.round(trace.finalConfidence * 100)}%
                          </div>
                          <div>
                            <span className="font-medium">Signals ({trace.signals.length}):</span>
                            <div className="mt-1 space-y-1">
                              {trace.signals.map((signal, index) => (
                                <div key={index} className="flex justify-between text-muted-foreground">
                                  <span>{signal.type}</span>
                                  <span>{Math.round(signal.confidence * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {trace.metadata && Object.keys(trace.metadata).length > 0 && (
                            <div>
                              <span className="font-medium">Metadata:</span>
                              <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
                                {JSON.stringify(trace.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};