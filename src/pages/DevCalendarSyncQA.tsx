import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Calendar,
  TestTube,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  RefreshCw,
  Zap,
  Bug
} from 'lucide-react';
import { toast } from 'sonner';
import { CalendarHealthPanel } from '@/components/CalendarHealthPanel';
import { supabase } from '@/integrations/supabase/client';

export default function DevCalendarSync() {
  const [testAccountId, setTestAccountId] = useState('');
  const [fullSyncMode, setFullSyncMode] = useState(false);
  const [customTimeWindow, setCustomTimeWindow] = useState(false);
  const [timeWindowStart, setTimeWindowStart] = useState('');
  const [timeWindowEnd, setTimeWindowEnd] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [simulate410Error, setSimulate410Error] = useState(false);

  const runSyncTest = async () => {
    if (!testAccountId.trim()) {
      toast.error('Please enter a calendar account ID');
      return;
    }

    setIsRunningTest(true);
    setTestResults(null);

    try {
      const requestBody: any = {
        calendarAccountId: testAccountId,
        fullSync: fullSyncMode,
      };

      if (customTimeWindow && timeWindowStart && timeWindowEnd) {
        requestBody.timeWindow = {
          start: new Date(timeWindowStart).toISOString(),
          end: new Date(timeWindowEnd).toISOString(),
        };
      }

      // Add 410 simulation flag for testing
      if (simulate410Error) {
        requestBody._simulate410 = true;
      }

      console.log('Triggering calendar sync test:', requestBody);

      const { data, error } = await supabase.functions.invoke('calendar-sync', {
        body: requestBody,
      });

      if (error) {
        throw new Error(error.message);
      }

      setTestResults({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });

      toast.success('Calendar sync test completed successfully');
    } catch (error: any) {
      console.error('Calendar sync test failed:', error);
      
      setTestResults({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      toast.error(`Sync test failed: ${error.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const runWatchChannelTest = async (action: 'setup' | 'renew' | 'stop') => {
    if (!testAccountId.trim()) {
      toast.error('Please enter a calendar account ID');
      return;
    }

    setIsRunningTest(true);

    try {
      const { data, error } = await supabase.functions.invoke('calendar-watch', {
        body: {
          calendarAccountId: testAccountId,
          action,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setTestResults({
        success: true,
        data,
        timestamp: new Date().toISOString(),
        operation: `watch_${action}`,
      });

      toast.success(`Watch channel ${action} test completed successfully`);
    } catch (error: any) {
      console.error(`Watch channel ${action} test failed:`, error);
      
      setTestResults({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        operation: `watch_${action}`,
      });

      toast.error(`Watch ${action} failed: ${error.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  const getAccountIds = async () => {
    try {
      const { data: accounts, error } = await supabase
        .from('calendar_accounts')
        .select('id, account_email, calendar_name')
        .limit(10);

      if (error) {
        toast.error('Failed to fetch calendar accounts');
        return;
      }

      if (accounts && accounts.length > 0) {
        const accountInfo = accounts.map(acc => 
          `${acc.id} (${acc.account_email})`
        ).join('\n');
        
        toast.success('Account IDs copied to console');
        console.log('Available Calendar Account IDs:\n', accountInfo);
        
        // Set first account as test target
        setTestAccountId(accounts[0].id);
      } else {
        toast.info('No calendar accounts found');
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Failed to fetch account IDs');
    }
  };

  const triggerChannelRenewal = async () => {
    setIsRunningTest(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('calendar-watch', {
        body: {
          calendarAccountId: '', // Not used for renewal
          action: 'renew',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      toast.success('Channel renewal process triggered');
      setTestResults({
        success: true,
        data,
        timestamp: new Date().toISOString(),
        operation: 'renew_all',
      });
    } catch (error: any) {
      toast.error(`Channel renewal failed: ${error.message}`);
      setTestResults({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        operation: 'renew_all',
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Calendar className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Calendar Sync Development Tools</h1>
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="health">Health Monitor</TabsTrigger>
          <TabsTrigger value="sync-test">Sync Testing</TabsTrigger>
          <TabsTrigger value="watch-test">Watch Channels</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-4">
          <CalendarHealthPanel />
        </TabsContent>

        <TabsContent value="sync-test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Calendar Sync Testing
              </CardTitle>
              <CardDescription>
                Test incremental and full calendar synchronization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="accountId">Calendar Account ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accountId"
                      value={testAccountId}
                      onChange={(e) => setTestAccountId(e.target.value)}
                      placeholder="Enter calendar account ID"
                    />
                    <Button variant="outline" onClick={getAccountIds}>
                      Get IDs
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="fullSync"
                      checked={fullSyncMode}
                      onCheckedChange={setFullSyncMode}
                    />
                    <Label htmlFor="fullSync">Full Sync Mode</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="customTime"
                      checked={customTimeWindow}
                      onCheckedChange={setCustomTimeWindow}
                    />
                    <Label htmlFor="customTime">Custom Time Window</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="simulate410"
                      checked={simulate410Error}
                      onCheckedChange={setSimulate410Error}
                    />
                    <Label htmlFor="simulate410">Simulate 410 Error</Label>
                  </div>
                </div>
              </div>

              {customTimeWindow && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="datetime-local"
                      value={timeWindowStart}
                      onChange={(e) => setTimeWindowStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="datetime-local"
                      value={timeWindowEnd}
                      onChange={(e) => setTimeWindowEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={runSyncTest}
                  disabled={isRunningTest}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isRunningTest ? 'animate-spin' : ''}`} />
                  Run Sync Test
                </Button>
              </div>

              {testResults && (
                <Alert className={testResults.success ? 'border-success' : 'border-destructive'}>
                  <div className="flex items-center gap-2">
                    {testResults.success ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={testResults.success ? 'secondary' : 'destructive'}>
                            {testResults.success ? 'Success' : 'Error'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(testResults.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {testResults.success ? (
                          <div>
                            <p>Events processed: {testResults.data?.eventsProcessed || 0}</p>
                            <p>Sync type: {testResults.data?.syncType || 'unknown'}</p>
                            {testResults.data?.nextSyncToken && (
                              <p className="text-xs">Next sync token received</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-destructive">{testResults.error}</p>
                        )}
                      </div>
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watch-test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Watch Channel Testing
              </CardTitle>
              <CardDescription>
                Test watch channel setup, renewal, and termination
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="watchAccountId">Calendar Account ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="watchAccountId"
                    value={testAccountId}
                    onChange={(e) => setTestAccountId(e.target.value)}
                    placeholder="Enter calendar account ID"
                  />
                  <Button variant="outline" onClick={getAccountIds}>
                    Get IDs
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => runWatchChannelTest('setup')}
                  disabled={isRunningTest}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Eye className="h-4 w-4" />
                  Setup Watch
                </Button>
                <Button
                  onClick={() => runWatchChannelTest('stop')}
                  disabled={isRunningTest}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Clock className="h-4 w-4" />
                  Stop Watch
                </Button>
                <Button
                  onClick={triggerChannelRenewal}
                  disabled={isRunningTest}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Zap className="h-4 w-4" />
                  Renew All Channels
                </Button>
              </div>

              {testResults && testResults.operation?.startsWith('watch') && (
                <Alert className={testResults.success ? 'border-success' : 'border-destructive'}>
                  <div className="flex items-center gap-2">
                    {testResults.success ? (
                      <CheckCircle className="h-4 w-4 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={testResults.success ? 'secondary' : 'destructive'}>
                            {testResults.operation}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(testResults.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {testResults.success ? (
                          <div>
                            <p>Operation completed successfully</p>
                            {testResults.data?.channelId && (
                              <p className="text-xs">Channel ID: {testResults.data.channelId}</p>
                            )}
                            {testResults.data?.expiresAt && (
                              <p className="text-xs">
                                Expires: {new Date(testResults.data.expiresAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-destructive">{testResults.error}</p>
                        )}
                      </div>
                    </AlertDescription>
                  </div>
                </Alert>
              )}

              <Alert>
                <Bug className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Testing 410 Gone Error Handling:</p>
                  <p className="text-sm">
                    Watch channels can receive 410 Gone responses when sync tokens expire.
                    The system should automatically fall back to full sync in this case.
                    Use the "Simulate 410 Error" option in sync testing to verify this behavior.
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}