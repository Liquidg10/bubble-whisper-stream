import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { selfModelV2Service } from '@/services/selfModelV2Service';
import { useBubbleStore } from '@/stores/bubbleStore';

interface OnboardingData {
  preferences: {
    name?: string;
    workSchedule?: string;
    communicationStyle?: string;
    primaryGoals?: string[];
    timeZone?: string;
  };
  routines: Array<{
    name: string;
    timeOfDay?: string;
  }>;
  currentChallenges?: string;
  personalContext?: string;
}

interface OnboardingDataWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: OnboardingData) => void;
}

const STEPS = [
  { title: 'Welcome', subtitle: 'Let\'s personalize your experience' },
  { title: 'Basic Info', subtitle: 'Tell us about yourself' },
  { title: 'Daily Routine', subtitle: 'Your typical day' },
  { title: 'Goals & Challenges', subtitle: 'What matters to you' },
  { title: 'Communication Style', subtitle: 'How you prefer to interact' },
];

export const OnboardingDataWizard: React.FC<OnboardingDataWizardProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<OnboardingData>({
    preferences: {
      primaryGoals: []
    },
    routines: [],
    currentChallenges: '',
    personalContext: ''
  });

  const { addBubble } = useBubbleStore();

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    try {
      // Save to self model
      await selfModelV2Service.updateSelfModel({
        preferences: {
          ...formData.preferences,
          onboardingCompleted: true,
          completedAt: Date.now()
        },
        routines: formData.routines
      }, 'surface');

      // Create welcome bubbles
      if (formData.preferences.name) {
        addBubble({
          id: `welcome-${Date.now()}`,
          content: `Welcome ${formData.preferences.name}! 🎉\n\nYour personalized workspace is ready. Try voice commands or explore the tools below.`,
          type: 'Thought' as const,
          x: Math.random() * 300 + 100,
          y: Math.random() * 200 + 100,
          size: 0.8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          completed: false
        });
      }

      // Add routine reminder bubbles
      formData.routines.forEach((routine, index) => {
        addBubble({
          id: `routine-${Date.now()}-${index}`,
          content: `${routine.name}${routine.timeOfDay ? `\nScheduled for ${routine.timeOfDay}` : '\nClick to set a time'}`,
          type: 'ReminderNote' as const,
          x: Math.random() * 400 + 150,
          y: Math.random() * 300 + 150,
          size: 0.6,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          completed: false
        });
      });

      onComplete(formData);
      onClose();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    }
  };

  const updateFormData = (section: keyof OnboardingData, data: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: section === 'preferences' && typeof prev[section] === 'object' && prev[section] !== null
        ? { ...prev[section], ...data }
        : data
    }));
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {STEPS[currentStep].title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{STEPS[currentStep].subtitle}</p>
        </DialogHeader>

        <div className="space-y-6">
          <Progress value={progress} className="h-2" />

          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="text-center space-y-4">
              <div className="text-6xl">🫧</div>
              <h3 className="text-lg font-medium">Welcome to Mind Manual</h3>
              <p className="text-muted-foreground">
                To give you the most personalized experience, we'd like to learn a bit about you. 
                This helps us provide better suggestions and create glimmers that actually resonate.
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>✓ Your data stays private and local</p>
                <p>✓ You can edit or delete anything later</p>
                <p>✓ Skip any questions you're not comfortable with</p>
              </div>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">What should we call you?</Label>
                <Input
                  id="name"
                  placeholder="Your name or nickname"
                  value={formData.preferences.name || ''}
                  onChange={(e) => updateFormData('preferences', { name: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="timezone">Time zone (optional)</Label>
                <Input
                  id="timezone"
                  placeholder="e.g., PST, EST, UTC+2"
                  value={formData.preferences.timeZone || ''}
                  onChange={(e) => updateFormData('preferences', { timeZone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="work-schedule">Work/sleep schedule (optional)</Label>
                <Input
                  id="work-schedule"
                  placeholder="e.g., 9-5 weekdays, night shift, flexible"
                  value={formData.preferences.workSchedule || ''}
                  onChange={(e) => updateFormData('preferences', { workSchedule: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Step 2: Routines */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                What are some key parts of your daily routine? These help us understand when to offer assistance.
              </p>
              
              {formData.routines.map((routine, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Routine (e.g., Morning coffee)"
                    value={routine.name}
                    onChange={(e) => {
                      const updated = [...formData.routines];
                      updated[index] = { ...updated[index], name: e.target.value };
                      updateFormData('routines', updated);
                    }}
                  />
                  <Input
                    placeholder="Time (e.g., 7:30 AM)"
                    value={routine.timeOfDay || ''}
                    onChange={(e) => {
                      const updated = [...formData.routines];
                      updated[index] = { ...updated[index], timeOfDay: e.target.value };
                      updateFormData('routines', updated);
                    }}
                  />
                </div>
              ))}
              
              <Button
                variant="outline"
                onClick={() => updateFormData('routines', [...formData.routines, { name: '', timeOfDay: '' }])}
                className="w-full"
              >
                Add Routine
              </Button>
            </div>
          )}

          {/* Step 3: Goals & Challenges */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="goals">What are your main goals right now? (optional)</Label>
                <Textarea
                  id="goals"
                  placeholder="e.g., Better work-life balance, stay organized, learn new skills..."
                  value={formData.preferences.primaryGoals?.join(', ') || ''}
                  onChange={(e) => updateFormData('preferences', { 
                    primaryGoals: e.target.value.split(',').map(g => g.trim()).filter(Boolean)
                  })}
                />
              </div>

              <div>
                <Label htmlFor="challenges">Current challenges or stress points? (optional)</Label>
                <Textarea
                  id="challenges"
                  placeholder="What's on your mind lately? This helps us provide better support."
                  value={formData.currentChallenges || ''}
                  onChange={(e) => updateFormData('currentChallenges', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 4: Communication Style */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <Label>How do you prefer encouragement and reminders?</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { key: 'friend', label: 'Like a supportive friend' },
                    { key: 'coach', label: 'Like a motivating coach' },
                    { key: 'scientist', label: 'Curious and analytical' },
                    { key: 'future-you', label: 'Like wise future you' }
                  ].map(style => (
                    <Button
                      key={style.key}
                      variant={formData.preferences.communicationStyle === style.key ? 'default' : 'outline'}
                      onClick={() => updateFormData('preferences', { communicationStyle: style.key })}
                      className="h-auto p-3 text-left"
                    >
                      {style.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="context">Anything else we should know? (optional)</Label>
                <Textarea
                  id="context"
                  placeholder="Personal preferences, things to avoid, or anything that would help us support you better"
                  value={formData.personalContext || ''}
                  onChange={(e) => updateFormData('personalContext', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext} className="flex items-center gap-2">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Complete Setup
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};