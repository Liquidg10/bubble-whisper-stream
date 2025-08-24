import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Alert, AlertDescription } from './ui/alert';
import { 
  ShoppingCart, 
  Home, 
  Mic, 
  Plus, 
  Check, 
  MapPin,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { DocumentScanner } from './DocumentScanner';
import { PersonalVoiceTrainer } from './PersonalVoiceTrainer';
import { EnhancedGroceryHelper } from './EnhancedGroceryHelper';
import { RealTimeCollaboration } from './RealTimeCollaboration';
import { CalendarIntegrationPlugin } from '@/plugins/CalendarIntegrationPlugin';
import { EmailIntegrationPlugin } from '@/plugins/EmailIntegrationPlugin';
import { BankingIntegrationPlugin } from '@/plugins/BankingIntegrationPlugin';
import { PluginSDK } from '@/plugins/PluginSDK';

export function OptionalModules() {
  const { settings, updateSettings } = useBubbleStore();
  const [groceryList, setGroceryList] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [cleaningPrompts, setCleaningPrompts] = useState(true);

  // Sample grocery items for demo
  useEffect(() => {
    setGroceryList(['Milk', 'Bread', 'Eggs', 'Bananas']);
  }, []);

  const addGroceryItem = () => {
    if (newItem.trim()) {
      setGroceryList([...groceryList, newItem.trim()]);
      setNewItem('');
    }
  };

  const removeGroceryItem = (index: number) => {
    setGroceryList(groceryList.filter((_, i) => i !== index));
  };

  const handleCleaningPromptsToggle = (enabled: boolean) => {
    setCleaningPrompts(enabled);
    updateSettings({ cleaningCuesEnabled: enabled });
  };

  return (
    <div className="space-y-6">
      {/* Plugin SDK & Development */}
      <PluginSDK />
      
      {/* Core Integration Plugins */}
      <CalendarIntegrationPlugin />
      <EmailIntegrationPlugin />
      <BankingIntegrationPlugin />
      
      {/* Enhanced Modules */}
      <EnhancedGroceryHelper />
      
      {/* Document Scanner */}
      <DocumentScanner />
      
      {/* Real-time Collaboration */}
      <RealTimeCollaboration />
      
      {/* Personal Voice Trainer */}
      <PersonalVoiceTrainer />
      
      {/* Legacy Grocery Helper Module - keeping for backward compatibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-green-600" />
            Grocery Helper
            <Badge variant="secondary">Optional</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch 
              checked={settings.groceryHelperEnabled || false}
              onCheckedChange={(enabled) => updateSettings({ groceryHelperEnabled: enabled })}
            />
            <div>
              <div className="font-medium">Enable Grocery Helper</div>
              <div className="text-sm text-muted-foreground">
                Smart list management with location-based reminders
              </div>
            </div>
          </div>

          {settings.groceryHelperEnabled && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex gap-2">
                <Input
                  placeholder="Add grocery item..."
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addGroceryItem()}
                  className="flex-1"
                />
                <Button onClick={addGroceryItem} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {groceryList.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                    <span>{item}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeGroceryItem(index)}
                      className="h-6 w-6 p-0"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {groceryList.length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No items in your grocery list
                  </div>
                )}
              </div>

              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertDescription>
                  <strong>Location Reminder:</strong> We'll gently remind you about your grocery list when you're near stores you've visited before.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clean House Cues Module */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-blue-600" />
            Clean House Cues
            <Badge variant="secondary">Optional</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch 
              checked={cleaningPrompts}
              onCheckedChange={handleCleaningPromptsToggle}
            />
            <div>
              <div className="font-medium">Enable Gentle Cleaning Cues</div>
              <div className="text-sm text-muted-foreground">
                10-minute reset prompts with compassionate, anti-shame language
              </div>
            </div>
          </div>

          {cleaningPrompts && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Sample Gentle Prompts:</span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="p-3 bg-background rounded border-l-4 border-l-blue-500">
                    "Ready for a gentle 10-minute reset? No pressure – just when you feel like it."
                  </div>
                  <div className="p-3 bg-background rounded border-l-4 border-l-green-500">
                    "Your space supports you best when it feels good. Care to do a quick tidy?"
                  </div>
                  <div className="p-3 bg-background rounded border-l-4 border-l-purple-500">
                    "Small steps count. Even putting away one thing makes a difference."
                  </div>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Anti-Shame Promise:</strong> These prompts will never make you feel guilty or inadequate. You can always postpone or dismiss them without judgment.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal Voice Clone Module */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-purple-600" />
            Personal Voice Clone
            <Badge variant="destructive">Biometric Required</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch 
              checked={settings.personalVoiceEnabled || false}
              onCheckedChange={(enabled) => updateSettings({ personalVoiceEnabled: enabled })}
              disabled={!settings.biometricEnabled}
            />
            <div>
              <div className="font-medium">Enable Personal Voice Clone</div>
              <div className="text-sm text-muted-foreground">
                Train a personal voice for TTS using your voice samples
              </div>
            </div>
          </div>

          {!settings.biometricEnabled && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Biometric authentication must be enabled first for security. Enable it in Privacy & Security settings.
              </AlertDescription>
            </Alert>
          )}

          {settings.personalVoiceEnabled && settings.biometricEnabled && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Privacy Notice:</strong> Voice samples are processed locally and never sent to external servers. All data remains on your device with encryption.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button variant="outline" className="w-full">
                  <Mic className="h-4 w-4 mr-2" />
                  Record Voice Sample (0/5 required)
                </Button>
                
                <div className="text-sm text-muted-foreground">
                  We need 5 short voice samples (30 seconds each) to create your personal voice clone. These will be used only for text-to-speech on this device.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}