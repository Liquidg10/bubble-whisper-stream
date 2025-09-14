/**
 * Cast Integration Demo - Shows unified AI with all Cast components
 * Demonstrates the complete Cast system in action
 */

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  MessageSquare, 
  Brain, 
  Wind, 
  Lightbulb, 
  Sparkles,
  Send,
  RefreshCw
} from 'lucide-react';
import { castSynthesizer } from '@/services/castSynthesizer';
import { castCopyPolish } from '@/services/castCopyPolish';
import { BreathPromptCard } from '@/components/BreathPromptCard';
import { MicroCelebrationPulse, useMicroCelebration } from '@/components/MicroCelebrationPulse';
import { ImplementationIntentionChip } from '@/components/ImplementationIntentionChip';
import { ProgressiveDisclosure } from '@/components/ProgressiveDisclosure';
import { useToast } from '@/hooks/use-toast';

export const CastIntegrationDemo: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [castResponse, setCastResponse] = useState<any>(null);
  const [polishedCopy, setPolishedCopy] = useState<any>(null);
  const [showBreathPrompt, setShowBreathPrompt] = useState(false);
  const [showImplementation, setShowImplementation] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { toast } = useToast();
  const { 
    celebration, 
    triggerCompletionGlow, 
    MicroCelebrationComponent 
  } = useMicroCelebration();

  const handleSubmit = async () => {
    if (!userInput.trim()) return;
    
    setIsProcessing(true);
    
    try {
      // Demonstrate Cast Synthesizer
      const castInput = {
        userId: 'demo-user',
        messageText: userInput,
        currentContext: {
          timeOfDay: getCurrentTimeOfDay(),
          energyLevel: inferEnergyFromText(userInput),
          taskCount: 3
        },
        userPersona: inferPersonaFromText(userInput)
      };

      const response = await castSynthesizer.synthesizeResponse(castInput);
      setCastResponse(response);

      // Demonstrate Copy Polish
      const copyContext = {
        situation: 'guidance' as const,
        userPersona: castInput.userPersona,
        energyLevel: castInput.currentContext.energyLevel,
        timeOfDay: castInput.currentContext.timeOfDay
      };

      const polished = castCopyPolish.polishCopy(response.message, copyContext);
      setPolishedCopy(polished);

      // Show relevant UI components based on Cast response
      if (response.breathPrompt?.show) {
        setShowBreathPrompt(true);
      }

      if (response.implementationIntention?.show) {
        setShowImplementation(true);
      }

      if (response.microCelebration?.show) {
        triggerCompletionGlow(response.microCelebration.message);
      }

      toast({
        title: "Cast Response Generated",
        description: `${response.metadata.castMembersActive.length} Cast members contributed`,
        duration: 3000
      });

    } catch (error) {
      console.error('Cast demo error:', error);
      toast({
        title: "Error",
        description: "Failed to process Cast response",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getCurrentTimeOfDay = (): 'morning' | 'afternoon' | 'evening' | 'night' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  };

  const inferEnergyFromText = (text: string): 'low' | 'medium' | 'high' => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('tired') || lowerText.includes('exhausted')) return 'low';
    if (lowerText.includes('energized') || lowerText.includes('excited')) return 'high';
    return 'medium';
  };

  const inferPersonaFromText = (text: string): 'executive' | 'parent' | 'builder' | 'mixed' => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('meeting') || lowerText.includes('deadline')) return 'executive';
    if (lowerText.includes('kids') || lowerText.includes('family')) return 'parent';
    if (lowerText.includes('build') || lowerText.includes('create')) return 'builder';
    return 'mixed';
  };

  const handleReset = () => {
    setUserInput('');
    setCastResponse(null);
    setPolishedCopy(null);
    setShowBreathPrompt(false);
    setShowImplementation(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Cast System Demo
        </h1>
        <p className="text-muted-foreground">
          Unified AI assistant with multi-expert synthesis
        </p>
      </div>

      {/* Input Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Your message to the AI assistant:
            </label>
            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g., 'I'm feeling overwhelmed with my tasks today' or 'I want to plan my morning routine'"
              className="min-h-[100px]"
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleSubmit}
              disabled={!userInput.trim() || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Process with Cast
            </Button>
            
            <Button 
              onClick={handleReset}
              variant="outline"
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Cast Response Display */}
      {castResponse && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Cast Synthesis Results
          </h2>

          {/* Main Response */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">AI Assistant Response</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    Confidence: {Math.round(castResponse.confidence * 100)}%
                  </Badge>
                  <Badge variant={castResponse.tone === 'encouraging' ? 'default' : 'secondary'}>
                    {castResponse.tone}
                  </Badge>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-foreground">{castResponse.message}</p>
              </div>

              {castResponse.becauseText && (
                <div className="text-sm text-muted-foreground">
                  <strong>Because:</strong> {castResponse.becauseText}
                </div>
              )}
            </div>
          </Card>

          {/* Active Cast Members */}
          <Card className="p-6">
            <h3 className="font-medium mb-3">Active Cast Members</h3>
            <div className="flex flex-wrap gap-2">
              {castResponse.metadata.castMembersActive.map((member: string) => (
                <Badge key={member} variant="outline" className="flex items-center gap-1">
                  {member === 'Clinical Psych' && <Brain className="h-3 w-3" />}
                  {member === 'Buddhist/Breathwork' && <Wind className="h-3 w-3" />}
                  {member === 'Positive Psych' && <Lightbulb className="h-3 w-3" />}
                  {member === 'Neurologist' && <Sparkles className="h-3 w-3" />}
                  {member}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Copy Polish Results */}
          {polishedCopy && (
            <ProgressiveDisclosure
              title="Copy Polish Analysis"
              summary={`Applied ${polishedCopy.castInfluences.length} expert perspectives`}
              level="context"
            >
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-sm mb-2">Polished Message:</h4>
                  <div className="p-3 bg-muted rounded text-sm">
                    {polishedCopy.message}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-2">Cast Influences:</h4>
                  <div className="flex flex-wrap gap-1">
                    {polishedCopy.castInfluences.map((influence: string) => (
                      <Badge key={influence} variant="secondary" className="text-xs">
                        {influence}
                      </Badge>
                    ))}
                  </div>
                </div>

                {polishedCopy.becauseText && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Because:</strong> {polishedCopy.becauseText}
                  </div>
                )}
              </div>
            </ProgressiveDisclosure>
          )}
        </div>
      )}

      {/* Interactive Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breath Prompt */}
        {showBreathPrompt && castResponse?.breathPrompt && (
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Wind className="h-4 w-4" />
              Buddhist/Breathwork Integration
            </h3>
            <BreathPromptCard
              type={castResponse.breathPrompt.type}
              trigger={castResponse.breathPrompt.trigger}
              onComplete={() => setShowBreathPrompt(false)}
              onDismiss={() => setShowBreathPrompt(false)}
            />
          </div>
        )}

        {/* Implementation Intention */}
        {showImplementation && castResponse?.implementationIntention && (
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Positive Psychology Integration
            </h3>
            <ImplementationIntentionChip
              ifThen={castResponse.implementationIntention.ifThen}
              context="planning"
              expanded={true}
              onDismiss={() => setShowImplementation(false)}
            />
          </div>
        )}
      </div>

      {/* Micro Celebration */}
      <MicroCelebrationComponent />
      
      {/* Quick Test Buttons */}
      <Card className="p-4">
        <h3 className="font-medium mb-3">Quick Test Scenarios</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setUserInput("I'm feeling overwhelmed with work today")}
          >
            Overwhelmed Executive
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setUserInput("Need to plan morning routine with kids")}
          >
            Parent Planning
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setUserInput("Ready to build something amazing today")}
          >
            Builder Energy
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CastIntegrationDemo;