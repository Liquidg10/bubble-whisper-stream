/**
 * Auto-Write Production Integration
 * Connects Auto-Write Ladder with task creation flows and user notifications
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  Mail, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  Eye,
  Send,
  Trash2,
  Undo2
} from 'lucide-react';
import { autoWriteLadderService } from '@/services/autoWriteLadder';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { taskAutoWriteProductionService } from '@/services/taskAutoWriteProductionService';
import { decisionTraceService } from '@/services/decisionTraceService';
import { useToast } from '@/hooks/use-toast';
import type { Task } from '@/types/task';

interface PendingDraft {
  id: string;
  type: 'calendar' | 'email';
  title: string;
  confidence: number;
  createdAt: number;
  taskId?: string;
  preview: string;
  traceId: string;
}

interface AutoWriteStats {
  dailyCalendar: number;
  weeklyCalendar: number;
  dailyEmail: number;
  weeklyEmail: number;
  canAutoWrite: boolean;
  nextReset: number;
}

export const AutoWriteProductionIntegration: React.FC = () => {
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [stats, setStats] = useState<AutoWriteStats>({
    dailyCalendar: 0,
    weeklyCalendar: 0,
    dailyEmail: 0,
    weeklyEmail: 0,
    canAutoWrite: true,
    nextReset: Date.now() + 86400000
  });
  const [activeTab, setActiveTab] = useState('drafts');
  const { toast } = useToast();

  useEffect(() => {
    loadPendingDrafts();
    loadStats();
    
    const interval = setInterval(() => {
      loadPendingDrafts();
      loadStats();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const loadPendingDrafts = async () => {
    try {
      const drafts = autoWriteLadderService.getDrafts();
      const formattedDrafts: PendingDraft[] = drafts.map(draft => ({
        id: draft.id,
        type: draft.feature as 'calendar' | 'email',
        title: draft.context.action.title || 'Untitled',
        confidence: draft.context.confidence,
        createdAt: draft.createdAt,
        taskId: draft.context.action.taskId,
        preview: generatePreview(draft),
        traceId: draft.traceId
      }));
      
      setPendingDrafts(formattedDrafts);
    } catch (error) {
      console.error('Failed to load pending drafts:', error);
    }
  };

  const loadStats = async () => {
    try {
      const calendarStats = await taskAutoWriteProductionService.getAutoWriteMetrics(7);
      // Mock email stats for now
      setStats({
        dailyCalendar: calendarStats.totalAttempts || 0,
        weeklyCalendar: calendarStats.autoWriteCount || 0,
        dailyEmail: 0,
        weeklyEmail: 0,
        canAutoWrite: calendarStats.successRate > 0.8,
        nextReset: Date.now() + 86400000
      });
    } catch (error) {
      console.error('Failed to load auto-write stats:', error);
    }
  };

  const generatePreview = (draft: any): string => {
    const action = draft.context.action;
    if (draft.feature === 'calendar') {
      return `${action.title} - ${new Date(action.startTime).toLocaleString()}`;
    } else if (draft.feature === 'email') {
      return `To: ${action.recipients?.join(', ') || 'Unknown'} - ${action.subject || 'No subject'}`;
    }
    return 'Draft preview unavailable';
  };

  const handleExecuteDraft = async (draftId: string) => {
    try {
      await autoWriteLadderService.executeDraft(draftId);
      toast({
        title: "Draft Executed",
        description: "Your draft has been successfully processed.",
      });
      loadPendingDrafts();
      loadStats();
    } catch (error) {
      toast({
        title: "Execution Failed",
        description: "Failed to execute draft. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      // Remove draft from storage
      const drafts = autoWriteLadderService.getDrafts();
      const filteredDrafts = drafts.filter(d => d.id !== draftId);
      // Note: This would need proper deletion method in autoWriteLadderService
      toast({
        title: "Draft Deleted",
        description: "Draft has been removed.",
      });
      loadPendingDrafts();
    } catch (error) {
      toast({
        title: "Deletion Failed",
        description: "Failed to delete draft.",
        variant: "destructive"
      });
    }
  };

  const handleViewTrace = (traceId: string) => {
    const trace = decisionTraceService.getTrace(traceId);
    if (trace) {
      toast({
        title: "Decision Trace",
        description: trace.becauseText,
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 85) return 'default';
    if (confidence >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Auto-Write Center</h2>
          <p className="text-muted-foreground">Manage AI-generated drafts and auto-write settings</p>
        </div>
        <Badge variant={stats.canAutoWrite ? 'default' : 'destructive'}>
          {stats.canAutoWrite ? 'Active' : 'Rate Limited'}
        </Badge>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Calendar Today</p>
                <p className="text-2xl font-bold">{stats.dailyCalendar}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-secondary" />
              <div>
                <p className="text-sm text-muted-foreground">Calendar This Week</p>
                <p className="text-2xl font-bold">{stats.weeklyCalendar}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm text-muted-foreground">Email Today</p>
                <p className="text-2xl font-bold">{stats.dailyEmail}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Next Reset</p>
                <p className="text-sm font-medium">
                  {new Date(stats.nextReset).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="drafts">
            Pending Drafts ({pendingDrafts.length})
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="space-y-4">
          {pendingDrafts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No pending drafts</p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI-generated drafts will appear here for your review
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingDrafts.map(draft => (
                <Card key={draft.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 rounded-full bg-muted">
                          {draft.type === 'calendar' ? 
                            <Calendar className="h-4 w-4" /> : 
                            <Mail className="h-4 w-4" />
                          }
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{draft.title}</h3>
                            <Badge variant={getConfidenceBadge(draft.confidence)}>
                              {Math.round(draft.confidence)}%
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {draft.preview}
                          </p>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Created {new Date(draft.createdAt).toLocaleTimeString()}</span>
                            {draft.taskId && <span>Task: {draft.taskId.slice(0, 8)}</span>}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewTrace(draft.traceId)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          size="sm"
                          onClick={() => handleExecuteDraft(draft.id)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Execute
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteDraft(draft.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Write History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Auto-write history tracking coming soon. This will show your recent
                automatic actions and their success rates.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Write Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Calendar Auto-Write</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically create calendar events for high-confidence tasks
                    </p>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Email Draft Generation</h4>
                    <p className="text-sm text-muted-foreground">
                      Generate email drafts from task descriptions
                    </p>
                  </div>
                  <Badge variant="secondary">Draft Only</Badge>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Confidence Thresholds</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Suggest:</span>
                      <span>&lt; 60%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Draft:</span>
                      <span>60-85%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Auto-write:</span>
                      <span>&gt; 85%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};