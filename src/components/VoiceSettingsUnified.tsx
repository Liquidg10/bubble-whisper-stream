/**
 * Voice Settings Unified - Central voice configuration for all components
 * Phase 2: Unified settings management for voice system
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useBubbleStore } from '@/stores/bubbleStore';
import { flags, toggleFeatureFlag } from '@/config/flags';
import { audioSessionManager } from '@/services/voiceSessionManager';
import { voiceHotkeyManager } from '@/services/voiceHotkeyManager';
import { Mic, Volume2, Keyboard, Zap, Shield, Bug } from 'lucide-react';
import { toast } from 'sonner';

export const VoiceSettingsUnified: React.FC = () => {
  const { settings, updateSettings } = useBubbleStore();
  
  // Voice settings with defaults
  const voiceAutoCommit = settings.voiceAutoCommit ?? false;
  const voiceHotkey = settings.voiceHotkey ?? 'Space';
  const voiceConfidenceThreshold = settings.voiceConfidenceThreshold ?? 0.7;
  const voiceFeedbackLevel = settings.voiceFeedbackLevel ?? 'standard';
  const voiceTTSEnabled = settings.voiceTTSEnabled ?? false;
  const voiceWebSpeechEnabled = settings.voiceWebSpeechEnabled ?? true;
  const voiceWhisperEnabled = settings.voiceWhisperEnabled ?? false;
  const voiceBackendPreference = settings.voiceBackendPreference ?? 'auto';
  const voiceDebugMode = settings.voiceDebugMode ?? false;
  const voiceSessionTimeout = settings.voiceSessionTimeout ?? 30000;

  // Get current session status
  const currentSession = audioSessionManager.getCurrentSession();
  
  const updateVoiceSetting = (key: string, value: any) => {
    updateSettings({ [key]: value });
    
    // Update hotkey manager if hotkey changed
    if (key === 'voiceHotkey') {
      voiceHotkeyManager.setHotkey(value);
    }
    
    toast.success('Voice setting updated');
  };

  const testVoice = async () => {
    try {
      const testText = `Voice settings test. Auto-commit is ${voiceAutoCommit ? 'enabled' : 'disabled'}. Confidence threshold is ${Math.round(voiceConfidenceThreshold * 100)} percent.`;
      
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(testText);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        speechSynthesis.speak(utterance);
      } else {
        toast.error('Text-to-speech not supported in this browser');
      }
    } catch (error) {
      console.error('Voice test failed:', error);
      toast.error('Voice test failed');
    }
  };

  const forceReleaseSession = () => {
    audioSessionManager.forceReleaseSession('user_action');
    toast.success('Voice session force released');
  };

  return (
    <div className="space-y-6">
      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Voice System Status
          </CardTitle>
          <CardDescription>
            Current state of the unified voice engine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Engine</Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={flags.VOICE_ENGINE_UNIFIED ? 'default' : 'secondary'}>
                  {flags.VOICE_ENGINE_UNIFIED ? 'Unified' : 'Legacy'}
                </Badge>
              </div>
            </div>
            
            <div>
              <Label className="text-muted-foreground">Session</Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={currentSession ? 'destructive' : 'outline'}>
                  {currentSession ? `Busy (${currentSession.source})` : 'Available'}
                </Badge>
                {currentSession && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={forceReleaseSession}
                    className="h-6 text-xs"
                  >
                    Release
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={flags.VOICE_SESSION_LOCK ? 'default' : 'secondary'}>
              Session Lock
            </Badge>
            <Badge variant={flags.VOICE_HOTKEY_UNIFIED ? 'default' : 'secondary'}>
              Unified Hotkey
            </Badge>
            <Badge variant={flags.VOICE_ROUTER_UNIFIED ? 'default' : 'secondary'}>
              Unified Router
            </Badge>
            <Badge variant={flags.VOICE_DECISION_TRACE ? 'default' : 'secondary'}>
              Decision Trace
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Core Voice Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Capture
          </CardTitle>
          <CardDescription>
            Configure how voice input is processed and handled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-commit */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-commit bubbles</Label>
              <p className="text-sm text-muted-foreground">
                Automatically create bubbles for high-confidence voice input
              </p>
            </div>
            <Switch
              checked={voiceAutoCommit}
              onCheckedChange={(checked) => updateVoiceSetting('voiceAutoCommit', checked)}
            />
          </div>

          <Separator />

          {/* Confidence threshold */}
          <div className="space-y-3">
            <Label>Confidence threshold ({Math.round(voiceConfidenceThreshold * 100)}%)</Label>
            <Slider
              value={[voiceConfidenceThreshold]}
              onValueChange={([value]) => updateVoiceSetting('voiceConfidenceThreshold', value)}
              max={1}
              min={0.3}
              step={0.05}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Minimum confidence required before prompting for confirmation
            </p>
          </div>

          <Separator />

          {/* Hotkey */}
          <div className="space-y-3">
            <Label>Voice hotkey</Label>
            <Select value={voiceHotkey} onValueChange={(value) => updateVoiceSetting('voiceHotkey', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Space">Space</SelectItem>
                <SelectItem value="KeyV">V</SelectItem>
                <SelectItem value="KeyM">M</SelectItem>
                <SelectItem value="F1">F1</SelectItem>
                <SelectItem value="F2">F2</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Hold this key to activate voice capture from anywhere
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Audio Backend Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Audio Backend
          </CardTitle>
          <CardDescription>
            Configure speech recognition and audio processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Backend preference */}
          <div className="space-y-3">
            <Label>Preferred backend</Label>
            <Select 
              value={voiceBackendPreference} 
              onValueChange={(value) => updateVoiceSetting('voiceBackendPreference', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (fastest available)</SelectItem>
                <SelectItem value="web-speech">Web Speech API</SelectItem>
                <SelectItem value="whisper">Whisper (cloud)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Individual backend toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Web Speech API</Label>
                <p className="text-sm text-muted-foreground">
                  Fast, local speech recognition (browser-dependent)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={flags.VOICE_WEB_SPEECH_ENABLED ? 'default' : 'secondary'}>
                  {flags.VOICE_WEB_SPEECH_ENABLED ? 'Available' : 'Disabled'}
                </Badge>
                <Switch
                  checked={voiceWebSpeechEnabled}
                  onCheckedChange={(checked) => {
                    updateVoiceSetting('voiceWebSpeechEnabled', checked);
                    toggleFeatureFlag('VOICE_WEB_SPEECH_ENABLED', checked);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Whisper (cloud)</Label>
                <p className="text-sm text-muted-foreground">
                  High-accuracy speech recognition via OpenAI
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={flags.VOICE_WHISPER_ENABLED ? 'default' : 'secondary'}>
                  {flags.VOICE_WHISPER_ENABLED ? 'Available' : 'Disabled'}
                </Badge>
                <Switch
                  checked={voiceWhisperEnabled}
                  onCheckedChange={(checked) => {
                    updateVoiceSetting('voiceWhisperEnabled', checked);
                    toggleFeatureFlag('VOICE_WHISPER_ENABLED', checked);
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice Feedback
          </CardTitle>
          <CardDescription>
            Configure audio and visual feedback for voice interactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* TTS enabled */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Text-to-speech confirmations</Label>
              <p className="text-sm text-muted-foreground">
                Speak back confirmations and feedback
              </p>
            </div>
            <Switch
              checked={voiceTTSEnabled}
              onCheckedChange={(checked) => updateVoiceSetting('voiceTTSEnabled', checked)}
            />
          </div>

          <Separator />

          {/* Feedback level */}
          <div className="space-y-3">
            <Label>Feedback level</Label>
            <Select 
              value={voiceFeedbackLevel} 
              onValueChange={(value) => updateVoiceSetting('voiceFeedbackLevel', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal (errors only)</SelectItem>
                <SelectItem value="standard">Standard (successes and errors)</SelectItem>
                <SelectItem value="verbose">Verbose (all interactions)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Test voice */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Test voice feedback</Label>
              <p className="text-sm text-muted-foreground">
                Hear how voice confirmations will sound
              </p>
            </div>
            <Button variant="outline" onClick={testVoice}>
              Test Voice
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Developer Settings */}
      {flags.VOICE_DEV_ROUTE_ENABLED && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Developer Settings
            </CardTitle>
            <CardDescription>
              Advanced debugging and development options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Debug mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Debug mode</Label>
                <p className="text-sm text-muted-foreground">
                  Show detailed voice processing information
                </p>
              </div>
              <Switch
                checked={voiceDebugMode}
                onCheckedChange={(checked) => {
                  updateVoiceSetting('voiceDebugMode', checked);
                  toggleFeatureFlag('VOICE_DEBUG_LOGGING', checked);
                }}
              />
            </div>

            <Separator />

            {/* Session timeout */}
            <div className="space-y-3">
              <Label>Session timeout ({Math.round(voiceSessionTimeout / 1000)}s)</Label>
              <Slider
                value={[voiceSessionTimeout]}
                onValueChange={([value]) => updateVoiceSetting('voiceSessionTimeout', value)}
                max={60000}
                min={10000}
                step={5000}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Automatic cleanup time for stuck voice sessions
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};