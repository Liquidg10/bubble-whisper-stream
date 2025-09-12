import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Shield, 
  Eye, 
  Lock, 
  ArrowRight, 
  CheckCircle, 
  AlertTriangle,
  FileText,
  Zap
} from 'lucide-react';
import { privacyConsentService } from '@/services/privacyConsentService';
import { useToast } from '@/hooks/use-toast';

interface PrivacyOnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface ConsentOption {
  id: string;
  label: string;
  description: string;
  required: boolean;
  icon: React.ReactNode;
  privacyLayer: 'surface' | 'context' | 'deep';
}

export function PrivacyOnboardingFlow({ open, onOpenChange, onComplete }: PrivacyOnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const steps = [
    { id: 'welcome', title: 'Welcome to Privacy First', icon: <Shield className="h-5 w-5" /> },
    { id: 'layers', title: 'Privacy Layers', icon: <Eye className="h-5 w-5" /> },
    { id: 'consent', title: 'Your Choices', icon: <CheckCircle className="h-5 w-5" /> },
    { id: 'complete', title: 'All Set!', icon: <Zap className="h-5 w-5" /> }
  ];

  const consentOptions: ConsentOption[] = [
    {
      id: 'surfaceLayer',
      label: 'Surface Layer (Basic Features)',
      description: 'UI preferences, themes, and basic app functionality',
      required: true,
      icon: <Shield className="h-4 w-4 text-green-500" />,
      privacyLayer: 'surface'
    },
    {
      id: 'contextLayer',
      label: 'Context Layer (Smart Features)',
      description: 'Pattern recognition, routine detection, and adaptive suggestions',
      required: false,
      icon: <Eye className="h-4 w-4 text-yellow-500" />,
      privacyLayer: 'context'
    },
    {
      id: 'deepLayer',
      label: 'Deep Layer (Advanced Insights)',
      description: 'Emotional patterns, CBT insights, and personal wellness tracking',
      required: false,
      icon: <Lock className="h-4 w-4 text-red-500" />,
      privacyLayer: 'deep'
    },
    {
      id: 'crashReporting',
      label: 'Crash Reporting',
      description: 'Anonymous error reports to improve app stability (no personal data)',
      required: false,
      icon: <FileText className="h-4 w-4 text-blue-500" />,
      privacyLayer: 'surface'
    }
  ];

  const handleOptionChange = (optionId: string, checked: boolean) => {
    setSelections(prev => ({ ...prev, [optionId]: checked }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    // Apply consent settings
    privacyConsentService.updateConsentSettings({
      telemetryEnabled: selections.contextLayer || false,
      analyticsEnabled: selections.contextLayer || false,
      crashReportingEnabled: selections.crashReporting || false,
      personalDataSharing: selections.deepLayer || false,
      cloudSyncEnabled: false, // Always start disabled
      dataRetentionDays: 30
    });

    toast({
      title: "Privacy settings configured",
      description: "Your privacy preferences have been saved securely",
    });

    onComplete();
    onOpenChange(false);
  };

  const renderWelcomeStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
        <Shield className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Privacy First Design</h3>
        <p className="text-muted-foreground">
          Your data stays on your device. You control what gets processed and how.
        </p>
      </div>
      <div className="space-y-3 text-left">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">100% local processing - no cloud required</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">Granular control over every data type</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">Transparent "Because..." explanations</span>
        </div>
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">One-tap pause, redact, or delete anytime</span>
        </div>
      </div>
    </div>
  );

  const renderLayersStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Three Privacy Layers</h3>
        <p className="text-muted-foreground">
          Choose what level of personalization you're comfortable with
        </p>
      </div>
      
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="h-5 w-5 text-green-500" />
              <span className="font-medium">Surface Layer</span>
              <Badge variant="outline" className="text-xs">Required</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Basic app functionality, themes, and UI preferences. Always processed locally.
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Eye className="h-5 w-5 text-yellow-500" />
              <span className="font-medium">Context Layer</span>
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Pattern recognition, routine detection, and smart suggestions based on your usage.
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <Lock className="h-5 w-5 text-red-500" />
              <span className="font-medium">Deep Layer</span>
              <Badge variant="outline" className="text-xs">Biometric</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Emotional insights, CBT analysis, and wellness patterns. Requires biometric unlock.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderConsentStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Your Privacy Choices</h3>
        <p className="text-muted-foreground">
          Select the features you want to enable. You can change these anytime.
        </p>
      </div>
      
      <div className="space-y-4">
        {consentOptions.map((option) => (
          <div key={option.id} className="flex items-start gap-3 p-3 border rounded-lg">
            <Checkbox
              id={option.id}
              checked={selections[option.id] || option.required}
              onCheckedChange={(checked) => handleOptionChange(option.id, checked as boolean)}
              disabled={option.required}
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {option.icon}
                <span className="font-medium text-sm">{option.label}</span>
                {option.required && (
                  <Badge variant="secondary" className="text-xs">Required</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Remember:</p>
            <p>You can pause, redact, or disable any feature at any time in Settings.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">You're All Set!</h3>
        <p className="text-muted-foreground">
          Your privacy preferences have been configured. The app will respect your choices.
        </p>
      </div>
      <div className="text-left space-y-2">
        <p className="text-sm font-medium">What happens next:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Only enabled features will collect data</li>
          <li>• All processing happens locally on your device</li>
          <li>• You'll see "Because..." explanations for suggestions</li>
          <li>• Privacy controls are always available in Settings</li>
        </ul>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderWelcomeStep();
      case 1:
        return renderLayersStep();
      case 2:
        return renderConsentStep();
      case 3:
        return renderCompleteStep();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {steps[currentStep].icon}
              {steps[currentStep].title}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {currentStep + 1} of {steps.length}
            </Badge>
          </div>
          <DialogDescription>
            <Progress value={((currentStep + 1) / steps.length) * 100} className="h-2 mt-2" />
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {renderStepContent()}
        </div>

        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          
          {currentStep === steps.length - 1 ? (
            <Button onClick={handleComplete}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Setup
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}