import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Eye, 
  Volume2, 
  MousePointer, 
  Zap, 
  Palette, 
  Type,
  Focus,
  Shield,
  Heart,
  TestTube
} from 'lucide-react';
import { useCalmMode } from '@/providers/CalmModeProvider';
import { AccessibleActionButton } from '@/components/AccessibleActionButton';
import { AccessibleConfirmDialog } from '@/components/AccessibleConfirmDialog';
import { microcopyService } from '@/services/microcopyService';

export const AccessibilitySettings: React.FC = () => {
  const { 
    calmMode, 
    accessibility, 
    updateCalmMode, 
    updateAccessibility,
    enableCalmMode,
    disableCalmMode 
  } = useCalmMode();

  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testAction, setTestAction] = useState<'save' | 'delete'>('save');

  const handleTestReadAloud = async () => {
    const testText = "This is a test of the read-aloud feature. It helps make the app more accessible for everyone.";
    try {
      await microcopyService.readAloud(testText);
    } catch (error) {
      console.warn('Read aloud test failed:', error);
    }
  };

  const readabilityScore = microcopyService.calculateReadabilityScore(
    "This is a test of the read-aloud feature. It helps make the app more accessible for everyone."
  );

  return (
    <div className="space-y-6">
      {/* Calm Mode Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Calm Mode
            {calmMode.enabled && (
              <Badge variant="secondary">Active</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">Enable calm, focused experience</p>
              <p className="text-sm text-muted-foreground">
                Reduces visual stress and makes interactions more comfortable
              </p>
            </div>
            <Switch
              checked={calmMode.enabled}
              onCheckedChange={(checked) => checked ? enableCalmMode() : disableCalmMode()}
            />
          </div>

          {calmMode.enabled && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reduce-animations" className="text-sm">Reduce animations</Label>
                  <Switch
                    id="reduce-animations"
                    checked={calmMode.reduceAnimations}
                    onCheckedChange={(checked) => updateCalmMode({ reduceAnimations: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="increase-contrast" className="text-sm">Increase contrast</Label>
                  <Switch
                    id="increase-contrast"
                    checked={calmMode.increaseContrast}
                    onCheckedChange={(checked) => updateCalmMode({ increaseContrast: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="large-targets" className="text-sm">Large touch targets</Label>
                  <Switch
                    id="large-targets"
                    checked={calmMode.largeTargets}
                    onCheckedChange={(checked) => updateCalmMode({ largeTargets: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="limit-stimuli" className="text-sm">Limit stimuli</Label>
                  <Switch
                    id="limit-stimuli"
                    checked={calmMode.limitConcurrentStimuli}
                    onCheckedChange={(checked) => updateCalmMode({ limitConcurrentStimuli: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="simplify-ui" className="text-sm">Simplify interface</Label>
                  <Switch
                    id="simplify-ui"
                    checked={calmMode.simplifyInterface}
                    onCheckedChange={(checked) => updateCalmMode({ simplifyInterface: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="read-aloud" className="text-sm">Read-aloud options</Label>
                  <Switch
                    id="read-aloud"
                    checked={calmMode.readAloudEnabled}
                    onCheckedChange={(checked) => updateCalmMode({ readAloudEnabled: checked })}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Visual Accessibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="high-contrast">High contrast mode</Label>
                <p className="text-xs text-muted-foreground">Stronger colors for better visibility</p>
              </div>
              <Switch
                id="high-contrast"
                checked={accessibility.highContrast}
                onCheckedChange={(checked) => updateAccessibility({ highContrast: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="large-text">Large text</Label>
                <p className="text-xs text-muted-foreground">Bigger fonts throughout the app</p>
              </div>
              <Switch
                id="large-text"
                checked={accessibility.largeText}
                onCheckedChange={(checked) => updateAccessibility({ largeText: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="reduced-motion">Reduced motion</Label>
                <p className="text-xs text-muted-foreground">Minimal animations and transitions</p>
              </div>
              <Switch
                id="reduced-motion"
                checked={accessibility.reducedMotion}
                onCheckedChange={(checked) => updateAccessibility({ reducedMotion: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="focus-visible">Enhanced focus</Label>
                <p className="text-xs text-muted-foreground">Clear focus indicators</p>
              </div>
              <Switch
                id="focus-visible"
                checked={accessibility.focusVisible}
                onCheckedChange={(checked) => updateAccessibility({ focusVisible: checked })}
              />
            </div>
          </div>

          <Separator />

          <div>
            <Label htmlFor="focus-style">Focus ring style</Label>
            <Select
              value={calmMode.focusRingStyle}
              onValueChange={(value: 'subtle' | 'prominent' | 'high-contrast') => 
                updateCalmMode({ focusRingStyle: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subtle">Subtle</SelectItem>
                <SelectItem value="prominent">Prominent</SelectItem>
                <SelectItem value="high-contrast">High Contrast</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Interaction & Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointer className="h-5 w-5" />
            Interaction & Navigation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="keyboard-nav">Keyboard navigation</Label>
                <p className="text-xs text-muted-foreground">Full keyboard control</p>
              </div>
              <Switch
                id="keyboard-nav"
                checked={accessibility.keyboardNavigation}
                onCheckedChange={(checked) => updateAccessibility({ keyboardNavigation: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="screen-reader">Screen reader optimized</Label>
                <p className="text-xs text-muted-foreground">Enhanced labels and descriptions</p>
              </div>
              <Switch
                id="screen-reader"
                checked={accessibility.screenReaderOptimized}
                onCheckedChange={(checked) => updateAccessibility({ screenReaderOptimized: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="voice-confirmations">Voice confirmations</Label>
                <p className="text-xs text-muted-foreground">Audio feedback for actions</p>
              </div>
              <Switch
                id="voice-confirmations"
                checked={accessibility.voiceConfirmations}
                onCheckedChange={(checked) => updateAccessibility({ voiceConfirmations: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Read-Aloud Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Read-Aloud Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-medium">Text-to-speech readability</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{readabilityScore.grade}</Badge>
                <Badge variant={readabilityScore.level === 'middle' ? 'default' : 'secondary'}>
                  {readabilityScore.level}
                </Badge>
              </div>
            </div>
            <Button onClick={handleTestReadAloud} variant="outline">
              <Volume2 className="h-4 w-4 mr-2" />
              Test Voice
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">Test Accessible Components</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AccessibleActionButton
                action="save"
                onPrimary={() => console.log('Save clicked')}
                onSecondary={() => console.log('Cancel clicked')}
                showReadAloud={calmMode.readAloudEnabled}
                microcopyOptions={{
                  tone: 'friendly',
                  readingLevel: 'middle'
                }}
              />

              <div className="space-y-2">
                <Button 
                  onClick={() => {
                    setTestAction('delete');
                    setShowTestDialog(true);
                  }}
                  variant="destructive"
                  className="w-full"
                >
                  Test Confirm Dialog
                </Button>
                
                <Button 
                  onClick={() => {
                    setTestAction('save');
                    setShowTestDialog(true);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Test Save Dialog
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Dialog */}
      <AccessibleConfirmDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        action={testAction}
        item="test item"
        onConfirm={() => console.log(`${testAction} confirmed`)}
        onCancel={() => console.log(`${testAction} cancelled`)}
        variant={testAction === 'delete' ? 'destructive' : 'default'}
        showReadAloud={calmMode.readAloudEnabled}
        microcopyOptions={{
          tone: 'friendly',
          readingLevel: 'middle'
        }}
      />
    </div>
  );
};