/**
 * Unified Drafts Feed - Phase 3 End-User Polish
 * Consolidates email/calendar drafts with visual diff and one-tap undo
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  Calendar, 
  Clock, 
  Eye, 
  Undo2, 
  Send, 
  Save,
  FileText,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { DiffView } from './DiffView';
import { decisionTracer } from '@/services/decisionTracer';
import { toast } from 'sonner';

export interface Draft {
  id: string;
  type: 'email' | 'calendar' | 'task' | 'note';
  title: string;
  content: string;
  originalContent?: string;
  recipients?: string[];
  scheduledTime?: Date;
  status: 'draft' | 'pending' | 'sent' | 'scheduled';
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  source: 'auto_write' | 'voice' | 'manual' | 'ai_suggestion';
  metadata?: {
    reasoning?: string;
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      timestamp: number;
    }>;
    undoId?: string;
  };
}

interface UnifiedDraftsFeedProps {
  drafts?: Draft[];
  onSendDraft?: (draftId: string) => void;
  onScheduleDraft?: (draftId: string, time: Date) => void;
  onEditDraft?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
  onUndoDraft?: (draftId: string) => void;
  className?: string;
}

export function UnifiedDraftsFeed({ 
  drafts: externalDrafts, 
  onSendDraft,
  onScheduleDraft,
  onEditDraft,
  onDeleteDraft,
  onUndoDraft,
  className 
}: UnifiedDraftsFeedProps) {
  const [drafts, setDrafts] = useState<Draft[]>(externalDrafts || []);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'email' | 'calendar' | 'pending'>('all');

  useEffect(() => {
    if (externalDrafts) {
      setDrafts(externalDrafts);
    } else {
      // Load sample drafts for demo
      loadSampleDrafts();
    }
  }, [externalDrafts]);

  const loadSampleDrafts = () => {
    const sampleDrafts: Draft[] = [
      {
        id: 'draft-email-1',
        type: 'email',
        title: 'Follow up on project proposal',
        content: 'Hi John,\n\nI wanted to follow up on the project proposal we discussed last week. Do you have any feedback or questions?\n\nBest regards,\nYour Name',
        originalContent: 'Hi John,\n\nFollowing up on our proposal discussion.\n\nThanks',
        recipients: ['john@example.com'],
        status: 'draft',
        confidence: 0.85,
        createdAt: new Date(Date.now() - 1800000), // 30 min ago
        updatedAt: new Date(Date.now() - 300000),  // 5 min ago
        source: 'auto_write',
        metadata: {
          reasoning: 'Enhanced based on professional email best practices',
          undoId: 'undo-email-1'
        }
      },
      {
        id: 'draft-calendar-1',
        type: 'calendar',
        title: 'Team standup meeting',
        content: 'Daily team standup\nLocation: Conference Room A\nAgenda: Sprint progress, blockers, next steps',
        scheduledTime: new Date(Date.now() + 86400000), // Tomorrow
        status: 'pending',
        confidence: 0.92,
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
        updatedAt: new Date(Date.now() - 900000),  // 15 min ago
        source: 'voice',
        metadata: {
          reasoning: 'Created from voice input: "Schedule team standup tomorrow"',
          undoId: 'undo-calendar-1'
        }
      },
      {
        id: 'draft-email-2',
        type: 'email',
        title: 'Thank you for the meeting',
        content: 'Dear Sarah,\n\nThank you for taking the time to meet with me today. I found our discussion about the new marketing strategy very insightful.\n\nI\'ll send over the documents we discussed by Friday.\n\nBest regards',
        status: 'draft',
        confidence: 0.78,
        createdAt: new Date(Date.now() - 900000), // 15 min ago
        updatedAt: new Date(Date.now() - 60000),  // 1 min ago
        source: 'ai_suggestion',
        metadata: {
          reasoning: 'Generated follow-up email based on calendar event',
          undoId: 'undo-email-2'
        }
      }
    ];
    setDrafts(sampleDrafts);
  };

  const handleSendDraft = (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;

    setDrafts(prev => prev.map(d => 
      d.id === draftId 
        ? { ...d, status: 'sent' as const }
        : d
    ));

    decisionTracer.trace({
      action: 'draft_sent',
      input: { draftId, type: draft.type },
      confidence: 1.0,
      reasoning: `User manually sent ${draft.type} draft`,
      metadata: { title: draft.title }
    });

    toast.success(`${draft.type === 'email' ? 'Email' : 'Event'} sent successfully`);
    onSendDraft?.(draftId);
  };

  const handleUndoDraft = (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft?.metadata?.undoId) return;

    setDrafts(prev => prev.filter(d => d.id !== draftId));

    decisionTracer.trace({
      action: 'draft_undone',
      input: { draftId, undoId: draft.metadata.undoId },
      confidence: 1.0,
      reasoning: 'User undid auto-generated draft',
      metadata: { type: draft.type, title: draft.title }
    });

    toast.success('Draft undone and removed');
    onUndoDraft?.(draftId);
  };

  const handleDeleteDraft = (draftId: string) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    toast.success('Draft deleted');
    onDeleteDraft?.(draftId);
  };

  const getTypeIcon = (type: Draft['type']) => {
    switch (type) {
      case 'email': return <Mail className="h-4 w-4" />;
      case 'calendar': return <Calendar className="h-4 w-4" />;
      case 'task': return <CheckCircle2 className="h-4 w-4" />;
      case 'note': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: Draft['status']) => {
    switch (status) {
      case 'draft': return 'text-yellow-600';
      case 'pending': return 'text-blue-600';
      case 'sent': return 'text-green-600';
      case 'scheduled': return 'text-purple-600';
      default: return 'text-gray-600';
    }
  };

  const getSourceLabel = (source: Draft['source']) => {
    switch (source) {
      case 'auto_write': return 'Auto-generated';
      case 'voice': return 'Voice input';
      case 'manual': return 'Manual';
      case 'ai_suggestion': return 'AI suggested';
      default: return 'Unknown';
    }
  };

  const filteredDrafts = drafts.filter(draft => {
    if (filter === 'all') return true;
    if (filter === 'pending') return draft.status === 'pending' || draft.status === 'draft';
    return draft.type === filter;
  });

  const pendingCount = drafts.filter(d => d.status === 'pending' || d.status === 'draft').length;
  const emailCount = drafts.filter(d => d.type === 'email').length;
  const calendarCount = drafts.filter(d => d.type === 'calendar').length;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              Drafts Feed
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge variant="secondary">
                  {pendingCount} pending
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={loadSampleDrafts}>
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(value) => setFilter(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All ({drafts.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="email">Email ({emailCount})</TabsTrigger>
          <TabsTrigger value="calendar">Calendar ({calendarCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="space-y-3">
          {filteredDrafts.length > 0 ? (
            filteredDrafts.map((draft) => (
              <Card key={draft.id} className={`transition-all ${
                selectedDraft === draft.id ? 'border-primary ring-1 ring-primary/20' : ''
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getTypeIcon(draft.type)}
                      <div>
                        <h3 className="font-medium">{draft.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(draft.updatedAt).toLocaleString()}
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(draft.source)}
                          </Badge>
                          <span className={getStatusColor(draft.status)}>
                            {draft.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(draft.confidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Content Preview */}
                  <div className="text-sm bg-muted/50 p-3 rounded-lg">
                    <p className="line-clamp-3">{draft.content}</p>
                  </div>

                  {/* Recipients/Schedule Info */}
                  {draft.recipients && (
                    <div className="text-sm">
                      <strong>To:</strong> {draft.recipients.join(', ')}
                    </div>
                  )}
                  {draft.scheduledTime && (
                    <div className="text-sm">
                      <strong>Scheduled:</strong> {draft.scheduledTime.toLocaleString()}
                    </div>
                  )}

                  {/* Reasoning */}
                  {draft.metadata?.reasoning && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {draft.metadata.reasoning}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedDraft(selectedDraft === draft.id ? null : draft.id)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        {selectedDraft === draft.id ? 'Collapse' : 'View'}
                      </Button>
                      
                      {draft.originalContent && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowDiff(showDiff === draft.id ? null : draft.id)}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          {showDiff === draft.id ? 'Hide Diff' : 'Show Changes'}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {draft.status === 'draft' && (
                        <>
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleSendDraft(draft.id)}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Send
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => onEditDraft?.(draft.id)}
                          >
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </>
                      )}
                      
                      {draft.metadata?.undoId && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleUndoDraft(draft.id)}
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          Undo
                        </Button>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteDraft(draft.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {selectedDraft === draft.id && (
                    <div className="pt-4 border-t animate-fade-in">
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Full Content:</h4>
                        <pre className="text-sm whitespace-pre-wrap">{draft.content}</pre>
                      </div>
                    </div>
                  )}

                  {/* Diff View */}
                  {showDiff === draft.id && draft.originalContent && (
                    <div className="pt-4 border-t animate-fade-in">
                      <DiffView 
                        original={draft.originalContent} 
                        modified={draft.content}
                        title="Content Changes"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Edit3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No drafts in this category</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}