import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, Plus, X, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBubbleStore } from '@/stores/bubbleStore';
import { oauthService } from '@/services/oauthService';
import { ScopeConsentModal } from '@/components/ScopeConsentModal';
import { supabase } from '@/integrations/supabase/client';

// Email account interface
interface EmailAccount {
  id: string;
  name: string;
  email: string;
  provider: string;
  connected: boolean;
  scopes: string[];
}

// Email message interface  
interface EmailMessage {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  isImportant: boolean;
  isRead: boolean;
  threadId?: string;
}

// Email filters interface
interface EmailFilters {
  keywords: string[];
  senders: string[];
  importantOnly: boolean;
  unreadOnly: boolean;
}

export const EmailIntegrationPlugin: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [scopeRequest, setScopeRequest] = useState<any>(null);
  const [filters, setFilters] = useState<EmailFilters>({
    keywords: [],
    senders: [],
    importantOnly: true,
    unreadOnly: false,
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [senderInput, setSenderInput] = useState('');

  const { toast } = useToast();
  const { addBubble } = useBubbleStore();

  // Load settings and accounts on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('emailIntegrationSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setIsEnabled(settings.enabled || false);
      setFilters(settings.filters || filters);
    }
    loadEmailAccounts();
  }, []);

  // Load emails when enabled or filters change
  useEffect(() => {
    if (isEnabled && connectedAccounts.length > 0) {
      loadImportantEmails();
    }
  }, [isEnabled, filters, connectedAccounts]);

  // Load email accounts from OAuth service
  const loadEmailAccounts = async () => {
    try {
      const accounts = await oauthService.getConnectedAccounts();
      const gmailAccounts = accounts
        .filter(account => account.provider === 'google' && account.scopes?.some(scope => 
          scope.includes('gmail') || scope.includes('mail')))
        .map(account => ({
          id: account.id,
          name: account.account_email || 'Gmail Account',
          email: account.account_email || '',
          provider: 'gmail',
          connected: true,
          scopes: account.scopes || [],
        }));
      
      setConnectedAccounts(gmailAccounts);
    } catch (error) {
      console.error('Failed to load email accounts:', error);
    }
  };

  // Load emails using real Gmail API
  const loadImportantEmails = async () => {
    if (connectedAccounts.length === 0) return;
    
    setIsLoadingEmails(true);
    
    try {
      const account = connectedAccounts[0]; // Use first connected account
      
      // Check if we have metadata scope at minimum
      const hasMetadataScope = account.scopes.some(scope => 
        scope.includes('gmail.metadata') || scope.includes('gmail.readonly'));
      
      if (!hasMetadataScope) {
        // Request minimal Gmail scope
        const request = await oauthService.requestScopeEscalation({
          provider: 'google',
          service: 'email',
          requiredScopes: ['https://www.googleapis.com/auth/gmail.metadata'],
          reason: 'Access email headers and basic information'
        });
        setScopeRequest(request);
        setIsLoadingEmails(false);
        return;
      }

      // Build Gmail search query based on filters
      let query = '';
      if (filters.importantOnly) query += 'is:important ';
      if (filters.unreadOnly) query += 'is:unread ';
      if (filters.keywords.length > 0) {
        query += `(${filters.keywords.map(k => `subject:"${k}" OR "${k}"`).join(' OR ')}) `;
      }
      if (filters.senders.length > 0) {
        query += `(${filters.senders.map(s => `from:"${s}"`).join(' OR ')}) `;
      }
      
      // Make request to our Gmail sync edge function
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: {
          accountId: account.id,
          operation: 'search',
          query: query.trim() || 'is:important',
          maxResults: 20
        }
      });

      if (error) throw error;

      // Get message details for each message
      const messageDetails = await Promise.all(
        (data.messages || []).slice(0, 10).map(async (msg: any) => {
          const { data: details } = await supabase.functions.invoke('gmail-sync', {
            body: {
              accountId: account.id,
              operation: 'get',
              messageId: msg.id
            }
          });
          
          if (details) {
            const headers = details.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
            const date = headers.find((h: any) => h.name === 'Date')?.value;
            
            return {
              id: details.id,
              sender: from,
              subject,
              snippet: details.snippet || '',
              receivedAt: date ? new Date(date) : new Date(),
              isImportant: details.labelIds?.includes('IMPORTANT') || false,
              isRead: !details.labelIds?.includes('UNREAD'),
              threadId: details.threadId
            };
          }
          return null;
        })
      );

      setEmails(messageDetails.filter(Boolean) as EmailMessage[]);
      
    } catch (error) {
      console.error('Failed to load emails:', error);
      toast({
        title: "Failed to load emails",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Real Gmail OAuth connection
  const connectGmailAccount = async () => {
    setIsLoading(true);
    
    try {
      // Request minimal Gmail metadata scope initially
      const authUrl = await oauthService.requestScopeEscalation({
        provider: 'google',
        service: 'email',
        requiredScopes: ['https://www.googleapis.com/auth/gmail.metadata'],
        reason: 'Access email headers and basic information'
      });
      
      // Open OAuth flow in popup
      const popup = window.open(authUrl, 'oauth', 'width=500,height=600');
      
      // Handle OAuth callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_OAUTH_SUCCESS') {
          popup?.close();
          await loadEmailAccounts();
          toast({
            title: "Gmail Connected",
            description: "Gmail has been successfully connected.",
          });
        } else if (event.data.type === 'GOOGLE_OAUTH_ERROR') {
          popup?.close();
          throw new Error(event.data.error);
        }
        
        window.removeEventListener('message', handleMessage);
      };

      window.addEventListener('message', handleMessage);
      
    } catch (error) {
      console.error('Failed to initiate Gmail connection:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to initiate Gmail connection",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Revoke Gmail account access
  const revokeEmailAccess = async (accountId: string) => {
    try {
      await oauthService.revokeAccount(accountId);
      await loadEmailAccounts();
      setEmails([]);
      toast({
        title: "Access Revoked",
        description: "Email access has been revoked. Write actions are now disabled.",
      });
    } catch (error) {
      console.error('Failed to revoke access:', error);
      toast({
        title: "Revoke Failed",
        description: "Unable to revoke email access. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Create bubble from email
  const createBubbleFromEmail = async (email: EmailMessage) => {
    try {
      const bubble = {
        id: crypto.randomUUID(),
        content: `📧 ${email.subject}\n\nFrom: ${email.sender}\n\n${email.snippet}`,
        type: 'Task' as const,
        tags: [
          { id: 'email', name: 'email', color: '#3b82f6' },
          { id: 'follow-up', name: 'follow-up', color: '#f59e0b' }
        ],
        x: Math.random() * 400,
        y: Math.random() * 400,
        size: email.isImportant ? 60 : 45,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completed: false
      };

      await addBubble(bubble);

      // Create follow-up reminder if important
      if (email.isImportant) {
        const { addReminder } = useBubbleStore.getState();
        const reminder = {
          id: crypto.randomUUID(),
          bubbleId: bubble.id,
          title: `Follow up: ${email.subject}`,
          description: `Reply to email from ${email.sender}`,
          scheduledFor: Date.now() + (4 * 60 * 60 * 1000), // 4 hours
          scheduledAt: Date.now() + (4 * 60 * 60 * 1000),
          level: 2 as 1 | 2 | 3,
          status: 'Active' as const,
          createdAt: Date.now(),
          snoozes: []
        };
        
        await addReminder(reminder);
      }

      toast({
        title: "Email Added",
        description: `Created bubble for "${email.subject}"`,
      });
    } catch (error) {
      console.error('Failed to create bubble:', error);
      toast({
        title: "Failed to create bubble",
        description: "Unable to create bubble from email",
        variant: "destructive",
      });
    }
  };

  // Add keyword filter
  const addKeyword = () => {
    if (keywordInput.trim() && !filters.keywords.includes(keywordInput.trim())) {
      const newFilters = {
        ...filters,
        keywords: [...filters.keywords, keywordInput.trim()]
      };
      setFilters(newFilters);
      setKeywordInput('');
      saveSettings({ enabled: isEnabled, filters: newFilters });
    }
  };

  // Remove keyword filter
  const removeKeyword = (keyword: string) => {
    const newFilters = {
      ...filters,
      keywords: filters.keywords.filter(k => k !== keyword)
    };
    setFilters(newFilters);
    saveSettings({ enabled: isEnabled, filters: newFilters });
  };

  // Add sender filter
  const addSender = () => {
    if (senderInput.trim() && !filters.senders.includes(senderInput.trim())) {
      const newFilters = {
        ...filters,
        senders: [...filters.senders, senderInput.trim()]
      };
      setFilters(newFilters);
      setSenderInput('');
      saveSettings({ enabled: isEnabled, filters: newFilters });
    }
  };

  // Remove sender filter
  const removeSender = (sender: string) => {
    const newFilters = {
      ...filters,
      senders: filters.senders.filter(s => s !== sender)
    };
    setFilters(newFilters);
    saveSettings({ enabled: isEnabled, filters: newFilters });
  };

  // Save settings to localStorage
  const saveSettings = (settings: { enabled: boolean; filters: EmailFilters }) => {
    localStorage.setItem('emailIntegrationSettings', JSON.stringify(settings));
  };

  // Toggle plugin enabled state
  const togglePlugin = (enabled: boolean) => {
    setIsEnabled(enabled);
    saveSettings({ enabled, filters });
    
    if (enabled && connectedAccounts.length > 0) {
      loadImportantEmails();
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Integration
              </CardTitle>
              <CardDescription>
                Connect your email accounts to automatically import important emails as bubbles
              </CardDescription>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) => togglePlugin(checked)}
            />
          </div>
        </CardHeader>

        {isEnabled && (
          <CardContent className="space-y-6">
            {/* Connected Accounts */}
            <div>
              <Label className="text-sm font-medium">Connected Accounts</Label>
              <div className="mt-2 space-y-2">
                {connectedAccounts.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No email accounts connected. Connect an account to get started.
                    </AlertDescription>
                  </Alert>
                ) : (
                  connectedAccounts.map((account) => (
                    <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{account.name}</div>
                          <div className="text-sm text-muted-foreground">{account.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {account.scopes.includes('gmail.readonly') ? 'Full Access' : 'Metadata Only'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeEmailAccess(account.id)}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                
                <Button
                  onClick={connectGmailAccount}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Connect Gmail Account
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Email Filters */}
            <div>
              <Label className="text-sm font-medium">Email Filters</Label>
              <div className="mt-3 space-y-4">
                {/* Filter checkboxes */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="important-only"
                    checked={filters.importantOnly}
                    onChange={(e) => {
                      const newFilters = { ...filters, importantOnly: e.target.checked };
                      setFilters(newFilters);
                      saveSettings({ enabled: isEnabled, filters: newFilters });
                    }}
                    className="rounded"
                  />
                  <Label htmlFor="important-only" className="text-sm">
                    Only important emails
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="unread-only"
                    checked={filters.unreadOnly}
                    onChange={(e) => {
                      const newFilters = { ...filters, unreadOnly: e.target.checked };
                      setFilters(newFilters);
                      saveSettings({ enabled: isEnabled, filters: newFilters });
                    }}
                    className="rounded"
                  />
                  <Label htmlFor="unread-only" className="text-sm">
                    Only unread emails
                  </Label>
                </div>

                {/* Keywords */}
                <div>
                  <Label className="text-sm">Keywords</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="urgent, deadline..."
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} size="sm">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {filters.keywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => removeKeyword(keyword)}
                      >
                        {keyword}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Senders */}
                <div>
                  <Label className="text-sm">Priority Senders</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="boss@company.com"
                      value={senderInput}
                      onChange={(e) => setSenderInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addSender()}
                    />
                    <Button onClick={addSender} size="sm">Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {filters.senders.map((sender) => (
                      <Badge
                        key={sender}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => removeSender(sender)}
                      >
                        {sender}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Latest Important Emails */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Latest Important Emails</Label>
                <Button
                  onClick={loadImportantEmails}
                  disabled={isLoadingEmails}
                  variant="outline"
                  size="sm"
                >
                  {isLoadingEmails ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>

              <div className="mt-3">
                {isLoadingEmails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading emails...</span>
                  </div>
                ) : emails.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No emails found matching your filters.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {emails.slice(0, 5).map((email) => (
                      <div key={email.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {email.isImportant && (
                                <Badge variant="destructive" className="text-xs">Important</Badge>
                              )}
                              {!email.isRead && (
                                <Badge variant="default" className="text-xs">Unread</Badge>
                              )}
                            </div>
                            <h4 className="font-medium text-sm mt-1">{email.subject}</h4>
                            <p className="text-sm text-muted-foreground mt-1">From: {email.sender}</p>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {email.snippet}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {email.receivedAt.toLocaleString()}
                            </p>
                          </div>
                          <Button
                            onClick={() => createBubbleFromEmail(email)}
                            size="sm"
                            className="ml-3"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Bubble
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Scope Consent Modal */}
      {scopeRequest && (
        <ScopeConsentModal
          open={!!scopeRequest}
          onOpenChange={(open) => !open && setScopeRequest(null)}
          request={scopeRequest}
          onApprove={(authUrl) => {
            window.open(authUrl, '_blank', 'width=500,height=600');
            setScopeRequest(null);
            toast({
              title: "Gmail Connection",
              description: "Complete the authorization in the popup window",
            });
          }}
          onDeny={() => {
            setScopeRequest(null);
            toast({
              title: "Connection Cancelled",
              description: "Gmail connection was cancelled",
            });
          }}
        />
      )}
    </>
  );
};