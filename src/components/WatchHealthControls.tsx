/**
 * Watch Health Controls - Enhanced controls for watch management
 * Includes 410 Gone recovery, label filtering, and testing
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RotateCcw, Settings, TestTube } from 'lucide-react';
import { gmailHealthService } from '@/services/gmailHealthService';
import { calendarHealthService } from '@/services/calendarHealthService';
import { toast } from 'sonner';

interface WatchHealthControlsProps {
  onRefresh: () => void;
}

export function WatchHealthControls({ onRefresh }: WatchHealthControlsProps) {
  const [testAccountId, setTestAccountId] = useState('');
  const [labelFilters, setLabelFilters] = useState('');
  const [loading, setLoading] = useState(false);

  const handle410Recovery = async (accountId: string, type: 'calendar' | 'gmail') => {
    try {
      setLoading(true);
      
      if (type === 'calendar') {
        // Trigger bounded resync + token reset
        await calendarHealthService.triggerBoundedSync(accountId);
        await calendarHealthService.setupWatchChannel(accountId);
        toast.success('Calendar 410 Gone recovery completed');
      } else {
        // Trigger Gmail sync with 410 recovery
        await gmailHealthService.triggerSyncWithRecovery(accountId, true);
        await gmailHealthService.setupWatchChannel(accountId);
        toast.success('Gmail 410 Gone recovery completed');
      }
      
      onRefresh();
    } catch (error) {
      console.error('410 recovery failed:', error);
      toast.error('410 Gone recovery failed');
    } finally {
      setLoading(false);
    }
  };

  const updateGmailLabels = async (accountId: string) => {
    try {
      setLoading(true);
      const labels = labelFilters.split(',').map(l => l.trim()).filter(Boolean);
      await gmailHealthService.updateLabelFilters(accountId, labels);
      toast.success('Gmail label filters updated');
      onRefresh();
    } catch (error) {
      console.error('Failed to update labels:', error);
      toast.error('Failed to update label filters');
    } finally {
      setLoading(false);
    }
  };

  const simulate410Gone = async () => {
    if (!testAccountId) {
      toast.error('Please enter an account ID for testing');
      return;
    }

    try {
      setLoading(true);
      await gmailHealthService.simulate410Gone(testAccountId);
      toast.success('410 Gone error simulated - check watch status');
      onRefresh();
    } catch (error) {
      console.error('Failed to simulate 410:', error);
      toast.error('Failed to simulate 410 Gone error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 410 Gone Recovery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            410 Gone Recovery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            When a watch channel returns 410 Gone (sync token invalid), use these recovery options:
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="recovery-account">Account ID for Recovery</Label>
            <Input
              id="recovery-account"
              placeholder="Enter account ID..."
              value={testAccountId}
              onChange={(e) => setTestAccountId(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handle410Recovery(testAccountId, 'calendar')}
              disabled={!testAccountId || loading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Recover Calendar
            </Button>
            <Button
              variant="outline"
              onClick={() => handle410Recovery(testAccountId, 'gmail')}
              disabled={!testAccountId || loading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Recover Gmail
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground">
            Calendar: Bounded resync (-90d/+90d) + new watch channel<br/>
            Gmail: Full history sync + new watch channel
          </div>
        </CardContent>
      </Card>

      {/* Gmail Label Filtering */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Gmail Label Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Configure which Gmail labels to monitor for changes
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="label-filters">Label Names (comma-separated)</Label>
            <Input
              id="label-filters"
              placeholder="INBOX, IMPORTANT, Custom Label"
              value={labelFilters}
              onChange={(e) => setLabelFilters(e.target.value)}
            />
          </div>
          
          <Button
            onClick={() => updateGmailLabels(testAccountId)}
            disabled={!testAccountId || loading}
          >
            Update Filters
          </Button>
          
          <div className="text-xs text-muted-foreground">
            Leave empty to monitor all labels. Changes apply on next watch renewal.
          </div>
        </CardContent>
      </Card>

      {/* Testing Controls */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Testing & Simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={simulate410Gone}
              disabled={!testAccountId || loading}
            >
              Simulate 410 Gone
            </Button>
            
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
            >
              Force Refresh Status
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                setTestAccountId('');
                setLabelFilters('');
                toast.success('Test controls reset');
              }}
            >
              Reset Controls
            </Button>
          </div>
          
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="text-sm font-medium mb-2">Testing Guidelines:</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Use real account IDs from your connected accounts</li>
              <li>• 410 Gone simulation marks watch as expired and clears history</li>
              <li>• Recovery operations will trigger real API calls</li>
              <li>• Monitor logs in browser console for detailed output</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}