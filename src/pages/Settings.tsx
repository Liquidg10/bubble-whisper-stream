import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings as SettingsIcon, 
  Brain, 
  Plug, 
  Shield, 
  Code,
  Bot,
  Timer
} from 'lucide-react';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { IntelligenceSettings } from '@/components/IntelligenceSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { PrivacySecuritySettings } from '@/components/settings/PrivacySecuritySettings';
import { AdvancedSettings } from '@/components/settings/AdvancedSettings';
import { AISettings } from '@/components/settings/AISettings';
import { ThoughtSupportSettings } from '@/components/settings/ThoughtSupportSettings';
import { ProductivitySettings } from '@/components/settings/ProductivitySettings';
import { useFeatureFlags } from '@/components/FeatureFlags';
import { isFeatureEnabled } from '@/config/flags';

export const Settings: React.FC = () => {
  const { isFeatureEnabled: isLegacyFeatureEnabled } = useFeatureFlags();
  const [activeTab, setActiveTab] = useState('general');
  
  // Check if CBT features are available
  const showCBTTab = isFeatureEnabled('cbtAssist') || isFeatureEnabled('cbtSilentObserve');

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
          <TabsList className={`grid w-full ${showCBTTab ? 'grid-cols-8' : 'grid-cols-7'} mx-4 mt-4`}>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger value="productivity" className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Focus</span>
            </TabsTrigger>
            {showCBTTab && (
              <TabsTrigger value="thought-support" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">Thought</span>
              </TabsTrigger>
            )}
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
            {isLegacyFeatureEnabled('debugMode') && (
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

            <TabsContent value="productivity" className="space-y-6 mt-0">
              <ProductivitySettings />
            </TabsContent>

            {showCBTTab && (
              <TabsContent value="thought-support" className="space-y-6 mt-0">
                <ThoughtSupportSettings />
              </TabsContent>
            )}

            <TabsContent value="intelligence" className="space-y-6 mt-0">
              <IntelligenceSettings />
            </TabsContent>

            <TabsContent value="integrations" className="space-y-6 mt-0">
              <IntegrationsSettings />
            </TabsContent>

            <TabsContent value="privacy" className="space-y-6 mt-0">
              <PrivacySecuritySettings />
            </TabsContent>

            {isLegacyFeatureEnabled('debugMode') && (
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