import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Brain, User, MessageSquare, Volume2, Settings } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { VoiceSettings } from '@/components/VoiceSettings';
import { TTSDebugConsole } from '@/components/TTSDebugConsole';

export const AISettings: React.FC = () => {
  const { settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  
  const [systemPrompt, setSystemPrompt] = useState(
    settings.aiSystemPrompt || 
    'You are a helpful, empathetic AI companion designed to support neurodivergent users. Be supportive, non-judgmental, and respectful of individual needs and preferences.'
  );
  
  const [personalInfo, setPersonalInfo] = useState(
    settings.aiPersonalInfo || 
    'Add information about yourself that you want the AI to remember, such as your preferences, goals, challenges, or anything that would help provide better support.'
  );

  const handleSaveSystemPrompt = () => {
    updateSettings({ aiSystemPrompt: systemPrompt });
    toast({
      title: "System prompt updated",
      description: "Your AI customization has been saved."
    });
  };

  const handleSavePersonalInfo = () => {
    updateSettings({ aiPersonalInfo: personalInfo });
    toast({
      title: "Personal information updated", 
      description: "The AI will now remember this information about you."
    });
  };

  const resetSystemPrompt = () => {
    const defaultPrompt = 'You are a helpful, empathetic AI companion designed to support neurodivergent users. Be supportive, non-judgmental, and respectful of individual needs and preferences.';
    setSystemPrompt(defaultPrompt);
    updateSettings({ aiSystemPrompt: defaultPrompt });
    toast({
      title: "System prompt reset",
      description: "Restored to default AI behavior."
    });
  };

  const clearPersonalInfo = () => {
    setPersonalInfo('');
    updateSettings({ aiPersonalInfo: '' });
    toast({
      title: "Personal information cleared",
      description: "The AI will no longer have access to this information."
    });
  };

  return (
    <div className="space-y-6">
      {/* System Prompt Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Personality & Behavior
          </CardTitle>
          <CardDescription>
            Customize how the AI behaves and responds to you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define how the AI should behave, its personality, and approach..."
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This prompt defines the AI's personality, tone, and approach to conversations.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSaveSystemPrompt} size="sm">
              Save Changes
            </Button>
            <Button onClick={resetSystemPrompt} variant="outline" size="sm">
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Memory
          </CardTitle>
          <CardDescription>
            Information about you that the AI should remember
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="personal-info">About You</Label>
            <Textarea
              id="personal-info"
              value={personalInfo}
              onChange={(e) => setPersonalInfo(e.target.value)}
              placeholder="Tell the AI about yourself - your preferences, goals, challenges, communication style, or anything that would help provide better support..."
              className="min-h-[120px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This information helps the AI provide more personalized and relevant support. All data stays local on your device.
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSavePersonalInfo} size="sm">
              Save Information
            </Button>
            <Button onClick={clearPersonalInfo} variant="outline" size="sm">
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Voice Settings */}
      <VoiceSettings />

      <Separator />

      {/* TTS Debug Console */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Voice Diagnostics
          </CardTitle>
          <CardDescription>
            Test and troubleshoot text-to-speech functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TTSDebugConsole />
        </CardContent>
      </Card>
    </div>
  );
};