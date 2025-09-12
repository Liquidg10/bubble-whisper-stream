import React, { useState } from 'react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Lock, 
  Eye, 
  Download, 
  Upload,
  Database
} from 'lucide-react';
import { storageService } from '@/services/storage';
import { hapticsService } from '@/services/haptics';
import { PrivacyZoneToggle } from '@/components/PrivacyZoneToggle';
import { CBTTraceSettings } from './CBTTraceSettings';
import { PrivacyControlPanel } from '@/components/privacy/PrivacyControlPanel';

export const PrivacySecuritySettings: React.FC = () => {
  const { settings, updateSettings, bubbles, reminders } = useBubbleStore();
  const [isExporting, setIsExporting] = useState(false);

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

  const calculateStorageSize = () => {
    const totalBubbles = bubbles.length;
    const totalReminders = reminders.length;
    // Rough estimate: 1KB per bubble + 0.5KB per reminder
    const estimatedSize = (totalBubbles * 1) + (totalReminders * 0.5);
    return `~${estimatedSize.toFixed(1)} KB`;
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Privacy Control Panel */}
      <PrivacyControlPanel />

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Protect your personal data with additional security
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
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Your data stays on your device by default
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* CBT Trace Management */}
      <CBTTraceSettings />

      {/* Privacy Notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5" />
            Privacy Promise
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm space-y-1">
            <p>✓ 100% local data storage</p>
            <p>✓ No analytics or tracking</p>
            <p>✓ No data sharing with third parties</p>
            <p>✓ You own and control your data</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};