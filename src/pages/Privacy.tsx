/**
 * PROMPT 11: Privacy Page for CBT Onboarding
 * Explains data handling and provides deletion controls
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Trash2, Database, Lock, Eye, Download } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';
import { storageService } from '@/services/storage';

export default function Privacy() {
  const { updateSettings } = useBubbleStore();
  const { toast } = useToast();

  const handleDeleteCBTData = () => {
    // Clear all CBT-related data
    const cbtKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('cbt_') || key.startsWith('ai_cbt_')
    );
    
    cbtKeys.forEach(key => localStorage.removeItem(key));
    
    // Reset CBT settings
    updateSettings({
      cbtSettings: {
        cbtAssistEnabled: false,
        assistLevel: 'off',
        privacyLayer: 'surface',
        autoLogMode: 'off',
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
        topicExclusions: [],
        neverInterveneOn: []
      }
    });

    toast({
      title: "CBT data cleared",
      description: "All thought support data has been removed from your device."
    });
  };

  const handleExportData = () => {
    const data = {
      cbtSettings: JSON.parse(localStorage.getItem('bubble-store') || '{}')?.state?.settings?.cbtSettings,
      onboardingState: JSON.parse(localStorage.getItem('bubble-store') || '{}')?.state?.settings?.cbtOnboardingState,
      metrics: Object.keys(localStorage)
        .filter(key => key.startsWith('cbt_metrics'))
        .reduce((acc, key) => {
          acc[key] = localStorage.getItem(key);
          return acc;
        }, {} as Record<string, any>)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bubble-os-cbt-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Data exported",
      description: "Your CBT data has been downloaded as JSON."
    });
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy & Data</h1>
        <p className="text-muted-foreground">
          How Bubble OS handles your personal information and thought support data
        </p>
      </div>

      <div className="grid gap-6">
        {/* Core Privacy Principles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Privacy-First Design
            </CardTitle>
            <CardDescription>
              Bubble OS is built with privacy as the foundation, not an afterthought
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex gap-3">
                <Database className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">Local-Only Storage</h4>
                  <p className="text-sm text-muted-foreground">
                    All your data stays on your device. No cloud storage, no external servers.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Lock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">Encrypted at Rest</h4>
                  <p className="text-sm text-muted-foreground">
                    Sensitive data is encrypted using browser security features.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Eye className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">No Analytics Tracking</h4>
                  <p className="text-sm text-muted-foreground">
                    We don't track your usage, behavior, or personal information.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Download className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium">Export Anytime</h4>
                  <p className="text-sm text-muted-foreground">
                    Download your data in standard formats whenever you want.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CBT Thought Support */}
        <Card>
          <CardHeader>
            <CardTitle>Thought Support (CBT) Data</CardTitle>
            <CardDescription>
              How the gentle check-in system works and what data it uses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>No message content leaves your device.</strong> The thought support system 
                analyzes patterns locally and never transmits your actual thoughts or messages.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <div>
                <h4 className="font-medium mb-2">What We Store Locally:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• Your preferences for check-in frequency and style</li>
                  <li>• Anonymous pattern recognition data (no message content)</li>
                  <li>• Your responses to check-ins (helpful/not helpful)</li>
                  <li>• Times when you've asked for less frequent support</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">What We Never Store:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• The actual content of your thoughts or messages</li>
                  <li>• Personal identifying information in any form</li>
                  <li>• Data about specific situations or people in your life</li>
                  <li>• Anything that could be used to reconstruct your conversations</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleExportData} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export My Data
              </Button>
              
              <Button onClick={handleDeleteCBTData} variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All CBT Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Retention */}
        <Card>
          <CardHeader>
            <CardTitle>Data Retention & Control</CardTitle>
            <CardDescription>
              You have complete control over your data lifecycle
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Automatic Cleanup</h4>
                <p className="text-sm text-muted-foreground">
                  Old metrics data is automatically removed after 90 days to keep 
                  your storage lean and protect privacy.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Manual Control</h4>
                <p className="text-sm text-muted-foreground">
                  You can delete any or all data at any time. Changes take effect 
                  immediately with no recovery period.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Reset Options</h4>
                <p className="text-sm text-muted-foreground">
                  Reset just your preferences, or completely start over with a 
                  fresh installation state.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">No Recovery</h4>
                <p className="text-sm text-muted-foreground">
                  Since we don't store backups anywhere, deleted data is truly gone. 
                  This protects your privacy but means deletions are permanent.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Questions or Concerns?</CardTitle>
            <CardDescription>
              We're here to help with any privacy questions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you have questions about how your data is handled, want to report a 
              privacy concern, or need help with data management, please reach out.
            </p>
            
            <Alert>
              <AlertDescription>
                <strong>Open Source:</strong> Bubble OS is open source, which means you can 
                inspect the code yourself to verify these privacy practices. The source code 
                is available for review and audit.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}