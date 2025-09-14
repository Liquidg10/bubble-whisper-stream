/**
 * Production Loading States
 * Consistent loading indicators for async operations
 */

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Wifi, WifiOff } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = 'md', text, className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6', 
    lg: 'h-8 w-8'
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Loader2 className={`animate-spin ${sizeClasses[size]}`} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  );
}

export function DraftCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <div>
              <Skeleton className="h-4 w-48 mb-2" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="flex justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-14" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TaskCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

interface AutoWriteStatusProps {
  status: 'processing' | 'success' | 'error' | 'offline';
  message?: string;
}

export function AutoWriteStatus({ status, message }: AutoWriteStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'processing':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          text: message || 'Processing auto-write...'
        };
      case 'success':
        return {
          icon: <Clock className="h-4 w-4" />,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          text: message || 'Auto-write completed'
        };
      case 'error':
        return {
          icon: <WifiOff className="h-4 w-4" />,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          text: message || 'Auto-write failed'
        };
      case 'offline':
        return {
          icon: <WifiOff className="h-4 w-4" />,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          text: message || 'Offline - changes saved locally'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Badge variant="secondary" className={`${config.bgColor} ${config.color}`}>
      {config.icon}
      <span className="ml-2">{config.text}</span>
    </Badge>
  );
}

interface AsyncContentProps {
  loading: boolean;
  error?: Error | null;
  children: React.ReactNode;
  loadingSkeleton?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

export function AsyncContent({ 
  loading, 
  error, 
  children, 
  loadingSkeleton,
  errorFallback 
}: AsyncContentProps) {
  if (loading) {
    return loadingSkeleton || <LoadingSpinner text="Loading..." />;
  }

  if (error) {
    return errorFallback || (
      <Card>
        <CardContent className="text-center py-8">
          <WifiOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Failed to load content</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}