import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Brain, Plug, Shield, Code, Bot, Lock, History, GraduationCap, Eye } from 'lucide-react';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { IntelligenceSettings } from '@/components/IntelligenceSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { PrivacySecuritySettings } from '@/components/settings/PrivacySecuritySettings';
import { AdvancedSettings } from '@/components/settings/AdvancedSettings';
import { AISettings } from '@/components/settings/AISettings';
import { ThoughtSupportSettings } from '@/components/settings/ThoughtSupportSettings';
import { SafetySettings } from '@/components/settings/SafetySettings';
import { AuditSettings } from '@/components/settings/AuditSettings';
import { OnboardingSettings } from '@/components/settings/OnboardingSettings';
import { AccessibilitySettings } from '@/components/settings/AccessibilitySettings';
import { AutoWriteSettings } from '@/components/settings/AutoWriteSettings';
import { useFeatureFlags } from '@/components/FeatureFlags';
import { isFeatureEnabled } from '@/config/flags';

export const Settings: React.FC = () => {
  const { isFeatureEnabled: isLegacyFeatureEnabled } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  const showCBTTab = isFeatureEnabled('cbtAssist') || isFeatureEnabled('cbtSilentObserve');
  const showAdvancedTab = isLegacyFeatureEnabled('debugMode');
  const sections = [
    { value: 'general', label: 'General', icon: SettingsIcon, description: 'Shape a space that feels like yours.', content: GeneralSettings },
    { value: 'accessibility', label: 'Accessibility', icon: Eye, description: 'Adjust motion, readability, and interaction to suit you.', content: AccessibilitySettings },
    { value: 'onboarding', label: 'Learning', icon: GraduationCap, description: 'Find your feet, one small step at a time.', content: OnboardingSettings },
    { value: 'ai', label: 'AI', icon: Bot, description: 'Choose how your assistant helps.', content: AISettings },
    ...(showCBTTab ? [{ value: 'thought-support', label: 'Thought support', icon: Brain, description: 'Choose the support that works for you.', content: ThoughtSupportSettings }] : []),
    { value: 'intelligence', label: 'Intelligence', icon: Brain, description: 'Manage suggestions and contextual assistance.', content: IntelligenceSettings },
    { value: 'autowrite', label: 'Auto-Write', icon: Bot, description: 'Choose your preferences for assisted writing.', content: AutoWriteSettings },
    { value: 'integrations', label: 'Integrations', icon: Plug, description: 'Manage connections to your other tools.', content: IntegrationsSettings },
    { value: 'safety', label: 'Safety', icon: Lock, description: 'Set the boundaries that help you feel comfortable.', content: SafetySettings },
    { value: 'privacy', label: 'Privacy', icon: Shield, description: 'Stay in control of your information.', content: PrivacySecuritySettings },
    { value: 'audit', label: 'Audit', icon: History, description: 'Review activity and decisions.', content: AuditSettings },
    ...(showAdvancedTab ? [{ value: 'advanced', label: 'Advanced', icon: Code, description: 'Diagnostics and developer options.', content: AdvancedSettings }] : []),
  ];
  const requestedTab = searchParams.get('tab');
  const activeSection = sections.find(section => section.value === requestedTab) ?? sections[0];
  const changeSection = (value: string) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', value);
      return next;
    }, { replace: true });
  };

  return (
    <div className="min-h-full min-w-0 bg-background">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Make it yours</p>
          <h1 className="font-display text-3xl tracking-tight">Settings & Privacy</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">A little more comfort. A little less friction. Choose what works for you.</p>
        </div>

        <Tabs value={activeSection.value} onValueChange={changeSection} orientation="vertical" className="grid min-w-0 gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <div className="min-w-0">
            <div className="md:hidden">
              <label htmlFor="settings-section" className="mb-2 block text-sm font-medium">Settings section</label>
              <select id="settings-section" value={activeSection.value} onChange={event => changeSection(event.target.value)} className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {sections.map(section => <option key={section.value} value={section.value}>{section.label}</option>)}
              </select>
            </div>
            <TabsList aria-label="Settings sections" className="hidden h-auto w-full flex-col items-stretch justify-start gap-1 rounded-2xl border border-border/60 bg-card/50 p-2 md:flex">
              {sections.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="min-h-11 justify-start gap-3 rounded-xl px-3 py-2 text-left data-[state=active]:bg-primary/10 data-[state=active]:shadow-none">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="min-w-0">
            <div className="mb-5 border-b border-border/60 pb-4">
              <h2 className="text-xl font-semibold">{activeSection.label}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{activeSection.description}</p>
            </div>
            {sections.map(({ value, content: Content }) => (
              <TabsContent key={value} value={value} className="mt-0 min-w-0 space-y-6"><Content /></TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </div>
  );
};
