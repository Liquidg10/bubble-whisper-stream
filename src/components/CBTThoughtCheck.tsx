// CBT Thought Check Component
// Provides guided reframing with supportive, non-clinical interface

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Volume2, ArrowLeft, ArrowRight, CheckCircle, Lightbulb } from 'lucide-react';
import { CBTEntry, DistortionKey } from '@/types/bubble';
import { cbtService, DISTORTION_DEFINITIONS } from '@/services/cbtService';
import { ttsService } from '@/services/tts';
import { useToast } from '@/hooks/use-toast';

interface CBTThoughtCheckProps {
  initialThought?: string;
  bubbleId?: string;
  onSave?: (entry: CBTEntry) => void;
  onCancel?: () => void;
}

type CBTStep = 'thought' | 'distortions' | 'evidence' | 'reframe' | 'complete';

export const CBTThoughtCheck: React.FC<CBTThoughtCheckProps> = ({
  initialThought = '',
  bubbleId,
  onSave,
  onCancel
}) => {
  const [step, setStep] = useState<CBTStep>('thought');
  const [thought, setThought] = useState(initialThought);
  const [selectedDistortions, setSelectedDistortions] = useState<DistortionKey[]>([]);
  const [evidenceFor, setEvidenceFor] = useState('');
  const [evidenceAgainst, setEvidenceAgainst] = useState('');
  const [reframe, setReframe] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const stepTitles = {
    thought: "What's on your mind?",
    distortions: "Notice any patterns?",
    evidence: "Let's explore this together",
    reframe: "A gentler perspective",
    complete: "Your reframe is ready"
  };

  const stepDescriptions = {
    thought: "Share what you're thinking about - no judgment here",
    distortions: "These are common thinking patterns many people experience",
    evidence: "What supports and challenges this thought?",
    reframe: "How might you see this differently?",
    complete: "You've created a balanced view of the situation"
  };

  const handleNext = () => {
    const steps: CBTStep[] = ['thought', 'distortions', 'evidence', 'reframe', 'complete'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: CBTStep[] = ['thought', 'distortions', 'evidence', 'reframe', 'complete'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleDistortionToggle = (distortion: DistortionKey) => {
    setSelectedDistortions(prev => 
      prev.includes(distortion)
        ? prev.filter(d => d !== distortion)
        : [...prev, distortion]
    );
  };

  const handleSuggestDistortions = () => {
    const suggestions = cbtService.suggestDistortions(thought);
    setSelectedDistortions(suggestions);
    toast({
      title: "Suggestions added",
      description: "Based on common patterns in your thought"
    });
  };

  const handleGenerateReframeSuggestions = async () => {
    const suggestions = await cbtService.generateReframeSuggestions(thought, selectedDistortions);
    if (suggestions.length > 0) {
      setReframe(suggestions[0]); // Use first suggestion
      toast({
        title: "Suggestion added",
        description: "Feel free to modify this to fit your perspective"
      });
    }
  };

  const handleReadAloud = async (text: string) => {
    try {
      await ttsService.speak(text);
    } catch (error) {
      toast({
        title: "Speech unavailable",
        description: "Text-to-speech isn't available right now",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!thought.trim()) return;

    setIsProcessing(true);
    try {
      const entry = await cbtService.createEntry({
        thought: thought.trim(),
        distortions: selectedDistortions,
        evidenceFor: evidenceFor.trim() || undefined,
        evidenceAgainst: evidenceAgainst.trim() || undefined,
        reframe: reframe.trim() || undefined,
        tags: [],
        bubbleId
      });

      toast({
        title: "Thought check saved",
        description: "Your reflection has been saved privately"
      });

      onSave?.(entry);
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Couldn't save your thought check",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'thought': return thought.trim().length > 0;
      case 'distortions': return true; // Optional step
      case 'evidence': return true; // Optional step
      case 'reframe': return true; // Optional step
      default: return true;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            {stepTitles[step]}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {stepDescriptions[step]}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Step: Thought Input */}
          {step === 'thought' && (
            <div className="space-y-4">
              <Textarea
                placeholder="What's going through your mind? Share as much or as little as feels comfortable..."
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                className="min-h-32 resize-none"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This stays private and is only stored on your device
              </p>
            </div>
          )}

          {/* Step: Distortion Selection */}
          {step === 'distortions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm">Select any that feel relevant (or skip this step):</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestDistortions}
                  className="text-xs"
                >
                  <Lightbulb className="h-3 w-3 mr-1" />
                  Suggest
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(DISTORTION_DEFINITIONS).map(([key, def]) => (
                  <Card
                    key={key}
                    className={`cursor-pointer transition-colors ${
                      selectedDistortions.includes(key as DistortionKey)
                        ? 'ring-2 ring-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => handleDistortionToggle(key as DistortionKey)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium">{def.label}</h4>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                        </div>
                        {selectedDistortions.includes(key as DistortionKey) && (
                          <CheckCircle className="h-4 w-4 text-primary mt-0.5" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {selectedDistortions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected patterns:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDistortions.map(distortion => (
                      <Badge key={distortion} variant="secondary">
                        {DISTORTION_DEFINITIONS[distortion].label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Evidence Exploration */}
          {step === 'evidence' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    What experiences make this thought feel true?
                  </label>
                  <Textarea
                    placeholder="What evidence supports this way of thinking? (optional)"
                    value={evidenceFor}
                    onChange={(e) => setEvidenceFor(e.target.value)}
                    className="min-h-20 resize-none"
                  />
                </div>
                
                <Separator />
                
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    What experiences challenge this thought?
                  </label>
                  <Textarea
                    placeholder="What would you tell a friend having this thought? (optional)"
                    value={evidenceAgainst}
                    onChange={(e) => setEvidenceAgainst(e.target.value)}
                    className="min-h-20 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step: Reframe */}
          {step === 'reframe' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  What's a gentler way to think about this?
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateReframeSuggestions}
                  className="text-xs"
                >
                  <Lightbulb className="h-3 w-3 mr-1" />
                  Suggest
                </Button>
              </div>
              
              <Textarea
                placeholder="How might you see this differently in a year? What would be a more balanced perspective?"
                value={reframe}
                onChange={(e) => setReframe(e.target.value)}
                className="min-h-24 resize-none"
              />
              
              {reframe && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReadAloud(reframe)}
                  className="self-start"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  Read kindly
                </Button>
              )}
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-lg">
                <h3 className="font-medium mb-2">Your original thought:</h3>
                <p className="text-sm text-muted-foreground mb-4">{thought}</p>
                
                {reframe && (
                  <>
                    <h3 className="font-medium mb-2">Your gentler perspective:</h3>
                    <p className="text-sm">{reframe}</p>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReadAloud(reframe)}
                      className="mt-3"
                    >
                      <Volume2 className="h-4 w-4 mr-2" />
                      Read kindly
                    </Button>
                  </>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                You can always come back and add more thoughts or adjust your perspective
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              onClick={step === 'thought' ? onCancel : handleBack}
              disabled={isProcessing}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {step === 'thought' ? 'Cancel' : 'Back'}
            </Button>

            <div className="flex gap-2">
              {step !== 'complete' ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || isProcessing}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Saving...' : 'Save reflection'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};