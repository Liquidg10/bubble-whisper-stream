import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings as SettingsIcon, 
  Brain, 
  Plug, 
  Shield, 
  Code,
  Bot
} from 'lucide-react';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { IntelligenceSettings } from '@/components/IntelligenceSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { PrivacySecuritySettings } from '@/components/settings/PrivacySecuritySettings';
import { AdvancedSettings } from '@/components/settings/AdvancedSettings';
import { AISettings } from '@/components/settings/AISettings';
import { useFeatureFlags } from '@/components/FeatureFlags';

export const Settings: React.FC = () => {
  const { isFeatureEnabled } = useFeatureFlags();
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Settings & Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Customize your experience and manage your data
        </p>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-6 mx-4 mt-4">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Intelligence</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
            {isFeatureEnabled('debugMode') && (
              <TabsTrigger value="advanced" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">Advanced</span>
              </TabsTrigger>
            )}
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="general" className="space-y-6 mt-0">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="ai" className="space-y-6 mt-0">
              <AISettings />
            </TabsContent>

            <TabsContent value="intelligence" className="space-y-6 mt-0">
              <IntelligenceSettings />
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6 mt-0">
              <IntegrationsSettings />
            </TabsContent>

            <TabsContent value="privacy" className="space-y-6 mt-0">
              <PrivacySecuritySettings />
            </TabsContent>

            {isFeatureEnabled('debugMode') && (
              <TabsContent value="advanced" className="space-y-6 mt-0">
                <AdvancedSettings />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
};