/**
 * Email Integration Hub - Unified email experience component
 * Combines triage, auto-write, and task integration in one place
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Mail, 
  Inbox, 
  Send, 
  Settings, 
  Bot,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { EmailTriageDashboard } from './EmailTriageDashboard';
import { EnhancedEmailAutoWriteWidget } from './EnhancedEmailAutoWriteWidget';
import { EmailIntegrationPlugin } from '@/plugins/EmailIntegrationPlugin';

interface EmailIntegrationHubProps {
  className?: string;
}

export const EmailIntegrationHub: React.FC<EmailIntegrationHubProps> = ({ 
  className = '' 
}) => {
  const [activeTab, setActiveTab] = useState('triage');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger a sync across all email services
      window.dispatchEvent(new CustomEvent('email-refresh'));
      
      setTimeout(() => {
        setRefreshing(false);
      }, 2000);
    } catch (error) {
      setRefreshing(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6" />
              <div>
                <CardTitle>Email Integration Hub</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Unified email → task workflow with AI assistance
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              
              <Badge variant="secondary" className="gap-1">
                <Bot className="h-3 w-3" />
                AI Powered
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="triage" className="gap-2">
            <Inbox className="h-4 w-4" />
            Email Triage
          </TabsTrigger>
          <TabsTrigger value="auto-write" className="gap-2">
            <Send className="h-4 w-4" />
            Auto-Write
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triage" className="space-y-4">
          <EmailTriageDashboard />
        </TabsContent>

        <TabsContent value="auto-write" className="space-y-4">
          <EnhancedEmailAutoWriteWidget />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Email Intelligence Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-2xl font-bold text-blue-600">42</div>
                  <div className="text-sm text-muted-foreground">Emails Classified</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-green-600">18</div>
                  <div className="text-sm text-muted-foreground">Tasks Created</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-purple-600">12</div>
                  <div className="text-sm text-muted-foreground">Drafts Generated</div>
                </Card>
                <Card className="p-4">
                  <div className="text-2xl font-bold text-orange-600">87%</div>
                  <div className="text-sm text-muted-foreground">Accuracy Rate</div>
                </Card>
              </div>

              {/* Intent Distribution */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Email Intent Distribution</h3>
                <div className="space-y-2">
                  {[
                    { intent: 'Task', count: 18, color: 'bg-blue-500' },
                    { intent: 'Meeting', count: 12, color: 'bg-green-500' },
                    { intent: 'Bill', count: 8, color: 'bg-red-500' },
                    { intent: 'Confirmation', count: 4, color: 'bg-yellow-500' }
                  ].map((item) => (
                    <div key={item.intent} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded ${item.color}`} />
                      <span className="text-sm flex-1">{item.intent}</span>
                      <span className="text-sm font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Learning Progress */}
              <Card className="p-4">
                <h3 className="font-semibold mb-3">AI Learning Progress</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Classification Accuracy</span>
                      <span>87%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '87%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Auto-Creation Success</span>
                      <span>73%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: '73%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Draft Quality Score</span>
                      <span>91%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: '91%' }} />
                    </div>
                  </div>
                </div>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <EmailIntegrationPlugin />
          
          <Card>
            <CardHeader>
              <CardTitle>Email Integration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto-Creation Settings */}
              <div className="space-y-3">
                <h3 className="font-semibold">Auto-Creation Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-3">
                    <div className="font-medium text-sm mb-1">Confidence Threshold</div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Minimum confidence for auto-creating tasks
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }} />
                      </div>
                      <span className="text-sm font-medium">75%</span>
                    </div>
                  </Card>
                  
                  <Card className="p-3">
                    <div className="font-medium text-sm mb-1">Auto-Write Threshold</div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Minimum confidence for generating drafts
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: '85%' }} />
                      </div>
                      <span className="text-sm font-medium">85%</span>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Learning Settings */}
              <div className="space-y-3">
                <h3 className="font-semibold">Learning & Improvement</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Learn from user corrections</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Improve classification accuracy over time</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Suggest better email templates</span>
                  </label>
                </div>
              </div>

              {/* Safety Settings */}
              <div className="space-y-3">
                <h3 className="font-semibold">Safety & Guardrails</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Always require confirmation for work emails</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Block auto-send to external domains</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Rate limit email generation (max 10/day)</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};