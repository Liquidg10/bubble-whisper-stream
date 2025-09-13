import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  RefreshCw, 
  Settings, 
  Clock,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Eye
} from 'lucide-react';
import { oauthIncrementalService } from '@/services/oauthIncrementalService';
import { oauthService } from '@/services/oauthService';
import { isFeatureEnabled } from '@/config/flags';

/**
 * Dev route for monitoring OAuth incremental authorization state
 * Shows current scopes, escalation history, and decay status
 */
export default function DevOAuthState() {
  const [currentScopes, setCurrentScopes] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [decayStatus, setDecayStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isIncrementalEnabled = isFeatureEnabled('incrementalOAuth');

  useEffect(() => {
    loadOAuthState();
  }, []);

  const loadOAuthState = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get current scopes from incremental service
      const scopes = await oauthIncrementalService.getCurrentScopes();
      setCurrentScopes(scopes);

      // Get connected accounts
      const connectedAccounts = await oauthService.getConnectedAccounts();
      setAccounts(connectedAccounts);

      // Check decay status (simulate for dev)
      const lastUpdate = localStorage.getItem('oauth_last_update');
      const daysSinceUpdate = lastUpdate ? 
        Math.floor((Date.now() - parseInt(lastUpdate)) / (1000 * 60 * 60 * 24)) : 0;
      
      setDecayStatus({
        daysSinceLastUpdate: daysSinceUpdate,
        willDecayIn: Math.max(0, 30 - daysSinceUpdate),
        isEligibleForDecay: daysSinceUpdate >= 30
      });

    } catch (err) {
      console.error('Failed to load OAuth state:', err);
      setError(err instanceof Error ? err.message : 'Failed to load OAuth state');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnforceDecay = async () => {
    try {
      await oauthIncrementalService.enforceScopeDecay();
      await loadOAuthState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enforce scope decay');
    }
  };

  const testScopeEscalation = async (featureScopes: string[]) => {
    try {
      const result = await oauthIncrementalService.requiresEscalation(featureScopes);
      
      if (result.needsEscalation) {
        console.log('Scope escalation required:', result.comparison);
        alert(`Scope escalation required. Added: ${result.comparison.added.length}, Removed: ${result.comparison.removed.length}`);
      } else {
        alert('No scope escalation needed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test scope escalation');
    }
  };

  const getScopeCategory = (scope: string) => {
    if (scope.includes('calendar')) return 'calendar';
    if (scope.includes('gmail')) return 'gmail';
    return 'other';
  };

  const getScopeLevel = (scope: string) => {
    if (scope.includes('readonly') || scope.includes('metadata')) return 'read';
    if (scope.includes('events') || scope.includes('modify')) return 'write';
    if (scope.includes('send')) return 'send';
    return 'unknown';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading OAuth state...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OAuth Authorization State</h1>
          <p className="text-muted-foreground">
            Development monitoring for incremental OAuth flow
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={isIncrementalEnabled ? "default" : "secondary"}>
            {isIncrementalEnabled ? 'Incremental Enabled' : 'Incremental Disabled'}
          </Badge>
          <Button onClick={loadOAuthState} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="current">Current State</TabsTrigger>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
          <TabsTrigger value="decay">Scope Decay</TabsTrigger>
          <TabsTrigger value="testing">Test Escalation</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Current OAuth Scopes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentScopes.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No OAuth scopes found. Connect an account to see scope information.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {/* Scope Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {currentScopes.filter(s => getScopeLevel(s) === 'read').length}
                      </div>
                      <div className="text-sm text-blue-800">Read Scopes</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {currentScopes.filter(s => getScopeLevel(s) === 'write').length}
                      </div>
                      <div className="text-sm text-orange-800">Write Scopes</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">
                        {currentScopes.filter(s => getScopeLevel(s) === 'send').length}
                      </div>
                      <div className="text-sm text-red-800">Send Scopes</div>
                    </div>
                  </div>

                  {/* Detailed Scopes */}
                  <div className="space-y-2">
                    <h4 className="font-medium">All Scopes ({currentScopes.length}):</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {currentScopes.map((scope, index) => {
                        const category = getScopeCategory(scope);
                        const level = getScopeLevel(scope);
                        
                        return (
                          <div key={index} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {category}
                              </Badge>
                              <Badge 
                                variant={level === 'read' ? 'secondary' : level === 'write' ? 'default' : 'destructive'}
                                className="text-xs"
                              >
                                {level}
                              </Badge>
                            </div>
                            <code className="text-xs text-muted-foreground font-mono">
                              {scope.split('/').pop()}
                            </code>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No connected accounts found.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {accounts.map((account, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{account.provider}</h4>
                          <p className="text-sm text-muted-foreground">
                            {account.account_email}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline">
                              {account.scopes.length} scope(s)
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Last used: {account.last_used_at ? 
                                new Date(account.last_used_at).toLocaleDateString() : 
                                'Never'
                              }
                            </div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decay" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scope Decay Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {decayStatus && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {decayStatus.daysSinceLastUpdate}
                      </div>
                      <div className="text-sm text-blue-800">Days Since Update</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {decayStatus.willDecayIn}
                      </div>
                      <div className="text-sm text-green-800">Days Until Decay</div>
                    </div>
                  </div>

                  {decayStatus.isEligibleForDecay ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="flex items-center justify-between">
                        <span>Scopes are eligible for decay (30+ days old)</span>
                        <Button size="sm" onClick={handleEnforceDecay}>
                          Enforce Decay Now
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Scopes are still fresh. Decay will occur automatically after 30 days of inactivity.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Test Scope Escalation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Test the incremental authorization flow with different feature scope requirements
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  onClick={() => testScopeEscalation(['https://www.googleapis.com/auth/calendar.events'])}
                  variant="outline"
                  className="h-20 flex-col"
                >
                  <span className="font-medium">Calendar Write</span>
                  <span className="text-xs text-muted-foreground">Test calendar.events scope</span>
                </Button>

                <Button 
                  onClick={() => testScopeEscalation(['https://www.googleapis.com/auth/gmail.modify'])}
                  variant="outline"
                  className="h-20 flex-col"
                >
                  <span className="font-medium">Gmail Modify</span>
                  <span className="text-xs text-muted-foreground">Test gmail.modify scope</span>
                </Button>

                <Button 
                  onClick={() => testScopeEscalation(['https://www.googleapis.com/auth/gmail.send'])}
                  variant="outline"
                  className="h-20 flex-col"
                >
                  <span className="font-medium">Gmail Send</span>
                  <span className="text-xs text-muted-foreground">Test gmail.send scope</span>
                </Button>

                <Button 
                  onClick={() => testScopeEscalation([
                    'https://www.googleapis.com/auth/calendar.events',
                    'https://www.googleapis.com/auth/gmail.modify'
                  ])}
                  variant="outline"
                  className="h-20 flex-col"
                >
                  <span className="font-medium">Multi-Service</span>
                  <span className="text-xs text-muted-foreground">Test multiple scopes</span>
                </Button>
              </div>

              <Alert>
                <ExternalLink className="h-4 w-4" />
                <AlertDescription>
                  These tests will check scope requirements and trigger the consent flow if needed.
                  Check the browser console for detailed logs.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}