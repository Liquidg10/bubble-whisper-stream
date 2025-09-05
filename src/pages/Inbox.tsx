import React, { useState, useEffect } from 'react';
import { InboxItem } from '@/types/inbox';
import { InboxItemCard } from '@/components/InboxItemCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Inbox as InboxIcon, Mail, MessageSquare, Search, Filter, RefreshCw } from 'lucide-react';
import { useBubbleStore } from '@/stores/bubbleStore';
import { inboxClassifier } from '@/services/inboxClassifier';
import { toast } from 'sonner';
import { Bubble } from '@/types/bubble';

// Mock data for demonstration
const mockInboxItems: InboxItem[] = [
  {
    id: '1',
    source: 'email',
    subject: 'Reminder: Team meeting tomorrow',
    snippet: 'Don\'t forget about our team standup meeting tomorrow at 10 AM in conference room B.',
    fullContent: 'Hi team, this is a friendly reminder about our weekly standup meeting scheduled for tomorrow (Tuesday) at 10:00 AM in conference room B. Please come prepared with your updates.',
    sender: 'manager@company.com',
    receivedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    suggestedType: 'ReminderNote',
    suggestedHorizon: 'today',
    suggestedTags: ['meeting', 'work', 'reminder'],
    confidence: 0.85,
    processed: false
  },
  {
    id: '2',
    source: 'sms',
    snippet: 'Great news! Your application has been approved. Congratulations!',
    fullContent: 'Great news! Your application has been approved. Congratulations! Please check your email for next steps.',
    sender: '+1-555-0123',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    suggestedType: 'Joy',
    suggestedTags: ['joy', 'success', 'application'],
    confidence: 0.75,
    processed: false
  },
  {
    id: '3',
    source: 'email',
    subject: 'Grocery list idea',
    snippet: 'I had an idea for organizing our weekly grocery shopping more efficiently...',
    fullContent: 'I had an idea for organizing our weekly grocery shopping more efficiently. What if we use categories and batch similar items together?',
    sender: 'spouse@example.com',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    suggestedType: 'Thought',
    suggestedTags: ['idea', 'grocery', 'organization'],
    confidence: 0.45,
    processed: false
  }
];

export default function Inbox() {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<InboxItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'email' | 'sms'>('all');
  const [undoQueue, setUndoQueue] = useState<{ bubble: Bubble; item: InboxItem; timeout: NodeJS.Timeout }[]>([]);
  
  const { addBubble, deleteBubble } = useBubbleStore();

  useEffect(() => {
    // Initialize classifier and load mock data
    inboxClassifier.initialize();
    
    // Apply classification to mock items
    const classifiedItems = mockInboxItems.map(item => {
      const classification = inboxClassifier.classifyItem(item);
      return {
        ...item,
        suggestedType: classification.type,
        suggestedHorizon: classification.horizon,
        suggestedTags: classification.tags,
        confidence: classification.confidence
      };
    });
    
    setInboxItems(classifiedItems);
  }, []);

  useEffect(() => {
    let filtered = inboxItems.filter(item => !item.processed);
    
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sender.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(item => item.source === sourceFilter);
    }
    
    setFilteredItems(filtered);
  }, [inboxItems, searchQuery, sourceFilter]);

  const handleCommit = async (
    item: InboxItem, 
    finalType: string, 
    finalHorizon?: string, 
    finalTags?: string[]
  ) => {
    // Learn from corrections if user changed the suggestion
    if (finalType !== item.suggestedType || 
        finalHorizon !== item.suggestedHorizon || 
        JSON.stringify(finalTags) !== JSON.stringify(item.suggestedTags)) {
      await inboxClassifier.learnFromCorrection(
        {
          type: item.suggestedType,
          horizon: item.suggestedHorizon,
          tags: item.suggestedTags
        },
        {
          type: finalType,
          horizon: finalHorizon,
          tags: finalTags || []
        },
        `${item.subject || ''} ${item.snippet}`
      );
    }

    // Create bubble
    const bubble: Bubble = {
      id: `inbox-${item.id}-${Date.now()}`,
      type: finalType as any,
      content: item.fullContent,
      tags: (finalTags || []).map(tag => ({ id: tag, name: tag, label: tag, color: '#666666' })),
      x: Math.random() * 400 + 100,
      y: Math.random() * 400 + 100,
      size: 40,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        source: 'inbox',
        originalSender: item.sender,
        receivedAt: item.receivedAt.toISOString(),
        inboxSource: item.source
      }
    };

    if (finalHorizon) {
      (bubble as any).horizon = finalHorizon;
    }

    addBubble(bubble);

    // Mark as processed
    setInboxItems(prev => prev.map(i => 
      i.id === item.id ? { ...i, processed: true, committedAt: new Date() } : i
    ));

    // Set up undo with 1-minute timeout
    const timeout = setTimeout(() => {
      setUndoQueue(prev => prev.filter(u => u.item.id !== item.id));
    }, 60000); // 1 minute

    setUndoQueue(prev => [...prev, { bubble, item, timeout }]);

    toast.success(`Added "${item.subject || item.snippet.slice(0, 30)}..." to bubbles`, {
      action: {
        label: 'Undo',
        onClick: () => handleUndo(item.id)
      }
    });
  };

  const handleUndo = (itemId: string) => {
    const undoItem = undoQueue.find(u => u.item.id === itemId);
    if (!undoItem) return;

    // Remove bubble
    deleteBubble(undoItem.bubble.id);

    // Restore to inbox
    setInboxItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, processed: false, committedAt: undefined } : i
    ));

    // Clear timeout and remove from undo queue
    clearTimeout(undoItem.timeout);
    setUndoQueue(prev => prev.filter(u => u.item.id !== itemId));

    toast.success('Restored item to inbox');
  };

  const handleDiscard = (itemId: string) => {
    setInboxItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, processed: true } : i
    ));
    toast.success('Item discarded');
  };

  const unprocessedCount = inboxItems.filter(item => !item.processed).length;

  return (
    <ScrollArea className="h-full">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <InboxIcon className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Inbox</h1>
              <p className="text-sm text-muted-foreground">
                Review and classify forwarded emails and messages
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {unprocessedCount} items
          </Badge>
        </div>

        {/* Instructions Card */}
        {unprocessedCount === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Forward Messages Here
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                To add items to your inbox, forward emails or messages to your personal ingest address.
                The system will automatically classify them and suggest the best bubble type and horizon.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h4 className="font-medium mb-2">Email forwarding:</h4>
                  <code className="block p-2 bg-muted rounded text-xs">
                    your-id@bubbles.inbox.app
                  </code>
                </div>
                <div>
                  <h4 className="font-medium mb-2">SMS forwarding:</h4>
                  <code className="block p-2 bg-muted rounded text-xs">
                    Text to: (555) 123-BUBBLE
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        {unprocessedCount > 0 && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(value: any) => setSourceFilter(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="email">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email only
                  </div>
                </SelectItem>
                <SelectItem value="sms">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    SMS only
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Items */}
        <div className="space-y-4">
          {filteredItems.map(item => (
            <InboxItemCard
              key={item.id}
              item={item}
              onCommit={handleCommit}
              onDiscard={handleDiscard}
            />
          ))}
        </div>

        {filteredItems.length === 0 && unprocessedCount > 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No items match your current filters.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}