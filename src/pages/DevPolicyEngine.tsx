import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PolicyDecisionChip } from '@/components/PolicyDecisionChip';
import { ContextEnginePanel } from '@/components/ContextEnginePanel';
import { policyDecisionEngine, PolicyDecisionInput, PolicyDecision } from '@/services/policyDecisionEngine';
import { THRESHOLD_LEVELS, thresholdLadderService } from '@/services/thresholdLadderService';
import { RefreshCw, Settings, Zap } from 'lucide-react';

export default function DevPolicyEngine() {
  const [policyDecision, setPolicyDecision] = useState<PolicyDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Form state
  const [input, setInput] = useState<PolicyDecisionInput>({
    content: 'Can you please reply to Sarah about the meeting tomorrow at 2 PM? Let her know I can attend.',
    sender: 'user@example.com',
    location: 'Office - Conference Room A',
    feature: 'email-draft',
    recipient: {
      email: 'sarah@company.com',
      domain: 'company.com',
      isFirstTime: false
    },
    userPreferences: {
      autoWriteEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00'
    }
  });

  // Policy context overrides for testing
  const [contextOverrides, setContextOverrides] = useState({
    isInMeeting: false,
    meetingDensity: 0.3,
    isQuietHours: false,
    locationProductivity: 0.7
  });

  const [thresholdConfig, setThresholdConfig] = useState(THRESHOLD_LEVELS);

  const analyzePolicy = async () => {
    if (!input.content?.trim()) return;

    setLoading(true);
    try {
      // Override the policy decision engine's context building for testing
      const originalInput = {
        ...input,
        // Add context overrides directly for testing
        metadata: {
          testOverrides: contextOverrides
        }
      };

      const decision = await policyDecisionEngine.makeDecision(originalInput);
      setPolicyDecision(decision);
    } catch (error) {
      console.error('Policy analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateThresholds = () => {
    thresholdLadderService.updateThresholdConfiguration(thresholdConfig);
  };

  const resetThresholds = () => {
    setThresholdConfig(THRESHOLD_LEVELS);
    thresholdLadderService.updateThresholdConfiguration(THRESHOLD_LEVELS);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Policy Decision Engine</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Policy Decision Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={input.content}
                  onChange={(e) => setInput({ ...input, content: e.target.value })}
                  placeholder="Enter the content to analyze..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sender">Sender</Label>
                  <Input
                    id="sender"
                    value={input.sender || ''}
                    onChange={(e) => setInput({ ...input, sender: e.target.value })}
                    placeholder="sender@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="feature">Feature</Label>
                  <Input
                    id="feature"
                    value={input.feature || ''}
                    onChange={(e) => setInput({ ...input, feature: e.target.value })}
                    placeholder="email-draft"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={input.location || ''}
                  onChange={(e) => setInput({ ...input, location: e.target.value })}
                  placeholder="Office - Conference Room A"
                />
              </div>

              <div className="space-y-3">
                <Label>Recipient Info</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    value={input.recipient?.email || ''}
                    onChange={(e) => setInput({
                      ...input,
                      recipient: { ...input.recipient, email: e.target.value }
                    })}
                    placeholder="recipient@example.com"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={input.recipient?.isFirstTime || false}
                      onCheckedChange={(checked) => setInput({
                        ...input,
                        recipient: { ...input.recipient, isFirstTime: checked }
                      })}
                    />
                    <Label>First-time recipient</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>User Preferences</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={input.userPreferences?.autoWriteEnabled || false}
                    onCheckedChange={(checked) => setInput({
                      ...input,
                      userPreferences: { ...input.userPreferences, autoWriteEnabled: checked }
                    })}
                  />
                  <Label>Auto-write enabled</Label>
                </div>
              </div>

              <Button onClick={analyzePolicy} disabled={loading} className="w-full">
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Analyze Policy Decision
              </Button>
            </CardContent>
          </Card>

          {/* Context Overrides for Testing */}
          <Card>
            <CardHeader>
              <CardTitle>Context Overrides (Testing)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={contextOverrides.isInMeeting}
                    onCheckedChange={(checked) => setContextOverrides({
                      ...contextOverrides,
                      isInMeeting: checked
                    })}
                  />
                  <Label>In meeting</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={contextOverrides.isQuietHours}
                    onCheckedChange={(checked) => setContextOverrides({
                      ...contextOverrides,
                      isQuietHours: checked
                    })}
                  />
                  <Label>Quiet hours</Label>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Meeting Density: {contextOverrides.meetingDensity}</Label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={contextOverrides.meetingDensity}
                  onChange={(e) => setContextOverrides({
                    ...contextOverrides,
                    meetingDensity: parseFloat(e.target.value)
                  })}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>Location Productivity: {contextOverrides.locationProductivity}</Label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={contextOverrides.locationProductivity}
                  onChange={(e) => setContextOverrides({
                    ...contextOverrides,
                    locationProductivity: parseFloat(e.target.value)
                  })}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {policyDecision && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Policy Decision Result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PolicyDecisionChip decision={policyDecision} variant="card" />
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Decision Variants</h4>
                    <div className="flex gap-2 flex-wrap">
                      <PolicyDecisionChip decision={policyDecision} variant="pill" />
                      <PolicyDecisionChip decision={policyDecision} variant="inline" />
                      <PolicyDecisionChip decision={policyDecision} variant="pill" compact />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="font-medium">Raw Decision Data</h4>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                      {JSON.stringify(policyDecision, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Context Engine Panel */}
              <ContextEnginePanel 
                input={input}
                className="border-l-4 border-l-primary"
              />
            </>
          )}

          {/* Threshold Configuration */}
          {showSettings && (
            <Card>
              <CardHeader>
                <CardTitle>Threshold Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label>High Threshold (Auto-Write)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={thresholdConfig.HIGH}
                      onChange={(e) => setThresholdConfig({
                        ...thresholdConfig,
                        HIGH: parseFloat(e.target.value)
                      })}
                    />
                  </div>
                  <div>
                    <Label>Medium Threshold (Draft + Ask)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={thresholdConfig.MEDIUM}
                      onChange={(e) => setThresholdConfig({
                        ...thresholdConfig,
                        MEDIUM: parseFloat(e.target.value)
                      })}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={updateThresholds} size="sm">
                    Update Thresholds
                  </Button>
                  <Button onClick={resetThresholds} variant="outline" size="sm">
                    Reset to Defaults
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}