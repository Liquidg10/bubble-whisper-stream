import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Volume2, Play, Settings } from 'lucide-react';
import { ttsService } from '@/services/tts';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface VoiceSettingsProps {
  className?: string;
}

type VoiceContext = 'banking' | 'companion' | 'notes' | 'cbt' | 'reminders' | 'glimmers';
type VoiceName = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

const VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy', description: 'Balanced, versatile voice' },
  { value: 'echo', label: 'Echo', description: 'Clear, professional tone' },
  { value: 'fable', label: 'Fable', description: 'Warm, storytelling voice' },
  { value: 'onyx', label: 'Onyx', description: 'Deep, authoritative voice' },
  { value: 'nova', label: 'Nova', description: 'Friendly, compassionate voice' },
  { value: 'shimmer', label: 'Shimmer', description: 'Bright, uplifting voice' }
];

const CONTEXT_DESCRIPTIONS = {
  banking: 'Financial conversations and banking information',
  companion: 'AI companion and supportive conversations',
  notes: 'Reading bubble content and personal notes',
  cbt: 'CBT reframes and therapeutic content',
  reminders: 'Notifications and reminder alerts',
  glimmers: 'Self-compassion messages and positive content'
};

const DEFAULT_VOICE_MAPPING: Record<VoiceContext, VoiceName> = {
  banking: 'onyx',
  companion: 'nova',
  notes: 'shimmer',
  cbt: 'nova',
  reminders: 'echo',
  glimmers: 'shimmer'
};

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ className = '' }) => {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  
  // Initialize voice preferences if not set
  const voicePreferences = settings.voicePreferences || DEFAULT_VOICE_MAPPING;
  const globalVoice = settings.globalVoice || 'nova';
  const voiceVolume = settings.voiceVolume || 0.8;
  const voiceSpeed = settings.voiceSpeed || 1.0;

  const handleVoiceChange = (context: VoiceContext, voice: VoiceName) => {
    const updatedPreferences = { ...voicePreferences, [context]: voice };
    updateSettings({ voicePreferences: updatedPreferences });
  };

  const handleGlobalVoiceChange = (voice: VoiceName) => {
    updateSettings({ globalVoice: voice });
  };

  const handleVolumeChange = (volume: number[]) => {
    updateSettings({ voiceVolume: volume[0] });
  };

  const handleSpeedChange = (speed: number[]) => {
    updateSettings({ voiceSpeed: speed[0] });
  };

  const testVoice = async (voice: VoiceName, context?: VoiceContext) => {
    setTestingVoice(context || 'global');
    
    try {
      const sampleTexts = {
        banking: "Your account balance is $1,234.56. Your recent transaction was processed successfully.",
        companion: "I'm here to support you. How are you feeling today? Remember, you're doing great.",
        notes: "This is a sample note reading. Today I captured some important thoughts about my goals.",
        cbt: "Here's a kinder way to think about this: You're learning and growing every day, and that's perfectly okay.",
        reminders: "Gentle reminder: It's time for your daily reflection. Take a moment when you're ready.",
        glimmers: "Remember to be kind to yourself. You've overcome challenges before, and you can do it again."
      };

      const text = context ? sampleTexts[context] : "This is how your selected voice sounds. How do you like it?";
      
      await ttsService.speak(text, {
        context,
        tone: context === 'cbt' ? 'compassionate' : context === 'companion' ? 'gentle' : 'neutral',
        volume: voiceVolume
      });
      
    } catch (error) {
      toast({
        title: "Voice test failed",
        description: "Unable to play voice sample. Please try again.",
        variant: "destructive"
      });
    } finally {
      setTestingVoice(null);
    }
  };

  const resetToDefaults = () => {
    updateSettings({ 
      voicePreferences: DEFAULT_VOICE_MAPPING,
      globalVoice: 'nova',
      voiceVolume: 0.8,
      voiceSpeed: 1.3
    });
    toast({
      title: "Voice settings reset",
      description: "All voice preferences have been reset to defaults."
    });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          AI Voice Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Global Voice Settings */}
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Default Voice</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Used when no specific context is detected
            </p>
            <div className="flex items-center gap-2">
              <Select value={globalVoice} onValueChange={handleGlobalVoiceChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      <div>
                        <div className="font-medium">{voice.label}</div>
                        <div className="text-xs text-muted-foreground">{voice.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testVoice(globalVoice as VoiceName)}
                disabled={testingVoice === 'global'}
                className="px-3"
              >
                <Play className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-2">
            <Label>Volume: {Math.round(voiceVolume * 100)}%</Label>
            <Slider
              value={[voiceVolume]}
              onValueChange={handleVolumeChange}
              max={1}
              min={0.1}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Speed Control */}
          <div className="space-y-2">
            <Label>Speed: {voiceSpeed}x</Label>
            <Slider
              value={[voiceSpeed]}
              onValueChange={handleSpeedChange}
              max={2.0}
              min={0.5}
              step={0.1}
              className="w-full"
            />
            <div className="flex gap-1 text-xs text-muted-foreground justify-between">
              <span>Relaxed (0.8x)</span>
              <span>Energetic (1.3x)</span>
              <span>Fast (2.0x)</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Context-Specific Voices */}
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Context-Specific Voices</Label>
            <p className="text-xs text-muted-foreground">
              Different voices for different types of content
            </p>
          </div>

          <div className="space-y-3">
            {Object.entries(CONTEXT_DESCRIPTIONS).map(([context, description]) => (
              <div key={context} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Label className="text-sm capitalize">{context}</Label>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {voicePreferences[context as VoiceContext]}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  <Select 
                    value={voicePreferences[context as VoiceContext]} 
                    onValueChange={(voice) => handleVoiceChange(context as VoiceContext, voice as VoiceName)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map((voice) => (
                        <SelectItem key={voice.value} value={voice.value}>
                          {voice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testVoice(voicePreferences[context as VoiceContext], context as VoiceContext)}
                    disabled={testingVoice === context}
                    className="px-3"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Reset Button */}
        <div className="flex justify-center">
          <Button variant="outline" onClick={resetToDefaults}>
            <Settings className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};