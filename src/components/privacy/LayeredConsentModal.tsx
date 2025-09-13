/**
 * Layered Consent Modal - Progressive privacy control
 * Surface/Context/Deep data layer consent with clear explanations
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, Brain, Lock } from 'lucide-react';
import { privacyConsentService } from '@/services/privacyConsentService';
import { useToast } from '@/hooks/use-toast';

interface LayeredConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ConsentLayer {
  id: 'surface' | 'context' | 'deep';
  title: string;
  icon: React.ComponentType<any>;
  description: string;
  examples: string[];
  dataTypes: string[];
  retention: string;
  required: boolean;
}

const CONSENT_LAYERS: ConsentLayer[] = [
  {
    id: 'surface',
    title: 'Surface Layer',
    icon: Eye,
    description: 'Basic functionality data that stays on your device',
    examples: ['Task titles', 'Due dates', 'Completion status'],
    dataTypes: ['Task metadata', 'UI preferences', 'Basic settings'],
    retention: 'Until you delete',
    required: true
  },
  {
    id: 'context',
    title: 'Context Layer', 
    icon: Brain,
    description: 'Pattern recognition to improve suggestions',
    examples: ['Time preferences', 'Category patterns', 'Completion habits'],
    dataTypes: ['Usage patterns', 'Timing preferences', 'Workflow habits'],
    retention: '30 days (auto-purge)',
    required: false
  },
  {
    id: 'deep',
    title: 'Deep Layer',
    icon: Lock,
    description: 'Full behavioral analysis for personalized assistance',
    examples: ['Mood patterns', 'Stress indicators', 'Energy cycles'],
    dataTypes: ['Behavioral analytics', 'Emotional context', 'Personal insights'],
    retention: '90 days (encrypted)',
    required: false
  }
];

export const LayeredConsentModal: React.FC<LayeredConsentModalProps> = ({
  open,
  onOpenChange,
  onComplete
}) => {
  const [consents, setConsents] = useState<Record<string, boolean>>({
    surface: true, // Required layer
    context: false,
    deep: false
  });
  const [step, setStep] = useState<'intro' | 'layers' | 'summary'>('intro');
  const { toast } = useToast();

  const handleConsentChange = (layerId: string, enabled: boolean) => {
    setConsents(prev => ({ ...prev, [layerId]: enabled }));
  };

  const handleNext = () => {
    if (step === 'intro') setStep('layers');
    else if (step === 'layers') setStep('summary');
  };

  const handleBack = () => {
    if (step === 'layers') setStep('intro');
    else if (step === 'summary') setStep('layers');
  };

  const handleComplete = async () => {
    try {
      // Update consent settings
      await privacyConsentService.updateConsentSettings({});

      toast({
        title: "Privacy settings saved",
        description: "Your data collection preferences have been updated"
      });

      onComplete?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error saving settings",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const renderIntro = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <Shield className="mx-auto h-12 w-12 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Your Privacy, Your Choice</h3>
          <p className="text-muted-foreground mt-2">
            We believe in complete transparency about data collection. 
            Choose what feels right for you - you can change these anytime.
          </p>
        </div>
      </div>
      
      <div className="bg-muted/30 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Our Promise</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• All data stays on your device by default</li>
          <li>• No tracking or ads, ever</li>
          <li>• You can export or delete everything</li>
          <li>• Clear explanations for every data use</li>
        </ul>
      </div>
    </div>
  );

  const renderLayers = () => (
    <div className="space-y-4">
      {CONSENT_LAYERS.map((layer) => {
        const Icon = layer.icon;
        return (
          <Card key={layer.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">{layer.title}</CardTitle>
                    <Badge variant={layer.required ? "default" : "secondary"} className="mt-1">
                      {layer.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                </div>
                <Switch
                  checked={consents[layer.id]}
                  onCheckedChange={(enabled) => handleConsentChange(layer.id, enabled)}
                  disabled={layer.required}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="mb-3">
                {layer.description}
              </CardDescription>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Examples: </span>
                  <span className="text-muted-foreground">
                    {layer.examples.join(', ')}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Retention: </span>
                  <span className="text-muted-foreground">{layer.retention}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const renderSummary = () => {
    const enabledLayers = CONSENT_LAYERS.filter(layer => consents[layer.id]);
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Privacy Summary</h3>
          <p className="text-muted-foreground">
            You've chosen to enable {enabledLayers.length} of {CONSENT_LAYERS.length} data layers
          </p>
        </div>

        <div className="space-y-3">
          {enabledLayers.map((layer) => {
            const Icon = layer.icon;
            return (
              <div key={layer.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Icon className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{layer.title}</div>
                  <div className="text-sm text-muted-foreground">{layer.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
          <p className="text-sm text-muted-foreground">
            <strong>Remember:</strong> You can change these settings anytime in Privacy Settings, 
            export all your data, or delete specific layers instantly.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Privacy & Data Controls</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex justify-center space-x-2">
            {['intro', 'layers', 'summary'].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full ${
                  step === s ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          {step === 'intro' && renderIntro()}
          {step === 'layers' && renderLayers()}
          {step === 'summary' && renderSummary()}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 'intro'}
            >
              Back
            </Button>
            
            {step === 'summary' ? (
              <Button onClick={handleComplete}>
                Save Privacy Settings
              </Button>
            ) : (
              <Button onClick={handleNext}>
                {step === 'layers' ? 'Review Summary' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};