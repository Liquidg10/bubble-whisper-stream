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
import NotFound from "./pages/NotFound";
import DevPhotoIridescent from "./pages/DevPhotoIridescent";
import DevAtomicBasic from "./pages/DevAtomicBasic";
import DevAtomicStress from "./pages/DevAtomicStress";
import DevBubblesBasic from "./pages/DevBubblesBasic";
import DevBubblesStress from "./pages/DevBubblesStress";
import { DevSettings } from "./components/DevSettings";
import DevAtomicUnified from "./pages/DevAtomicUnified";
import { DevMenu } from "./components/DevMenu";
import { useDevMenu } from "./hooks/useDevMenu";

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
                      <Route path="cbt-worksheet" element={<CBTWorksheet />} />
                      <Route path="settings" element={<Settings />} />
                    </Route>
                    <Route path="/dev/photo" element={<DevPhotoIridescent />} />
                    <Route path="/dev/atomic-basic" element={<DevAtomicBasic />} />
                    <Route path="/dev/atomic-stress" element={<DevAtomicStress />} />
                    <Route path="/dev/atomic-unified" element={<DevAtomicUnified />} />
                    <Route path="/dev/bubbles-basic" element={<DevBubblesBasic />} />
                    <Route path="/dev/bubbles-stress" element={<DevBubblesStress />} />
                    <Route path="/dev/settings" element={<DevSettings />} />
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
