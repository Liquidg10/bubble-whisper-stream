import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Calendar, 
  CheckSquare, 
  CreditCard, 
  MessageCircle, 
  Brain,
  Info,
  Clock,
  Mail
} from 'lucide-react';
import { BecausePill } from './BecausePill';
import type { EmailMetadata, IntentClassification } from '@/services/gmailIntentClassifier';

interface GmailIntentChipProps {
  metadata: EmailMetadata;
  classification: IntentClassification;
  onCorrectIntent?: (newIntent: string) => void;
  onCreateBubble?: () => void;
  showActions?: boolean;
}

const intentConfig = {
  meeting_invite: {
    icon: Calendar,
    label: 'Meeting Invite',
    color: 'hsl(var(--primary))',
    bgColor: 'hsl(var(--primary) / 0.1)',
    description: 'Calendar invitation or meeting request'
  },
  task: {
    icon: CheckSquare,
    label: 'Action Required',
    color: 'hsl(var(--destructive))',
    bgColor: 'hsl(var(--destructive) / 0.1)',
    description: 'Task or action item that needs attention'
  },
  bill: {
    icon: CreditCard,
    label: 'Bill/Payment',
    color: 'hsl(var(--warning))',
    bgColor: 'hsl(var(--warning) / 0.1)',
    description: 'Invoice, bill, or payment notification'
  },
  confirmation: {
    icon: MessageCircle,
    label: 'Confirmation',
    color: 'hsl(var(--success))',
    bgColor: 'hsl(var(--success) / 0.1)',
    description: 'Receipt, confirmation, or status update'
  },
  thought: {
    icon: Brain,
    label: 'General',
    color: 'hsl(var(--muted-foreground))',
    bgColor: 'hsl(var(--muted) / 0.5)',
    description: 'General email or conversation'
  }
};

const horizonConfig = {
  today: { label: 'Today', color: 'hsl(var(--destructive))' },
  thisWeek: { label: 'This Week', color: 'hsl(var(--warning))' },
  thisMonth: { label: 'This Month', color: 'hsl(var(--primary))' },
  someday: { label: 'Someday', color: 'hsl(var(--muted-foreground))' }
};

export const GmailIntentChip: React.FC<GmailIntentChipProps> = ({
  metadata,
  classification,
  onCorrectIntent,
  onCreateBubble,
  showActions = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = intentConfig[classification.intent];
  const IconComponent = config.icon;
  const horizon = classification.horizon ? horizonConfig[classification.horizon] : null;

  const confidenceLevel = classification.confidence >= 0.75 ? 'High' : 
                         classification.confidence >= 0.5 ? 'Medium' : 'Low';

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4" 
              style={{ borderLeftColor: config.color }}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div 
                  className="p-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: config.bgColor }}
                >
                  <IconComponent 
                    className="h-4 w-4" 
                    style={{ color: config.color }} 
                  />
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-medium"
                      style={{ 
                        backgroundColor: config.bgColor,
                        color: config.color 
                      }}
                    >
                      {config.label}
                    </Badge>
                    {horizon && (
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{ color: horizon.color }}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {horizon.label}
                      </Badge>
                    )}
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        confidenceLevel === 'High' ? 'border-green-500 text-green-700' :
                        confidenceLevel === 'Medium' ? 'border-yellow-500 text-yellow-700' :
                        'border-gray-500 text-gray-700'
                      }`}
                    >
                      {Math.round(classification.confidence * 100)}%
                    </Badge>
                  </div>
                  
                  <h4 className="font-medium text-sm truncate mb-1">
                    {metadata.subject}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate">
                    From: {metadata.sender}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(metadata.receivedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                  }}
                >
                  <Info className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Tags */}
            {classification.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {classification.tags.slice(0, 3).map((tag) => (
                  <Badge 
                    key={tag} 
                    variant="outline" 
                    className="text-xs px-1 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {classification.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    +{classification.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </PopoverTrigger>

      <PopoverContent className="w-80" side="right" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4" />
              Email Details
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Subject:</span> {metadata.subject}
              </div>
              <div>
                <span className="font-medium">From:</span> {metadata.sender}
              </div>
              <div>
                <span className="font-medium">Email:</span> {metadata.senderEmail}
              </div>
              <div>
                <span className="font-medium">Received:</span> {formatDate(metadata.receivedAt)}
              </div>
              {metadata.snippet && (
                <div>
                  <span className="font-medium">Preview:</span> {metadata.snippet}
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">Intent Classification</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconComponent className="h-4 w-4" style={{ color: config.color }} />
                <span className="text-sm">{config.label}</span>
                <Badge variant="outline" className="text-xs">
                  {Math.round(classification.confidence * 100)}% confidence
                </Badge>
              </div>
              
              <BecausePill 
                explanation={{
                  reason: classification.reasoning,
                  factors: [],
                  confidence: classification.confidence
                }}
                compact={false}
              />
            </div>
          </div>

          {classification.tags.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {classification.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {showActions && (
            <div className="flex gap-2 pt-2 border-t">
              {onCreateBubble && (
                <Button
                  size="sm"
                  onClick={() => {
                    onCreateBubble();
                    setIsOpen(false);
                  }}
                  className="flex-1"
                >
                  Create Bubble
                </Button>
              )}
              {onCorrectIntent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Could open a correction dialog
                    onCorrectIntent('thought');
                    setIsOpen(false);
                  }}
                  className="flex-1"
                >
                  Correct Intent
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};