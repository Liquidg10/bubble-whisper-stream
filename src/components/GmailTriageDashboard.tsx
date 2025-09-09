import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Calendar, CheckCircle, Mail, Package, CreditCard, Users, RefreshCw, Play, Square } from 'lucide-react';
import { gmailTriageService, ActionableItem, TriageResult, GmailLabel } from '@/services/gmailTriageService';
import { toast } from 'sonner';

interface GmailTriageDashboardProps {
  accountId: string;
  accountEmail: string;
}

export function GmailTriageDashboard({ accountId, accountEmail }: GmailTriageDashboardProps) {
  const [actionables, setActionables] = useState<ActionableItem[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [triageInProgress, setTriageInProgress] = useState(false);
  const [watchActive, setWatchActive] = useState(false);
  const [lastTriageResult, setLastTriageResult] = useState<TriageResult | null>(null);
  const [contextCacheEnabled, setContextCacheEnabled] = useState(false);

  useEffect(() => {
    loadInitialData();
    
    // Subscribe to triage updates
    const unsubscribe = gmailTriageService.subscribe((result) => {
      setLastTriageResult(result);
      if (result.errors.length === 0) {
        toast.success(`Triage completed: ${result.messagesProcessed} messages processed, ${result.actionablesFound} actionables found`);
        loadActionables();
      } else {
        toast.error(`Triage completed with ${result.errors.length} errors`);
      }
    });

    return unsubscribe;
  }, [accountId]);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        loadLabels(),
        loadActionables(),
        checkWatchStatus()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error('Failed to load Gmail data');
    }
  };

  const loadLabels = async () => {
    try {
      const labelsData = await gmailTriageService.syncLabels(accountId);
      setLabels(labelsData);
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const loadActionables = async () => {
    try {
      // Get user ID from account
      const userId = 'current-user-id'; // This should come from auth context
      const actionablesData = await gmailTriageService.getActionables(
        userId,
        selectedType === 'all' ? undefined : selectedType
      );
      setActionables(actionablesData);
    } catch (error) {
      console.error('Error loading actionables:', error);
    }
  };

  const checkWatchStatus = async () => {
    // This would check if Gmail watch is currently active
    // For now, we'll set it to false
    setWatchActive(false);
  };

  const handleTriageStart = async () => {
    setTriageInProgress(true);
    try {
      await gmailTriageService.triageMessages(accountId, {
        maxResults: 100,
        labelIds: selectedLabels.length > 0 ? selectedLabels : undefined,
        contextCacheEnabled
      });
    } catch (error) {
      console.error('Error starting triage:', error);
      toast.error('Failed to start Gmail triage');
      setTriageInProgress(false);
    }
  };

  const handleWatchToggle = async () => {
    try {
      if (watchActive) {
        await gmailTriageService.stopWatch(accountId);
        setWatchActive(false);
        toast.success('Gmail watch stopped');
      } else {
        await gmailTriageService.startWatch(accountId);
        setWatchActive(true);
        toast.success('Gmail watch started');
      }
    } catch (error) {
      console.error('Error toggling watch:', error);
      toast.error(`Failed to ${watchActive ? 'stop' : 'start'} Gmail watch`);
    }
  };

  const handleCompleteActionable = async (actionableId: string) => {
    try {
      await gmailTriageService.completeActionable(actionableId);
      toast.success('Actionable marked as completed');
      loadActionables();
    } catch (error) {
      console.error('Error completing actionable:', error);
      toast.error('Failed to complete actionable');
    }
  };

  const getActionableIcon = (type: string) => {
    switch (type) {
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      case 'rsvp':
        return <Users className="h-4 w-4" />;
      case 'bill':
        return <CreditCard className="h-4 w-4" />;
      case 'shipping':
        return <Package className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 0.8) return 'bg-destructive';
    if (priority >= 0.6) return 'bg-warning';
    return 'bg-muted';
  };

  const formatDueDate = (date?: Date) => {
    if (!date) return 'No due date';
    
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `Due in ${diffDays} days`;
  };

  const filteredActionables = actionables.filter(item => {
    if (selectedType !== 'all' && item.type !== selectedType) return false;
    return true;
  });

  const actionableStats = {
    total: filteredActionables.length,
    overdue: filteredActionables.filter(item => item.dueDate && item.dueDate < new Date()).length,
    today: filteredActionables.filter(item => {
      if (!item.dueDate) return false;
      const today = new Date();
      return item.dueDate.toDateString() === today.toDateString();
    }).length,
    thisWeek: filteredActionables.filter(item => {
      if (!item.dueDate) return false;
      const oneWeek = new Date();
      oneWeek.setDate(oneWeek.getDate() + 7);
      return item.dueDate <= oneWeek;
    }).length
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Gmail Triage Dashboard
              </CardTitle>
              <CardDescription>
                Account: {accountEmail}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={watchActive ? "destructive" : "default"}
                size="sm"
                onClick={handleWatchToggle}
                disabled={triageInProgress}
              >
                {watchActive ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {watchActive ? 'Stop Watch' : 'Start Watch'}
              </Button>
              <Button
                onClick={handleTriageStart}
                disabled={triageInProgress}
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {triageInProgress ? 'Triaging...' : 'Run Triage'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Label Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter by Labels</label>
              <Select value={selectedLabels[0] || 'all'} onValueChange={(value) => {
                setSelectedLabels(value === 'all' ? [] : [value]);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All labels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All labels</SelectItem>
                  {labels.filter(label => label.type === 'user').map(label => (
                    <SelectItem key={label.id} value={label.id}>
                      {label.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter by Type</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="meeting">Meetings</SelectItem>
                  <SelectItem value="rsvp">RSVPs</SelectItem>
                  <SelectItem value="bill">Bills</SelectItem>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="task">Tasks</SelectItem>
                  <SelectItem value="deadline">Deadlines</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Context Cache Toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Triage Options</label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="context-cache"
                  checked={contextCacheEnabled}
                  onCheckedChange={(checked) => setContextCacheEnabled(checked as boolean)}
                />
                <label htmlFor="context-cache" className="text-sm">
                  Enable context cache
                </label>
              </div>
            </div>
          </div>

          {/* Stats */}
          {lastTriageResult && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="font-medium">Messages Processed</div>
                <div className="text-2xl font-bold text-primary">{lastTriageResult.messagesProcessed}</div>
              </div>
              <div>
                <div className="font-medium">Actionables Found</div>
                <div className="text-2xl font-bold text-warning">{lastTriageResult.actionablesFound}</div>
              </div>
              <div>
                <div className="font-medium">Threads Processed</div>
                <div className="text-2xl font-bold text-muted-foreground">{lastTriageResult.threadsProcessed}</div>
              </div>
              <div>
                <div className="font-medium">Errors</div>
                <div className={`text-2xl font-bold ${lastTriageResult.errors.length > 0 ? 'text-destructive' : 'text-success'}`}>
                  {lastTriageResult.errors.length}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actionables Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{actionableStats.total}</div>
            <p className="text-xs text-muted-foreground">Total Actionables</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-destructive">{actionableStats.overdue}</div>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-warning">{actionableStats.today}</div>
            <p className="text-xs text-muted-foreground">Due Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">{actionableStats.thisWeek}</div>
            <p className="text-xs text-muted-foreground">This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Actionables List */}
      <Card>
        <CardHeader>
          <CardTitle>Actionable Items</CardTitle>
          <CardDescription>
            Items that require your attention based on email analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredActionables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No actionable items found</p>
                <p className="text-sm">Run triage to analyze your emails</p>
              </div>
            ) : (
              filteredActionables.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getActionableIcon(item.type)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{item.metadata.subject}</h4>
                        <p className="text-sm text-muted-foreground">
                          From: {item.metadata.sender}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={getPriorityColor(item.priority)}>
                          {item.type}
                        </Badge>
                        {item.dueDate && (
                          <Badge variant="secondary">
                            {formatDueDate(item.dueDate)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.metadata.snippet}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Priority: {Math.round(item.priority * 100)}%
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCompleteActionable(item.id)}
                        disabled={item.completed}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {item.completed ? 'Completed' : 'Mark Complete'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}