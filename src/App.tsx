import React from 'react';
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
import { DevContextEngine } from "./pages/DevContextEngine";
import Inbox from "./pages/Inbox";
import Search from "./pages/Search";
import { DevFlags } from "./pages/DevFlags";
import DevCBTObserver from "./pages/DevCBTObserver";
import DevCBTPolicy from "./pages/DevCBTPolicy";
import DevCBTE2E from "./pages/DevCBTE2E";
import DevCBTMetrics from "./pages/DevCBTMetrics";
import DevPolicyEngine from "./pages/DevPolicyEngine";
import DevCalendarSync from "./pages/DevCalendarSync";
import DevAutoWriteCalendar from "./pages/DevAutoWriteCalendar";
import DevTemporalReasoning from "./pages/DevTemporalReasoning";
import { DevMenu } from "./components/DevMenu";
import { useDevMenu } from "./hooks/useDevMenu";
import { AuthCallback } from "./pages/AuthCallback";
import Privacy from "./pages/Privacy";

const queryClient = new QueryClient();

const App = () => {
  console.log('App component rendering...');
  const { isOpen: isDevMenuOpen, closeMenu: closeDevMenu } = useDevMenu();
  
  try {
    const initializeStore = useBubbleStore(state => state.initializeStore);
    
    React.useEffect(() => {
      console.log('Initializing store...');
      initializeStore();
    }, [initializeStore]);

    return (
      <ThemeProvider defaultTheme="iridescent-soap">
        <AccessibilityProvider>
          <FeatureFlagsProvider>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<AppShell />}>
                      <Route index element={<Index />} />
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
                      <Route path="privacy" element={<Privacy />} />
                    </Route>
                    <Route path="auth/callback" element={<AuthCallback />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
                <DevMenu isOpen={isDevMenuOpen} onClose={closeDevMenu} />
              </TooltipProvider>
            </QueryClientProvider>
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
