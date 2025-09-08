import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmailComposeModal } from '@/components/EmailComposeModal';
import { RecipientAllowlistManager } from '@/components/RecipientAllowlistManager';
import { ContactDisambiguationModal } from '@/components/ContactDisambiguationModal';
import { 
  Send, 
  FileText, 
  Shield, 
  Users, 
  AlertTriangle, 
  Mail,
  MessageSquare,
  TestTube,
  Settings
} from 'lucide-react';
import { oauthService } from '@/services/oauthService';
import { contactDisambiguationService, ContactOption } from '@/services/contactDisambiguationService';
import { gmailDraftSendService } from '@/services/gmailDraftSendService';
import { emailGuardrailsService } from '@/services/emailGuardrailsService';
import { toast } from 'sonner';

export default function DevEmailCompose() {
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showDisambiguationModal, setShowDisambiguationModal] = useState(false);
  const [disambiguationContacts, setDisambiguationContacts] = useState<ContactOption[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);

  useEffect(() => {
    loadConnectedAccounts();
  }, []);

  const loadConnectedAccounts = async () => {
    try {
      const accounts = await oauthService.getConnectedAccounts();
      const gmailAccounts = accounts.filter(acc => 
        acc.provider === 'google' && 
        acc.scopes.includes('https://www.googleapis.com/auth/gmail.metadata')
      );
      setConnectedAccounts(gmailAccounts);
      if (gmailAccounts.length > 0 && !selectedAccount) {
        setSelectedAccount(gmailAccounts[0].id);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
      toast.error('Failed to load connected accounts');
    }
  };

  const testContactDisambiguation = async (query: string) => {
    try {
      const result = await contactDisambiguationService.resolveContact(query);
      
      setTestResults(prev => [...prev, {
        type: 'disambiguation',
        query,
        result,
        timestamp: new Date().toISOString()
      }]);

      if (result.needsDisambiguation) {
        setDisambiguationContacts(result.contacts);
        setShowDisambiguationModal(true);
      } else {
        toast.success(`Resolved to: ${result.exactMatch?.email || 'No match'}`);
      }
    } catch (error) {
      console.error('Disambiguation test failed:', error);
      toast.error('Disambiguation test failed');
    }
  };

  const testEmailGuardrails = async () => {
    try {
      const testRequest = {
        recipients: ['test@example.com', 'new-contact@example.com'],
        subject: 'Test Email with Sensitive Content - Password Reset',
        body: 'This is a test email containing the word password for testing guardrails.',
        userSettings: {
          autoSendEnabled: true,
          maxDailyAutoSends: 20,
          requireConfirmationForNewRecipients: true
        }
      };

      const result = await emailGuardrailsService.evaluateEmailSafety(testRequest);
      
      setTestResults(prev => [...prev, {
        type: 'guardrails',
        request: testRequest,
        result,
        timestamp: new Date().toISOString()
      }]);

      toast.success('Guardrail test completed - check results below');
    } catch (error) {
      console.error('Guardrail test failed:', error);
      toast.error('Guardrail test failed');
    }
  };

  const clearTestResults = () => {
    setTestResults([]);
    toast.success('Test results cleared');
  };

  const getDecisionBadgeVariant = (decision: string) => {
    switch (decision) {
      case 'auto-send': return 'default';
      case 'confirmation-required': return 'secondary';
      case 'draft-only': return 'outline';
      case 'blocked': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gmail Compose & Safety Testing</h1>
        <Badge variant="outline">Development Mode</Badge>
      </div>

      <Tabs defaultValue="compose" className="space-y-6">
        <TabsList>
          <TabsTrigger value="compose" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="allowlist" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Allowlist
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Testing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Composition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectedAccounts.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No Gmail accounts connected. Please connect a Gmail account first.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium">Selected Account:</label>
                    <select 
                      value={selectedAccount}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      className="w-full mt-1 p-2 border rounded"
                    >
                      {connectedAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.account_email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setShowComposeModal(true)}
                      disabled={!selectedAccount}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Compose Email
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowComposeModal(true)}
                      disabled={!selectedAccount}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Create Draft
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allowlist" className="space-y-6">
          <RecipientAllowlistManager />
        </TabsContent>

        <TabsContent value="testing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Safety Testing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-medium">Contact Disambiguation</h3>
                  <p className="text-sm text-muted-foreground">
                    Test contact resolution with ambiguous names
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => testContactDisambiguation('John')}
                    >
                      Test "John"
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => testContactDisambiguation('test@example.com')}
                    >
                      Test Email
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">Email Guardrails</h3>
                  <p className="text-sm text-muted-foreground">
                    Test safety evaluation with various scenarios
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={testEmailGuardrails}
                    >
                      Test Guardrails
                    </Button>
                  </div>
                </div>
              </div>

              {testResults.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Test Results</h3>
                    <Button size="sm" variant="outline" onClick={clearTestResults}>
                      Clear Results
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {testResults.map((result, index) => (
                      <Card key={index} className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">
                              {result.type === 'disambiguation' ? 'Contact Resolution' : 'Safety Check'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(result.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          {result.type === 'disambiguation' && (
                            <div className="space-y-1">
                              <p><strong>Query:</strong> {result.query}</p>
                              <p><strong>Needs Disambiguation:</strong> {result.result.needsDisambiguation ? 'Yes' : 'No'}</p>
                              <p><strong>Contacts Found:</strong> {result.result.contacts.length}</p>
                              {result.result.exactMatch && (
                                <p><strong>Exact Match:</strong> {result.result.exactMatch.email}</p>
                              )}
                            </div>
                          )}

                          {result.type === 'guardrails' && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <strong>Decision:</strong>
                                <Badge variant={getDecisionBadgeVariant(result.result.decision)}>
                                  {result.result.decision}
                                </Badge>
                                <span className="text-sm">
                                  ({Math.round(result.result.confidence * 100)}% confidence)
                                </span>
                              </div>
                              
                              {result.result.warnings.length > 0 && (
                                <div>
                                  <strong>Warnings:</strong>
                                  <ul className="list-disc list-inside text-sm ml-4">
                                    {result.result.warnings.map((warning: string, i: number) => (
                                      <li key={i}>{warning}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {result.result.blockedReasons.length > 0 && (
                                <div>
                                  <strong>Blocked Reasons:</strong>
                                  <ul className="list-disc list-inside text-sm ml-4">
                                    {result.result.blockedReasons.map((reason: string, i: number) => (
                                      <li key={i}>{reason}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EmailComposeModal
        isOpen={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        accountId={selectedAccount}
      />

      <ContactDisambiguationModal
        isOpen={showDisambiguationModal}
        onClose={() => setShowDisambiguationModal(false)}
        contacts={disambiguationContacts}
        onSelectContact={(contact) => {
          toast.success(`Selected: ${contact.email}`);
          setShowDisambiguationModal(false);
        }}
        searchQuery="Test Contact"
      />
    </div>
  );
}