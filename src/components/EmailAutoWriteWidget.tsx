import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Mail, 
  Send, 
  Edit3, 
  Trash2, 
  Eye,
  CheckCircle,
  Clock
} from 'lucide-react';
import { gmailDraftSendService } from '@/services/gmailDraftSendService';
import { usePrecisionGateUndo } from '@/hooks/usePrecisionGateUndo';
import { toast } from '@/hooks/use-toast';

interface EmailDraft {
  id: string;
  to: string[];
  subject: string;
  body: string;
  confidence?: number;
  autoSendEligible?: boolean;
  created_at: string;
  account_id: string;
}

interface EmailAutoWriteWidgetProps {
  className?: string;
}

export function EmailAutoWriteWidget({ className }: EmailAutoWriteWidgetProps) {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const { createEmailUndo, showUndoToast } = usePrecisionGateUndo();

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = () => {
    // Load drafts from localStorage for demo
    // In real implementation, this would fetch from database
    const stored = localStorage.getItem('email_drafts');
    const emailDrafts = stored ? JSON.parse(stored) : [];
    setDrafts(emailDrafts);
  };

  const handleSendDraft = async (draft: EmailDraft) => {
    setLoading(true);
    try {
      const result = await gmailDraftSendService.sendDraft(draft.account_id, draft.id);
      
      if (result.success) {
        // Show undo toast for sent emails
        const undoAction = createEmailUndo({
          traceId: `email-${Date.now()}`,
          messageId: result.messageId,
          draftId: draft.id,
          subject: draft.subject,
          isDraft: false
        });
        showUndoToast(undoAction);
        
        // Remove from drafts
        const updatedDrafts = drafts.filter(d => d.id !== draft.id);
        setDrafts(updatedDrafts);
        localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));
        
        toast({
          title: "Email Sent",
          description: `Email sent to ${draft.to.join(', ')}`,
        });
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error) {
      console.error('Failed to send draft:', error);
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditDraft = (draft: EmailDraft) => {
    // In a real implementation, this would open the email composer
    toast({
      title: "Edit Draft",
      description: "Email composer would open here for editing.",
    });
  };

  const handleDeleteDraft = (draftId: string) => {
    const updatedDrafts = drafts.filter(d => d.id !== draftId);
    setDrafts(updatedDrafts);
    localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));
    
    toast({
      title: "Draft Deleted",
      description: "Email draft has been removed.",
    });
  };

  if (drafts.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Drafts
          <Badge variant="secondary">{drafts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((draft) => (
          <div key={draft.id} className="border border-border rounded-lg p-4 space-y-3">
            <div className="space-y-2">
              <div className="font-medium">{draft.subject}</div>
              
              <div className="text-sm text-muted-foreground">
                To: {draft.to.join(', ')}
              </div>
              
              <div className="text-sm text-muted-foreground line-clamp-2">
                {draft.body.substring(0, 150)}...
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={draft.autoSendEligible ? "default" : "secondary"}>
                  {Math.round((draft.confidence || 0.5) * 100)}% confidence
                </Badge>
                {draft.autoSendEligible && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Auto-send eligible
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(draft.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleSendDraft(draft)}
                disabled={loading}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditDraft(draft)}
                disabled={loading}
              >
                <Edit3 className="h-4 w-4 mr-1" />
                Edit
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteDraft(draft.id)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        ))}

        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription>
            Email drafts are created when the system has medium to high confidence in the content. 
            Review and send when ready.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}