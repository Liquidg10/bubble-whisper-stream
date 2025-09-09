import React, { useState } from 'react';
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
          <TabsList className={`grid w-full ${showCBTTab ? 'grid-cols-13' : 'grid-cols-12'} mx-4 mt-4`}>
            <TabsTrigger value="general" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="onboarding" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">Learning</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger value="pomodoro" className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Pomodoro</span>
            </TabsTrigger>
            <TabsTrigger value="cleanhouse" className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Clean House</span>
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
            <TabsTrigger value="safety" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Safety</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="accessibility" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">A11y</span>
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