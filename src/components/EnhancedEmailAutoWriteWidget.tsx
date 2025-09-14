/**
 * Enhanced Email Auto-Write Widget
 * Shows email drafts with better UX and management
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Mail, 
  Send, 
  Edit, 
  Trash2, 
  ExternalLink,
  Eye,
  Undo2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { taskAwareAutoWriteService } from '@/services/taskAwareAutoWriteService';
import { gmailDraftSendService } from '@/services/gmailDraftSendService';

interface EmailDraft {
  id: string;
  taskId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  confidence: number;
  createdAt: number;
  draftId?: string;
  status: 'draft' | 'sent' | 'failed';
  guardrailResults?: {
    autoSend: boolean;
    draft: boolean;
    confirmation: boolean;
    warnings: string[];
  };
}

interface EnhancedEmailAutoWriteWidgetProps {
  className?: string;
}

export const EnhancedEmailAutoWriteWidget: React.FC<EnhancedEmailAutoWriteWidgetProps> = ({ 
  className = '' 
}) => {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);
  const [editingDraft, setEditingDraft] = useState<EmailDraft | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadEmailDrafts();
    
    // Refresh every 30 seconds to catch new drafts
    const interval = setInterval(loadEmailDrafts, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadEmailDrafts = async () => {
    setLoading(true);
    try {
      // Load from localStorage for demo - in production would load from Supabase
      const stored = localStorage.getItem('email_drafts');
      let parsedDrafts: EmailDraft[] = [];
      if (stored) {
        parsedDrafts = JSON.parse(stored);
        setDrafts(parsedDrafts);
      }
      
      // Also load recent mappings from auto-write service
      const mappings = taskAwareAutoWriteService.getAllEmailMappings();
      const mappingDrafts: EmailDraft[] = Array.from(mappings.values()).map(mapping => ({
        id: `mapping-${mapping.taskId}`,
        taskId: mapping.taskId,
        to: mapping.recipients,
        subject: mapping.subject,
        body: `Draft generated from task (confidence: ${mapping.confidence})`,
        confidence: mapping.confidence,
        createdAt: mapping.createdAt,
        status: 'draft' as const,
        draftId: mapping.draftId
      }));
      
      // Combine and deduplicate
      const allDrafts = [...parsedDrafts, ...mappingDrafts];
      const uniqueDrafts = allDrafts.filter((draft, index, self) => 
        index === self.findIndex(d => d.id === draft.id)
      );
      
      setDrafts(uniqueDrafts.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load email drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendDraft = async (draft: EmailDraft) => {
    try {
      setLoading(true);
      
      // Get user's Gmail account (simplified - in production would be more robust)
      const mockAccountId = 'user-account-id';
      
      const result = await gmailDraftSendService.composeEmail(mockAccountId, {
        to: draft.to,
        cc: draft.cc,
        subject: draft.subject,
        body: draft.body,
        recipients: draft.to
      }, {
        autoSendEnabled: false, // Always manual for now
        requireConfirmation: true
      });

      if (result.success) {
        // Update draft status
        setDrafts(prev => prev.map(d => 
          d.id === draft.id 
            ? { ...d, status: 'sent' as const, draftId: result.draftId }
            : d
        ));

        toast({
          title: "Email Sent",
          description: "Your email has been sent successfully",
          action: result.messageId ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleUndoSend(draft.id, result.messageId!)}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          ) : undefined
        });
      } else {
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (error) {
      toast({
        title: "Send Failed",
        description: error instanceof Error ? error.message : "Failed to send email",
        variant: "destructive"
      });
      
      // Update draft status to failed
      setDrafts(prev => prev.map(d => 
        d.id === draft.id 
          ? { ...d, status: 'failed' as const }
          : d
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleEditDraft = (draft: EmailDraft) => {
    setEditingDraft({ ...draft });
  };

  const handleSaveEdit = async () => {
    if (!editingDraft) return;
    
    try {
      // Update the draft
      setDrafts(prev => prev.map(d => 
        d.id === editingDraft.id ? editingDraft : d
      ));
      
      // Save to localStorage
      const updatedDrafts = drafts.map(d => 
        d.id === editingDraft.id ? editingDraft : d
      );
      localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));
      
      setEditingDraft(null);
      
      toast({
        title: "Draft Updated",
        description: "Your changes have been saved",
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save draft changes",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      // Remove from state
      setDrafts(prev => prev.filter(d => d.id !== draftId));
      
      // Update localStorage
      const updatedDrafts = drafts.filter(d => d.id !== draftId);
      localStorage.setItem('email_drafts', JSON.stringify(updatedDrafts));
      
      toast({
        title: "Draft Deleted",
        description: "Email draft has been removed",
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete draft",
        variant: "destructive"
      });
    }
  };

  const handleUndoSend = async (draftId: string, messageId: string) => {
    // In production, this would call Gmail API to delete/recall the message
    toast({
      title: "Undo Not Available",
      description: "Email undo is not available in this demo",
      variant: "default"
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const filterDrafts = (drafts: EmailDraft[], filter: string) => {
    switch (filter) {
      case 'pending':
        return drafts.filter(d => d.status === 'draft');
      case 'sent':
        return drafts.filter(d => d.status === 'sent');
      case 'failed':
        return drafts.filter(d => d.status === 'failed');
      case 'all':
      default:
        return drafts;
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const filteredDrafts = filterDrafts(drafts, activeTab);

  if (drafts.length === 0 && !loading) {
    return null; // Don't show widget if no drafts
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Auto-Write
          <Badge variant="secondary">{drafts.length}</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pending">
              Pending ({filterDrafts(drafts, 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="sent">
              Sent ({filterDrafts(drafts, 'sent').length})
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed ({filterDrafts(drafts, 'failed').length})
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-4">
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-pulse">Loading drafts...</div>
              </div>
            ) : filteredDrafts.length === 0 ? (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  No email drafts in this category
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {filteredDrafts.map((draft) => (
                  <Card key={draft.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {getStatusIcon(draft.status)}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm truncate">
                              {draft.subject}
                            </h4>
                            <Badge className={`text-xs ${getConfidenceColor(draft.confidence)}`}>
                              {Math.round(draft.confidence * 100)}%
                            </Badge>
                          </div>
                          
                          <p className="text-xs text-muted-foreground mb-2">
                            To: {draft.to.join(', ')} • {formatTime(draft.createdAt)}
                          </p>
                          
                          {draft.taskId && (
                            <Badge variant="outline" className="text-xs mb-2">
                              <Sparkles className="h-3 w-3 mr-1" />
                              Auto-generated from task
                            </Badge>
                          )}
                          
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {draft.body.substring(0, 120)}...
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedDraft(draft)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Email Preview</DialogTitle>
                            </DialogHeader>
                            {selectedDraft && (
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-xs">To:</Label>
                                  <p className="text-sm">{selectedDraft.to.join(', ')}</p>
                                </div>
                                <div>
                                  <Label className="text-xs">Subject:</Label>
                                  <p className="text-sm font-medium">{selectedDraft.subject}</p>
                                </div>
                                <div>
                                  <Label className="text-xs">Body:</Label>
                                  <div className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">
                                    {selectedDraft.body}
                                  </div>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                        
                        {draft.status === 'draft' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditDraft(draft)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSendDraft(draft)}
                              disabled={loading}
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDraft(draft.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            Email drafts are automatically generated from tasks with communication intent. 
            Review and send when ready.
          </AlertDescription>
        </Alert>
        
        {/* Edit Draft Dialog */}
        <Dialog open={editingDraft !== null} onOpenChange={() => setEditingDraft(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Email Draft</DialogTitle>
            </DialogHeader>
            {editingDraft && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-to">To:</Label>
                  <Input
                    id="edit-to"
                    value={editingDraft.to.join(', ')}
                    onChange={(e) => setEditingDraft(prev => prev ? {
                      ...prev,
                      to: e.target.value.split(',').map(email => email.trim())
                    } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-subject">Subject:</Label>
                  <Input
                    id="edit-subject"
                    value={editingDraft.subject}
                    onChange={(e) => setEditingDraft(prev => prev ? {
                      ...prev,
                      subject: e.target.value
                    } : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-body">Body:</Label>
                  <Textarea
                    id="edit-body"
                    value={editingDraft.body}
                    onChange={(e) => setEditingDraft(prev => prev ? {
                      ...prev,
                      body: e.target.value
                    } : null)}
                    rows={10}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingDraft(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};