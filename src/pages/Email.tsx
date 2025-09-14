/**
 * Email Page
 * 
 * Main email interface bringing together all email functionality:
 * - Email integration hub
 * - Auto-compose features  
 * - Email triage and management
 * - Gmail connection status
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  Settings, 
  Zap,
  Activity,
  Plus,
  Inbox,
  Send
} from 'lucide-react';
import { EmailIntegrationHub } from '@/components/EmailIntegrationHub';
import { WithFeatureFlag } from '@/components/FeatureFlags';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function Email() {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleComposeNew = () => {
    toast({
      title: "New Email",
      description: "Opening email composer...",
    });
  };

  const handleThreadSelect = (threadId: string) => {
    setSelectedThread(threadId);
    toast({
      title: "Thread Selected", 
      description: `Selected email thread: ${threadId}`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Email
          </h1>
          <p className="text-muted-foreground">
            Unified email management with auto-compose and intelligent triage
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleComposeNew}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Compose
          </Button>
        </div>
      </div>

      {/* Main Email Interface */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Email Hub - Takes most space */}
        <div className="xl:col-span-3">
          <EmailIntegrationHub />
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-4">
          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Unread</span>
                <Badge variant="outline">8</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Auto-composed</span>
                <Badge variant="secondary">2</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Triaged</span>
                <Badge variant="default">15</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Gmail Connected</span>
                <Badge variant="secondary">Active</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Connection Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Integration Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user ? (
                <div className="text-xs text-green-600">
                  ✓ Authenticated - Gmail integration available
                </div>
              ) : (
                <div className="text-xs text-amber-600">
                  ! Sign in to connect Gmail
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Management Tabs */}
      <Tabs defaultValue="integration" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="integration" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Integration
          </TabsTrigger>
          <TabsTrigger value="autocompose" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Auto-Compose
          </TabsTrigger>
          <TabsTrigger value="triage" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Triage
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integration" className="space-y-4">
          <EmailIntegrationHub />
        </TabsContent>

        <TabsContent value="autocompose" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Compose</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Email auto-compose features are available through the main Email Integration Hub.
                Configure auto-compose settings through Settings → Integrations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Triage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Email triage features are available through the main Email Integration Hub.
                Configure triage settings through Settings → Integrations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email Integration Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Email integration settings are managed through the main Settings page.
                Use the tabs above to configure auto-compose, triage, and integration preferences.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selected Thread Details */}
      {selectedThread && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Selected Thread Details
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedThread(null)}
              >
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <h4 className="font-medium">Thread ID: {selectedThread}</h4>
              <div className="text-xs text-muted-foreground">
                📧 Thread selected for management
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}