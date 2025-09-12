import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  Plus, 
  Minus, 
  CheckCircle, 
  Eye, 
  Edit, 
  Send,
  Calendar,
  Mail
} from 'lucide-react';

interface ScopeComparisonViewProps {
  currentScopes: string[];
  requestedScopes: string[];
  service: 'calendar' | 'gmail';
}

const SCOPE_INFO = {
  'https://www.googleapis.com/auth/calendar.readonly': {
    icon: Eye,
    title: 'Read Calendar Events',
    description: 'View your calendar events and details',
    risk: 'low' as const
  },
  'https://www.googleapis.com/auth/calendar.events': {
    icon: Edit,
    title: 'Create Calendar Events',
    description: 'Create and edit calendar events',
    risk: 'medium' as const
  },
  'https://www.googleapis.com/auth/gmail.metadata': {
    icon: Eye,
    title: 'Email Headers & Labels',
    description: 'View email subjects, senders, and labels',
    risk: 'low' as const
  },
  'https://www.googleapis.com/auth/gmail.readonly': {
    icon: Eye,
    title: 'Read Email Content',
    description: 'View and search your full email messages',
    risk: 'medium' as const
  },
  'https://www.googleapis.com/auth/gmail.modify': {
    icon: Edit,
    title: 'Modify Emails & Labels',
    description: 'Mark emails as read, archive, or apply labels',
    risk: 'medium' as const
  },
  'https://www.googleapis.com/auth/gmail.send': {
    icon: Send,
    title: 'Send Emails',
    description: 'Send emails on your behalf',
    risk: 'high' as const
  }
};

export function ScopeComparisonView({ currentScopes, requestedScopes, service }: ScopeComparisonViewProps) {
  const addedScopes = requestedScopes.filter(scope => !currentScopes.includes(scope));
  const maintainedScopes = requestedScopes.filter(scope => currentScopes.includes(scope));
  const removedScopes = currentScopes.filter(scope => !requestedScopes.includes(scope));
  
  const ServiceIcon = service === 'calendar' ? Calendar : Mail;
  
  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low': return 'bg-green-50 text-green-700 border-green-200';
      case 'medium': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'high': return 'bg-red-50 text-red-700 border-red-200';
    }
  };
  
  const renderScopeItem = (scope: string, status: 'added' | 'maintained' | 'removed') => {
    const scopeInfo = SCOPE_INFO[scope as keyof typeof SCOPE_INFO];
    if (!scopeInfo) return null;
    
    const IconComponent = scopeInfo.icon;
    const statusConfig = {
      added: { 
        icon: Plus, 
        bgColor: 'bg-green-50 border-green-200', 
        iconColor: 'text-green-600',
        label: 'New Permission'
      },
      maintained: { 
        icon: CheckCircle, 
        bgColor: 'bg-blue-50 border-blue-200', 
        iconColor: 'text-blue-600',
        label: 'Keeping'
      },
      removed: { 
        icon: Minus, 
        bgColor: 'bg-red-50 border-red-200', 
        iconColor: 'text-red-600',
        label: 'Removing'
      }
    };
    
    const config = statusConfig[status];
    const StatusIcon = config.icon;
    
    return (
      <div key={scope} className={`flex items-start gap-3 p-3 border rounded-lg ${config.bgColor}`}>
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 ${config.iconColor}`} />
          <IconComponent className="h-4 w-4 text-muted-foreground" />
        </div>
        
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{scopeInfo.title}</span>
            <Badge variant="outline" className={`text-xs ${getRiskColor(scopeInfo.risk)}`}>
              {scopeInfo.risk} risk
            </Badge>
            <Badge variant="outline" className="text-xs">
              {config.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {scopeInfo.description}
          </p>
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ServiceIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-medium">Permission Changes</h3>
          <p className="text-sm text-muted-foreground">
            Compare your current and requested permissions
          </p>
        </div>
      </div>
      
      {/* New Permissions */}
      {addedScopes.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Plus className="h-4 w-4 text-green-600" />
            New Permissions ({addedScopes.length})
          </h4>
          <div className="space-y-2">
            {addedScopes.map(scope => renderScopeItem(scope, 'added'))}
          </div>
        </div>
      )}
      
      {/* Maintained Permissions */}
      {maintainedScopes.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            Keeping Current Permissions ({maintainedScopes.length})
          </h4>
          <div className="space-y-2">
            {maintainedScopes.map(scope => renderScopeItem(scope, 'maintained'))}
          </div>
        </div>
      )}
      
      {/* Removed Permissions */}
      {removedScopes.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Minus className="h-4 w-4 text-red-600" />
            Removing Permissions ({removedScopes.length})
          </h4>
          <div className="space-y-2">
            {removedScopes.map(scope => renderScopeItem(scope, 'removed'))}
          </div>
        </div>
      )}
      
      {/* Summary Alert */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>What's changing:</strong> You're granting {addedScopes.length} new permission{addedScopes.length !== 1 ? 's' : ''} 
          while keeping {maintainedScopes.length} existing permission{maintainedScopes.length !== 1 ? 's' : ''}.
          {removedScopes.length > 0 && ` ${removedScopes.length} permission${removedScopes.length !== 1 ? 's' : ''} will be removed.`}
        </AlertDescription>
      </Alert>
    </div>
  );
}