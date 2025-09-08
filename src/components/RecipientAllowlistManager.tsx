import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Plus, Shield, ShieldOff, User, Mail, Calendar, MessageSquare } from 'lucide-react';
import { recipientAllowlistService, RecipientEntry } from '@/services/recipientAllowlistService';
import { toast } from 'sonner';

export function RecipientAllowlistManager() {
  const [recipients, setRecipients] = useState<RecipientEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  useEffect(() => {
    loadRecipients();
  }, []);

  const loadRecipients = async () => {
    try {
      setIsLoading(true);
      const data = await recipientAllowlistService.getAllowlistedRecipients();
      setRecipients(data);
    } catch (error) {
      console.error('Failed to load recipients:', error);
      toast.error('Failed to load recipient list');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadRecipients();
      return;
    }

    try {
      setIsLoading(true);
      const results = await recipientAllowlistService.searchRecipients(searchQuery);
      setRecipients(results);
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToAllowlist = async () => {
    if (!newEmail.trim()) {
      toast.error('Email address is required');
      return;
    }

    try {
      await recipientAllowlistService.addToAllowlist(newEmail.trim(), newDisplayName.trim() || undefined);
      toast.success('Contact added to allowlist');
      setNewEmail('');
      setNewDisplayName('');
      setShowAddDialog(false);
      loadRecipients();
    } catch (error) {
      console.error('Failed to add contact:', error);
      toast.error('Failed to add contact');
    }
  };

  const handleRemoveFromAllowlist = async (email: string) => {
    try {
      await recipientAllowlistService.removeFromAllowlist(email);
      toast.success('Contact removed from allowlist');
      loadRecipients();
    } catch (error) {
      console.error('Failed to remove contact:', error);
      toast.error('Failed to remove contact');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getInitials = (email: string, displayName?: string) => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getTrustColor = (trustScore: number) => {
    if (trustScore >= 0.8) return 'text-green-600 bg-green-50';
    if (trustScore >= 0.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const filteredRecipients = recipients.filter(recipient =>
    recipient.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipient.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Trusted Recipients
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Trusted Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="new-email">Email Address</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="new-display-name">Display Name (optional)</Label>
                  <Input
                    id="new-display-name"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddToAllowlist}>
                    Add Contact
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} variant="outline">
            Search
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading contacts...
          </div>
        ) : filteredRecipients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No trusted contacts found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecipients.map((recipient) => (
              <div key={recipient.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-sm">
                    {getInitials(recipient.email, recipient.display_name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">
                      {recipient.display_name || recipient.email}
                    </span>
                    {recipient.is_allowlisted && (
                      <Badge variant="secondary" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        Trusted
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs ${getTrustColor(recipient.trust_score)}`}>
                      {Math.round(recipient.trust_score * 100)}% trust
                    </Badge>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 mb-1">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{recipient.email}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {recipient.interaction_count} emails
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Last: {formatDate(recipient.last_contacted_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRemoveFromAllowlist(recipient.email)}
                  className="text-red-600 hover:text-red-700"
                >
                  <ShieldOff className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}