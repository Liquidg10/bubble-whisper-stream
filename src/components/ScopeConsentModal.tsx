import React, { useState } from 'react';
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
import { 
  Shield, 
  Calendar, 
  Mail, 
  Eye, 
  Edit, 
  AlertTriangle,
  CheckCircle 
} from 'lucide-react';
import { oauthService, ScopeRequest } from '@/services/oauthService';

interface ScopeConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ScopeRequest;
  onApprove: (authUrl: string) => void;
  onDeny: () => void;
}

const SCOPE_DESCRIPTIONS = {
  'https://www.googleapis.com/auth/calendar.readonly': {
    icon: Eye,
    title: 'Read Calendar Events',
    description: 'View your calendar events and details',
    risk: 'low'
  },
  'https://www.googleapis.com/auth/calendar': {
    icon: Edit,
    title: 'Manage Calendar Events',
    description: 'Create, edit, and delete calendar events',
    risk: 'medium'
  },
  'https://www.googleapis.com/auth/gmail.metadata': {
    icon: Eye,
    title: 'Read Email Metadata',
    description: 'View email subjects, senders, and labels (not content)',
    risk: 'low'
  },
  'https://www.googleapis.com/auth/gmail.readonly': {
    icon: Eye,
    title: 'Read Email Content',
    description: 'View and search your email messages',
    risk: 'medium'
  },
  'https://www.googleapis.com/auth/gmail.compose': {
    icon: Edit,
    title: 'Compose Emails',
    description: 'Create and send email drafts',
    risk: 'high'
  },
  'https://www.googleapis.com/auth/gmail.modify': {
    icon: Edit,
    title: 'Modify Emails',
    description: 'Mark emails as read, archive, or apply labels',
    risk: 'medium'
  }
} as const;

export function ScopeConsentModal({ 
  open, 
  onOpenChange, 
  request, 
  onApprove, 
  onDeny 
}: ScopeConsentModalProps) {
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ServiceIcon className="h-5 w-5 text-primary" />
            </div>
            Permission Request
          </DialogTitle>
          <DialogDescription>
            Mind Manual needs additional permissions to {request.reason}
          </DialogDescription>
        </DialogHeader>

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
              {(request.requiredScopes || []).map((scope) => {
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleDeny}
              className="flex-1"
            >
              Continue Read-Only
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Connecting...' : 'Grant Access'}
            </Button>
          </div>

          {/* Alternative Path */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              You can still use {request.service} features in read-only mode
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}