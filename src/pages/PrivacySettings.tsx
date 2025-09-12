import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Shield, Settings, Activity, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PrivacyControlPanel } from '@/components/privacy/PrivacyControlPanel';
import { PrivacyDashboard } from '@/components/privacy/PrivacyDashboard';
import { PrivacyOnboardingFlow } from '@/components/privacy/PrivacyOnboardingFlow';
import { privacyConsentService } from '@/services/privacyConsentService';
import { useToast } from '@/hooks/use-toast';

export default function PrivacySettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const handleExportData = () => {
    try {
      const exportData = privacyConsentService.exportUserData({
        includePersonalData: false,
        includeMetrics: true,
        includeBehaviorData: false,
        format: 'json'
      });

      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Data exported",
        description: "Your privacy data has been exported successfully",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Unable to export data. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleResetSettings = () => {
    privacyConsentService.resetAllPrivacySettings();
    toast({
      title: "Privacy settings reset",
      description: "All privacy settings have been restored to defaults",
    });
  };

  const consentSettings = privacyConsentService.getConsentSettings();
  const privacyControls = privacyConsentService.getPrivacyControls();

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Privacy & Security Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your data privacy, consent preferences, and security controls
          </p>
        </div>
      </div>

      {/* Privacy Status Overview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Privacy Status</h3>
                <Badge variant={consentSettings.consentTimestamp > 0 ? 'default' : 'secondary'}>
                  {consentSettings.consentTimestamp > 0 ? 'Configured' : 'Not Set'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {consentSettings.consentTimestamp > 0 
                  ? `Last updated: ${new Date(consentSettings.consentTimestamp).toLocaleDateString()}`
                  : 'Privacy preferences not configured'
                }
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setOnboardingOpen(true)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Reconfigure
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="controls" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="consent">Consent</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>

        <TabsContent value="controls" className="space-y-6">
          <PrivacyControlPanel />
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-6">
          <PrivacyDashboard />
        </TabsContent>

        <TabsContent value="consent" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Consent Settings</CardTitle>
                <CardDescription>
                  Your current privacy preferences and consent status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {Object.entries(consentSettings).map(([key, value]) => {
                    if (typeof value === 'boolean') {
                      return (
                        <div key={key} className="flex justify-between items-center text-sm">
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                          <Badge variant={value ? 'default' : 'secondary'}>
                            {value ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Privacy Controls</CardTitle>
                <CardDescription>
                  Active privacy control settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span>Learning Status</span>
                  <Badge variant={privacyControls.pauseLearning ? 'destructive' : 'default'}>
                    {privacyControls.pauseLearning ? 'Paused' : 'Active'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Data Retention</span>
                  <span className="text-muted-foreground">{consentSettings.dataRetentionDays} days</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Disabled Integrations</span>
                  <span className="text-muted-foreground">{privacyControls.disableSpecificIntegrations.length}</span>
                </div>
                {privacyControls.lastRedaction > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span>Last Redaction</span>
                    <span className="text-muted-foreground">
                      {new Date(privacyControls.lastRedaction).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Export</CardTitle>
                <CardDescription>
                  Export your data in privacy-compliant formats
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Export your privacy settings, metrics, and non-personal data for backup or analysis.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    <span>Only includes data you've consented to share</span>
                  </div>
                </div>
                <Button onClick={handleExportData} variant="outline" className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Export Privacy Data
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reset Settings</CardTitle>
                <CardDescription>
                  Reset all privacy settings to defaults
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This will reset all privacy preferences, consent settings, and controls to their defaults.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <Shield className="h-3 w-3" />
                    <span>This action cannot be undone</span>
                  </div>
                </div>
                <Button onClick={handleResetSettings} variant="destructive" className="w-full">
                  <Activity className="h-4 w-4 mr-2" />
                  Reset All Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Privacy Onboarding Flow */}
      <PrivacyOnboardingFlow
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onComplete={() => {
          toast({
            title: "Privacy settings updated",
            description: "Your privacy preferences have been reconfigured",
          });
        }}
      />
    </div>
  );
}