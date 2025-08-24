import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Mail, 
  Star, 
  AlertCircle, 
  CheckCircle, 
  Settings,
  RefreshCw,
  Plus,
  MessageSquare,
  Clock
} from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { useToast } from '@/hooks/use-toast';

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  type: 'gmail' | 'outlook' | 'imap';
  connected: boolean;
}

interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isImportant: boolean;
  isUnread: boolean;
  labels?: string[];
}

interface EmailFilters {
  keywords: string[];
  senders: string[];
  importantOnly: boolean;
  unreadOnly: boolean;
}

export function EmailIntegrationPlugin() {
  const { addBubble, addReminder, settings, updateSettings } = useBubbleStore();
  const { toast } = useToast();
  
  const [isEnabled, setIsEnabled] = useState(settings.emailIntegrationEnabled || false);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const [filters, setFilters] = useState<EmailFilters>({
    keywords: ['urgent', 'important', 'deadline', 'asap'],
    senders: [],
    importantOnly: false,
    unreadOnly: true
  });
  
  const [newKeyword, setNewKeyword] = useState('');
  const [newSender, setNewSender] = useState('');

  useEffect(() => {
    loadEmailAccounts();
    if (isEnabled) {
      loadImportantEmails();
    }
  }, [isEnabled]);

  const loadEmailAccounts = async () => {
    const savedAccounts = localStorage.getItem('email-accounts');
    if (savedAccounts) {
      setAccounts(JSON.parse(savedAccounts));
    }
  };

  const loadImportantEmails = async () => {
    setIsLoading(true);
    try {
      // Mock important emails - in real implementation would use Gmail/Outlook APIs
      const mockEmails: EmailMessage[] = [
        {
          id: '1',
          from: 'boss@company.com',
          subject: 'URGENT: Project deadline moved to tomorrow',
          snippet: 'Hi team, due to client requirements, we need to deliver the project by tomorrow...',
          receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          isImportant: true,
          isUnread: true,
          labels: ['work', 'urgent']
        },
        {
          id: '2',
          from: 'doctor@clinic.com',
          subject: 'Appointment reminder - Thursday 3pm',
          snippet: 'This is a friendly reminder about your upcoming appointment...',
          receivedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          isImportant: true,
          isUnread: false,
          labels: ['medical', 'appointment']
        },
        {
          id: '3',
          from: 'client@example.com',
          subject: 'Re: Contract updates needed ASAP',
          snippet: 'Thanks for the quick turnaround. Could you please review section 3...',
          receivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          isImportant: true,
          isUnread: true,
          labels: ['client', 'contract']
        }
      ];
      
      // Apply filters
      let filteredEmails = mockEmails;
      
      if (filters.unreadOnly) {
        filteredEmails = filteredEmails.filter(email => email.isUnread);
      }
      
      if (filters.importantOnly) {
        filteredEmails = filteredEmails.filter(email => email.isImportant);
      }
      
      if (filters.keywords.length > 0) {
        filteredEmails = filteredEmails.filter(email =>
          filters.keywords.some(keyword =>
            email.subject.toLowerCase().includes(keyword.toLowerCase()) ||
            email.snippet.toLowerCase().includes(keyword.toLowerCase())
          )
        );
      }
      
      if (filters.senders.length > 0) {
        filteredEmails = filteredEmails.filter(email =>
          filters.senders.some(sender =>
            email.from.toLowerCase().includes(sender.toLowerCase())
          )
        );
      }
      
      setEmails(filteredEmails);
    } catch (error) {
      console.error('Failed to load emails:', error);
      toast({
        title: "Email Sync Failed",
        description: "Unable to sync emails. Please check your connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const connectGmailAccount = async () => {
    setIsConnecting(true);
    try {
      // In real implementation, this would initiate OAuth flow
      const newAccount: EmailAccount = {
        id: crypto.randomUUID(),
        name: 'Personal Gmail',
        email: 'user@gmail.com',
        type: 'gmail',
        connected: true
      };
      
      const updatedAccounts = [...accounts, newAccount];
      setAccounts(updatedAccounts);
      localStorage.setItem('email-accounts', JSON.stringify(updatedAccounts));
      
      toast({
        title: "Email Account Connected",
        description: "Gmail account has been successfully connected.",
      });
    } catch (error) {
      console.error('Failed to connect email:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Gmail. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const createBubbleFromEmail = async (email: EmailMessage) => {
    const bubbleId = crypto.randomUUID();
    const bubble = {
      id: bubbleId,
      content: `📧 ${email.subject}\n\nFrom: ${email.from}\n\n${email.snippet}`,
      type: 'Task' as const,
      tags: [{ id: 'email', name: 'email', color: '#3b82f6' }, { id: 'follow-up', name: 'follow-up', color: '#f59e0b' }],
      x: Math.random() * 400,
      y: Math.random() * 400,
      size: email.isImportant ? 60 : 45,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completed: false
    };
    
    await addBubble(bubble);
    
    // Create follow-up reminder if urgent
    if (email.isImportant || filters.keywords.some(k => 
      email.subject.toLowerCase().includes(k.toLowerCase())
    )) {
      const reminder = {
        id: crypto.randomUUID(),
        bubbleId: bubbleId,
        title: `Follow up: ${email.subject}`,
        description: `Reply to email from ${email.from}`,
        scheduledFor: Date.now() + (4 * 60 * 60 * 1000),
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
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !filters.keywords.includes(newKeyword.trim())) {
      setFilters(prev => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()]
      }));
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setFilters(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const addSender = () => {
    if (newSender.trim() && !filters.senders.includes(newSender.trim())) {
      setFilters(prev => ({
        ...prev,
        senders: [...prev.senders, newSender.trim()]
      }));
      setNewSender('');
    }
  };

  const removeSender = (sender: string) => {
    setFilters(prev => ({
      ...prev,
      senders: prev.senders.filter(s => s !== sender)
    }));
  };

  const togglePlugin = async (enabled: boolean) => {
    setIsEnabled(enabled);
    await updateSettings({ emailIntegrationEnabled: enabled });
    
    if (enabled) {
      loadImportantEmails();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Integration
            <Badge variant="secondary">Core Plugin</Badge>
          </CardTitle>
          <Switch
            checked={isEnabled}
            onCheckedChange={togglePlugin}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Enable email integration to automatically create bubbles and follow-up reminders from important emails.
            </AlertDescription>
          </Alert>
        )}
        
        {isEnabled && (
          <>
            {/* Account Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Connected Accounts</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={connectGmailAccount}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Add Email
                </Button>
              </div>
              
              {accounts.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No email accounts connected. Add an account to start syncing important emails.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <div>
                          <div className="text-sm font-medium">{account.name}</div>
                          <div className="text-xs text-muted-foreground">{account.email}</div>
                        </div>
                      </div>
                      <Badge variant="outline">{account.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Filters */}
            <div className="space-y-4 p-4 border rounded">
              <Label className="text-sm font-medium">Smart Filters</Label>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="important-only"
                    checked={filters.importantOnly}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, importantOnly: checked as boolean }))
                    }
                  />
                  <Label htmlFor="important-only" className="text-sm">Important emails only</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="unread-only"
                    checked={filters.unreadOnly}
                    onCheckedChange={(checked) => 
                      setFilters(prev => ({ ...prev, unreadOnly: checked as boolean }))
                    }
                  />
                  <Label htmlFor="unread-only" className="text-sm">Unread emails only</Label>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">Priority Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="urgent, deadline..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                  />
                  <Button size="sm" onClick={addKeyword}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {filters.keywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeKeyword(keyword)}
                    >
                      {keyword} ×
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm">VIP Senders</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="boss@company.com"
                    value={newSender}
                    onChange={(e) => setNewSender(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSender()}
                  />
                  <Button size="sm" onClick={addSender}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {filters.senders.map((sender) => (
                    <Badge
                      key={sender}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeSender(sender)}
                    >
                      {sender} ×
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Important Emails */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Important Emails</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadImportantEmails}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              
              {emails.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No important emails found matching your filters.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {emails.slice(0, 3).map((email) => (
                    <div key={email.id} className="flex items-start justify-between p-3 border rounded">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {email.isImportant && <Star className="h-3 w-3 text-yellow-500 fill-current" />}
                          {email.isUnread && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                          <div className="font-medium text-sm">{email.subject}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          From: {email.from}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {email.snippet}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(email.receivedAt).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createBubbleFromEmail(email)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Bubble
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}