import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ScopeStatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'pending';
  message?: string;
  className?: string;
}

export function ScopeStatusIndicator({ 
  status, 
  message, 
  className = '' 
}: ScopeStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'loading':
        return {
          icon: Loader2,
          variant: 'secondary' as const,
          className: 'bg-blue-50 text-blue-700 border-blue-200',
          iconClassName: 'animate-spin'
        };
      case 'success':
        return {
          icon: CheckCircle,
          variant: 'secondary' as const,
          className: 'bg-green-50 text-green-700 border-green-200',
          iconClassName: ''
        };
      case 'error':
        return {
          icon: XCircle,
          variant: 'destructive' as const,
          className: 'bg-red-50 text-red-700 border-red-200',
          iconClassName: ''
        };
      case 'pending':
        return {
          icon: AlertTriangle,
          variant: 'secondary' as const,
          className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
          iconClassName: ''
        };
    }
  };

  const { icon: Icon, variant, className: statusClassName, iconClassName } = getStatusConfig();

  return (
    <Badge 
      variant={variant} 
      className={`flex items-center gap-1.5 ${statusClassName} ${className}`}
    >
      <Icon className={`h-3 w-3 ${iconClassName}`} />
      {message || status}
    </Badge>
  );
}