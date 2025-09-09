/**
 * PROMPT 11: CBT First-Time Onboarding Banner
 * Build trust from first contact with clear controls and privacy
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { X, Shield, Trash2, Info } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { polishCopy } from '@/utils/copyPolish';
import { useAccessibility } from '@/components/AccessibilityProvider';
import { storageService } from '@/services/storage';

interface CBTOnboardingBannerProps {
  className?: string;
}

export function CBTOnboardingBanner({ className = '' }: CBTOnboardingBannerProps) {
  const { settings, updateSettings } = useBubbleStore();
  const [isVisible, setIsVisible] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<'off' | 'ask' | 'on' | null>(null);
  const { toast } = useToast();
  const { settings: a11ySettings } = useAccessibility();

  // Check if banner should be shown
  useEffect(() => {
    const checkOnboardingState = () => {
      const hasShown = localStorage.getItem('cbt_onboarding_shown');
      const cbtEnabled = settings.cbtSettings?.cbtAssistEnabled;
      const dismissedAt = localStorage.getItem('cbt_onboarding_dismissed_at');
      
      // Show if CBT is enabled but onboarding hasn't been shown
      if (cbtEnabled && !hasShown) {
        setIsVisible(true);
        return;
      }
      
      // Re-offer after 7 days if dismissed
      if (dismissedAt && cbtEnabled) {
        const dismissedTime = parseInt(dismissedAt);
        const weekInMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - dismissedTime > weekInMs) {
          localStorage.removeItem('cbt_onboarding_dismissed_at');
          localStorage.removeItem('cbt_onboarding_shown');
          setIsVisible(true);
        }
      }
    };

    checkOnboardingState();
  }, [settings.cbtSettings?.cbtAssistEnabled]);

  const handleChoice = (choice: 'off' | 'ask' | 'on') => {
    setSelectedChoice(choice);
    
    // Map choice to settings
    const assistLevel = choice === 'off' ? 'off' : choice === 'ask' ? 'subtle' : 'standard';
    const autoLogMode = choice === 'off' ? 'off' : choice === 'ask' ? 'ask' : 'on';
    
    updateSettings({
      cbtSettings: {
        ...settings.cbtSettings,
        cbtAssistEnabled: choice !== 'off',
        assistLevel,
        autoLogMode
      }
    });

    // Store onboarding completion
    localStorage.setItem('cbt_onboarding_shown', 'true');
    localStorage.setItem('cbt_onboarding_choice', choice);
    localStorage.setItem('cbt_onboarding_completed_at', Date.now().toString());

    toast({
      title: polishCopy("Choice saved", "notification"),
      description: choice === 'off' 
        ? "No check-ins will be offered" 
        : choice === 'ask'
        ? "I'll ask before offering support"
        : "Gentle check-ins are ready when helpful"
    });

    // Hide banner after brief delay
    setTimeout(() => setIsVisible(false), 1500);
  };

  const handleDismiss = () => {
    localStorage.setItem('cbt_onboarding_dismissed_at', Date.now().toString());
    setIsVisible(false);
    
    toast({
      title: "Maybe later",
      description: "I'll ask again in a week if you're interested."
    });
  };

  const handleDeleteData = () => {
    // Clear all CBT-related data
    const cbtKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('cbt_') || key.startsWith('ai_cbt_')
    );
    
    cbtKeys.forEach(key => localStorage.removeItem(key));
    
    // Reset CBT settings
    updateSettings({
      cbtSettings: {
        cbtAssistEnabled: false,
        assistLevel: 'off',
        privacyLayer: 'surface',
        autoLogMode: 'off',
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        topicExclusions: [],
        neverInterveneOn: []
      }
    });

    toast({
      title: "Data cleared",
      description: "All thought support data has been removed from your device."
    });
    
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const shouldAnimate = !a11ySettings.reducedMotion;

  return (
    <AnimatePresence>
      {/* Fixed overlay with backdrop */}
      <motion.div
        initial={shouldAnimate ? { opacity: 0 } : undefined}
        animate={shouldAnimate ? { opacity: 1 } : {}}
        exit={shouldAnimate ? { opacity: 0 } : undefined}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
      >
        <motion.div
          initial={shouldAnimate ? { opacity: 0, scale: 0.95, y: 20 } : undefined}
          animate={shouldAnimate ? { opacity: 1, scale: 1, y: 0 } : {}}
          exit={shouldAnimate ? { opacity: 0, scale: 0.95, y: 20 } : undefined}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`w-full max-w-3xl mx-4 ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
        <Card className="border border-primary/20 bg-gradient-to-r from-background to-muted/30">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Would you like gentle check-ins?
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    I've noticed some patterns and would love to offer optional support
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Ask me later"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Benefits */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  <Info className="h-3 w-3 mr-1" />
                  Always dismissible
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Stays on your device
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Learns your preferences
                </Badge>
              </div>
            </div>

            {/* Choice Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Button
                variant={selectedChoice === 'off' ? 'default' : 'outline'}
                onClick={() => handleChoice('off')}
                className="flex-1 justify-start"
              >
                <span className="font-medium">No thanks</span>
                <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                  Keep things as they are
                </span>
              </Button>
              
              <Button
                variant={selectedChoice === 'ask' ? 'default' : 'outline'}
                onClick={() => handleChoice('ask')}
                className="flex-1 justify-start"
              >
                <span className="font-medium">Ask me first</span>
                <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                  I'll check before offering support
                </span>
              </Button>
              
              <Button
                variant={selectedChoice === 'on' ? 'default' : 'outline'}
                onClick={() => handleChoice('on')}
                className="flex-1 justify-start"
              >
                <span className="font-medium">Yes, please</span>
                <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                  Gentle check-ins welcome
                </span>
              </Button>
            </div>

            {/* Privacy Footer */}
            <Alert className="border-muted bg-muted/30">
              <Shield className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span>
                    Everything stays completely private on your device. No data leaves your browser.
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2"
                      onClick={() => window.open('/privacy', '_blank')}
                    >
                      <Info className="h-3 w-3 mr-1" />
                      Learn more
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                      onClick={handleDeleteData}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete everything
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}