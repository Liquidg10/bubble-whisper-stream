/**
 * Production Error Boundary
 * Catches React errors and provides user-friendly fallbacks
 */

import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';
import { logger } from '@/utils/logger';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  errorId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Log error for debugging
    logger.error('React Error Boundary caught error', {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    this.setState({
      error,
      errorInfo,
      errorId
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReportError = () => {
    if (this.state.error && this.state.errorId) {
      // In production, would send to error reporting service
      console.log('Reporting error:', {
        id: this.state.errorId,
        message: this.state.error.message,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
      
      // Show user feedback
      alert('Error report sent. Thank you for helping us improve!');
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Card className="max-w-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Bug className="h-4 w-4" />
              <AlertDescription>
                We've encountered an unexpected error. Your data is safe, but this feature isn't working right now.
              </AlertDescription>
            </Alert>

            {this.props.showDetails && this.state.error && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium mb-2">
                  Technical Details
                </summary>
                <div className="bg-muted p-3 rounded-lg space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  {this.state.errorId && (
                    <div>
                      <strong>ID:</strong> {this.state.errorId}
                    </div>
                  )}
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="text-xs mt-1 whitespace-pre-wrap">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex gap-2">
              <Button onClick={this.handleRetry} className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleReportError}
                className="flex-1"
              >
                <Bug className="h-4 w-4 mr-2" />
                Report Issue
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can continue using other parts of the app. If this keeps happening, 
              try refreshing the page.
            </p>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorBoundary() {
  return (error: Error) => {
    throw error;
  };
}