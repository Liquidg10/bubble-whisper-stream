import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle, 
  XCircle, 
  Eye,
  ExternalLink
} from 'lucide-react';
import { calendarWriteService } from '@/services/calendarWriteService';
import { usePrecisionGateUndo } from '@/hooks/usePrecisionGateUndo';
import { toast } from '@/hooks/use-toast';
import { CalendarEmbed } from '@/components/EmbedPreview';
import { InlineActionBar } from '@/components/InlineActionBar';

interface CalendarAutoWriteWidgetProps {
  className?: string;
}

export function CalendarAutoWriteWidget({ className }: CalendarAutoWriteWidgetProps) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { createCalendarUndo, showUndoToast } = usePrecisionGateUndo();

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    const currentDrafts = calendarWriteService.getDrafts();
    setDrafts(currentDrafts);
  };

  const handleConfirmDraft = async (draftId: string) => {
    setLoading(true);
    try {
      const result = await calendarWriteService.confirmDraft(draftId);
      
      // Show undo toast for confirmed events
      const undoAction = createCalendarUndo(result);
      showUndoToast(undoAction);
      
      loadDrafts();
      
      toast({
        title: "Added • Undo",
        description: "Calendar event created successfully",
      });
    } catch (error) {
      console.error('Failed to confirm draft:', error);
      toast({
        title: "Error",
        description: "Failed to create calendar event. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = (draftId: string) => {
    const updatedDrafts = drafts.filter(d => d.id !== draftId);
    localStorage.setItem('calendar_drafts', JSON.stringify(updatedDrafts));
    setDrafts(updatedDrafts);
    
    toast({
      title: "Draft Deleted",
      description: "Calendar draft has been removed.",
    });
  };

  if (drafts.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar Drafts
          <Badge variant="secondary">{drafts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="border border-border rounded-lg p-4 space-y-3">
            {/* Calendar Event Preview */}
            <CalendarEmbed
              event={{
                id: draft.id,
                title: draft.title,
                startTime: draft.startTime,
                endTime: draft.endTime,
                location: draft.location,
                attendees: draft.attendees,
                description: draft.description,
                htmlLink: draft.htmlLink, // Google Calendar link if available
                confidence: draft.confidence
              }}
              onOpenExternal={() => {
                console.log('Opening calendar event in Google Calendar');
              }}
            />

            {/* Inline Action Bar */}
            <InlineActionBar
              state="draft"
              confidence={draft.confidence || 0.5}
              autoWriteEligible={draft.autoWriteEligible}
              onConfirm={() => handleConfirmDraft(draft.id)}
              onReject={() => handleDeleteDraft(draft.id)}
              onOpenExternal={draft.htmlLink ? () => window.open(draft.htmlLink, '_blank') : undefined}
              loading={loading}
            />
          </div>
        ))}

        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Calendar drafts are created when the system has medium confidence in event details. 
            Review and confirm to add to your calendar.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}