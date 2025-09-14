/**
 * Enhanced Email Triage Dashboard
 * Shows classified emails with one-click task creation
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
  DollarSign, 
  CheckCircle, 
  MessageSquare,
  Plus,
  Undo2,
  ExternalLink,
  Bot,
  Clock,
  Star
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { emailTaskCreationService, type EmailTaskCreationResult } from '@/services/emailTaskCreationService';
import { gmailMetadataSync, type SyncResult } from '@/services/gmailMetadataSync';
import type { EmailMetadata, IntentClassification } from '@/services/gmailIntentClassifier';

interface ClassifiedEmail {
  metadata: EmailMetadata;
  classification: IntentClassification;
  taskId?: string;
  createdAt: number;
}

interface EmailTriageDashboardProps {
  className?: string;
}

export const EmailTriageDashboard: React.FC<EmailTriageDashboardProps> = ({ className = '' }) => {
  const [emails, setEmails] = useState<ClassifiedEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('actionable');
  const [taskCreationHistory, setTaskCreationHistory] = useState<EmailTaskCreationResult[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadClassifiedEmails();
    
    // Subscribe to sync updates
    const unsubscribe = gmailMetadataSync.subscribe((result: SyncResult) => {
      if (result.intents && result.intents.length > 0) {
        handleNewClassifiedEmails(result);
      }
    });

    return unsubscribe;
  }, []);

  const loadClassifiedEmails = async () => {
    setLoading(true);
    try {
      // Load from localStorage for demo - in production would load from Supabase
      const stored = localStorage.getItem('classified_emails');
      if (stored) {
        const parsedEmails = JSON.parse(stored);
        setEmails(parsedEmails.map((email: any) => ({
          ...email,
          metadata: {
            ...email.metadata,
            receivedAt: new Date(email.metadata.receivedAt)
          }
        })));
      }
    } catch (error) {
      console.error('Failed to load classified emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewClassifiedEmails = (syncResult: SyncResult) => {
    if (!syncResult.intents) return;

    const newEmails: ClassifiedEmail[] = syncResult.intents.map(item => ({
      metadata: item.metadata,
      classification: item.classification,
      createdAt: Date.now()
    }));

    setEmails(prev => {
      const combined = [...newEmails, ...prev];
      // Keep only last 100 emails
      const limited = combined.slice(0, 100);
      
      // Save to localStorage
      localStorage.setItem('classified_emails', JSON.stringify(limited));
      
      return limited;
    });

    toast({
      title: "New Emails Classified",
      description: `${newEmails.length} emails processed and classified`,
    });
  };

  const createTaskFromEmail = async (email: ClassifiedEmail, autoCreate = false) => {
    try {
      const result = await emailTaskCreationService.createTaskFromEmail(
        email.metadata,
        email.classification,
        { 
          autoCreate,
          preserveEmailMetadata: true,
          minConfidence: 0.6 // Lower threshold for manual creation
        }
      );

      if (result.success) {
        // Update email to show task was created
        setEmails(prev => prev.map(e => 
          e.metadata.id === email.metadata.id 
            ? { ...e, taskId: result.taskId }
            : e
        ));

        setTaskCreationHistory(prev => [result, ...prev.slice(0, 49)]);

        toast({
          title: "Task Created",
          description: result.reason,
          action: result.taskId ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleUndoTaskCreation(email.metadata.id, result.taskId)}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          ) : undefined
        });
      } else {
        toast({
          title: "Task Creation Failed",
          description: result.reason,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create task from email",
        variant: "destructive"
      });
    }
  };

  const handleUndoTaskCreation = async (emailId: string, taskId?: string) => {
    const success = await emailTaskCreationService.undoTaskCreation(emailId, taskId);
    
    if (success) {
      // Update email to remove task association
      setEmails(prev => prev.map(e => 
        e.metadata.id === emailId 
          ? { ...e, taskId: undefined }
          : e
      ));

      toast({
        title: "Task Removed",
        description: "Task creation has been undone",
      });
    } else {
      toast({
        title: "Undo Failed",
        description: "Could not undo task creation",
        variant: "destructive"
      });
    }
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'meeting_invite': return <Calendar className="h-4 w-4" />;
      case 'bill': return <DollarSign className="h-4 w-4" />;
      case 'confirmation': return <CheckCircle className="h-4 w-4" />;
      case 'task': return <Star className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getIntentColor = (intent: string, confidence: number) => {
    const baseColors = {
      'meeting_invite': 'blue',
      'bill': 'red',
      'confirmation': 'green',
      'task': 'yellow',
      'thought': 'gray'
    };
    
    const opacity = confidence >= 0.8 ? '' : confidence >= 0.6 ? '/80' : '/60';
    return `bg-${baseColors[intent as keyof typeof baseColors] || 'gray'}-100${opacity}`;
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  const filterEmails = (emails: ClassifiedEmail[], filter: string) => {
    switch (filter) {
      case 'actionable':
        return emails.filter(e => 
          ['meeting_invite', 'bill', 'task'].includes(e.classification.intent) &&
          e.classification.confidence >= 0.6
        );
      case 'high-confidence':
        return emails.filter(e => e.classification.confidence >= 0.8);
      case 'with-tasks':
        return emails.filter(e => e.taskId);
      case 'all':
      default:
        return emails;
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const filteredEmails = filterEmails(emails, activeTab);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Email Triage Dashboard
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          AI-classified emails ready for task creation
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="actionable">Actionable</TabsTrigger>
            <TabsTrigger value="high-confidence">High Confidence</TabsTrigger>
            <TabsTrigger value="with-tasks">With Tasks</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-pulse">Loading classified emails...</div>
              </div>
            ) : filteredEmails.length === 0 ? (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  No emails found in this category. Sync your Gmail to see classified emails here.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {filteredEmails.map((email) => (
                  <Card key={email.metadata.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-full ${getIntentColor(email.classification.intent, email.classification.confidence)}`}>
                          {getIntentIcon(email.classification.intent)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm truncate">
                              {email.metadata.subject}
                            </h4>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {getConfidenceLabel(email.classification.confidence)}
                            </Badge>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {email.classification.intent}
                            </Badge>
                          </div>
                          
                          <p className="text-xs text-muted-foreground mb-2">
                            From: {email.metadata.sender} • {formatRelativeTime(email.createdAt)}
                          </p>
                          
                          {email.metadata.snippet && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {email.metadata.snippet}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="h-3 w-3" />
                            <span className="text-muted-foreground">
                              {email.classification.horizon || 'No deadline'}
                            </span>
                            {email.classification.tags.length > 0 && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <div className="flex gap-1">
                                  {email.classification.tags.slice(0, 3).map((tag, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {email.taskId ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Task Created
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUndoTaskCreation(email.metadata.id, email.taskId)}
                            >
                              <Undo2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => createTaskFromEmail(email, true)}
                            className="gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Create Task
                          </Button>
                        )}
                        
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                      <strong>AI Reasoning:</strong> {email.classification.reasoning}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
