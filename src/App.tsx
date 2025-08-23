import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBubbleStore } from '@/stores/bubbleStore';
import { AppShell } from '@/components/AppShell';
import Index from "./pages/Index";
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';
import { Reminders } from './pages/Reminders';
import { Reflection } from './pages/Reflection';
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const initializeStore = useBubbleStore(state => state.initializeStore);

  React.useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  return (
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
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
