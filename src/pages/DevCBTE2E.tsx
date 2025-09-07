/**
 * Dev Route 3: CBT End-to-End Testing
 * Mock conversation, see chips, consent, trace writes
 */

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, Database, Users, Send, RefreshCw, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { CBTChip } from '@/components/CBTChip';
import { CBTConversationWrapper } from '@/components/CBTConversationWrapper';
import { goldenSampleLoader } from '@/services/goldenSampleLoader';
import { cbtDevHarness } from '@/services/cbtDevHarness';
import { cbtPerformanceTracker } from '@/services/cbtPerformanceTracker';
import { CBTTraceService } from '@/ai/cbt/trace';

const cbtTraceService = new CBTTraceService();

interface MockMessage {
  id: string;
  text: string;
  timestamp: number;
  type: 'user' | 'assistant';
  cbtData?: {
    annotation: any;
    decision: any;
    chipShown: boolean;
    userFeedback?: 'helpful' | 'decline';
    traceId?: string;
  };
}

export default function DevCBTE2E() {
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [consentGiven, setConsentGiven] = useState(true);
  const [traces, setTraces] = useState<any[]>([]);
  const [sessionStats, setSessionStats] = useState({
    totalMessages: 0,
    cbtInterventions: 0,
    helpfulFeedback: 0,
    declineFeedback: 0,
    crisisFlags: 0,
    avgLatency: 0
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load traces on mount
  useEffect(() => {
    loadTraces();
  }, []);

  // Add message and process CBT
  const addMessage = async (text: string, type: 'user' | 'assistant' = 'user') => {
    if (!text.trim()) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();

    // Create base message
    const newMsg: MockMessage = {
      id: messageId,
      text,
      timestamp,
      type,
      cbtData: undefined
    };

    setMessages(prev => [...prev, newMsg]);
    setIsProcessing(true);

    try {
      // Only process CBT for user messages
      if (type === 'user') {
        const measurement = cbtPerformanceTracker.createMeasurement();

        // Test the full pipeline
        const result = await cbtDevHarness.testPolicyDecision(text, {
          messageId,
          timestamp,
          conversationHistory: messages.map(m => ({
            role: m.type,
            content: m.text,
            timestamp: m.timestamp
          }))
        });

        measurement.markObserverComplete();
        measurement.markPolicyComplete();

        const totalLatency = measurement.complete(
          text.length,
          result.annotation?.distortions.length || 0,
          result.annotation?.crisisFlags.length || 0
        );

        // Create trace if consent given and CBT triggered
        let traceId: string | undefined;
        if (consentGiven && result.decision.shouldShowCBT && result.annotation) {
          traceId = await cbtTraceService.persist({
            messageId,
            userId: 'mock_user_e2e',
            conversationId: 'e2e_conversation',
            distortion: result.annotation.distortions[0]?.type || 'all_or_nothing',
            timestamp: timestamp,
            createdAt: timestamp,
            annotation: result.annotation,
            decision: {
              ...result.decision,
              shouldIntervene: result.decision.shouldShowCBT,
              interventionType: (result.decision.intervention as any) || 'chip'
            } as any,
            privacyLayer: 'surface',
            consent: true
          }, consentGiven);
        }

        // Update message with CBT data
        const cbtData = {
          annotation: result.annotation,
          decision: result.decision,
          chipShown: result.decision.shouldShowCBT,
          traceId
        };

        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, cbtData }
            : msg
        ));

        // Update session stats
        setSessionStats(prev => ({
          totalMessages: prev.totalMessages + 1,
          cbtInterventions: prev.cbtInterventions + (result.decision.shouldShowCBT ? 1 : 0),
          helpfulFeedback: prev.helpfulFeedback,
          declineFeedback: prev.declineFeedback,
          crisisFlags: prev.crisisFlags + (result.annotation?.crisisFlags.length || 0),
          avgLatency: ((prev.avgLatency * prev.totalMessages) + totalLatency) / (prev.totalMessages + 1)
        }));
      }
    } catch (error) {
      console.error('E2E processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle CBT feedback
  const handleCBTFeedback = (messageId: string, feedback: 'helpful' | 'decline') => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.cbtData) {
        const updatedData = { ...msg.cbtData, userFeedback: feedback };
        
        // Update trace if exists
        if (updatedData.traceId) {
          // In a real implementation, this would update the trace outcome
          console.log(`Feedback recorded for trace ${updatedData.traceId}: ${feedback}`);
        }

        return { ...msg, cbtData: updatedData };
      }
      return msg;
    }));

    // Update session stats
    setSessionStats(prev => ({
      ...prev,
      helpfulFeedback: prev.helpfulFeedback + (feedback === 'helpful' ? 1 : 0),
      declineFeedback: prev.declineFeedback + (feedback === 'decline' ? 1 : 0)
    }));
  };

  // Load sample conversation
  const loadSampleConversation = () => {
    const samples = [
      'Hi, how are you doing today?',
      'I\'m feeling overwhelmed with work. Everything always goes wrong.',
      'I understand that can be really stressful. Can you tell me more?',
      'I never do anything right and everyone probably thinks I\'m incompetent.',
      'That sounds really difficult. What happened at work specifically?',
      'If I don\'t finish this project perfectly, my career will be ruined forever.'
    ];

    setMessages([]);
    samples.forEach((text, idx) => {
      setTimeout(() => {
        addMessage(text, idx % 2 === 0 ? 'assistant' : 'user');
      }, idx * 1000);
    });
  };

  // Load random golden sample
  const loadGoldenSample = (category: 'distortion' | 'crisis' | 'neutral') => {
    const sample = goldenSampleLoader.getRandomSample(category);
    setNewMessage(sample.message);
  };

  // Clear conversation
  const clearConversation = () => {
    setMessages([]);
    setSessionStats({
      totalMessages: 0,
      cbtInterventions: 0,
      helpfulFeedback: 0,
      declineFeedback: 0,
      crisisFlags: 0,
      avgLatency: 0
    });
  };

  // Load traces
  const loadTraces = () => {
    const allTraces = cbtTraceService.list({ limit: 20 });
    setTraces(allTraces);
  };

  // Export session data
  const exportSession = () => {
    const sessionData = {
      messages,
      sessionStats,
      traces: traces.filter(t => messages.some(m => m.cbtData?.traceId === t.id)),
      performance: cbtPerformanceTracker.getStats(),
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cbt-e2e-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            CBT End-to-End Testing
          </h1>
          <p className="text-muted-foreground">
            Full pipeline testing with mock conversations, chips, consent, and traces
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearConversation}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={loadSampleConversation}>
            <Users className="h-4 w-4 mr-2" />
            Sample Chat
          </Button>
          <Button variant="outline" size="sm" onClick={exportSession}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Session Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Session Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Consent Given</Label>
              <Switch checked={consentGiven} onCheckedChange={setConsentGiven} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => loadGoldenSample('neutral')}>
                Neutral
              </Button>
              <Button variant="outline" size="sm" onClick={() => loadGoldenSample('distortion')}>
                Distortion
              </Button>
              <Button variant="outline" size="sm" onClick={() => loadGoldenSample('crisis')}>
                Crisis
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Session Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Messages: <Badge variant="outline">{sessionStats.totalMessages}</Badge></div>
              <div>CBT: <Badge variant="secondary">{sessionStats.cbtInterventions}</Badge></div>
              <div>Helpful: <Badge variant="default">{sessionStats.helpfulFeedback}</Badge></div>
              <div>Declined: <Badge variant="outline">{sessionStats.declineFeedback}</Badge></div>
              <div>Crisis: <Badge variant="destructive">{sessionStats.crisisFlags}</Badge></div>
              <div>Latency: <Badge variant="outline">{sessionStats.avgLatency.toFixed(1)}ms</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Trace Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Total Traces</Label>
                <Badge variant="outline">{traces.length}</Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={loadTraces}>
                <Database className="h-4 w-4 mr-2" />
                Refresh Traces
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversation */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mock Conversation</CardTitle>
              <CardDescription>
                Real-time CBT processing with chip rendering
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] mb-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className="space-y-2">
                      <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg ${
                          message.type === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}>
                          <p className="text-sm">{message.text}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      {/* CBT Chip */}
                      {message.cbtData?.chipShown && (
                        <div className="flex justify-start">
                        <div className="max-w-[80%]">
                          <CBTConversationWrapper
                            cbtGuidance={{
                              shouldShow: true,
                              action: {
                                type: 'chip',
                                text: `Detected ${message.cbtData.annotation?.distortions[0]?.type || 'distortion'}`
                              },
                              traceId: message.cbtData.traceId
                            }}
                            onCBTEngagement={(traceId, engaged, response, helpfulness) => 
                              handleCBTFeedback(message.id, engaged ? 'helpful' : 'decline')
                            }
                          >
                            <div /> {/* Empty div - wrapper handles chip rendering */}
                          </CBTConversationWrapper>
                          </div>
                        </div>
                      )}

                      {/* CBT Debug Info */}
                      {message.cbtData && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                CBT Debug
                              </Badge>
                              {message.cbtData.traceId && (
                                <Badge variant="outline" className="text-xs">
                                  Trace: {message.cbtData.traceId.substring(0, 8)}
                                </Badge>
                              )}
                              {message.cbtData.userFeedback && (
                                <Badge 
                                  variant={message.cbtData.userFeedback === 'helpful' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {message.cbtData.userFeedback}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <span>Distortions: {message.cbtData.annotation?.distortions.length || 0}</span>
                              <span>Crisis: {message.cbtData.annotation?.crisisFlags.length || 0}</span>
                              <span>Decision: {message.cbtData.decision.shouldShowCBT ? 'Show' : 'Hide'}</span>
                              <span>Priority: {message.cbtData.decision.priority || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-muted p-3 rounded-lg animate-pulse">
                        <p className="text-sm text-muted-foreground">Processing CBT...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addMessage(newMessage);
                      setNewMessage('');
                    }
                  }}
                />
                <Button 
                  onClick={() => {
                    addMessage(newMessage);
                    setNewMessage('');
                  }}
                  disabled={!newMessage.trim() || isProcessing}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Traces & Analysis */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Traces</CardTitle>
              <CardDescription>
                Stored CBT intervention traces
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {traces.slice(0, 10).map((trace) => (
                    <div key={trace.id} className="p-2 border rounded text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {trace.intervention}
                        </Badge>
                        <Badge 
                          variant={
                            trace.priority === 'crisis' ? 'destructive' :
                            trace.priority === 'high' ? 'secondary' : 'default'
                          }
                          className="text-xs"
                        >
                          {trace.priority}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {new Date(trace.timestamp).toLocaleString()}
                      </p>
                      <p>Distortions: {trace.annotation.distortions.length}</p>
                      {trace.outcome && (
                        <div className="flex items-center gap-1 mt-1">
                          {trace.outcome.userEngaged ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                          )}
                          <span>{trace.outcome.userEngaged ? 'Engaged' : 'Declined'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {traces.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No traces yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Monitor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Avg Latency:</span>
                  <Badge variant={sessionStats.avgLatency <= 50 ? 'default' : 'destructive'}>
                    {sessionStats.avgLatency.toFixed(1)}ms
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Success Rate:</span>
                  <Badge variant="outline">
                    {sessionStats.totalMessages > 0 ? 
                      ((sessionStats.helpfulFeedback / Math.max(sessionStats.cbtInterventions, 1)) * 100).toFixed(1) + '%' : 
                      'N/A'
                    }
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Intervention Rate:</span>
                  <Badge variant="secondary">
                    {sessionStats.totalMessages > 0 ? 
                      ((sessionStats.cbtInterventions / sessionStats.totalMessages) * 100).toFixed(1) + '%' : 
                      'N/A'
                    }
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {!consentGiven && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Consent disabled - traces will not be stored
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}