import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Brain, Heart, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useAccessibility } from './AccessibilityProvider';

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  features: string[];
  action?: {
    label: string;
    onClick: () => void;
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Intelligence Layer",
    description: "Your personal cognitive companion that learns and adapts while keeping everything private and local.",
    icon: Brain,
    features: [
      "Local-first processing - nothing leaves your device",
      "Gentle, explainable suggestions",
      "Always optional and customizable",
      "Built for neurodivergent minds"
    ]
  },
  {
    title: "CBT Thought Check",
    description: "Transform spiraling thoughts into balanced perspectives with guided, compassionate reflection.",
    icon: Heart,
    features: [
      "Step-by-step thought examination",
      "Pattern recognition without judgment", 
      "Evidence-based reframing",
      "Optional voice playback for comfort"
    ]
  },
  {
    title: "Self-Compassion Glimmers",
    description: "Receive timely, gentle nudges in your preferred tone when patterns suggest you need support.",
    icon: Zap,
    features: [
      "Supportive, motivational, analytical, or inspiring tones",
      "Frequency caps and quiet hours",
      "Context-aware timing",
      "Because... explanations for transparency"
    ]
  },
  {
    title: "Adaptive Reminders 2.0",
    description: "Reminders that learn from your snooze patterns and adjust their timing and intensity accordingly.",
    icon: Shield,
    features: [
      "Learns from your 'Overwhelmed' signals",
      "Adjusts timing based on your energy patterns",
      "Fatigue guard prevents reminder burnout",
      "Clear explanations for every adjustment"
    ]
  }
];

interface QuickTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickTour({ isOpen, onClose }: QuickTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { updateSettings } = useBubbleStore();
  const { announceText, settings: a11ySettings } = useAccessibility();

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      announceText(`Step ${nextStep + 1}: ${TOUR_STEPS[nextStep].title}`);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      announceText(`Step ${prevStep + 1}: ${TOUR_STEPS[prevStep].title}`);
    }
  };

  const handleFinish = () => {
    // Enable intelligence layer by default after tour
    updateSettings({ intelligenceEnabled: true });
    announceText("Quick tour completed. Intelligence layer enabled.");
    onClose();
  };

  const handleSkip = () => {
    announceText("Quick tour skipped.");
    onClose();
  };

  if (!isOpen) return null;

  const currentStepData = TOUR_STEPS[currentStep];
  const StepIcon = currentStepData.icon;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: a11ySettings.reducedMotion ? 0.1 : 0.3 }}
        className="w-full max-w-lg"
      >
        <Card className="shadow-xl">
          <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <StepIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{currentStepData.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Step {currentStep + 1} of {TOUR_STEPS.length}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Phase 2 Feature
                    </Badge>
                  </div>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-on-surface-variant hover:text-on-surface"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <p className="text-on-surface-variant leading-relaxed">
              {currentStepData.description}
            </p>
            
            <div className="space-y-3">
              <h4 className="font-medium text-on-surface">Key Features:</h4>
              <ul className="space-y-2">
                {currentStepData.features.map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: a11ySettings.reducedMotion ? 0 : index * 0.1,
                      duration: a11ySettings.reducedMotion ? 0.1 : 0.2 
                    }}
                    className="flex items-start gap-2 text-sm text-on-surface-variant"
                  >
                    <span className="text-primary mt-1">•</span>
                    <span>{feature}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
            
            {/* Progress indicator */}
            <div className="flex gap-2 justify-center">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-8 rounded-full transition-all ${
                    index === currentStep 
                      ? 'bg-primary' 
                      : index < currentStep 
                        ? 'bg-primary/50' 
                        : 'bg-surface-variant'
                  }`}
                />
              ))}
            </div>
            
            {/* Navigation */}
            <div className="flex justify-between items-center pt-4">
              <Button
                variant="outline"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <Button
                onClick={handleNext}
                className="flex items-center gap-2"
              >
                {currentStep === TOUR_STEPS.length - 1 ? (
                  'Get Started'
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}