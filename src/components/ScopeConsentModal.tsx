import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Calendar, 
  Mail, 
  Eye, 
  Edit, 
  Send,
  AlertTriangle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { oauthService, ScopeRequest } from '@/services/oauthService';
import { ScopeComparisonView } from './ScopeComparisonView';
import { ScopeProgressionIndicator } from './ScopeProgressionIndicator';
import { isFeatureEnabled } from '@/config/flags';

interface ScopeConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ScopeRequest;
  currentScopes?: string[];
  onApprove: (authUrl: string) => void;
  onDeny: () => void;
}

const SCOPE_DESCRIPTIONS = {
  'https://www.googleapis.com/auth/calendar.readonly': {
    icon: Eye,
    title: 'Read Calendar Events',
    description: 'View your calendar events and details',
    risk: 'low',
    reason: 'Needed to display your upcoming events and create reminders'
  },
  'https://www.googleapis.com/auth/calendar.events': {
    icon: Edit,
    title: 'Create Calendar Events',
    description: 'Create and edit calendar events (minimal write access)',
    risk: 'medium',
    reason: 'Required when you want to create events from bubbles or tasks'
  },
  'https://www.googleapis.com/auth/gmail.metadata': {
    icon: Eye,
    title: 'Email Headers & Labels',
    description: 'View email subjects, senders, and labels (not message content)',
    risk: 'low',
    reason: 'Minimal access to organize and filter your emails without reading content'
  },
  'https://www.googleapis.com/auth/gmail.readonly': {
    icon: Eye,
    title: 'Read Email Content',
    description: 'View and search your full email messages',
    risk: 'medium',
    reason: 'Needed to create bubbles from email content and understand context'
  },
  'https://www.googleapis.com/auth/gmail.modify': {
    icon: Edit,
    title: 'Modify Emails & Labels',
    description: 'Mark emails as read, archive, or apply labels (no sending)',
    risk: 'medium',
    reason: 'Required to manage email organization and create drafts'
  },
  'https://www.googleapis.com/auth/gmail.send': {
    icon: Send,
    title: 'Send Emails',
    description: 'Send emails on your behalf',
    risk: 'high',
    reason: 'Only requested when you explicitly enable email sending features'
  }
} as const;

export function ScopeConsentModal({ 
  open, 
  onOpenChange, 
  request, 
  currentScopes = [],
  onApprove, 
  onDeny 
}: ScopeConsentModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const showEnhancedUI = isFeatureEnabled('incrementalOAuth');

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const authUrl = await oauthService.requestScopeEscalation(request);
      onApprove(authUrl);
    } catch (error) {
      console.error('Failed to generate auth URL:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = () => {
    onDeny();
    onOpenChange(false);
  };

  const getServiceIcon = () => {
    switch (request.service) {
      case 'calendar':
        return Calendar;
      case 'email':
        return Mail;
      default:
        return Shield;
    }
  };

  const ServiceIcon = getServiceIcon();

  const isUpgrade = currentScopes.length > 0;
  const requestedScopes = request.requiredScopes || [];
  const service = request.service as 'calendar' | 'gmail';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={showEnhancedUI ? "max-w-2xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ServiceIcon className="h-5 w-5 text-primary" />
            </div>
            {isUpgrade ? 'Permission Upgrade' : 'Permission Request'}
          </DialogTitle>
          <DialogDescription>
            {isUpgrade 
              ? `Upgrade your ${request.service} permissions to ${request.reason}`
              : `Mind Manual needs permissions to ${request.reason}`
            }
          </DialogDescription>
        </DialogHeader>

        {showEnhancedUI && isUpgrade ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="comparison">Changes</TabsTrigger>
              <TabsTrigger value="progression">Levels</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              {/* Reason */}
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Why we're asking:</strong> {request.reason}
                </AlertDescription>
              </Alert>

              {/* Quick Summary */}
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <ArrowRight className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Permission Upgrade</p>
                  <p className="text-xs text-blue-700">
                    Adding {requestedScopes.filter(s => !currentScopes.includes(s)).length} new permission(s) 
                    to your existing {currentScopes.length} permission(s)
                  </p>
                </div>
              </div>

              {/* Security Notice */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Your privacy matters:</strong> You can revoke these permissions 
                  anytime in Settings → Integrations. We only access data you explicitly allow.
                </AlertDescription>
              </Alert>
            </TabsContent>
            
            <TabsContent value="comparison" className="space-y-4">
              <ScopeComparisonView
                currentScopes={currentScopes}
                requestedScopes={requestedScopes}
                service={service}
              />
            </TabsContent>
            
            <TabsContent value="progression" className="space-y-4">
              <ScopeProgressionIndicator
                service={service}
                currentScopes={currentScopes}
                targetScopes={requestedScopes}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            {/* Reason */}
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Why we're asking:</strong> {request.reason}
              </AlertDescription>
            </Alert>

            {/* Requested Permissions */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Requested Permissions:</h4>
              <div className="space-y-2">
                {requestedScopes.map((scope) => {
                  const scopeInfo = SCOPE_DESCRIPTIONS[scope as keyof typeof SCOPE_DESCRIPTIONS];
                  if (!scopeInfo) return null;

                  const IconComponent = scopeInfo.icon;
                  const riskColor = {
                    low: 'bg-green-50 text-green-700 border-green-200',
                    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                    high: 'bg-red-50 text-red-700 border-red-200'
                  }[scopeInfo.risk];

                  return (
                    <div key={scope} className="flex items-start gap-3 p-3 border rounded-lg">
                      <IconComponent className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{scopeInfo.title}</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${riskColor}`}
                          >
                            {scopeInfo.risk} risk
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {scopeInfo.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Security Notice */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Your privacy matters:</strong> You can revoke these permissions 
                anytime in Settings → Integrations. We only access data you explicitly allow.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleDeny}
            className="flex-1"
          >
            {isUpgrade ? 'Keep Current Level' : 'Continue Read-Only'}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? 'Connecting...' : (isUpgrade ? 'Upgrade Access' : 'Grant Access')}
          </Button>
        </div>

        {/* Alternative Path */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {isUpgrade 
              ? `You can continue using ${request.service} with your current permissions`
              : `You can still use ${request.service} features in read-only mode`
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}