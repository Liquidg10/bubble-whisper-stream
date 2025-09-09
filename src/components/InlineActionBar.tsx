/**
 * InlineActionBar Component
 * 
 * Reusable component for unified suggestion → draft → confirm flows
 * with consistent styling and interaction patterns.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  XCircle, 
  ArrowRight, 
  Edit3, 
  ExternalLink 
} from 'lucide-react';

export type ActionState = 'suggestion' | 'draft' | 'confirmed';

interface InlineActionBarProps {
  state: ActionState;
  confidence: number;
  autoWriteEligible?: boolean;
  onPromote?: () => void;
  onConfirm?: () => void;
  onEdit?: () => void;
  onReject?: () => void;
  onOpenExternal?: () => void;
  loading?: boolean;
  className?: string;
}

export function InlineActionBar({
  state,
  confidence,
  autoWriteEligible = false,
  onPromote,
  onConfirm,
  onEdit,
  onReject,
  onOpenExternal,
  loading = false,
  className = ""
}: InlineActionBarProps) {
  const confidencePercent = Math.round(confidence * 100);

  const renderStateContent = () => {
    switch (state) {
      case 'suggestion':
        return (
          <>
            <div className="flex items-center gap-2 flex-1">
              <Badge variant={autoWriteEligible ? "default" : "secondary"}>
                {confidencePercent}% confidence
              </Badge>
              {autoWriteEligible && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Auto-write eligible
                </Badge>
              )}
              <Progress value={confidencePercent} className="w-20 h-1" />
            </div>
            
            <div className="flex gap-2">
              {onPromote && (
                <Button 
                  size="sm" 
                  onClick={onPromote}
                  disabled={loading}
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Create Draft
                </Button>
              )}
              {onReject && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onReject}
                  disabled={loading}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              )}
            </div>
          </>
        );

      case 'draft':
        return (
          <>
            <div className="flex items-center gap-2 flex-1">
              <Badge variant="outline">Draft Ready</Badge>
              <Badge variant="secondary">
                {confidencePercent}% confidence
              </Badge>
            </div>
            
            <div className="flex gap-2">
              {onConfirm && (
                <Button 
                  size="sm" 
                  onClick={onConfirm}
                  disabled={loading}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirm
                </Button>
              )}
              {onEdit && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onEdit}
                  disabled={loading}
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
              {onReject && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onReject}
                  disabled={loading}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              )}
            </div>
          </>
        );

      case 'confirmed':
        return (
          <>
            <div className="flex items-center gap-2 flex-1">
              <Badge variant="default" className="text-green-600 border-green-600">
                Created
              </Badge>
              <span className="text-sm text-muted-foreground">
                Action completed successfully
              </span>
            </div>
            
            {onOpenExternal && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onOpenExternal}
                disabled={loading}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open
              </Button>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {renderStateContent()}
    </div>
  );
}