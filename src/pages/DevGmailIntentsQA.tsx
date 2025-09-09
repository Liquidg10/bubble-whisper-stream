import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  Mail, 
  Brain, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Clock,
  Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { gmailMetadataSync } from '@/services/gmailMetadataSync';
import { gmailIntentClassifier } from '@/services/gmailIntentClassifier';
import { GmailIntentChip } from '@/components/GmailIntentChip';
import { oauthService } from '@/services/oauthService';
import { useBubbleStore } from '@/stores/bubbleStore';
import type { SyncResult } from '@/services/gmailMetadataSync';
import type { EmailMetadata, IntentClassification } from '@/services/gmailIntentClassifier';

export const DevGmailIntents: React.FC = () => {
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [testSubject, setTestSubject] = useState('');
  const [testSender, setTestSender] = useState('');
  const [testClassification, setTestClassification] = useState<IntentClassification | null>(null);
  const [recentEmails, setRecentEmails] = useState<Array<{
    metadata: EmailMetadata;
    classification: IntentClassification;
  }>>([]);

  const { toast } = useToast();
  const { addBubble } = useBubbleStore();

  useEffect(() => {
    loadGmailAccounts();
    
    // Subscribe to sync updates
    const unsubscribe = gmailMetadataSync.subscribe((result) => {
      setSyncResult(result);
      setRecentEmails(result.intents);
      if (result.errors.length === 0) {
        toast({
          title: "Sync Complete",
          description: `Processed ${result.processed} emails with intent classification`,
        });
      } else {
        toast({
          title: "Sync Completed with Errors",
          description: `Processed ${result.processed} emails, ${result.errors.length} errors`,
          variant: "destructive"
        });
      }
    });

    return unsubscribe;
  }, [toast]);

  const loadGmailAccounts = async () => {
    try {
      const accounts = await oauthService.getConnectedAccounts();
      const gmailAccounts = accounts.filter(acc => 
        acc.provider === 'google' && 
        acc.scopes?.some(scope => scope.includes('gmail'))
      );
      setConnectedAccounts(gmailAccounts);
    } catch (error) {
      console.error('Failed to load Gmail accounts:', error);
    }
  };

  const runMetadataSync = async (accountId: string) => {
    setIsLoading(true);
    try {
      const result = await gmailMetadataSync.syncMetadata(accountId, {
        maxResults: 20,
        query: 'is:important OR is:unread'
      });
      
      if (result.errors.length > 0) {
        console.error('Sync errors:', result.errors);
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testClassifier = async () => {
    if (!testSubject.trim() || !testSender.trim()) return;

    const testMetadata: EmailMetadata = {
      id: 'test-' + Date.now(),
      subject: testSubject,
      sender: testSender.split('<')[0].trim(),
      senderEmail: testSender.includes('<') 
        ? testSender.match(/<(.+)>/)?.[1] || testSender 
        : testSender,
      receivedAt: new Date(),
      snippet: `Test email: ${testSubject}`
    };

    const classification = await gmailIntentClassifier.classifyEmailMetadata(testMetadata);
    setTestClassification(classification);
  };

  const createBubbleFromEmail = async (metadata: EmailMetadata, classification: IntentClassification) => {
    try {
      const bubble = {
        id: crypto.randomUUID(),
        content: `📧 ${metadata.subject}\n\nFrom: ${metadata.sender}\nIntent: ${classification.intent}\n\n${metadata.snippet || ''}`,
        type: classification.intent === 'task' ? 'Task' as const : 'Thought' as const,
        tags: [
          { id: 'email', name: 'email', color: '#3b82f6' },
          { id: classification.intent, name: classification.intent, color: '#f59e0b' },
          ...classification.tags.slice(0, 2).map(tag => ({
            id: tag,
            name: tag,
            color: '#6b7280'
          }))
        ],
        x: Math.random() * 400,
        y: Math.random() * 400,
        size: classification.confidence > 0.75 ? 60 : 45,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completed: false
      };

      await addBubble(bubble);

      toast({
        title: "Bubble Created",
        description: `Created ${bubble.type.toLowerCase()} bubble for "${metadata.subject}"`,
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Gmail Intent Classification - Dev Tools</h1>
        <p className="text-muted-foreground">
          Test and debug Gmail metadata-only intent extraction and classification
        </p>
      </div>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Connected Gmail Accounts
          </CardTitle>
          <CardDescription>
            Gmail accounts with metadata access for intent classification
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectedAccounts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No Gmail accounts connected. Connect an account in the Email Integration plugin first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {connectedAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{account.account_email}</div>
                      <div className="text-sm text-muted-foreground">
                        Scopes: {account.scopes?.join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                    <Button
                      onClick={() => runMetadataSync(account.id)}
                      disabled={isLoading || gmailMetadataSync.isInProgress()}
                      size="sm"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Sync Metadata
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Classifier Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Test Intent Classifier
          </CardTitle>
          <CardDescription>
            Test the classifier with custom email metadata
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="test-subject">Email Subject</Label>
              <Input
                id="test-subject"
                placeholder="Meeting: Project Review Tomorrow"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="test-sender">Sender (Name &lt;email&gt;)</Label>
              <Input
                id="test-sender"
                placeholder="John Doe <john@company.com>"
                value={testSender}
                onChange={(e) => setTestSender(e.target.value)}
              />
            </div>
          </div>
          <Button 
            onClick={testClassifier}
            disabled={!testSubject.trim() || !testSender.trim()}
          >
            <Brain className="h-4 w-4 mr-2" />
            Classify Intent
          </Button>

          {testClassification && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Classification Result:</h4>
              <div className="space-y-2 text-sm">
                <div><strong>Intent:</strong> {testClassification.intent}</div>
                <div><strong>Confidence:</strong> {Math.round(testClassification.confidence * 100)}%</div>
                {testClassification.horizon && (
                  <div><strong>Horizon:</strong> {testClassification.horizon}</div>
                )}
                <div><strong>Tags:</strong> {testClassification.tags.join(', ')}</div>
                <div><strong>Reasoning:</strong> {testClassification.reasoning}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Results */}
      {syncResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Last Sync Results
            </CardTitle>
            <CardDescription>
              Recent metadata sync and intent classification results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{syncResult.processed}</div>
                <div className="text-sm text-muted-foreground">Processed</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{syncResult.intents.length}</div>
                <div className="text-sm text-muted-foreground">Classified</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-red-600">{syncResult.errors.length}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {syncResult.errors.length > 0 && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Errors:</strong> {syncResult.errors.join('; ')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Emails with Intent Classification */}
      {recentEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Email Intents
            </CardTitle>
            <CardDescription>
              Emails processed with intent classification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentEmails.map((email, index) => (
                <GmailIntentChip
                  key={`${email.metadata.id}-${index}`}
                  metadata={email.metadata}
                  classification={email.classification}
                  onCreateBubble={() => createBubbleFromEmail(email.metadata, email.classification)}
                  onCorrectIntent={(newIntent) => {
                    // Handle intent correction
                    toast({
                      title: "Intent Corrected",
                      description: `Intent changed to ${newIntent}`,
                    });
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};