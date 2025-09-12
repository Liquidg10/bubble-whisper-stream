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
  AlertTriangle,
  Shield,
  Calendar,
  Mail,
  X,
  CheckCircle
} from 'lucide-react';
import { ScopeRequest } from '@/services/oauthService';

interface ScopeDowngradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ScopeRequest;
  currentScopes: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

const FEATURE_IMPACT = {
  'https://www.googleapis.com/auth/calendar.events': [
    'Creating events from tasks',
    'Auto-scheduling features',
    'Calendar write operations'
  ],
  'https://www.googleapis.com/auth/gmail.send': [
    'Sending emails',
    'Automated email responses', 
    'Email scheduling features'
  ],
  'https://www.googleapis.com/auth/gmail.modify': [
    'Creating email drafts',
    'Organizing emails',
    'Managing labels'
  ],
  'https://www.googleapis.com/auth/gmail.readonly': [
    'Reading email content',
    'Creating tasks from emails',
    'Email content analysis'
  ]
} as const;

export function ScopeDowngradeModal({
  open,
  onOpenChange,
  request,
  currentScopes,
  onConfirm,
  onCancel
}: ScopeDowngradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
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
  const removingScopes = currentScopes.filter(scope => 
    !request.requiredScopes.includes(scope)
  );

  const affectedFeatures = removingScopes.flatMap(scope => 
    FEATURE_IMPACT[scope as keyof typeof FEATURE_IMPACT] || []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-50 border border-orange-200">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            Reduce Permissions
          </DialogTitle>
          <DialogDescription>
            You're about to reduce your {request.service} permissions. Some features will be disabled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current vs Target */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <ServiceIcon className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                Reducing to minimal permissions
              </p>
              <p className="text-xs text-blue-700">
                Removing {removingScopes.length} permission(s) from {currentScopes.length} total
              </p>
            </div>
          </div>

          {/* Affected Features Warning */}
          {affectedFeatures.length > 0 && (
            <Alert variant="destructive">
              <X className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">These features will be disabled:</p>
                  <ul className="text-xs space-y-1 pl-4">
                    {affectedFeatures.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-current rounded-full" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* What You Keep */}
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">You'll still have:</p>
                <p className="text-xs">
                  {request.service === 'calendar' 
                    ? 'Read-only access to view calendar events and create reminders'
                    : 'Basic email metadata access for organization and filtering'
                  }
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* Privacy Benefit */}
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Enhanced Privacy</p>
                <p className="text-xs text-green-700">
                  Reducing permissions means less data access and improved privacy
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            Keep Current
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? 'Updating...' : 'Reduce Permissions'}
          </Button>
        </div>

        {/* Reversal Notice */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            You can always upgrade permissions later if needed
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
