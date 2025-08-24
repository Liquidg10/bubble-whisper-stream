import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Volume2, 
  Eye, 
  Smartphone, 
  Download, 
  Upload,
  Lock,
  Database,
  Trash2,
  Brain,
  Puzzle
} from 'lucide-react';
import { storageService } from '@/services/storage';
import { hapticsService } from '@/services/haptics';
import { ttsService } from '@/services/tts';
import { IntelligenceSettings } from '@/components/IntelligenceSettings';
import { MonthlyReviewCard } from '@/components/MonthlyReviewCard';
import { PrivacyZoneToggle } from '@/components/PrivacyZoneToggle';
import { QuickTour } from '@/components/QuickTour';
import { OptionalModules } from '@/components/OptionalModules';
import { PerformanceMonitor } from '@/components/PerformanceMonitor';

export const Settings: React.FC = () => {
  const { settings, updateSettings, bubbles, reminders } = useBubbleStore();
  const [isExporting, setIsExporting] = useState(false);
  const [testingTTS, setTestingTTS] = useState(false);
  const [showQuickTour, setShowQuickTour] = useState(false);
  const [showMonthlyReview, setShowMonthlyReview] = useState(false);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [showIntelligenceDashboard, setShowIntelligenceDashboard] = useState(false);
  const [showPerformanceOptimizer, setShowPerformanceOptimizer] = useState(false);
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const exportData = await storageService.exportData();
      const dataBlob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `bubble-universe-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      hapticsService.success();
    } catch (error) {
      console.error('Export failed:', error);
      hapticsService.error();
    } finally {
      setIsExporting(false);
    }
  };

  const handleTestTTS = async () => {
    setTestingTTS(true);
    try {
      await ttsService.speak('This is a test of the text-to-speech system. How does it sound?');
      hapticsService.success();
    } catch (error) {
      console.error('TTS test failed:', error);
      hapticsService.error();
    } finally {
      setTestingTTS(false);
    }
  };

  const handleTestHaptics = () => {
    hapticsService.tap();
  };

  const calculateStorageSize = () => {
    const totalBubbles = bubbles.length;
    const totalReminders = reminders.length;
    // Rough estimate: 1KB per bubble + 0.5KB per reminder
    const estimatedSize = (totalBubbles * 1) + (totalReminders * 0.5);
    return `~${estimatedSize.toFixed(1)} KB`;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold">Settings & Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Customize your experience and manage your data
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Intelligence Settings */}
        <IntelligenceSettings />

        {/* Monthly Review */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Monthly Review
            </CardTitle>
            <CardDescription>
              Review your patterns and growth over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => setShowMonthlyReview(true)}
              className="w-full"
            >
              <Brain className="h-4 w-4 mr-2" />
              Review This Month
            </Button>
          </CardContent>
        </Card>

        {/* Privacy Zones */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Privacy Zones</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Control what data layers are active for personalization
            </p>
          </div>
          
          <PrivacyZoneToggle
            layer="surface"
            title="Surface Layer"
            description="Basic preferences, theme settings, and UI customizations"
            icon={<Eye className="h-5 w-5" />}
          />
          
          <PrivacyZoneToggle
            layer="context"
            title="Context Layer"
            description="Time patterns, routine detection, and adaptive reminders"
            icon={<Shield className="h-5 w-5" />}
            requiresBiometric={false}
          />
          
          <PrivacyZoneToggle
            layer="deep"
            title="Deep Layer"
            description="Emotional patterns, CBT insights, and personal triggers"
            icon={<Lock className="h-5 w-5" />}
            requiresBiometric={true}
          />
        </div>

        {/* Optional Modules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="h-5 w-5" />
              Optional Modules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OptionalModules />
          </CardContent>
        </Card>

        {/* Privacy & Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy & Security
            </CardTitle>
            <CardDescription>
              Your data stays on your device by default
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="biometric-lock">Biometric Lock</Label>
                <p className="text-sm text-muted-foreground">
                  Require fingerprint/face unlock to open app
                </p>
              </div>
              <Switch
                id="biometric-lock"
                checked={settings.biometricLock}
                onCheckedChange={(checked) => 
                  updateSettings({ biometricLock: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Data Management</Label>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Local Storage</p>
                  <p className="text-xs text-muted-foreground">
                    {bubbles.length} bubbles, {reminders.length} reminders
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Size: {calculateStorageSize()}
                  </p>
                </div>
                <Badge variant="secondary">
                  <Database className="h-3 w-3 mr-1" />
                  Local Only
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isExporting ? 'Exporting...' : 'Export Backup'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import (Coming Soon)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accessibility */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Accessibility
            </CardTitle>
            <CardDescription>
              Customize the interface for your needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="high-contrast">High Contrast</Label>
                <p className="text-sm text-muted-foreground">
                  Increase contrast for better visibility
                </p>
              </div>
              <Switch
                id="high-contrast"
                checked={settings.highContrast}
                onCheckedChange={(checked) => 
                  updateSettings({ highContrast: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="reduced-motion">Reduced Motion</Label>
                <p className="text-sm text-muted-foreground">
                  Minimize animations and transitions
                </p>
              </div>
              <Switch
                id="reduced-motion"
                checked={settings.reducedMotion}
                onCheckedChange={(checked) => 
                  updateSettings({ reducedMotion: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Bubble Density: {settings.bubbleDensity}</Label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((density) => (
                  <Button
                    key={density}
                    variant={settings.bubbleDensity === density ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateSettings({ bubbleDensity: density })}
                    className="flex-1 capitalize"
                  >
                    {density}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Controls how many bubbles appear on the canvas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audio & Haptics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Audio & Haptics
            </CardTitle>
            <CardDescription>
              Voice playback and vibration settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="tts-enabled">Text-to-Speech</Label>
                <p className="text-sm text-muted-foreground">
                  Read bubble content aloud
                </p>
              </div>
              <Switch
                id="tts-enabled"
                checked={settings.ttsEnabled}
                onCheckedChange={(checked) => 
                  updateSettings({ ttsEnabled: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestTTS}
                disabled={testingTTS || !settings.ttsEnabled}
                className="w-full"
              >
                <Volume2 className="h-4 w-4 mr-2" />
                {testingTTS ? 'Testing...' : 'Test Voice Playback'}
              </Button>
              {!ttsService.isAvailable() && (
                <p className="text-xs text-muted-foreground">
                  Text-to-speech not available on this device
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Haptic Feedback</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestHaptics}
                className="w-full"
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Test Vibration
              </Button>
              {!hapticsService.isAvailable() && (
                <p className="text-xs text-muted-foreground">
                  Haptic feedback not available on this device
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Quiet Hours</CardTitle>
            <CardDescription>
              Limit notifications during specific times
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">Start Time</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={settings.quietHours?.start || '22:00'}
                  onChange={(e) => 
                    updateSettings({ 
                      quietHours: { 
                        ...settings.quietHours, 
                        start: e.target.value,
                        end: settings.quietHours?.end || '08:00'
                      } 
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">End Time</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={settings.quietHours?.end || '08:00'}
                  onChange={(e) => 
                    updateSettings({ 
                      quietHours: { 
                        start: settings.quietHours?.start || '22:00',
                        end: e.target.value
                      } 
                    })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              During quiet hours, only gentle reminders will be shown
            </p>
          </CardContent>
        </Card>

        {/* Help & Support */}
        <Card>
          <CardHeader>
            <CardTitle>Help & Support</CardTitle>
            <CardDescription>
              Learn about features and get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              onClick={() => setShowQuickTour(true)}
              className="w-full"
            >
              <Brain className="h-4 w-4 mr-2" />
              Take Feature Tour
            </Button>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About Bubble Universe</CardTitle>
            <CardDescription>
              Your personal cognitive companion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <p>Version: 1.0.0 (MVP)</p>
              <p>Privacy-first, local-only storage</p>
              <p>No analytics, no tracking</p>
            </div>
            <Badge variant="secondary" className="w-fit">
              <Lock className="h-3 w-3 mr-1" />
              100% Local
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Quick Tour Modal */}
      <QuickTour 
        isOpen={showQuickTour} 
        onClose={() => setShowQuickTour(false)} 
      />

      {/* Monthly Review Modal */}
      {showMonthlyReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <MonthlyReviewCard onClose={() => setShowMonthlyReview(false)} />
        </div>
      )}
      {/* Performance Monitor (Development) */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Performance Monitor
            </CardTitle>
            <CardDescription>
              Real-time performance metrics and optimization tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="performance-monitor">Show Performance Monitor</Label>
                <Switch
                  id="performance-monitor"
                  checked={showPerformanceMonitor}
                  onCheckedChange={setShowPerformanceMonitor}
                />
              </div>
              
              {showPerformanceMonitor && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <PerformanceMonitor show={true} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};