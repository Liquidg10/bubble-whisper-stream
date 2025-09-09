import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings as SettingsIcon, 
  Brain, 
  Plug, 
  Shield, 
  Code,
  Bot,
  Timer,
  Home,
  Lock,
  History,
  GraduationCap,
  Eye
} from 'lucide-react';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { IntelligenceSettings } from '@/components/IntelligenceSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { PrivacySecuritySettings } from '@/components/settings/PrivacySecuritySettings';
import { AdvancedSettings } from '@/components/settings/AdvancedSettings';
import { AISettings } from '@/components/settings/AISettings';
import { ThoughtSupportSettings } from '@/components/settings/ThoughtSupportSettings';
import { PomodoroSettings } from '@/components/settings/PomodoroSettings';
import { CleanHouseSettings } from '@/components/settings/CleanHouseSettings';
import { SafetySettings } from '@/components/settings/SafetySettings';
import { AuditSettings } from '@/components/settings/AuditSettings';
import { OnboardingSettings } from '@/components/settings/OnboardingSettings';
import { AccessibilitySettings } from '@/components/settings/AccessibilitySettings';
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
          <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <TabsList className="inline-flex h-12 items-center justify-start w-full p-1 text-muted-foreground bg-transparent overflow-x-auto scrollbar-none mx-4">
              <TabsTrigger value="general" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <SettingsIcon className="h-4 w-4" />
                <span>General</span>
              </TabsTrigger>
              <TabsTrigger value="onboarding" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <GraduationCap className="h-4 w-4" />
                <span>Learning</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Bot className="h-4 w-4" />
                <span>AI</span>
              </TabsTrigger>
              <TabsTrigger value="pomodoro" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Timer className="h-4 w-4" />
                <span>Pomodoro</span>
              </TabsTrigger>
              <TabsTrigger value="cleanhouse" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Home className="h-4 w-4" />
                <span>Clean House</span>
              </TabsTrigger>
              {showCBTTab && (
                <TabsTrigger value="thought-support" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                  <Brain className="h-4 w-4" />
                  <span>Thought</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="intelligence" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Brain className="h-4 w-4" />
                <span>Intelligence</span>
              </TabsTrigger>
              <TabsTrigger value="integrations" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Plug className="h-4 w-4" />
                <span>Integrations</span>
              </TabsTrigger>
              <TabsTrigger value="safety" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Lock className="h-4 w-4" />
                <span>Safety</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <History className="h-4 w-4" />
                <span>Audit</span>
              </TabsTrigger>
              <TabsTrigger value="privacy" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Shield className="h-4 w-4" />
                <span>Privacy</span>
              </TabsTrigger>
              <TabsTrigger value="accessibility" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                <Eye className="h-4 w-4" />
                <span>A11y</span>
              </TabsTrigger>
              {isLegacyFeatureEnabled('debugMode') && (
                <TabsTrigger value="advanced" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-2 min-w-fit">
                  <Code className="h-4 w-4" />
                  <span>Advanced</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="general" className="space-y-6 mt-0">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="onboarding" className="space-y-6 mt-0">
              <OnboardingSettings />
            </TabsContent>

            <TabsContent value="ai" className="space-y-6 mt-0">
              <AISettings />
            </TabsContent>

            <TabsContent value="pomodoro" className="space-y-6 mt-0">
              <PomodoroSettings />
            </TabsContent>

            <TabsContent value="cleanhouse" className="space-y-6 mt-0">
              <CleanHouseSettings />
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

            <TabsContent value="safety" className="space-y-6 mt-0">
              <SafetySettings />
            </TabsContent>

            <TabsContent value="audit" className="space-y-6 mt-0">
              <AuditSettings />
            </TabsContent>

            <TabsContent value="privacy" className="space-y-6 mt-0">
              <PrivacySecuritySettings />
            </TabsContent>

            <TabsContent value="accessibility" className="space-y-6 mt-0">
              <AccessibilitySettings />
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