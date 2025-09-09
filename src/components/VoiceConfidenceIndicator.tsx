import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { IntentResult } from '@/intent/voiceRouter';

interface VoiceConfidenceIndicatorProps {
  intentResult: IntentResult;
  isProcessing?: boolean;
  wasAutoCommitted?: boolean;
  bubbleCreated?: boolean;
}

export function VoiceConfidenceIndicator({ 
  intentResult, 
  isProcessing = false,
  wasAutoCommitted = false,
  bubbleCreated = false
}: VoiceConfidenceIndicatorProps) {
  const getConfidenceColor = (gate: string) => {
    switch (gate) {
      case 'high': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    if (isProcessing) {
      return <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
    }
    
    if (wasAutoCommitted && bubbleCreated) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
    
    if (intentResult.needsClarification) {
      return <HelpCircle className="w-4 h-4 text-yellow-600" />;
    }
    
    if (bubbleCreated) {
      return <CheckCircle className="w-4 h-4 text-blue-600" />;
    }
    
    return <AlertCircle className="w-4 h-4 text-gray-600" />;
  };

  const getStatusText = () => {
    if (isProcessing) return 'Processing...';
    if (wasAutoCommitted && bubbleCreated) return 'Auto-committed';
    if (bubbleCreated) return 'Bubble created';
    if (intentResult.needsClarification) return 'Needs clarification';
    return 'Ready';
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-card/50 rounded-lg border">
      {getStatusIcon()}
      
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {Math.round(intentResult.confidence * 100)}% confident
        </Badge>
        
        <div className={`w-2 h-2 rounded-full ${getConfidenceColor(intentResult.confidenceGate)}`} />
        
        <span className="text-sm text-muted-foreground">
          {getStatusText()}
        </span>
      </div>
      
      {intentResult.type && (
        <Badge variant="secondary" className="text-xs">
          {intentResult.type}
        </Badge>
      )}
    </div>
  );
}