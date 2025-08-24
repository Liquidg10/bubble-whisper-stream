import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Reminder, SNOOZE_PRESETS } from '@/types/bubble';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  MoreVertical,
  Bell,
  BellOff,
  Calendar
} from 'lucide-react';
import { reminderEngine } from '@/services/reminderEngine';
import { hapticsService } from '@/services/haptics';

export const Reminders: React.FC = () => {
  const { reminders, updateReminder, bubbles } = useBubbleStore();
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [showAdjustment, setShowAdjustment] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, any>>({});

  const getBubbleForReminder = (reminder: Reminder) => {
    return bubbles.find(b => b.id === reminder.bubbleId);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = timestamp - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
      return 'Overdue';
    } else if (diffMins < 60) {
      return `in ${diffMins}m`;
    } else if (diffHours < 24) {
      return `in ${diffHours}h`;
    } else if (diffDays < 7) {
      return `in ${diffDays}d`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleCompleteReminder = async (reminder: Reminder) => {
    const completed = reminderEngine.completeReminder(reminder);
    await updateReminder(completed);
    hapticsService.success();
  };

  const handleSnoozeReminder = async (reminder: Reminder, presetKey: string) => {
    const preset = SNOOZE_PRESETS.find(p => p.key === presetKey);
    if (preset) {
      const snoozed = reminderEngine.snoozeReminder(reminder, preset.key);
      await updateReminder(snoozed);
      hapticsService.tap();
    }
  };

  const handleDismissReminder = async (reminder: Reminder) => {
    const dismissed = reminderEngine.dismissReminder(reminder);
    await updateReminder(dismissed);
    hapticsService.trigger('warning');
  };

  const getFilteredReminders = () => {
    switch (activeTab) {
      case 'active':
        return reminders.filter(r => r.status === 'Active' || r.status === 'Snoozed');
      case 'completed':
        return reminders.filter(r => r.status === 'Done' || r.status === 'Dismissed');
      case 'all':
      default:
        return reminders;
    }
  };

  const filteredReminders = getFilteredReminders();

  const getStatusColor = (status: Reminder['status']) => {
    switch (status) {
      case 'Active':
        return 'bg-blue-500/20 text-blue-300';
      case 'Snoozed':
        return 'bg-orange-500/20 text-orange-300';
      case 'Done':
        return 'bg-green-500/20 text-green-300';
      case 'Dismissed':
        return 'bg-gray-500/20 text-gray-300';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 1:
        return <Bell className="h-4 w-4" />;
      case 2:
        return <Bell className="h-4 w-4 text-orange-400" />;
      case 3:
        return <Bell className="h-4 w-4 text-red-400" />;
      default:
        return <BellOff className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">
          Manage your gentle, persistent, and important reminders
        </p>
      </div>

      <div className="p-4">
        <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active ({reminders.filter(r => r.status === 'Active' || r.status === 'Snoozed').length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({reminders.filter(r => r.status === 'Done' || r.status === 'Dismissed').length})</TabsTrigger>
            <TabsTrigger value="all">All ({reminders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <div className="space-y-3">
              {filteredReminders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No reminders in this category</p>
                  <p className="text-sm">Create a bubble and add a reminder to get started</p>
                </div>
              ) : (
                filteredReminders.map((reminder) => {
                  const bubble = getBubbleForReminder(reminder);
                  return (
                    <Card key={reminder.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {getLevelIcon(reminder.level)}
                            <CardTitle className="text-sm font-medium">
                              {bubble?.content?.substring(0, 50) || 'Reminder'}
                              {bubble?.content && bubble.content.length > 50 && '...'}
                            </CardTitle>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {(reminder.status === 'Active' || reminder.status === 'Snoozed') && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleCompleteReminder(reminder)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Mark Done
                                  </DropdownMenuItem>
                                  {SNOOZE_PRESETS.slice(0, 3).map((preset) => (
                                    <DropdownMenuItem
                                      key={preset.key}
                                      onClick={() => handleSnoozeReminder(reminder, preset.key)}
                                    >
                                      <Clock className="h-4 w-4 mr-2" />
                                      {preset.label}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem
                                    onClick={() => handleDismissReminder(reminder)}
                                    className="text-destructive"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Dismiss
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge className={getStatusColor(reminder.status)}>
                            {reminder.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatTime(reminder.scheduledAt)}
                          </span>
                        </div>

                        {bubble?.tags && bubble.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {bubble.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag.id} variant="outline" className="text-xs">
                                {tag.emoji} {tag.name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {reminder.snoozes.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Snoozed {reminder.snoozes.length} time{reminder.snoozes.length !== 1 ? 's' : ''}
                            {reminder.snoozes[reminder.snoozes.length - 1]?.reason && (
                              <span> · {reminder.snoozes[reminder.snoozes.length - 1].reason}</span>
                            )}
                          </div>
                        )}

                        {(reminder.status === 'Active' || reminder.status === 'Snoozed') && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              onClick={() => handleCompleteReminder(reminder)}
                              className="flex-1"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Done
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Clock className="h-4 w-4 mr-1" />
                                  Snooze
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {SNOOZE_PRESETS.map((preset) => (
                                  <DropdownMenuItem
                                    key={preset.key}
                                    onClick={() => handleSnoozeReminder(reminder, preset.key)}
                                  >
                                    {preset.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};