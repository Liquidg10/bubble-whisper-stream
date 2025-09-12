import React, { lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBubbleStore } from '@/stores/bubbleStore';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/themes/provider';
import { AccessibilityProvider } from '@/components/AccessibilityProvider';
import { FeatureFlagsProvider } from '@/components/FeatureFlags';
import { ProgressiveOnboardingProvider } from '@/providers/ProgressiveOnboardingProvider';
import { CalmModeProvider } from '@/providers/CalmModeProvider';
import Index from "./pages/Index";
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';
import { Reminders } from './pages/Reminders';
import { Reflection } from './pages/Reflection';
import { CBTWorksheet } from './pages/CBTWorksheet';
import { Joy } from './pages/Joy';
import { Intelligence } from './pages/Intelligence';
import Tools from './pages/Tools';
import NotFound from "./pages/NotFound";
import DevPhotoTest from "./pages/DevPhotoTest";
import DevPhotoIridescent from "./pages/DevPhotoIridescent";
import DevAtomicBasic from "./pages/DevAtomicBasic";
import DevAtomicStress from "./pages/DevAtomicStress";
import DevBubblesBasic from "./pages/DevBubblesBasic";
import DevBubblesStress from "./pages/DevBubblesStress";
import { DevSettings } from "./components/DevSettings";
import DevAtomicUnified from "./pages/DevAtomicUnified";
import { DevAI } from "./pages/DevAI";
import { DevReceipts } from "./pages/DevReceipts";
import DevRealtimeVoice from "./pages/DevRealtimeVoice";
import { DevVision } from "./pages/DevVision";
import { Focus } from "./pages/Focus";
import { DevFocus } from "./pages/DevFocus";
import { DevPrioritizer } from "./pages/DevPrioritizer";
import DevModes from "./pages/DevModes";
import { DevBudget } from "./pages/DevBudget";
import { DevSyncBasic } from "./pages/DevSyncBasic";
import { DevSyncDiff } from "./pages/DevSyncDiff";
import { DevContextEngine } from "./pages/DevContextEngineQA";
import Inbox from "./pages/Inbox";
import Search from "./pages/Search";
import { DevFlags } from "./pages/DevFlags";
import DevCBTObserver from "./pages/DevCBTObserver";
import DevCBTPolicy from "./pages/DevCBTPolicy";
import DevCBTE2E from "./pages/DevCBTE2E";
import DevCBTMetrics from "./pages/DevCBTMetrics";
import TaskAutoWriteDemo from "./pages/TaskAutoWriteDemo";
import DevPolicyEngine from "./pages/DevPolicyEngine";
import DevCalendarSync from "./pages/DevCalendarSyncQA";
import DevAutoWriteCalendar from "./pages/DevAutoWriteCalendar";
import DevTemporalReasoning from "./pages/DevTemporalReasoning";
import { DevGmailIntents } from "./pages/DevGmailIntentsQA";
import DevEmailCompose from "./pages/DevEmailCompose";
import DevRecurringFinance from "./pages/DevRecurringFinance";
import { DevVoiceFirst } from "./pages/DevVoiceFirst";
import DevHealthDashboard from "./pages/DevHealthDashboard";
import DevPlaidRecur from "./pages/DevPlaidRecur";
import DevMetricsAlerts from "./pages/DevMetricsAlerts";
import DevA11yGate from "./pages/DevA11yGate";
import DevContextDrift from "@/pages/DevContextDrift";
import DevFatigueBudgets from "@/pages/DevFatigueBudgets";
import DevWatchHealth from "@/pages/DevWatchHealth";
import DevTaskAdapter from "@/pages/DevTaskAdapter";
import DevViewSDK from "@/pages/DevViewSDK";
import DevE2EGate from "@/pages/DevE2EGate";
import { ListView } from "./pages/ListView";
import KanbanView from "./pages/KanbanView";
import MatrixView from "./pages/MatrixView";
import { DevMenu } from "./components/DevMenu";
import { ReducedMotionEnforcer } from "./components/ReducedMotionEnforcer";
import { useDevMenu } from "./hooks/useDevMenu";
import { AuthCallback } from "./pages/AuthCallback";
import Privacy from "./pages/Privacy";
import { oauthService } from '@/services/oauthService';
import { OnboardingManager } from '@/components/OnboardingManager';

const queryClient = new QueryClient();

const App = () => {
  console.log('App component rendering...');
  const { isOpen: isDevMenuOpen, closeMenu: closeDevMenu } = useDevMenu();
  
  try {
    const initializeStore = useBubbleStore(state => state.initializeStore);
    
    React.useEffect(() => {
      console.log('Initializing store...');
      initializeStore();
      
      // Start OAuth background services
      oauthService.startBackgroundServices().catch(error => {
        console.error('Failed to start OAuth background services:', error);
      });

      // Cleanup on unmount
      return () => {
        oauthService.stopBackgroundServices().catch(error => {
          console.error('Failed to stop OAuth background services:', error);
        });
      };
    }, [initializeStore]);

    return (
      <ThemeProvider defaultTheme="iridescent-soap">
        <AccessibilityProvider>
          <FeatureFlagsProvider>
            <ProgressiveOnboardingProvider>
              <CalmModeProvider>
                <QueryClientProvider client={queryClient}>
                  <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<AppShell />}>
                      <Route index element={<Index />} />
                      <Route path="list" element={<ListView />} />
                      <Route path="kanban" element={<KanbanView />} />
                      <Route path="matrix" element={<MatrixView />} />
                      <Route path="timeline" element={<Timeline />} />
                      <Route path="reminders" element={<Reminders />} />
                      <Route path="reflection" element={<Reflection />} />
                      <Route path="joy" element={<Joy />} />
                      <Route path="intelligence" element={<Intelligence />} />
                      <Route path="tools" element={<Tools />} />
                      <Route path="inbox" element={<Inbox />} />
                      <Route path="search" element={<Search />} />
                      <Route path="cbt-worksheet" element={<CBTWorksheet />} />
                      <Route path="focus" element={<Focus />} />
                      <Route path="settings" element={<Settings />} />
                      {/* Dev routes - now inside AppShell for provider access */}
                      <Route path="dev/photo" element={<DevPhotoTest />} />
                      <Route path="dev/atomic-basic" element={<DevAtomicBasic />} />
                      <Route path="dev/atomic-stress" element={<DevAtomicStress />} />
                      <Route path="dev/ai" element={<DevAI />} />
                      <Route path="dev/receipts" element={<DevReceipts />} />
                      <Route path="dev/atomic-unified" element={<DevAtomicUnified />} />
                      <Route path="dev/bubbles-basic" element={<DevBubblesBasic />} />
                      <Route path="dev/bubbles-stress" element={<DevBubblesStress />} />
                       <Route path="dev/voice" element={<DevRealtimeVoice />} />
                       <Route path="dev/realtime-voice" element={<DevRealtimeVoice />} />
                      <Route path="dev/vision" element={<DevVision />} />
                      <Route path="dev/focus" element={<DevFocus />} />
                      <Route path="dev/prioritizer" element={<DevPrioritizer />} />
                      <Route path="dev/modes" element={<DevModes />} />
                      <Route path="dev/budget" element={<DevBudget />} />
                      <Route path="dev/sync-basic" element={<DevSyncBasic />} />
                      <Route path="dev/sync-diff" element={<DevSyncDiff />} />
                      <Route path="dev/settings" element={<DevSettings />} />
                      <Route path="dev/flags" element={<DevFlags />} />
                      <Route path="dev/cbt-observer" element={<DevCBTObserver />} />
                      <Route path="dev/cbt-policy" element={<DevCBTPolicy />} />
                      <Route path="dev/cbt-e2e" element={<DevCBTE2E />} />
                      <Route path="dev/cbt-metrics" element={<DevCBTMetrics />} />
                        <Route path="dev/context-engine" element={<DevContextEngine />} />
                        <Route path="dev/policy-engine" element={<DevPolicyEngine />} />
                        <Route path="dev/calendar-sync" element={<DevCalendarSync />} />
                        <Route path="dev/auto-write-calendar" element={<DevAutoWriteCalendar />} />
                        <Route path="dev/temporal-reasoning" element={<DevTemporalReasoning />} />
                        <Route path="dev/gmail-intents" element={<DevGmailIntents />} />
                         <Route path="dev/email-compose" element={<DevEmailCompose />} />
                         <Route path="dev/plaid-recur" element={<DevPlaidRecur />} />
                         <Route path="dev/metrics-alerts" element={<DevMetricsAlerts />} />
                         <Route path="dev/recurring-finance" element={<DevRecurringFinance />} />
                         <Route path="dev/voice-first" element={<DevVoiceFirst />} />
                         <Route path="dev/health-dashboard" element={<DevHealthDashboard />} />
                         <Route path="dev/a11y-gate" element={<DevA11yGate />} />
                          <Route path="dev/context-drift" element={<DevContextDrift />} />
                          <Route path="dev/fatigue-budgets" element={<DevFatigueBudgets />} />
                          <Route path="dev/watch-health" element={<DevWatchHealth />} />
                            <Route path="dev/task-adapter" element={<DevTaskAdapter />} />
                        <Route path="dev/view-sdk" element={<DevViewSDK />} />
                        <Route path="dev/e2e-gate" element={<DevE2EGate />} />
                            <Route path="dev/task-auto-write" element={<TaskAutoWriteDemo />} />
                      <Route path="privacy" element={<Privacy />} />
                    </Route>
                     <Route path="auth/callback" element={<AuthCallback />} />
                     <Route path="oauth-callback" element={<AuthCallback />} />
                     <Route path="*" element={<NotFound />} />
                   </Routes>
                    <DevMenu isOpen={isDevMenuOpen} onClose={closeDevMenu} />
                    <OnboardingManager />
                  </BrowserRouter>
                 </TooltipProvider>
               </QueryClientProvider>
             </CalmModeProvider>
           </ProgressiveOnboardingProvider>
        </FeatureFlagsProvider>
      </AccessibilityProvider>
      </ThemeProvider>
    );
  } catch (error) {
    console.error('App render error:', error);
    return (
      <div style={{ padding: '20px' }}>
        <h1>Application Error</h1>
        <p>There was an error loading the application. Please refresh the page.</p>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </div>
    );
  }
};

export default App;
