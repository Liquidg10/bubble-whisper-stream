import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { flags, getActiveFlags, toggleFeatureFlag, clearFlagOverrides, type FeatureFlag } from '@/config/flags';
import { Flag, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function DevFlags() {
  const { toast } = useToast();
  const [activeFlags, setActiveFlags] = React.useState(getActiveFlags());

  const refreshFlags = () => {
    setActiveFlags(getActiveFlags());
  };

  const handleToggleFlag = (flag: FeatureFlag, enabled: boolean) => {
    toggleFeatureFlag(flag, enabled);
    refreshFlags();
    toast({
      title: "Feature Flag Updated",
      description: `${flag} is now ${enabled ? 'enabled' : 'disabled'}`,
    });
  };

  const handleClearOverrides = () => {
    clearFlagOverrides();
    refreshFlags();
    toast({
      title: "Overrides Cleared",
      description: "All localStorage flag overrides have been cleared",
    });
  };

  // Categorize flags
  const cbtFlags = Object.entries(activeFlags).filter(([key]) => key.startsWith('cbt'));
  const coreFlags = Object.entries(activeFlags).filter(([key]) => !key.startsWith('cbt'));

  const FlagGroup = ({ 
    title, 
    description, 
    flagEntries 
  }: { 
    title: string; 
    description: string; 
    flagEntries: [string, boolean][];
  }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flagEntries.map(([flag, enabled]) => {
          const isOverridden = localStorage.getItem(`flags.${flag}`) !== null;
          const defaultValue = flags[flag as FeatureFlag];
          
          return (
            <div key={flag} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor={flag} className="font-mono text-sm">
                    {flag}
                  </Label>
                  {isOverridden && (
                    <Badge variant="outline" className="text-xs">
                      Overridden
                    </Badge>
                  )}
                  {enabled !== defaultValue && (
                    <Badge variant="secondary" className="text-xs">
                      {enabled ? 'ON' : 'OFF'}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Default: {defaultValue ? 'ON' : 'OFF'}
                  {isOverridden && ` • Override: ${enabled ? 'ON' : 'OFF'}`}
                </p>
              </div>
              <Switch
                id={flag}
                checked={enabled}
                onCheckedChange={(checked) => handleToggleFlag(flag as FeatureFlag, checked)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="h-6 w-6" />
            Feature Flags
          </h1>
          <p className="text-muted-foreground">
            Development control panel for feature toggles and experiments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshFlags}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearOverrides}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Overrides
          </Button>
        </div>
      </div>

      {/* CBT Feature Flags */}
      <FlagGroup
        title="CBT & Thought Support"
        description="Cognitive Behavioral Therapy and mental health support features"
        flagEntries={cbtFlags}
      />

      {/* Core Feature Flags */}
      <FlagGroup
        title="Core Features"
        description="Main application features and capabilities"
        flagEntries={coreFlags}
      />

      {/* Usage Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • <strong>Default values</strong> are defined in the code and used when no override exists
          </p>
          <p>
            • <strong>Overrides</strong> are stored in localStorage and take precedence over defaults
          </p>
          <p>
            • <strong>CBT flags</strong> control thought support features with additional safety switches
          </p>
          <p>
            • Use "Clear Overrides" to reset all flags to their default values
          </p>
        </CardContent>
      </Card>
    </div>
  );
}