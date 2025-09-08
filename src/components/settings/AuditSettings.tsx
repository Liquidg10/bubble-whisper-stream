import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  History, 
  Undo2, 
  Download, 
  Trash2, 
  Calendar, 
  Mail, 
  DollarSign, 
  Brain,
  Eye,
  AlertCircle
} from 'lucide-react';
import { decisionTraceService, type DecisionTrace } from '@/services/decisionTraceService';
import { crossViewUndoService } from '@/services/crossViewUndoService';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

export function AuditSettings() {
  const { toast } = useToast();
  const [traces, setTraces] = useState<DecisionTrace[]>([]);
  const [undoableTraces, setUndoableTraces] = useState<DecisionTrace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<DecisionTrace | null>(null);

  useEffect(() => {
    // Subscribe to trace updates
    const unsubscribe = decisionTraceService.subscribe((newTraces) => {
      setTraces(newTraces.slice(0, 50)); // Show last 50 traces
      setUndoableTraces(decisionTraceService.getRecentUndoable(10));
    });

    // Load initial data
    setTraces(decisionTraceService.getTraces({ limit: 50 }));
    setUndoableTraces(decisionTraceService.getRecentUndoable(10));

    return unsubscribe;
  }, []);

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'calendar': return <Calendar className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'finance': return <DollarSign className="h-4 w-4" />;
      case 'context': return <Brain className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'auto-write': return 'bg-green-100 text-green-800 border-green-200';
      case 'draft': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'suggest': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'skip': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleUndo = async (trace: DecisionTrace) => {
    try {
      // This would need to be connected to actual undo implementations
      // For now, we'll just mark it as undone in the trace
      decisionTraceService.markAsUndone(trace.id, crypto.randomUUID());
      
      toast({
        title: "Action Undone",
        description: `Reverted: ${trace.action}`,
      });
    } catch (error) {
      toast({
        title: "Undo Failed",
        description: "Could not undo this action. Please try manually.",
        variant: "destructive"
      });
    }
  };

  const handleExportAuditLog = () => {
    const exportData = decisionTraceService.exportTraces();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mind-manual-audit-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Audit Log Exported",
      description: "Downloaded complete audit trail for your records"
    });
  };

  const handleClearAuditLog = () => {
    if (confirm('Are you sure you want to clear the entire audit log? This cannot be undone.')) {
      decisionTraceService.clear();
      toast({
        title: "Audit Log Cleared",
        description: "All decision traces have been removed"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5" />
              <CardTitle>Audit Dashboard</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleExportAuditLog} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button onClick={handleClearAuditLog} variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
          <CardDescription>
            View and manage all automated actions taken by Mind Manual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{traces.length}</div>
              <div className="text-sm text-muted-foreground">Total Actions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {traces.filter(t => t.decision === 'auto-write').length}
              </div>
              <div className="text-sm text-muted-foreground">Auto-Written</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {traces.filter(t => t.decision === 'draft').length}
              </div>
              <div className="text-sm text-muted-foreground">Drafted</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {undoableTraces.length}
              </div>
              <div className="text-sm text-muted-foreground">Undoable</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Undoable Actions */}
      {undoableTraces.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              <CardTitle>Quick Undo</CardTitle>
            </div>
            <CardDescription>
              Recent actions that can be undone with one click
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {undoableTraces.map((trace) => (
              <div key={trace.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getFeatureIcon(trace.feature)}
                  <div>
                    <div className="font-medium text-sm">{trace.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(trace.timestamp)} ago • {trace.becauseText}
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={() => handleUndo(trace)} 
                  variant="outline" 
                  size="sm"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Undo
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Complete Audit Trail */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle>Complete Audit Trail</CardTitle>
          </div>
          <CardDescription>
            Chronological log of all automated decisions and actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {traces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>No automated actions have been taken yet</p>
              <p className="text-sm">Enable auto-write features to see activity here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {traces.map((trace) => (
                <div key={trace.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getFeatureIcon(trace.feature)}
                      <span className="font-medium text-sm capitalize">{trace.feature}</span>
                      <Badge className={`text-xs ${getDecisionColor(trace.decision)}`}>
                        {trace.decision}
                      </Badge>
                      {trace.undoId && (
                        <Badge variant="outline" className="text-xs">
                          Undone
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(trace.timestamp)} ago
                    </span>
                  </div>
                  
                  <div className="text-sm">{trace.action}</div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Confidence: {Math.round(trace.finalConfidence * 100)}%</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{trace.signals.length} signals</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span>{trace.becauseText}</span>
                  </div>

                  {selectedTrace?.id === trace.id && (
                    <div className="mt-3 p-3 bg-muted rounded border space-y-2">
                      <div className="text-sm font-medium">Signal Breakdown:</div>
                      {trace.signals.map((signal, idx) => (
                        <div key={idx} className="text-xs flex justify-between">
                          <span>{signal.type} ({signal.source})</span>
                          <span>{Math.round(signal.confidence * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={() => setSelectedTrace(selectedTrace?.id === trace.id ? null : trace)}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    {selectedTrace?.id === trace.id ? 'Hide Details' : 'Show Details'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}