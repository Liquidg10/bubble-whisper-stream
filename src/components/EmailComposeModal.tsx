import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send, FileText, AlertTriangle, CheckCircle, Shield } from 'lucide-react';
import { ContactDisambiguationModal } from './ContactDisambiguationModal';
import { contactDisambiguationService, ContactOption } from '@/services/contactDisambiguationService';
import { gmailDraftSendService, EmailDraft, EmailSendResult } from '@/services/gmailDraftSendService';
import { toast } from 'sonner';

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId?: string;
  initialRecipients?: string[];
  initialSubject?: string;
  initialBody?: string;
}

export function EmailComposeModal({
  isOpen,
  onClose,
  accountId,
  initialRecipients = [],
  initialSubject = '',
  initialBody = ''
}: EmailComposeModalProps) {
  const [recipients, setRecipients] = useState<string[]>(initialRecipients);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<EmailSendResult | null>(null);
  
  // Disambiguation state
  const [showDisambiguation, setShowDisambiguation] = useState(false);
  const [disambiguationContacts, setDisambiguationContacts] = useState<ContactOption[]>([]);
  const [currentDisambiguationQuery, setCurrentDisambiguationQuery] = useState('');
  const [currentRecipientIndex, setCurrentRecipientIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setRecipients(initialRecipients);
      setSubject(initialSubject);
      setBody(initialBody);
      setLastResult(null);
    }
  }, [isOpen, initialRecipients, initialSubject, initialBody]);

  const handleRecipientChange = (value: string) => {
    const emails = value.split(',').map(email => email.trim()).filter(email => email);
    setRecipients(emails);
  };

  const resolveRecipientsAndCompose = async () => {
    if (!accountId || recipients.length === 0) {
      toast.error('Please provide account and recipients');
      return;
    }

    setIsLoading(true);
    
    try {
      // Resolve each recipient
      const resolvedRecipients: string[] = [];
      
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const result = await contactDisambiguationService.resolveContact(recipient);
        
        if (result.needsDisambiguation) {
          // Show disambiguation modal
          setDisambiguationContacts(result.contacts);
          setCurrentDisambiguationQuery(recipient);
          setCurrentRecipientIndex(i);
          setShowDisambiguation(true);
          setIsLoading(false);
          return;
        } else if (result.exactMatch) {
          resolvedRecipients.push(result.exactMatch.email);
        } else {
          // No match found - use as-is if it looks like an email
          if (recipient.includes('@')) {
            resolvedRecipients.push(recipient);
          } else {
            toast.error(`Could not resolve contact: ${recipient}`);
            setIsLoading(false);
            return;
          }
        }
      }

      // All recipients resolved, proceed with composition
      await composeWithResolvedRecipients(resolvedRecipients);
      
    } catch (error: any) {
      console.error('Recipient resolution error:', error);
      toast.error('Failed to resolve recipients');
      setIsLoading(false);
    }
  };

  const composeWithResolvedRecipients = async (resolvedRecipients: string[]) => {
    if (!accountId) return;

    const draft: EmailDraft = {
      recipients: resolvedRecipients,
      subject,
      body
    };

    try {
      const result = await gmailDraftSendService.composeEmail(accountId, draft, {
        autoSendEnabled,
        requireConfirmation: false,
        bypassGuardrails: false
      });

      setLastResult(result);

      if (result.success) {
        if (result.decision === 'sent') {
          toast.success('Email sent successfully!');
          onClose();
        } else if (result.decision === 'drafted') {
          toast.success('Draft created successfully!');
        }
      } else {
        toast.error(result.error || 'Failed to process email');
      }

    } catch (error: any) {
      console.error('Email composition error:', error);
      toast.error(error.message || 'Failed to compose email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisambiguationSelect = (contact: ContactOption) => {
    const newRecipients = [...recipients];
    newRecipients[currentRecipientIndex] = contact.email;
    setRecipients(newRecipients);
    setShowDisambiguation(false);
    
    // Continue with composition
    setTimeout(() => {
      resolveRecipientsAndCompose();
    }, 100);
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'sent': return <Send className="h-4 w-4 text-green-600" />;
      case 'drafted': return <FileText className="h-4 w-4 text-blue-600" />;
      case 'blocked': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'sent': return 'border-green-200 bg-green-50';
      case 'drafted': return 'border-blue-200 bg-blue-50';
      case 'blocked': return 'border-red-200 bg-red-50';
      default: return '';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Compose Email
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="recipients">To</Label>
              <Input
                id="recipients"
                value={recipients.join(', ')}
                onChange={(e) => handleRecipientChange(e.target.value)}
                placeholder="Enter email addresses or contact names..."
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate multiple recipients with commas
              </p>
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose your email..."
                rows={8}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="auto-send"
                checked={autoSendEnabled}
                onCheckedChange={setAutoSendEnabled}
                disabled={isLoading}
              />
              <Label htmlFor="auto-send" className="text-sm">
                Enable auto-send for trusted recipients
              </Label>
            </div>

            {lastResult && (
              <Alert className={getDecisionColor(lastResult.decision)}>
                <div className="flex items-center gap-2">
                  {getDecisionIcon(lastResult.decision)}
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <strong>Result:</strong>
                        <Badge variant={lastResult.success ? 'default' : 'destructive'}>
                          {lastResult.decision.charAt(0).toUpperCase() + lastResult.decision.slice(1)}
                        </Badge>
                        <span className="text-xs">
                          Confidence: {Math.round(lastResult.guardrailCheck.confidence * 100)}%
                        </span>
                      </div>
                      
                      {lastResult.guardrailCheck.warnings.length > 0 && (
                        <div className="text-sm">
                          <strong>Warnings:</strong>
                          <ul className="list-disc list-inside ml-2">
                            {lastResult.guardrailCheck.warnings.map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {lastResult.guardrailCheck.blockedReasons.length > 0 && (
                        <div className="text-sm">
                          <strong>Blocked:</strong>
                          <ul className="list-disc list-inside ml-2">
                            {lastResult.guardrailCheck.blockedReasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </div>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Create draft only
                  setAutoSendEnabled(false);
                  resolveRecipientsAndCompose();
                }}
                disabled={isLoading || !recipients.length || !subject || !body}
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <FileText className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button 
                onClick={() => {
                  // Allow send if enabled
                  resolveRecipientsAndCompose();
                }}
                disabled={isLoading || !recipients.length || !subject || !body}
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Send className="h-4 w-4 mr-2" />
                {autoSendEnabled ? 'Send' : 'Compose'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ContactDisambiguationModal
        isOpen={showDisambiguation}
        onClose={() => {
          setShowDisambiguation(false);
          setIsLoading(false);
        }}
        contacts={disambiguationContacts}
        onSelectContact={handleDisambiguationSelect}
        searchQuery={currentDisambiguationQuery}
      />
    </>
  );
}