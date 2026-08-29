import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { 
  Bot, 
  Calendar, 
  Mail, 
  Settings2, 
  Shield, 
  TrendingUp,
  Clock,
  Users,
  AlertTriangle
} from 'lucide-react';
import { userTrustService } from '@/services/userTrustService';
import {
  decisionTraceService,
  getDecisionUserAction,
  isAcceptanceTelemetryTrace,
  summarizeDecisionOutcomes,
  type DecisionTrace
} from '@/services/decisionTraceService';
import { toast } from '@/hooks/use-toast';

interface AutoWritePreferences {
  calendarAutoWriteEnabled: boolean;
  emailAutoWriteEnabled: boolean;
  financeAutoWriteEnabled: boolean;
  dailyLimit: number;
  requireConfirmationForNewContacts: boolean;
  respectQuietHours: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export function AutoWriteSettings() {
  const [preferences, setPreferences] = useState<AutoWritePreferences>({
    calendarAutoWriteEnabled: false,
    emailAutoWriteEnabled: false,
    financeAutoWriteEnabled: false,
    dailyLimit: 5,
    requireConfirmationForNewContacts: true,
    respectQuietHours: true,
    quietHoursStart: '18:00',
    quietHoursEnd: '09:00'
  });

  const [stats, setStats] = useState({
    todayCount: 0,
    weeklyCount: 0,
    successRate: null as number | null,
    avgConfidence: 0
  });

  const [trustData, setTrustData] = useState({
    allowlistedContacts: 0,
    whitelistedCalendars: 0,
    recentDecisions: [] as DecisionTrace[]
  });

  useEffect(() => {
    loadPreferences();
    loadStats();
    loadTrustData();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await userTrustService.getTrustPreferences();
      setPreferences(prev => ({ ...prev, ...prefs }));
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const loadStats = async () => {
    try {
      const traces = decisionTraceService.getTraces({
        feature: undefined,
        limit: 100
      }).filter(isAcceptanceTelemetryTrace);

      const today = new Date().toDateString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const todayTraces = traces.filter(t => 
        new Date(t.timestamp).toDateString() === today
      );
      
      const weeklyTraces = traces.filter(t => 
        new Date(t.timestamp) >= weekAgo
      );

      const outcomeSummary = summarizeDecisionOutcomes(traces);
      const successRate = outcomeSummary.acceptanceRate === null
        ? null
        : outcomeSummary.acceptanceRate * 100;

      const avgConfidence = traces.length > 0 
        ? traces.reduce((sum, t) => sum + (t.finalConfidence || 0), 0) / traces.length * 100
        : 0;

      setStats({
        todayCount: todayTraces.length,
        weeklyCount: weeklyTraces.length,
        successRate,
        avgConfidence
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadTrustData = async () => {
    try {
      const contacts = await userTrustService.getAllowlistedContacts();
      const recentActions = decisionTraceService
        .getTraces({ limit: 100 })
        .filter(isAcceptanceTelemetryTrace)
        .slice(0, 5);
      
      setTrustData({
        allowlistedContacts: contacts.length,
        whitelistedCalendars: 0, // Would load from user trust service
        recentDecisions: recentActions.slice(0, 5)
      });
    } catch (error) {
      console.error('Failed to load trust data:', error);
    }
  };

  const updatePreference = async (key: keyof AutoWritePreferences, value: any) => {
    try {
      const updatedPrefs = { ...preferences, [key]: value };
      setPreferences(updatedPrefs);
      
      // Only save specific preferences that match TrustPreferences interface
      const trustPrefs = {
        autoAllowFrequentContacts: updatedPrefs.requireConfirmationForNewContacts,
        trustThreshold: 0.7,
        maxInteractionsForTrust: 5,
        whitelistedDomains: [],
        blockedDomains: []
      };
      await userTrustService.saveTrustPreferences(trustPrefs);
      
      toast({
        title: "Preferences Updated",
        description: "Your auto-write preferences have been saved."
      });
    } catch (error) {
      console.error('Failed to update preference:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Auto-Write Activity
          </CardTitle>
          <CardDescription>
            Your automated writing activity and performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.todayCount}</div>
              <div className="text-sm text-muted-foreground">Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.weeklyCount}</div>
              <div className="text-sm text-muted-foreground">This Week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.successRate === null ? 'No outcomes' : `${stats.successRate.toFixed(1)}%`}
              </div>
              <div className="text-sm text-muted-foreground">Acceptance Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.avgConfidence.toFixed(0)}%</div>
              <div className="text-sm text-muted-foreground">Avg Confidence</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Daily limit progress</span>
              <span>{stats.todayCount}/{preferences.dailyLimit}</span>
            </div>
            <Progress 
              value={(stats.todayCount / preferences.dailyLimit) * 100} 
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Feature Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Auto-Write Features
          </CardTitle>
          <CardDescription>
            Enable or disable automatic writing for different features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <Label>Calendar Events</Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  Automatically create calendar events from conversations
                </div>
              </div>
              <Switch
                checked={preferences.calendarAutoWriteEnabled}
                onCheckedChange={(checked) => updatePreference('calendarAutoWriteEnabled', checked)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <Label>Email Drafts</Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  Automatically compose email drafts from voice input
                </div>
              </div>
              <Switch
                checked={preferences.emailAutoWriteEnabled}
                onCheckedChange={(checked) => updatePreference('emailAutoWriteEnabled', checked)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  <Label>Require Confirmation for New Contacts</Label>
                </div>
                <div className="text-sm text-muted-foreground">
                  Always ask before auto-writing to unknown recipients
                </div>
              </div>
              <Switch
                checked={preferences.requireConfirmationForNewContacts}
                onCheckedChange={(checked) => updatePreference('requireConfirmationForNewContacts', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trust Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Trust & Safety
          </CardTitle>
          <CardDescription>
            Manage trusted contacts and calendars for auto-write permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 border border-border rounded-lg">
              <div className="text-xl font-semibold text-primary">{trustData.allowlistedContacts}</div>
              <div className="text-sm text-muted-foreground">Trusted Contacts</div>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <div className="text-xl font-semibold text-primary">{trustData.whitelistedCalendars}</div>
              <div className="text-sm text-muted-foreground">Trusted Calendars</div>
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Auto-write is only enabled for trusted contacts and calendars. Build trust by confirming suggested actions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Configure when auto-write should be disabled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Respect Quiet Hours</Label>
            <Switch
              checked={preferences.respectQuietHours}
              onCheckedChange={(checked) => updatePreference('respectQuietHours', checked)}
            />
          </div>

          {preferences.respectQuietHours && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <input
                  type="time"
                  value={preferences.quietHoursStart}
                  onChange={(e) => updatePreference('quietHoursStart', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <input
                  type="time"
                  value={preferences.quietHoursEnd}
                  onChange={(e) => updatePreference('quietHoursEnd', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent decision telemetry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Auto-Write Decisions
          </CardTitle>
          <CardDescription>
            Review observed outcomes. Undo is available only from the action surface that owns the real reversal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trustData.recentDecisions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              No recent auto-write actions
            </div>
          ) : (
            <div className="space-y-3">
              {trustData.recentDecisions.map((decision) => {
                const outcome = getDecisionUserAction(decision);
                return (
                  <div key={decision.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">{decision.feature} - {decision.decision}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(decision.timestamp).toLocaleString()}
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary">{Math.round(decision.finalConfidence * 100)}% confidence</Badge>
                        <Badge variant={outcome ? 'outline' : 'secondary'}>
                          {outcome || 'Awaiting outcome'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
