/**
 * EmbedPreview Components
 * 
 * Unified preview components for external integrations
 * with deep-linking and quick verification actions.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ExternalLink, 
  Calendar, 
  Mail, 
  DollarSign,
  Clock,
  MapPin,
  Users,
  User,
  FileText
} from 'lucide-react';

interface CalendarEmbedProps {
  event: {
    id?: string;
    title: string;
    startTime: string;
    endTime?: string;
    location?: string;
    attendees?: string[];
    description?: string;
    htmlLink?: string;
    confidence?: number;
  };
  onOpenExternal?: () => void;
}

export function CalendarEmbed({ event, onOpenExternal }: CalendarEmbedProps) {
  const handleOpenGoogleCalendar = () => {
    if (event.htmlLink) {
      window.open(event.htmlLink, '_blank');
    }
    onOpenExternal?.();
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="font-medium text-sm">{event.title}</div>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(event.startTime).toLocaleString()}
            </div>
            
            {event.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate max-w-[100px]">{event.location}</span>
              </div>
            )}
            
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {event.attendees.length}
              </div>
            )}
          </div>

          {event.confidence && (
            <Badge variant="outline" className="text-xs">
              {Math.round(event.confidence * 100)}% confidence
            </Badge>
          )}
        </div>
        
        {event.htmlLink && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleOpenGoogleCalendar}
            className="text-xs h-7 px-2"
          >
            <Calendar className="h-3 w-3 mr-1" />
            Open in Google
          </Button>
        )}
      </div>
    </div>
  );
}

interface GmailEmbedProps {
  thread: {
    id: string;
    subject: string;
    from: string;
    snippet: string;
    date: string;
    labels?: string[];
    accountId?: string;
  };
  onOpenExternal?: () => void;
}

export function GmailEmbed({ thread, onOpenExternal }: GmailEmbedProps) {
  const handleOpenGmail = () => {
    const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${thread.id}`;
    window.open(gmailUrl, '_blank');
    onOpenExternal?.();
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="font-medium text-sm">{thread.subject}</div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {thread.from}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(thread.date).toLocaleDateString()}
            </div>
          </div>

          <div className="text-xs text-muted-foreground line-clamp-2">
            {thread.snippet}
          </div>

          {thread.labels && thread.labels.length > 0 && (
            <div className="flex gap-1">
              {thread.labels.slice(0, 2).map(label => (
                <Badge key={label} variant="secondary" className="text-xs">
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleOpenGmail}
          className="text-xs h-7 px-2"
        >
          <Mail className="h-3 w-3 mr-1" />
          Open in Gmail
        </Button>
      </div>
    </div>
  );
}

interface FinanceEmbedProps {
  transaction: {
    id: string;
    description: string;
    amount: number;
    date: string;
    category?: string;
    account?: string;
    confidence?: number;
  };
  onOpenExternal?: () => void;
}

export function FinanceEmbed({ transaction, onOpenExternal }: FinanceEmbedProps) {
  const handleOpenPlaid = () => {
    // Would open bank app or Plaid interface
    onOpenExternal?.();
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="font-medium text-sm">{transaction.description}</div>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              ${Math.abs(transaction.amount).toFixed(2)}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(transaction.date).toLocaleDateString()}
            </div>
          </div>

          {transaction.category && (
            <Badge variant="outline" className="text-xs">
              {transaction.category}
            </Badge>
          )}

          {transaction.confidence && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(transaction.confidence * 100)}% confidence
            </Badge>
          )}
        </div>
        
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleOpenPlaid}
          className="text-xs h-7 px-2"
        >
          <FileText className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </div>
    </div>
  );
}