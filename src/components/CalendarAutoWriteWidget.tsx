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
  Undo2,
  Eye
} from 'lucide-react';
import { calendarWriteService } from '@/services/calendarWriteService';
import { usePrecisionGateUndo } from '@/hooks/usePrecisionGateUndo';
import { toast } from '@/hooks/use-toast';

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
        title: "Event Created",
        description: "Calendar event has been successfully created.",
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
            <div className="space-y-2">
              <div className="font-medium">{draft.title}</div>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {new Date(draft.startTime).toLocaleString()}
                </div>
                
                {draft.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {draft.location}
                  </div>
                )}
                
                {draft.attendees && draft.attendees.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {draft.attendees.length} attendees
                  </div>
                )}
              </div>

              {draft.description && (
                <div className="text-sm text-muted-foreground">
                  {draft.description}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Badge variant={draft.autoWriteEligible ? "default" : "secondary"}>
                  {Math.round((draft.confidence || 0.5) * 100)}% confidence
                </Badge>
                {draft.autoWriteEligible && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Auto-write eligible
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleConfirmDraft(draft.id)}
                disabled={loading}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirm & Create
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteDraft(draft.id)}
                disabled={loading}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
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