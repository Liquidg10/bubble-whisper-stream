import React, { useEffect, useState } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Check, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
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
  const [stepAnnouncement, setStepAnnouncement] = useState('');
  const [formData, setFormData] = useState<OnboardingData>({
    preferences: {
      primaryGoals: []
    },
    routines: [],
    currentChallenges: '',
    personalContext: ''
  });

  const { addBubble } = useBubbleStore();

  useEffect(() => {
    setStepAnnouncement(
      `Step ${currentStep + 1} of ${STEPS.length}: ${STEPS[currentStep].title}`,
    );
  }, [currentStep]);

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
      // Create welcome bubbles first (in-memory storage as fallback)
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

      // Try to save to self model (gracefully handle failures)
      try {
        await selfModelV2Service.updateSelfModel({
          preferences: {
            ...formData.preferences,
            onboardingCompleted: true,
            completedAt: Date.now()
          },
          routines: formData.routines
        }, 'surface');
        console.log('Onboarding data saved to self model');
      } catch (modelError) {
        console.warn('Failed to save to self model, continuing with onboarding:', modelError);
        // Continue without failing - the bubbles are already created
      }

      // Complete onboarding regardless of storage issues
      onComplete(formData);
      onClose();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // Still close the dialog to prevent user being stuck
      onClose();
    }
  };

  const updatePreferences = (
    preferences: Partial<OnboardingData['preferences']>,
  ) => {
    setFormData(prev => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        ...preferences,
      },
    }));
  };

  const updateFormData = <
    Section extends Exclude<keyof OnboardingData, 'preferences'>,
  >(
    section: Section,
    data: OnboardingData[Section],
  ) => {
    setFormData(prev => ({
      ...prev,
      [section]: data,
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
          <DialogDescription>
            {STEPS[currentStep].subtitle}
          </DialogDescription>
        </DialogHeader>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {stepAnnouncement}
        </p>

        <div className="space-y-6">
          <Progress
            value={progress}
            className="h-2"
            aria-label={`Onboarding progress: step ${currentStep + 1} of ${STEPS.length}`}
          />

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
                  onChange={(e) => updatePreferences({ name: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="timezone">Time zone (optional)</Label>
                <Input
                  id="timezone"
                  placeholder="e.g., PST, EST, UTC+2"
                  value={formData.preferences.timeZone || ''}
                  onChange={(e) => updatePreferences({ timeZone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="work-schedule">Work/sleep schedule (optional)</Label>
                <Input
                  id="work-schedule"
                  placeholder="e.g., 9-5 weekdays, night shift, flexible"
                  value={formData.preferences.workSchedule || ''}
                  onChange={(e) => updatePreferences({ workSchedule: e.target.value })}
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
                <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`routine-name-${index}`}>
                      Routine {index + 1}
                    </Label>
                    <Input
                      id={`routine-name-${index}`}
                      placeholder="e.g., Morning coffee"
                      value={routine.name}
                      onChange={(e) => {
                        const updated = [...formData.routines];
                        updated[index] = { ...updated[index], name: e.target.value };
                        updateFormData('routines', updated);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`routine-time-${index}`}>
                      Time for routine {index + 1} (optional)
                    </Label>
                    <Input
                      id={`routine-time-${index}`}
                      placeholder="e.g., 7:30 AM"
                      value={routine.timeOfDay || ''}
                      onChange={(e) => {
                        const updated = [...formData.routines];
                        updated[index] = { ...updated[index], timeOfDay: e.target.value };
                        updateFormData('routines', updated);
                      }}
                    />
                  </div>
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
                  onChange={(e) => updatePreferences({
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
                <Label id="communication-style-label">
                  How do you prefer encouragement and reminders?
                </Label>
                <RadioGroupPrimitive.Root
                  aria-labelledby="communication-style-label"
                  value={formData.preferences.communicationStyle ?? ''}
                  onValueChange={(value) => updatePreferences({
                    communicationStyle: value,
                  })}
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {[
                    { key: 'friend', label: 'Warm and supportive' },
                    { key: 'coach', label: 'Motivating and encouraging' },
                    { key: 'scientist', label: 'Curious and analytical' },
                    { key: 'future-you', label: 'Like wise future you' }
                  ].map(style => (
                    <RadioGroupPrimitive.Item
                      key={style.key}
                      value={style.key}
                      className="group flex min-h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-medium leading-tight text-foreground ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    >
                      <span className="min-w-0 whitespace-normal break-words">
                        {style.label}
                      </span>
                      <RadioGroupPrimitive.Indicator className="shrink-0">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </RadioGroupPrimitive.Indicator>
                    </RadioGroupPrimitive.Item>
                  ))}
                </RadioGroupPrimitive.Root>
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
